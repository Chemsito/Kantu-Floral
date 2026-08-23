-- Allow a customer to cancel only their own order before any payment attempt exists.
create or replace function public.customer_cancel_order(p_order_id bigint)
returns table(order_id bigint, old_status text, new_status text, payment_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_user_id uuid;
    v_order public.orders%rowtype;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
    end if;

    if p_order_id is null or p_order_id <= 0 then
        raise exception using errcode = '22023', message = 'ORDER_ID_REQUIRED';
    end if;

    select o.*
      into v_order
      from public.orders as o
     where o.id = p_order_id
       and o.user_id = v_user_id
     for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
    end if;

    if v_order.status <> 'pendiente' or v_order.payment_status <> 'pending' then
        raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLABLE';
    end if;

    -- Once Mercado Pago created a preference/payment, cancelling locally could
    -- leave an external checkout URL capable of collecting money for a cancelled
    -- order. Require support/admin handling instead.
    if v_order.payment_preference_id is not null or v_order.payment_id is not null then
        raise exception using errcode = 'P0001', message = 'PAYMENT_ALREADY_STARTED';
    end if;

    -- A manual proof means the customer may already have transferred money.
    if exists (
        select 1
          from public.payment_proofs as pp
         where pp.order_id = p_order_id
    ) then
        raise exception using errcode = 'P0001', message = 'PAYMENT_ALREADY_STARTED';
    end if;

    update public.orders as o
       set status = 'cancelado',
           payment_status = 'cancelled',
           payment_status_detail = 'customer_cancelled_before_payment'
     where o.id = p_order_id
       and o.user_id = v_user_id
       and o.status = 'pendiente'
       and o.payment_status = 'pending';

    if not found then
        raise exception using errcode = 'P0001', message = 'ORDER_CHANGED_DURING_CANCELLATION';
    end if;

    return query
    select p_order_id, v_order.status, 'cancelado'::text, 'cancelled'::text;
end;
$function$;

revoke all on function public.customer_cancel_order(bigint) from public, anon;
grant execute on function public.customer_cancel_order(bigint) to authenticated;
grant execute on function public.customer_cancel_order(bigint) to service_role;
