create or replace function public.confirm_paid_order(
    p_order_id bigint,
    p_payment_id text,
    p_paid_at timestamptz
)
returns table (
    order_id bigint,
    old_status text,
    new_status text,
    already_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_old_status text;
    v_payment_status text;
    v_payment_id text;
begin
    if p_order_id is null or p_order_id <= 0 then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_ID';
    end if;

    if p_payment_id is null or btrim(p_payment_id) = '' then
        raise exception using errcode = '22023', message = 'PAYMENT_ID_REQUIRED';
    end if;

    select o.status, o.payment_status, o.payment_id
      into v_old_status, v_payment_status, v_payment_id
      from public.orders as o
     where o.id = p_order_id
     for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
    end if;

    if v_payment_status <> 'approved' then
        raise exception using errcode = 'P0001', message = 'PAYMENT_NOT_APPROVED';
    end if;

    if v_payment_id is null or v_payment_id <> p_payment_id then
        raise exception using errcode = 'P0001', message = 'PAYMENT_ID_MISMATCH';
    end if;

    if v_old_status = 'confirmado' then
        update public.orders as o
           set payment_provider = 'mercadopago',
               paid_at = coalesce(o.paid_at, p_paid_at, pg_catalog.now())
         where o.id = p_order_id;

        return query select p_order_id, v_old_status, v_old_status, true;
        return;
    end if;

    if v_old_status <> 'pendiente' then
        raise exception using
            errcode = 'P0001',
            message = 'ORDER_CANNOT_BE_CONFIRMED',
            detail = pg_catalog.format('El pedido %s tiene estado %s.', p_order_id, v_old_status);
    end if;

    if not exists (select 1 from public.order_items as oi where oi.order_id = p_order_id) then
        raise exception using errcode = 'P0001', message = 'ORDER_ITEMS_EMPTY';
    end if;

    perform 1
      from public.products as p
      join (
        select oi.product_id, sum(oi.quantity)::bigint as required_quantity
          from public.order_items as oi
         where oi.order_id = p_order_id
         group by oi.product_id
      ) as requested on requested.product_id = p.id
     order by p.id
     for update of p;

    if exists (
        select 1
          from (
            select oi.product_id
              from public.order_items as oi
             where oi.order_id = p_order_id
             group by oi.product_id
          ) as requested
          left join public.products as p on p.id = requested.product_id
         where p.id is null
    ) then
        raise exception using errcode = 'P0001', message = 'ORDER_PRODUCT_NOT_FOUND';
    end if;

    if exists (
        select 1
          from public.products as p
          join (
            select oi.product_id, sum(oi.quantity)::bigint as required_quantity
              from public.order_items as oi
             where oi.order_id = p_order_id
             group by oi.product_id
          ) as requested on requested.product_id = p.id
         where p.stock is null or p.stock < requested.required_quantity
    ) then
        raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
    end if;

    update public.products as p
       set stock = p.stock - requested.required_quantity
      from (
        select oi.product_id, sum(oi.quantity)::bigint as required_quantity
          from public.order_items as oi
         where oi.order_id = p_order_id
         group by oi.product_id
      ) as requested
     where p.id = requested.product_id;

    update public.orders as o
       set status = 'confirmado',
           payment_provider = 'mercadopago',
           paid_at = coalesce(o.paid_at, p_paid_at, pg_catalog.now())
     where o.id = p_order_id;

    return query select p_order_id, v_old_status, 'confirmado'::text, false;
end;
$function$;

revoke all on function public.confirm_paid_order(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_paid_order(bigint, text, timestamptz) to service_role;
