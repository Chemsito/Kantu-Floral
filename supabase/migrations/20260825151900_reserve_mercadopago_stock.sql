create extension if not exists pg_cron;

create table if not exists private.order_stock_reservations (
    order_id bigint not null references public.orders(id) on delete cascade,
    product_id bigint not null references public.products(id),
    quantity integer not null check (quantity > 0),
    state text not null default 'active' check (state in ('active','consumed','released','expired')),
    reserved_at timestamptz not null default now(),
    expires_at timestamptz not null,
    finalized_at timestamptz null,
    release_reason text null,
    primary key (order_id, product_id)
);

create index if not exists order_stock_reservations_active_expiry_idx on private.order_stock_reservations(expires_at, order_id) where state = 'active';
revoke all on table private.order_stock_reservations from public, anon, authenticated;

create or replace function private.release_order_stock_reservation(p_order_id bigint, p_reason text default 'released') returns integer language plpgsql security definer set search_path = '' as $$
declare v_order_status text; v_payment_status text; v_released integer := 0;
begin
    if p_order_id is null or p_order_id <= 0 then return 0; end if;
    select o.status, o.payment_status into v_order_status, v_payment_status from public.orders o where o.id = p_order_id for update;
    if not found then return 0; end if;
    if v_payment_status = 'approved' or v_order_status in ('confirmado','preparando','en_camino','entregado') then return 0; end if;
    perform 1 from public.products p join private.order_stock_reservations r on r.product_id=p.id and r.order_id=p_order_id and r.state='active' order by p.id for update of p;
    with released as (
        update private.order_stock_reservations r set state=case when p_reason='expired' then 'expired' else 'released' end, finalized_at=now(), release_reason=left(coalesce(nullif(btrim(p_reason),''),'released'),120) where r.order_id=p_order_id and r.state='active' returning r.product_id,r.quantity
    ), restored as (
        update public.products p set stock=p.stock+released.quantity from released where p.id=released.product_id returning p.id
    ) select count(*)::integer into v_released from restored;
    return coalesce(v_released,0);
end; $$;
revoke all on function private.release_order_stock_reservation(bigint,text) from public,anon,authenticated;

create or replace function private.expire_order_stock_reservations() returns integer language plpgsql security definer set search_path='' as $$
declare v_order_id bigint; v_total integer:=0;
begin
    for v_order_id in select distinct r.order_id from private.order_stock_reservations r join public.orders o on o.id=r.order_id where r.state='active' and r.expires_at<=now() and o.payment_id is null and o.payment_status in ('pending','rejected','cancelled') and o.status='pendiente' order by r.order_id loop
        v_total:=v_total+private.release_order_stock_reservation(v_order_id,'expired');
    end loop;
    return v_total;
end; $$;
revoke all on function private.expire_order_stock_reservations() from public,anon,authenticated;

create or replace function public.reserve_order_stock_for_payment(p_order_id bigint,p_reservation_minutes integer default 45)
returns table(order_id bigint,reserved_until timestamptz,reserved_items integer) language plpgsql security definer set search_path='' as $$
declare v_status text; v_payment_status text; v_payment_provider text; v_existing_active integer:=0; v_item_count integer:=0; v_until timestamptz;
begin
    if p_order_id is null or p_order_id<=0 then raise exception using errcode='22023',message='INVALID_ORDER_ID'; end if;
    if p_reservation_minutes is null or p_reservation_minutes<10 or p_reservation_minutes>180 then raise exception using errcode='22023',message='INVALID_RESERVATION_WINDOW'; end if;
    perform private.expire_order_stock_reservations();
    select o.status,o.payment_status,o.payment_provider into v_status,v_payment_status,v_payment_provider from public.orders o where o.id=p_order_id for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_status<>'pendiente' then raise exception 'INVALID_ORDER_STATUS'; end if;
    if v_payment_status not in ('pending','rejected','cancelled') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
    if v_payment_provider is not null and v_payment_provider<>'mercadopago' then raise exception 'PAYMENT_PROVIDER_MISMATCH'; end if;
    if not exists(select 1 from public.order_items oi where oi.order_id=p_order_id) then raise exception 'ORDER_ITEMS_EMPTY'; end if;
    select count(*)::integer into v_existing_active from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active';
    if v_existing_active>0 then
        if exists(select 1 from (select oi.product_id,sum(oi.quantity)::integer quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested full join (select r.product_id,r.quantity from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active') reserved using(product_id) where requested.product_id is null or reserved.product_id is null or requested.quantity<>reserved.quantity) then raise exception 'RESERVATION_ITEMS_MISMATCH'; end if;
        v_until:=now()+make_interval(mins=>p_reservation_minutes);
        update private.order_stock_reservations set expires_at=v_until where order_stock_reservations.order_id=p_order_id and state='active';
        select count(*)::integer into v_item_count from private.order_stock_reservations where order_stock_reservations.order_id=p_order_id and state='active';
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
    on conflict(order_id,product_id) do update set quantity=excluded.quantity,state='active',reserved_at=now(),expires_at=excluded.expires_at,finalized_at=null,release_reason=null;
    get diagnostics v_item_count=row_count;
    return query select p_order_id,v_until,v_item_count;
end; $$;
revoke all on function public.reserve_order_stock_for_payment(bigint,integer) from public,anon,authenticated;
grant execute on function public.reserve_order_stock_for_payment(bigint,integer) to service_role;

create or replace function public.release_order_stock_reservation(p_order_id bigint,p_reason text default 'edge_release') returns integer language sql security definer set search_path='' as $$ select private.release_order_stock_reservation(p_order_id,p_reason); $$;
revoke all on function public.release_order_stock_reservation(bigint,text) from public,anon,authenticated;
grant execute on function public.release_order_stock_reservation(bigint,text) to service_role;

create or replace function private.release_stock_reservation_on_order_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
    if new.payment_status in ('rejected','cancelled') and new.payment_status is distinct from old.payment_status then perform private.release_order_stock_reservation(new.id,'payment_'||new.payment_status);
    elsif new.status='cancelado' and new.status is distinct from old.status then perform private.release_order_stock_reservation(new.id,'order_cancelled'); end if;
    return new;
end; $$;
revoke all on function private.release_stock_reservation_on_order_change() from public,anon,authenticated;
drop trigger if exists orders_release_stock_reservation on public.orders;
create trigger orders_release_stock_reservation after update of payment_status,status on public.orders for each row execute function private.release_stock_reservation_on_order_change();

create or replace function public.confirm_paid_order(p_order_id bigint,p_payment_id text,p_paid_at timestamptz)
returns table(order_id bigint,old_status text,new_status text,already_confirmed boolean) language plpgsql security definer set search_path='' as $$
declare v_old_status text; v_payment_status text; v_payment_id text; v_has_reservation boolean:=false;
begin
    if p_order_id is null or p_order_id<=0 then raise exception using errcode='22023',message='INVALID_ORDER_ID'; end if;
    if p_payment_id is null or btrim(p_payment_id)='' then raise exception using errcode='22023',message='PAYMENT_ID_REQUIRED'; end if;
    select o.status,o.payment_status,o.payment_id into v_old_status,v_payment_status,v_payment_id from public.orders o where o.id=p_order_id for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_payment_status<>'approved' then raise exception 'PAYMENT_NOT_APPROVED'; end if;
    if v_payment_id is null or v_payment_id<>p_payment_id then raise exception 'PAYMENT_ID_MISMATCH'; end if;
    if v_old_status='confirmado' then update public.orders o set payment_provider='mercadopago',paid_at=coalesce(o.paid_at,p_paid_at,now()) where o.id=p_order_id; return query select p_order_id,v_old_status,v_old_status,true; return; end if;
    if v_old_status<>'pendiente' then raise exception 'ORDER_CANNOT_BE_CONFIRMED'; end if;
    if not exists(select 1 from public.order_items oi where oi.order_id=p_order_id) then raise exception 'ORDER_ITEMS_EMPTY'; end if;
    select exists(select 1 from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active') into v_has_reservation;
    if v_has_reservation then
        if exists(select 1 from (select oi.product_id,sum(oi.quantity)::integer quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested full join (select r.product_id,r.quantity from private.order_stock_reservations r where r.order_id=p_order_id and r.state='active') reserved using(product_id) where requested.product_id is null or reserved.product_id is null or requested.quantity<>reserved.quantity) then raise exception 'RESERVATION_ITEMS_MISMATCH'; end if;
        update private.order_stock_reservations r set state='consumed',finalized_at=now(),release_reason='payment_approved' where r.order_id=p_order_id and r.state='active';
    else
        perform 1 from public.products p join (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested on requested.product_id=p.id order by p.id for update of p;
        if exists(select 1 from (select oi.product_id from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested left join public.products p on p.id=requested.product_id where p.id is null) then raise exception 'ORDER_PRODUCT_NOT_FOUND'; end if;
        if exists(select 1 from public.products p join (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested on requested.product_id=p.id where p.stock is null or p.stock<requested.required_quantity) then raise exception 'INSUFFICIENT_STOCK'; end if;
        update public.products p set stock=p.stock-requested.required_quantity from (select oi.product_id,sum(oi.quantity)::bigint required_quantity from public.order_items oi where oi.order_id=p_order_id group by oi.product_id) requested where p.id=requested.product_id;
    end if;
    update public.orders o set status='confirmado',payment_provider='mercadopago',paid_at=coalesce(o.paid_at,p_paid_at,now()) where o.id=p_order_id;
    return query select p_order_id,v_old_status,'confirmado'::text,false;
end; $$;
revoke all on function public.confirm_paid_order(bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.confirm_paid_order(bigint,text,timestamptz) to service_role;

select cron.unschedule(jobid) from cron.job where jobname='kantu-expire-stock-reservations';
select cron.schedule('kantu-expire-stock-reservations','*/5 * * * *','select private.expire_order_stock_reservations();');
