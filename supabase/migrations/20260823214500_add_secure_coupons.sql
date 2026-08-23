-- Kantu Floral: cupones/promociones server-authoritative.
-- No se crean códigos ficticios: Admin define las promociones reales.

create table if not exists public.coupons (
  id bigserial primary key,
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_subtotal numeric(12,2) not null default 0 check (min_subtotal >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  target_product_ids bigint[],
  target_categories text[],
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percent_value_check check (discount_type <> 'percent' or discount_value <= 100),
  constraint coupons_date_window_check check (starts_at is null or ends_at is null or starts_at <= ends_at),
  constraint coupons_code_format_check check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')
);

create or replace function public.normalize_coupon_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  new.updated_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  new.target_product_ids := case
    when new.target_product_ids is null then null
    else array(select distinct x from unnest(new.target_product_ids) x where x > 0 order by x)
  end;
  new.target_categories := case
    when new.target_categories is null then null
    else array(select distinct btrim(x) from unnest(new.target_categories) x where nullif(btrim(x), '') is not null order by btrim(x))
  end;
  if cardinality(new.target_product_ids) = 0 then new.target_product_ids := null; end if;
  if cardinality(new.target_categories) = 0 then new.target_categories := null; end if;
  return new;
end;
$$;

drop trigger if exists coupons_normalize_trigger on public.coupons;
create trigger coupons_normalize_trigger
before insert or update on public.coupons
for each row execute function public.normalize_coupon_row();

alter table public.coupons enable row level security;
revoke all on table public.coupons from public, anon, authenticated;
grant select, insert, update on table public.coupons to authenticated;
revoke all on sequence public.coupons_id_seq from public, anon;
grant usage, select on sequence public.coupons_id_seq to authenticated;

drop policy if exists "Admins can view coupons" on public.coupons;
create policy "Admins can view coupons" on public.coupons
for select to authenticated using (public.is_admin());

drop policy if exists "Admins can create coupons" on public.coupons;
create policy "Admins can create coupons" on public.coupons
for insert to authenticated with check (public.is_admin());

drop policy if exists "Admins can update coupons" on public.coupons;
create policy "Admins can update coupons" on public.coupons
for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.orders
  add column if not exists coupon_id bigint references public.coupons(id),
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.orders drop constraint if exists orders_discount_amount_check;
alter table public.orders add constraint orders_discount_amount_check check (discount_amount >= 0);

create table if not exists public.checkout_coupon_selections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coupon_code text not null,
  updated_at timestamptz not null default now()
);

alter table public.checkout_coupon_selections enable row level security;
revoke all on table public.checkout_coupon_selections from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.calculate_coupon_for_user(p_user_id uuid, p_code text)
returns table(
  coupon_id bigint,
  coupon_code text,
  cart_subtotal numeric,
  eligible_subtotal numeric,
  discount_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coupon public.coupons%rowtype;
  v_code text;
  v_cart_subtotal numeric := 0;
  v_eligible_subtotal numeric := 0;
  v_discount numeric := 0;
  v_used integer := 0;
  v_user_used integer := 0;
begin
  if p_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then raise exception 'COUPON_REQUIRED'; end if;

  select c.* into v_coupon from public.coupons c where c.code = v_code;
  if not found then raise exception 'COUPON_INVALID'; end if;
  if not v_coupon.active then raise exception 'COUPON_INACTIVE'; end if;
  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception 'COUPON_NOT_STARTED'; end if;
  if v_coupon.ends_at is not null and now() > v_coupon.ends_at then raise exception 'COUPON_EXPIRED'; end if;

  select coalesce(sum(p.price * ci.quantity), 0)
    into v_cart_subtotal
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = p_user_id
    and p.active = true
    and ci.quantity > 0;

  if v_cart_subtotal <= 0 then raise exception 'CART_EMPTY'; end if;
  if v_cart_subtotal < v_coupon.min_subtotal then raise exception 'COUPON_MIN_SUBTOTAL'; end if;

  select coalesce(sum(p.price * ci.quantity), 0)
    into v_eligible_subtotal
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = p_user_id
    and p.active = true
    and ci.quantity > 0
    and (
      (v_coupon.target_product_ids is null and v_coupon.target_categories is null)
      or (v_coupon.target_product_ids is not null and p.id = any(v_coupon.target_product_ids))
      or (v_coupon.target_categories is not null and p.category = any(v_coupon.target_categories))
    );

  if v_eligible_subtotal <= 0 then raise exception 'COUPON_NOT_APPLICABLE'; end if;

  if v_coupon.max_redemptions is not null then
    select count(*)::integer into v_used
    from public.orders o
    where o.coupon_id = v_coupon.id and o.status <> 'cancelado';
    if v_used >= v_coupon.max_redemptions then raise exception 'COUPON_USAGE_LIMIT'; end if;
  end if;

  if v_coupon.per_user_limit is not null then
    select count(*)::integer into v_user_used
    from public.orders o
    where o.coupon_id = v_coupon.id
      and o.user_id = p_user_id
      and o.status <> 'cancelado';
    if v_user_used >= v_coupon.per_user_limit then raise exception 'COUPON_USER_LIMIT'; end if;
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := round(v_eligible_subtotal * v_coupon.discount_value / 100.0, 2);
  else
    v_discount := least(v_coupon.discount_value, v_eligible_subtotal);
  end if;
  v_discount := greatest(0, least(v_discount, v_cart_subtotal));

  return query select v_coupon.id, v_coupon.code, v_cart_subtotal, v_eligible_subtotal, v_discount;
end;
$$;

revoke all on function private.calculate_coupon_for_user(uuid, text) from public, anon, authenticated;

create or replace function public.select_checkout_coupon(p_code text)
returns table(
  coupon_code text,
  cart_subtotal numeric,
  eligible_subtotal numeric,
  discount_amount numeric,
  subtotal_after_discount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote record;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into v_quote from private.calculate_coupon_for_user(v_user_id, p_code);

  insert into public.checkout_coupon_selections(user_id, coupon_code, updated_at)
  values (v_user_id, v_quote.coupon_code, now())
  on conflict (user_id) do update
    set coupon_code = excluded.coupon_code, updated_at = excluded.updated_at;

  return query select
    v_quote.coupon_code,
    v_quote.cart_subtotal,
    v_quote.eligible_subtotal,
    v_quote.discount_amount,
    greatest(0, v_quote.cart_subtotal - v_quote.discount_amount);
end;
$$;

revoke all on function public.select_checkout_coupon(text) from public, anon;
grant execute on function public.select_checkout_coupon(text) to authenticated;

create or replace function public.clear_checkout_coupon()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return false; end if;
  delete from public.checkout_coupon_selections s where s.user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.clear_checkout_coupon() from public, anon;
grant execute on function public.clear_checkout_coupon() to authenticated;

create or replace function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric,
  p_recipient_name text,
  p_recipient_phone text,
  p_gift_message text,
  p_is_surprise boolean,
  p_requested_delivery_date date,
  p_requested_delivery_slot text
)
returns table(order_id bigint, total numeric, subtotal numeric, delivery_fee numeric, delivery_distance_km numeric, estimated_delivery_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_order_id bigint;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_delivery_distance numeric := 0;
  v_estimated_minutes integer := 20;
  v_service_available boolean := false;
  v_item record;
  v_item_count integer := 0;
  v_recipient_name text;
  v_recipient_phone text;
  v_gift_message text;
  v_delivery_slot text;
  v_schedule_enabled boolean := false;
  v_min_lead_hours integer := 0;
  v_max_days_ahead integer := 30;
  v_slots text[] := '{}'::text[];
  v_now_local timestamp without time zone := timezone('America/Lima', now());
  v_today date;
  v_slot_start time without time zone;
  v_selected_coupon text;
  v_coupon_id bigint;
  v_coupon_code text;
  v_discount numeric := 0;
  v_coupon_quote record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if nullif(btrim(p_customer_name), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if nullif(btrim(p_customer_phone), '') is null then raise exception 'CUSTOMER_PHONE_REQUIRED'; end if;
  if nullif(btrim(p_delivery_address), '') is null then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;

  v_recipient_name := coalesce(nullif(btrim(p_recipient_name), ''), btrim(p_customer_name));
  v_recipient_phone := coalesce(nullif(btrim(p_recipient_phone), ''), btrim(p_customer_phone));
  v_gift_message := nullif(btrim(p_gift_message), '');
  v_delivery_slot := nullif(btrim(p_requested_delivery_slot), '');
  v_today := v_now_local::date;

  if char_length(v_recipient_name) > 120 then raise exception 'RECIPIENT_NAME_TOO_LONG'; end if;
  if char_length(v_recipient_phone) > 40 then raise exception 'RECIPIENT_PHONE_TOO_LONG'; end if;
  if v_gift_message is not null and char_length(v_gift_message) > 500 then raise exception 'GIFT_MESSAGE_TOO_LONG'; end if;

  select s.scheduling_enabled, s.min_lead_hours, s.max_days_ahead, s.slots
    into v_schedule_enabled, v_min_lead_hours, v_max_days_ahead, v_slots
  from public.delivery_schedule_settings s where s.id = 1;

  if p_requested_delivery_date is null and v_delivery_slot is not null then raise exception 'DELIVERY_DATE_REQUIRED_FOR_SLOT'; end if;
  if p_requested_delivery_date is not null then
    if not coalesce(v_schedule_enabled, false) then raise exception 'DELIVERY_SCHEDULING_DISABLED'; end if;
    if p_requested_delivery_date < v_today then raise exception 'INVALID_DELIVERY_DATE'; end if;
    if p_requested_delivery_date > (v_today + coalesce(v_max_days_ahead, 30)) then raise exception 'DELIVERY_DATE_TOO_FAR'; end if;
    if v_delivery_slot is null then raise exception 'DELIVERY_SLOT_REQUIRED'; end if;
    if not (v_delivery_slot = any(coalesce(v_slots, '{}'::text[]))) then raise exception 'INVALID_DELIVERY_SLOT'; end if;
    if v_delivery_slot !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_DELIVERY_SLOT'; end if;
    v_slot_start := split_part(v_delivery_slot, '-', 1)::time;
    if (p_requested_delivery_date::timestamp + v_slot_start) < (v_now_local + make_interval(hours => coalesce(v_min_lead_hours, 0))) then
      raise exception 'DELIVERY_SLOT_TOO_SOON';
    end if;
  end if;

  select q.distance_km, q.delivery_fee, q.estimated_minutes, q.service_available
    into v_delivery_distance, v_delivery_fee, v_estimated_minutes, v_service_available
  from public.quote_delivery_fee(p_delivery_lat, p_delivery_lng) q;
  if not coalesce(v_service_available, false) then raise exception 'DELIVERY_OUT_OF_RANGE'; end if;

  for v_item in
    select ci.product_id, ci.quantity, p.price, p.stock, p.active
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = v_user_id
    for update of ci, p
  loop
    v_item_count := v_item_count + 1;
    if v_item.quantity is null or v_item.quantity <= 0 then raise exception 'INVALID_CART'; end if;
    if v_item.active is not true then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    if v_item.stock is null or v_item.stock < v_item.quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;
  if v_item_count = 0 then raise exception 'CART_EMPTY'; end if;

  select s.coupon_code into v_selected_coupon
  from public.checkout_coupon_selections s
  where s.user_id = v_user_id
  for update;

  if v_selected_coupon is not null then
    -- Bloquea el cupón para que el límite de usos sea consistente bajo concurrencia.
    perform 1 from public.coupons c where c.code = upper(btrim(v_selected_coupon)) for update;
    if not found then raise exception 'COUPON_INVALID'; end if;
    select * into v_coupon_quote from private.calculate_coupon_for_user(v_user_id, v_selected_coupon);
    v_coupon_id := v_coupon_quote.coupon_id;
    v_coupon_code := v_coupon_quote.coupon_code;
    v_discount := v_coupon_quote.discount_amount;
  end if;

  v_total := greatest(0, v_subtotal - v_discount) + v_delivery_fee;

  insert into public.orders (
    user_id, total, subtotal, delivery_fee, delivery_distance_km, delivery_lat, delivery_lng,
    estimated_delivery_minutes, status, customer_name, customer_phone, delivery_address,
    recipient_name, recipient_phone, gift_message, is_surprise, requested_delivery_date,
    requested_delivery_slot, coupon_id, coupon_code, discount_amount
  ) values (
    v_user_id, v_total, v_subtotal, v_delivery_fee, v_delivery_distance, p_delivery_lat, p_delivery_lng,
    v_estimated_minutes, 'pendiente', btrim(p_customer_name), btrim(p_customer_phone), btrim(p_delivery_address),
    v_recipient_name, v_recipient_phone, v_gift_message, coalesce(p_is_surprise, false),
    p_requested_delivery_date, v_delivery_slot, v_coupon_id, v_coupon_code, v_discount
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price)
  select v_order_id, ci.product_id, ci.quantity, p.price
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.user_id = v_user_id;

  delete from public.cart_items where user_id = v_user_id;
  delete from public.checkout_coupon_selections where user_id = v_user_id;

  return query select v_order_id, v_total, v_subtotal, v_delivery_fee, v_delivery_distance, v_estimated_minutes;
end;
$$;

revoke all on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) from public, anon;
grant execute on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) to authenticated;

create or replace function public.kantu_coupons_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
select jsonb_build_object(
  'healthy',
    (select relrowsecurity from pg_catalog.pg_class where oid='public.coupons'::regclass)
    and (select relrowsecurity from pg_catalog.pg_class where oid='public.checkout_coupon_selections'::regclass)
    and to_regprocedure('public.select_checkout_coupon(text)') is not null
    and to_regprocedure('public.clear_checkout_coupon()') is not null
    and to_regprocedure('private.calculate_coupon_for_user(uuid,text)') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_amount'),
  'coupons_rls', (select relrowsecurity from pg_catalog.pg_class where oid='public.coupons'::regclass),
  'selections_rls', (select relrowsecurity from pg_catalog.pg_class where oid='public.checkout_coupon_selections'::regclass),
  'quote_rpc', to_regprocedure('public.select_checkout_coupon(text)') is not null,
  'clear_rpc', to_regprocedure('public.clear_checkout_coupon()') is not null,
  'discount_columns', exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_amount')
);
$$;

revoke all on function public.kantu_coupons_health_check() from public, anon, authenticated;
grant execute on function public.kantu_coupons_health_check() to service_role;
