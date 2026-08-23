-- Kantu Floral
-- Impide que el panel administrativo confirme pedidos sin pasar por un flujo de pago
-- y elimina la posibilidad de mutar orders directamente desde el navegador.

create or replace function public.update_order_status(
    p_order_id bigint,
    p_new_status text
)
returns table(
    order_id bigint,
    old_status text,
    new_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_old_status text;
    v_payment_status text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not coalesce(public.is_admin(), false) then
        raise exception using
            errcode = '42501',
            message = 'ADMIN_PERMISSION_REQUIRED';
    end if;

    if p_order_id is null or p_order_id <= 0 then
        raise exception using
            errcode = '22023',
            message = 'ORDER_ID_REQUIRED';
    end if;

    if p_new_status is null
       or p_new_status not in (
            'pendiente',
            'confirmado',
            'preparando',
            'en_camino',
            'entregado',
            'cancelado'
       )
    then
        raise exception using
            errcode = '22023',
            message = 'INVALID_ORDER_STATUS';
    end if;

    select o.status, o.payment_status
      into v_old_status, v_payment_status
      from public.orders as o
     where o.id = p_order_id
     for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'ORDER_NOT_FOUND';
    end if;

    if v_old_status is null
       or v_old_status not in (
            'pendiente',
            'confirmado',
            'preparando',
            'en_camino',
            'entregado',
            'cancelado'
       )
    then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_CURRENT_ORDER_STATUS';
    end if;

    -- La confirmación y el descuento de stock pertenecen exclusivamente
    -- a confirm_paid_order() o approve_manual_payment().
    if v_old_status = 'pendiente' and p_new_status = 'confirmado' then
        raise exception using
            errcode = 'P0001',
            message = 'PAYMENT_FLOW_REQUIRED';
    end if;

    -- Mientras no exista un flujo automático de reembolso, un pedido pagado
    -- no puede cancelarse desde el panel administrativo.
    if p_new_status = 'cancelado' and v_payment_status = 'approved' then
        raise exception using
            errcode = 'P0001',
            message = 'PAID_ORDER_CANNOT_BE_CANCELLED';
    end if;

    if not (
        (v_old_status = 'pendiente' and p_new_status = 'cancelado')
        or
        (v_old_status = 'confirmado' and p_new_status = 'preparando')
        or
        (v_old_status = 'preparando' and p_new_status = 'en_camino')
        or
        (v_old_status = 'en_camino' and p_new_status = 'entregado')
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_STATUS_TRANSITION',
            detail = format(
                'No se permite cambiar el pedido %s de %s a %s.',
                p_order_id,
                v_old_status,
                p_new_status
            );
    end if;

    -- Ningún pedido puede avanzar por preparación/reparto si el pago
    -- no está aprobado.
    if p_new_status in ('preparando', 'en_camino', 'entregado')
       and v_payment_status <> 'approved'
    then
        raise exception using
            errcode = 'P0001',
            message = 'PAYMENT_NOT_APPROVED';
    end if;

    update public.orders as o
       set status = p_new_status
     where o.id = p_order_id;

    return query
    select p_order_id, v_old_status, p_new_status;
end;
$$;

-- El frontend no necesita UPDATE directo sobre orders. Los cambios legítimos
-- pasan por RPCs con validaciones internas; service_role continúa omitiendo RLS.
drop policy if exists "Admins can update orders" on public.orders;

revoke update on table public.orders from anon;
revoke update on table public.orders from authenticated;

grant execute on function public.update_order_status(bigint, text) to authenticated;
