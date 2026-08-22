alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['customer'::text, 'admin'::text, 'florist'::text, 'delivery'::text]));

alter table public.orders
  add column if not exists subtotal numeric(12,2),
  add column if not exists delivery_fee numeric(12,2) not null default 0,
  add column if not exists delivery_distance_km numeric(8,2),
  add column if not exists delivery_lat numeric(9,6),
  add column if not exists delivery_lng numeric(9,6),
  add column if not exists estimated_delivery_minutes integer,
  add column if not exists prep_started_at timestamptz,
  add column if not exists ready_for_delivery_at timestamptz,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivered_at timestamptz;

update public.orders
set subtotal = coalesce(subtotal, total),
    delivery_fee = coalesce(delivery_fee, 0)
where subtotal is null or delivery_fee is null;

alter table public.orders alter column subtotal set default 0;
alter table public.orders alter column subtotal set not null;

alter table public.orders drop constraint if exists orders_delivery_fee_check;
alter table public.orders add constraint orders_delivery_fee_check check (delivery_fee >= 0);
alter table public.orders drop constraint if exists orders_delivery_distance_check;
alter table public.orders add constraint orders_delivery_distance_check check (delivery_distance_km is null or delivery_distance_km >= 0);
alter table public.orders drop constraint if exists orders_delivery_lat_check;
alter table public.orders add constraint orders_delivery_lat_check check (delivery_lat is null or delivery_lat between -90 and 90);
alter table public.orders drop constraint if exists orders_delivery_lng_check;
alter table public.orders add constraint orders_delivery_lng_check check (delivery_lng is null or delivery_lng between -180 and 180);
alter table public.orders drop constraint if exists orders_estimated_delivery_minutes_check;
alter table public.orders add constraint orders_estimated_delivery_minutes_check check (estimated_delivery_minutes is null or estimated_delivery_minutes between 1 and 240);

create index if not exists orders_staff_queue_idx
  on public.orders(payment_status, status, paid_at)
  where payment_status = 'approved';
create index if not exists orders_delivery_history_idx
  on public.orders(delivery_distance_km, delivery_started_at, delivered_at)
  where delivered_at is not null and delivery_started_at is not null;

create table if not exists public.delivery_pricing_settings (
  settings_key text primary key,
  origin_lat numeric(9,6) not null,
  origin_lng numeric(9,6) not null,
  road_factor numeric(5,2) not null default 1.25,
  base_fee numeric(12,2) not null default 5.00,
  included_km numeric(8,2) not null default 2.00,
  rate_2_5 numeric(12,2) not null default 1.20,
  rate_5_10 numeric(12,2) not null default 1.50,
  rate_over_10 numeric(12,2) not null default 1.80,
  max_distance_km numeric(8,2) not null default 25.00,
  updated_at timestamptz not null default now(),
  constraint delivery_pricing_settings_key_check check (settings_key = 'default'),
  constraint delivery_pricing_positive_check check (
    road_factor >= 1 and base_fee >= 0 and included_km >= 0 and
    rate_2_5 >= 0 and rate_5_10 >= 0 and rate_over_10 >= 0 and max_distance_km > 0
  )
);

insert into public.delivery_pricing_settings (
  settings_key, origin_lat, origin_lng, road_factor, base_fee, included_km,
  rate_2_5, rate_5_10, rate_over_10, max_distance_km
) values (
  'default', -16.4098229, -71.5223031, 1.25, 5.00, 2.00,
  1.20, 1.50, 1.80, 25.00
)
on conflict (settings_key) do nothing;

alter table public.delivery_pricing_settings enable row level security;

drop policy if exists "Admins can view delivery pricing" on public.delivery_pricing_settings;
create policy "Admins can view delivery pricing"
on public.delivery_pricing_settings for select to authenticated
using (public.is_admin());

drop policy if exists "Admins can update delivery pricing" on public.delivery_pricing_settings;
create policy "Admins can update delivery pricing"
on public.delivery_pricing_settings for update to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.delivery_pricing_settings from anon;
grant select, update on public.delivery_pricing_settings to authenticated;

create or replace function public.quote_delivery_fee(
  p_delivery_lat numeric,
  p_delivery_lng numeric
)
returns table(distance_km numeric, delivery_fee numeric, estimated_minutes integer, service_available boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_origin_lat numeric; v_origin_lng numeric; v_road_factor numeric;
  v_base_fee numeric; v_included_km numeric; v_rate_2_5 numeric;
  v_rate_5_10 numeric; v_rate_over_10 numeric; v_max_distance numeric;
  v_air_km numeric; v_distance numeric; v_fee numeric; v_remaining numeric;
  v_base_minutes integer; v_history_count integer; v_history_avg numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_delivery_lat is null or p_delivery_lng is null
     or p_delivery_lat not between -90 and 90
     or p_delivery_lng not between -180 and 180 then
    raise exception 'INVALID_DELIVERY_COORDINATES';
  end if;

  select origin_lat, origin_lng, road_factor, base_fee, included_km,
         rate_2_5, rate_5_10, rate_over_10, max_distance_km
    into v_origin_lat, v_origin_lng, v_road_factor, v_base_fee, v_included_km,
         v_rate_2_5, v_rate_5_10, v_rate_over_10, v_max_distance
  from public.delivery_pricing_settings where settings_key = 'default';
  if not found then raise exception 'DELIVERY_PRICING_NOT_CONFIGURED'; end if;

  v_air_km := 6371 * 2 * asin(sqrt(
    power(sin(radians((p_delivery_lat - v_origin_lat)::double precision) / 2), 2)
    + cos(radians(v_origin_lat::double precision))
    * cos(radians(p_delivery_lat::double precision))
    * power(sin(radians((p_delivery_lng - v_origin_lng)::double precision) / 2), 2)
  ));
  v_distance := round((v_air_km * v_road_factor)::numeric, 2);
  v_fee := v_base_fee;
  v_remaining := greatest(v_distance - v_included_km, 0);
  if v_remaining > 0 then
    v_fee := v_fee + least(v_remaining, 3) * v_rate_2_5;
    v_remaining := greatest(v_remaining - 3, 0);
  end if;
  if v_remaining > 0 then
    v_fee := v_fee + least(v_remaining, 5) * v_rate_5_10;
    v_remaining := greatest(v_remaining - 5, 0);
  end if;
  if v_remaining > 0 then v_fee := v_fee + v_remaining * v_rate_over_10; end if;
  v_fee := ceil(v_fee * 2) / 2;
  v_base_minutes := greatest(15, least(35, round(12 + v_distance * 1.8)::integer));

  select count(*)::integer,
         avg(extract(epoch from (o.delivered_at - o.delivery_started_at)) / 60.0)
    into v_history_count, v_history_avg
  from public.orders o
  where o.status = 'entregado'
    and o.delivery_started_at is not null and o.delivered_at is not null
    and o.delivered_at > o.delivery_started_at
    and o.delivered_at >= now() - interval '90 days'
    and o.delivery_distance_km between greatest(v_distance - 2, 0) and v_distance + 2
    and floor(extract(hour from timezone('America/Lima', o.delivery_started_at)) / 6)
        = floor(extract(hour from timezone('America/Lima', now())) / 6)
    and extract(epoch from (o.delivered_at - o.delivery_started_at)) between 300 and 7200;

  if v_history_count >= 3 and v_history_avg is not null then
    v_base_minutes := greatest(10, least(60,
      round((v_history_avg * 0.70) + (v_base_minutes * 0.30))::integer));
  end if;

  return query select v_distance, v_fee, v_base_minutes, (v_distance <= v_max_distance);
end;
$$;
revoke all on function public.quote_delivery_fee(numeric, numeric) from public, anon;
grant execute on function public.quote_delivery_fee(numeric, numeric) to authenticated;

create or replace function public.create_order(
  p_customer_name text, p_customer_phone text, p_delivery_address text,
  p_delivery_lat numeric, p_delivery_lng numeric
)
returns table(order_id bigint, total numeric, subtotal numeric, delivery_fee numeric,
              delivery_distance_km numeric, estimated_delivery_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid; v_order_id bigint; v_subtotal numeric := 0; v_total numeric := 0;
  v_delivery_fee numeric := 0; v_delivery_distance numeric := 0;
  v_estimated_minutes integer := 20; v_service_available boolean := false;
  v_item record; v_item_count integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if nullif(btrim(p_customer_name), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if nullif(btrim(p_customer_phone), '') is null then raise exception 'CUSTOMER_PHONE_REQUIRED'; end if;
  if nullif(btrim(p_delivery_address), '') is null then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;

  select q.distance_km, q.delivery_fee, q.estimated_minutes, q.service_available
    into v_delivery_distance, v_delivery_fee, v_estimated_minutes, v_service_available
  from public.quote_delivery_fee(p_delivery_lat, p_delivery_lng) q;
  if not coalesce(v_service_available, false) then raise exception 'DELIVERY_OUT_OF_RANGE'; end if;

  for v_item in
    select ci.product_id, ci.quantity, p.price, p.stock, p.active
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.user_id = v_user_id for update of ci, p
  loop
    v_item_count := v_item_count + 1;
    if v_item.quantity is null or v_item.quantity <= 0 then raise exception 'INVALID_CART'; end if;
    if v_item.active is not true then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    if v_item.stock is null or v_item.stock < v_item.quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;
  if v_item_count = 0 then raise exception 'CART_EMPTY'; end if;
  v_total := v_subtotal + v_delivery_fee;

  insert into public.orders (
    user_id, total, subtotal, delivery_fee, delivery_distance_km, delivery_lat, delivery_lng,
    estimated_delivery_minutes, status, customer_name, customer_phone, delivery_address
  ) values (
    v_user_id, v_total, v_subtotal, v_delivery_fee, v_delivery_distance, p_delivery_lat, p_delivery_lng,
    v_estimated_minutes, 'pendiente', btrim(p_customer_name), btrim(p_customer_phone), btrim(p_delivery_address)
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price)
  select v_order_id, ci.product_id, ci.quantity, p.price
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.user_id = v_user_id;
  delete from public.cart_items where user_id = v_user_id;

  return query select v_order_id, v_total, v_subtotal, v_delivery_fee, v_delivery_distance, v_estimated_minutes;
end;
$$;
revoke all on function public.create_order(text, text, text, numeric, numeric) from public, anon;
grant execute on function public.create_order(text, text, text, numeric, numeric) to authenticated;

create or replace function public.create_order(p_customer_name text, p_customer_phone text, p_delivery_address text)
returns table(order_id bigint, total numeric)
language plpgsql security definer set search_path = ''
as $$
declare v_match text[];
begin
  v_match := regexp_match(coalesce(p_delivery_address, ''), 'q=(-?[0-9]+[.][0-9]+),(-?[0-9]+[.][0-9]+)');
  if v_match is null or array_length(v_match, 1) <> 2 then raise exception 'DELIVERY_COORDINATES_REQUIRED'; end if;
  return query
  select c.order_id, c.total
  from public.create_order(p_customer_name, p_customer_phone, p_delivery_address,
                           v_match[1]::numeric, v_match[2]::numeric) c;
end;
$$;
revoke all on function public.create_order(text, text, text) from public, anon;
grant execute on function public.create_order(text, text, text) to authenticated;

create or replace function public.set_order_operational_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'preparando' then
      new.prep_started_at := coalesce(new.prep_started_at, now());
    elsif new.status = 'en_camino' then
      new.ready_for_delivery_at := coalesce(new.ready_for_delivery_at, now());
      new.delivery_started_at := coalesce(new.delivery_started_at, now());
    elsif new.status = 'entregado' then
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_operational_timestamps_trigger on public.orders;
create trigger orders_operational_timestamps_trigger before update on public.orders
for each row execute function public.set_order_operational_timestamps();

create or replace function public.staff_get_orders()
returns table(
  order_id bigint, status text, total numeric, subtotal numeric, delivery_fee numeric,
  delivery_distance_km numeric, estimated_delivery_minutes integer,
  customer_name text, customer_phone text, delivery_address text,
  paid_at timestamptz, prep_started_at timestamptz, ready_for_delivery_at timestamptz,
  delivery_started_at timestamptz, delivered_at timestamptz, queue_position integer, items jsonb
)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role not in ('admin', 'florist', 'delivery') then raise exception 'STAFF_PERMISSION_REQUIRED'; end if;

  return query
  select o.id, o.status, o.total, o.subtotal, o.delivery_fee, o.delivery_distance_km,
    o.estimated_delivery_minutes,
    case when v_role in ('admin', 'delivery') then o.customer_name else null end,
    case when v_role in ('admin', 'delivery') then o.customer_phone else null end,
    case when v_role in ('admin', 'delivery') then o.delivery_address else null end,
    o.paid_at, o.prep_started_at, o.ready_for_delivery_at, o.delivery_started_at, o.delivered_at,
    case when o.payment_status = 'approved' and o.status in ('confirmado', 'preparando')
              and o.ready_for_delivery_at is null then (
      select count(*)::integer from public.orders q
      where q.payment_status = 'approved' and q.status in ('confirmado', 'preparando')
        and q.ready_for_delivery_at is null
        and (coalesce(q.paid_at, q.created_at), q.id) <= (coalesce(o.paid_at, o.created_at), o.id)
    ) else null end,
    coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id, 'name', p.name, 'image', p.image,
      'quantity', oi.quantity, 'unit_price', oi.unit_price
    ) order by oi.id)
    from public.order_items oi left join public.products p on p.id = oi.product_id
    where oi.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.payment_status = 'approved' and (
    (v_role in ('admin', 'florist') and (
      o.status in ('confirmado', 'preparando', 'en_camino')
      or (o.status = 'entregado' and o.delivered_at >= now() - interval '12 hours')
    )) or
    (v_role = 'delivery' and (
      (o.status = 'preparando' and o.ready_for_delivery_at is not null)
      or o.status = 'en_camino'
      or (o.status = 'entregado' and o.delivered_at >= now() - interval '12 hours')
    ))
  )
  order by case when o.status = 'en_camino' then 0 when o.ready_for_delivery_at is not null then 1 else 2 end,
           coalesce(o.paid_at, o.created_at), o.id;
end;
$$;
revoke all on function public.staff_get_orders() from public, anon;
grant execute on function public.staff_get_orders() to authenticated;

create or replace function public.staff_update_order_operation(p_order_id bigint, p_action text)
returns table(order_id bigint, status text, prep_started_at timestamptz,
              ready_for_delivery_at timestamptz, delivery_started_at timestamptz, delivered_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_role text; v_order public.orders%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role not in ('admin', 'florist', 'delivery') then raise exception 'STAFF_PERMISSION_REQUIRED'; end if;
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'approved' then raise exception 'PAYMENT_NOT_APPROVED'; end if;

  if p_action = 'start_preparation' then
    if v_role not in ('admin', 'florist') then raise exception 'FLORIST_PERMISSION_REQUIRED'; end if;
    if v_order.status = 'preparando' then null;
    elsif v_order.status <> 'confirmado' then raise exception 'ORDER_NOT_READY_FOR_PREPARATION';
    else update public.orders set status = 'preparando', prep_started_at = coalesce(prep_started_at, now()) where id = p_order_id; end if;
  elsif p_action = 'mark_ready' then
    if v_role not in ('admin', 'florist') then raise exception 'FLORIST_PERMISSION_REQUIRED'; end if;
    if v_order.status <> 'preparando' then raise exception 'ORDER_NOT_IN_PREPARATION'; end if;
    update public.orders set ready_for_delivery_at = coalesce(ready_for_delivery_at, now()) where id = p_order_id;
  elsif p_action = 'start_delivery' then
    if v_role not in ('admin', 'delivery') then raise exception 'DELIVERY_PERMISSION_REQUIRED'; end if;
    if v_order.status = 'en_camino' then null;
    elsif v_order.status <> 'preparando' or v_order.ready_for_delivery_at is null then raise exception 'ORDER_NOT_READY_FOR_DELIVERY';
    else update public.orders set status = 'en_camino', delivery_started_at = coalesce(delivery_started_at, now()) where id = p_order_id; end if;
  elsif p_action = 'mark_delivered' then
    if v_role not in ('admin', 'delivery') then raise exception 'DELIVERY_PERMISSION_REQUIRED'; end if;
    if v_order.status = 'entregado' then null;
    elsif v_order.status <> 'en_camino' then raise exception 'ORDER_NOT_IN_DELIVERY';
    else update public.orders set status = 'entregado', delivered_at = coalesce(delivered_at, now()) where id = p_order_id; end if;
  else raise exception 'INVALID_STAFF_ACTION'; end if;

  return query select o.id, o.status, o.prep_started_at, o.ready_for_delivery_at,
                      o.delivery_started_at, o.delivered_at
  from public.orders o where o.id = p_order_id;
end;
$$;
revoke all on function public.staff_update_order_operation(bigint, text) from public, anon;
grant execute on function public.staff_update_order_operation(bigint, text) to authenticated;

create or replace function public.admin_list_team()
returns table(user_id uuid, full_name text, email text, role text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;
  return query select p.id, p.full_name, p.email, p.role from public.profiles p
  order by case p.role when 'admin' then 0 when 'florist' then 1 when 'delivery' then 2 else 3 end,
           lower(coalesce(p.full_name, p.email, ''));
end;
$$;
revoke all on function public.admin_list_team() from public, anon;
grant execute on function public.admin_list_team() to authenticated;

create or replace function public.admin_set_profile_role(p_user_id uuid, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;
  if p_user_id is null then raise exception 'USER_ID_REQUIRED'; end if;
  if p_role not in ('customer', 'admin', 'florist', 'delivery') then raise exception 'INVALID_PROFILE_ROLE'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'ADMIN_CANNOT_DEMOTE_SELF'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  return p_role;
end;
$$;
revoke all on function public.admin_set_profile_role(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;
