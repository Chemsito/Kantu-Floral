create or replace function public.reserve_order_stock_for_payment(
    p_order_id bigint,
    p_reservation_minutes integer default 45
)
returns table(order_id bigint, reserved_until timestamptz, reserved_items integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_status text;
    v_payment_status text;
    v_payment_provider text;
    v_existing_active integer := 0;
    v_item_count integer := 0;
    v_until timestamptz;
begin
    if p_order_id is null or p_order_id <= 0 then raise exception using errcode='22023', message='INVALID_ORDER_ID'; end if;
    if p_reservation_minutes is null or p_reservation_minutes < 10 or p_reservation_minutes > 180 then raise exception using errcode='22023', message='INVALID_RESERVATION_WINDOW'; end if;
    perform private.expire_order_stock_reservations();
    select o.status,o.payment_status,o.payment_provider into v_status,v_payment_status,v_payment_provider from public.orders o where o.id=p_order_id for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_status <> 'pendiente' then raise exception 'INVALID_ORDER_STATUS'; end if;
    if v_payment_status not in ('pending','rejected','cancelled') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
    if v_payment_provider is not null and v_payment_provider <> 'mercadopago' then raise exception 'PAYMENT_PROVIDER_MISMATCH'; end if;
    if not exists(select 1 from public.order_items oi where oi.order_id=p_order_id) then raise exception 'ORDER_ITEMS_EMPTY'; end if;
    select count(*)::integer into v_existing_active from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active';
    if v_existing_active > 0 then
        if exists(select 1 from (select oi.product_id,sum(oi.quantity)::integer quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested full join (select r.product_id,r.quantity from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active') reserved using(product_id) where requested.product_id is null or reserved.product_id is null or requested.quantity<>reserved.quantity) then raise exception 'RESERVATION_ITEMS_MISMATCH'; end if;
        v_until:=now()+make_interval(mins=>p_reservation_minutes);
        update private.order_stock_reservations r set expires_at=v_until where r.order_id=p_order_id and r.state='active';
        select count(*)::integer into v_item_count from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active';
        return query select p_order_id,v_until,v_item_count; return;
    end if;
    perform 1 from public.products p join (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested on requested.product_id=p.id order by p.id for update of p;
    if exists(select 1 from (select oi.product_id from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested left join public.products p on p.id=requested.product_id where p.id is null) then raise exception 'ORDER_PRODUCT_NOT_FOUND'; end if;
    if exists(select 1 from public.products p join (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested on requested.product_id=p.id where p.active is not true) then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.products p join (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested on requested.product_id=p.id where p.stock is null or p.stock<requested.required_quantity) then raise exception 'INSUFFICIENT_STOCK'; end if;
    update public.products p set stock=p.stock-requested.required_quantity from (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested where p.id=requested.product_id;
    v_until:=now()+make_interval(mins=>p_reservation_minutes);
    insert into private.order_stock_reservations(order_id,product_id,quantity,state,reserved_at,expires_at,finalized_at,release_reason)
    select p_order_id,oi.product_id,sum(oi.quantity)::integer,'active',now(),v_until,null,null from public.order_items oi where oi.order_id=p_order_id group by oi.product_id
    on conflict on constraint order_stock_reservations_pkey do update
       set quantity=excluded.quantity,state='active',reserved_at=now(),expires_at=excluded.expires_at,finalized_at=null,release_reason=null;
    get diagnostics v_item_count=row_count;
    return query select p_order_id,v_until,v_item_count;
end;
$$;
revoke all on function public.reserve_order_stock_for_payment(bigint,integer) from public,anon,authenticated;
grant execute on function public.reserve_order_stock_for_payment(bigint,integer) to service_role;
