-- El panel Admin ya no cambia estados operativos.
-- Preparación, reparto y entrega pasan exclusivamente por staff_update_order_operation(),
-- que registra los timestamps operativos correspondientes.

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
        raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not coalesce(public.is_admin(), false) then
        raise exception using errcode = '42501', message = 'ADMIN_PERMISSION_REQUIRED';
    end if;

    if p_order_id is null or p_order_id <= 0 then
        raise exception using errcode = '22023', message = 'ORDER_ID_REQUIRED';
    end if;

    if p_new_status is null
       or p_new_status not in ('pendiente','confirmado','preparando','en_camino','entregado','cancelado')
    then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_STATUS';
    end if;

    select o.status, o.payment_status
      into v_old_status, v_payment_status
      from public.orders as o
     where o.id = p_order_id
     for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
    end if;

    if v_old_status = 'pendiente' and p_new_status = 'confirmado' then
        raise exception using errcode = 'P0001', message = 'PAYMENT_FLOW_REQUIRED';
    end if;

    if p_new_status = 'cancelado' and v_payment_status = 'approved' then
        raise exception using errcode = 'P0001', message = 'PAID_ORDER_CANNOT_BE_CANCELLED';
    end if;

    -- Única mutación administrativa permitida: cancelar un pedido aún no pagado.
    if not (v_old_status = 'pendiente' and p_new_status = 'cancelado') then
        raise exception using
            errcode = 'P0001',
            message = 'OPERATIONAL_FLOW_REQUIRED',
            detail = 'Los estados de preparación, reparto y entrega se actualizan desde el portal operativo.';
    end if;

    update public.orders as o
       set status = 'cancelado'
     where o.id = p_order_id;

    return query
    select p_order_id, v_old_status, 'cancelado'::text;
end;
$$;

grant execute on function public.update_order_status(bigint, text) to authenticated;
