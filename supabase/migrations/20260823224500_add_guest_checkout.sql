-- Kantu Floral: checkout invitado con acceso por token opaco.
-- El token crudo nunca se almacena en PostgreSQL: solo SHA-256 hexadecimal.

create schema if not exists private;

create table if not exists public.guest_order_access (
  order_id bigint primary key references public.orders(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint guest_order_access_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint guest_order_access_expiry_check check (expires_at > created_at)
);

alter table public.guest_order_access enable row level security;
revoke all on table public.guest_order_access from public, anon, authenticated;
grant select, insert, update, delete on table public.guest_order_access to service_role;

create index if not exists guest_order_access_expires_at_idx
  on public.guest_order_access (expires_at);

create table if not exists public.guest_checkout_rate_limits (
  fingerprint_hash text not null,
  action text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (fingerprint_hash, action),
  constraint guest_checkout_rate_hash_check check (fingerprint_hash ~ '^[a-f0-9]{64}$'),
  constraint guest_checkout_rate_action_check check (action ~ '^[a-z_]{2,40}$'),
  constraint guest_checkout_rate_attempts_check check (attempts >= 0)
);

alter table public.guest_checkout_rate_limits enable row level security;
revoke all on table public.guest_checkout_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.guest_checkout_rate_limits to service_role;

create or replace function private.calculate_delivery_quote(
  p_delivery_lat numeric,
  p_delivery_lng numeric
)
returns table(
  distance_km numeric,
  delivery_fee numeric,
  estimated_minutes integer,
  service_available boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin_lat numeric;
  v_origin_lng numeric;
  v_road_factor numeric;
  v_base_fee numeric;
  v_included_km numeric;
  v_rate_2_5 numeric;
  v_rate_5_10 numeric;
  v_rate_over_10 numeric;
  v_max_distance numeric;
  v_air_km numeric;
  v_distance numeric;
  v_fee numeric;
  v_remaining numeric;
  v_base_minutes integer;
  v_history_count integer;
  v_history_avg numeric;
begin
  if p_delivery_lat is null or p_delivery_lng is null
     or p_delivery_lat not between -90 and 90
     or p_delivery_lng not between -180 and 180 then
    raise exception 'INVALID_DELIVERY_COORDINATES';
  end if;

  select origin_lat, origin_lng, road_factor, base_fee, included_km,
         rate_2_5, rate_5_10, rate_over_10, max_distance_km
    into v_origin_lat, v_origin_lng, v_road_factor, v_base_fee, v_included_km,
         v_rate_2_5, v_rate_5_10, v_rate_over_10, v_max_distance
  from public.delivery_pricing_settings
  where settings_key = 'default';

  if not found then
    raise exception 'DELIVERY_PRICING_NOT_CONFIGURED';
  end if;

  v_air_km := 6371 * 2 * asin(
    sqrt(
      power(sin(radians((p_delivery_lat - v_origin_lat)::double precision) / 2), 2)
      + cos(radians(v_origin_lat::double precision))
      * cos(radians(p_delivery_lat::double precision))
      * power(sin(radians((p_delivery_lng - v_origin_lng)::double precision) / 2), 2)
    )
  );

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
  if v_remaining > 0 then
    v_fee := v_fee + v_remaining * v_rate_over_10;
  end if;

  v_fee := ceil(v_fee * 2) / 2;
  v_base_minutes := greatest(15, least(35, round(12 + v_distance * 1.8)::integer));

  select count(*)::integer,
         avg(extract(epoch from (o.delivered_at - o.delivery_started_at)) / 60.0)
    into v_history_count, v_history_avg
  from public.orders o
  where o.status = 'entregado'
    and o.delivery_started_at is not null
    and o.delivered_at is not null
    and o.delivered_at > o.delivery_started_at
    and o.delivered_at >= now() - interval '90 days'
    and o.delivery_distance_km between greatest(v_distance - 2, 0) and v_distance + 2
    and floor(extract(hour from timezone('America/Lima', o.delivery_started_at)) / 6)
        = floor(extract(hour from timezone('America/Lima', now())) / 6)
    and extract(epoch from (o.delivered_at - o.delivery_started_at)) between 300 and 7200;

  if v_history_count >= 3 and v_history_avg is not null then
    v_base_minutes := greatest(
      10,
      least(60, round((v_history_avg * 0.70) + (v_base_minutes * 0.30))::integer)
    );
  end if;

  return query
  select v_distance, v_fee, v_base_minutes, (v_distance <= v_max_distance);
end;
$$;

revoke all on function private.calculate_delivery_quote(numeric, numeric) from public, anon, authenticated;

create or replace function public.quote_delivery_fee(
  p_delivery_lat numeric,
  p_delivery_lng numeric
)
returns table(
  distance_km numeric,
  delivery_fee numeric,
  estimated_minutes integer,
  service_available boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  return query
  select * from private.calculate_delivery_quote(p_delivery_lat, p_delivery_lng);
end;
$$;

revoke all on function public.quote_delivery_fee(numeric, numeric) from public, anon;
grant execute on function public.quote_delivery_fee(numeric, numeric) to authenticated, service_role;

create or replace function public.service_quote_delivery_fee(
  p_delivery_lat numeric,
  p_delivery_lng numeric
)
returns table(
  distance_km numeric,
  delivery_fee numeric,
  estimated_minutes integer,
  service_available boolean
)
language sql
security definer
set search_path = ''
as $$
  select * from private.calculate_delivery_quote(p_delivery_lat, p_delivery_lng);
$$;

revoke all on function public.service_quote_delivery_fee(numeric, numeric) from public, anon, authenticated;
grant execute on function public.service_quote_delivery_fee(numeric, numeric) to service_role;

create or replace function public.consume_guest_checkout_rate_limit(
  p_fingerprint_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer default 3600
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.guest_checkout_rate_limits%rowtype;
  v_now timestamptz := now();
  v_window interval;
begin
  if p_fingerprint_hash is null or p_fingerprint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_RATE_FINGERPRINT';
  end if;
  if p_action is null or p_action !~ '^[a-z_]{2,40}$' then
    raise exception 'INVALID_RATE_ACTION';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;
  if p_window_seconds is null or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_WINDOW';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.guest_checkout_rate_limits(fingerprint_hash, action, window_started_at, attempts)
  values (p_fingerprint_hash, p_action, v_now, 0)
  on conflict (fingerprint_hash, action) do nothing;

  select * into v_row
  from public.guest_checkout_rate_limits
  where fingerprint_hash = p_fingerprint_hash and action = p_action
  for update;

  if v_row.window_started_at + v_window <= v_now then
    update public.guest_checkout_rate_limits
       set window_started_at = v_now, attempts = 1
     where fingerprint_hash = p_fingerprint_hash and action = p_action;
    return query select true, 0;
    return;
  end if;

  if v_row.attempts >= p_limit then
    return query
    select false,
           greatest(1, ceil(extract(epoch from ((v_row.window_started_at + v_window) - v_now)))::integer);
    return;
  end if;

  update public.guest_checkout_rate_limits
     set attempts = attempts + 1
   where fingerprint_hash = p_fingerprint_hash and action = p_action;

  return query select true, 0;
end;
$$;

revoke all on function public.consume_guest_checkout_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_guest_checkout_rate_limit(text, text, integer, integer) to service_role;

create or replace function public.create_guest_order(
  p_access_token_hash text,
  p_items jsonb,
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
returns table(
  order_id bigint,
  total numeric,
  subtotal numeric,
  delivery_fee numeric,
  delivery_distance_km numeric,
  estimated_delivery_minutes integer,
  discount_amount numeric,
  access_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id bigint;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_delivery_distance numeric := 0;
  v_estimated_minutes integer := 20;
  v_service_available boolean := false;
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
  v_item record;
  v_product record;
  v_expiry timestamptz := now() + interval '30 days';
begin
  if p_access_token_hash is null or p_access_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_GUEST_ACCESS_TOKEN_HASH';
  end if;
  if nullif(btrim(p_customer_name), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if nullif(btrim(p_customer_phone), '') is null then raise exception 'CUSTOMER_PHONE_REQUIRED'; end if;
  if nullif(btrim(p_delivery_address), '') is null then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;
  if char_length(btrim(p_customer_name)) > 120 then raise exception 'CUSTOMER_NAME_TOO_LONG'; end if;
  if char_length(btrim(p_customer_phone)) > 40 then raise exception 'CUSTOMER_PHONE_TOO_LONG'; end if;
  if char_length(btrim(p_delivery_address)) > 700 then raise exception 'DELIVERY_ADDRESS_TOO_LONG'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'INVALID_CART';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item->>'product_id', '') !~ '^[1-9][0-9]*$'
       or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$'
       or length(item->>'product_id') > 18
       or length(item->>'quantity') > 9
  ) then
    raise exception 'INVALID_CART';
  end if;

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
  from public.delivery_schedule_settings s
  where s.id = 1;

  if p_requested_delivery_date is null and v_delivery_slot is not null then
    raise exception 'DELIVERY_DATE_REQUIRED_FOR_SLOT';
  end if;

  if p_requested_delivery_date is not null then
    if not coalesce(v_schedule_enabled, false) then raise exception 'DELIVERY_SCHEDULING_DISABLED'; end if;
    if p_requested_delivery_date < v_today then raise exception 'INVALID_DELIVERY_DATE'; end if;
    if p_requested_delivery_date > (v_today + coalesce(v_max_days_ahead, 30)) then raise exception 'DELIVERY_DATE_TOO_FAR'; end if;
    if v_delivery_slot is null then raise exception 'DELIVERY_SLOT_REQUIRED'; end if;
    if not (v_delivery_slot = any(coalesce(v_slots, '{}'::text[]))) then raise exception 'INVALID_DELIVERY_SLOT'; end if;
    if v_delivery_slot !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_DELIVERY_SLOT'; end if;
    v_slot_start := split_part(v_delivery_slot, '-', 1)::time;
    if (p_requested_delivery_date::timestamp + v_slot_start)
       < (v_now_local + make_interval(hours => coalesce(v_min_lead_hours, 0))) then
      raise exception 'DELIVERY_SLOT_TOO_SOON';
    end if;
  end if;

  select q.distance_km, q.delivery_fee, q.estimated_minutes, q.service_available
    into v_delivery_distance, v_delivery_fee, v_estimated_minutes, v_service_available
  from private.calculate_delivery_quote(p_delivery_lat, p_delivery_lng) q;

  if not coalesce(v_service_available, false) then raise exception 'DELIVERY_OUT_OF_RANGE'; end if;

  for v_item in
    select (item->>'product_id')::bigint as product_id,
           sum((item->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_items) item
    group by (item->>'product_id')::bigint
    order by (item->>'product_id')::bigint
  loop
    if v_item.quantity <= 0 or v_item.quantity > 2147483647 then raise exception 'INVALID_CART'; end if;

    select p.id, p.price, p.stock, p.active
      into v_product
    from public.products p
    where p.id = v_item.product_id
    for update;

    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    if v_product.active is not true then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    if v_product.stock is null or v_product.stock::bigint < v_item.quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
  end loop;

  if v_subtotal <= 0 then raise exception 'INVALID_CART'; end if;
  v_total := v_subtotal + v_delivery_fee;

  insert into public.orders (
    user_id, total, subtotal, delivery_fee, delivery_distance_km, delivery_lat, delivery_lng,
    estimated_delivery_minutes, status, customer_name, customer_phone, delivery_address,
    recipient_name, recipient_phone, gift_message, is_surprise,
    requested_delivery_date, requested_delivery_slot,
    promotion_id, promotion_code, discount_amount
  ) values (
    null, v_total, v_subtotal, v_delivery_fee, v_delivery_distance, p_delivery_lat, p_delivery_lng,
    v_estimated_minutes, 'pendiente', btrim(p_customer_name), btrim(p_customer_phone), btrim(p_delivery_address),
    v_recipient_name, v_recipient_phone, v_gift_message, coalesce(p_is_surprise, false),
    p_requested_delivery_date, v_delivery_slot,
    null, null, 0
  ) returning id into v_order_id;

  insert into public.order_items(order_id, product_id, quantity, unit_price)
  select v_order_id,
         aggregated.product_id,
         aggregated.quantity::integer,
         p.price
  from (
    select (item->>'product_id')::bigint as product_id,
           sum((item->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_items) item
    group by (item->>'product_id')::bigint
  ) aggregated
  join public.products p on p.id = aggregated.product_id;

  insert into public.guest_order_access(order_id, token_hash, expires_at)
  values (v_order_id, p_access_token_hash, v_expiry);

  return query
  select v_order_id, v_total, v_subtotal, v_delivery_fee, v_delivery_distance,
         v_estimated_minutes, 0::numeric, v_expiry;
end;
$$;

revoke all on function public.create_guest_order(text, jsonb, text, text, text, numeric, numeric, text, text, text, boolean, date, text) from public, anon, authenticated;
grant execute on function public.create_guest_order(text, jsonb, text, text, text, numeric, numeric, text, text, text, boolean, date, text) to service_role;

alter table public.payment_proofs alter column user_id drop not null;

-- Deja explícito que NULL/NULL representa correctamente un comprobante de un pedido invitado,
-- y sigue rechazando cualquier combinación donde solo uno de los dos propietarios sea NULL.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'approve_manual_payment'
    and pg_get_function_identity_arguments(p.oid) = 'p_payment_proof_id bigint';

  if v_definition is null then
    raise exception 'APPROVE_MANUAL_PAYMENT_FUNCTION_NOT_FOUND';
  end if;

  if position('v_proof_user_id is distinct from v_order_user_id' in lower(v_definition)) = 0 then
    if position('v_proof_user_id <> v_order_user_id' in v_definition) = 0 then
      raise exception 'APPROVE_MANUAL_PAYMENT_OWNER_CHECK_NOT_FOUND';
    end if;
    v_definition := replace(
      v_definition,
      'v_proof_user_id <> v_order_user_id',
      'v_proof_user_id is distinct from v_order_user_id'
    );
    execute v_definition;
  end if;
end
$$;

create or replace function public.kantu_guest_checkout_health_check()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'healthy',
      coalesce(c.relrowsecurity, false)
      and coalesce(r.relrowsecurity, false)
      and not has_table_privilege('anon', 'public.guest_order_access', 'SELECT')
      and not has_table_privilege('authenticated', 'public.guest_order_access', 'SELECT')
      and not has_function_privilege('anon', 'public.create_guest_order(text,jsonb,text,text,text,numeric,numeric,text,text,text,boolean,date,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.create_guest_order(text,jsonb,text,text,text,numeric,numeric,text,text,text,boolean,date,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.service_quote_delivery_fee(numeric,numeric)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.service_quote_delivery_fee(numeric,numeric)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.quote_delivery_fee(numeric,numeric)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.quote_delivery_fee(numeric,numeric)', 'EXECUTE')
      and a.attnotnull = false
      and position('v_proof_user_id is distinct from v_order_user_id' in lower(pg_get_functiondef(ap.oid))) > 0,
    'guest_access_rls', coalesce(c.relrowsecurity, false),
    'rate_limit_rls', coalesce(r.relrowsecurity, false),
    'guest_access_client_blocked',
      not has_table_privilege('anon', 'public.guest_order_access', 'SELECT')
      and not has_table_privilege('authenticated', 'public.guest_order_access', 'SELECT'),
    'guest_create_service_only',
      not has_function_privilege('anon', 'public.create_guest_order(text,jsonb,text,text,text,numeric,numeric,text,text,text,boolean,date,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.create_guest_order(text,jsonb,text,text,text,numeric,numeric,text,text,text,boolean,date,text)', 'EXECUTE'),
    'guest_quote_service_only',
      not has_function_privilege('anon', 'public.service_quote_delivery_fee(numeric,numeric)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.service_quote_delivery_fee(numeric,numeric)', 'EXECUTE'),
    'authenticated_quote_preserved',
      has_function_privilege('authenticated', 'public.quote_delivery_fee(numeric,numeric)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.quote_delivery_fee(numeric,numeric)', 'EXECUTE'),
    'payment_proof_guest_nullable', a.attnotnull = false,
    'manual_owner_check_null_safe', position('v_proof_user_id is distinct from v_order_user_id' in lower(pg_get_functiondef(ap.oid))) > 0
  )
  from pg_class c
  join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'public' and c.relname = 'guest_order_access'
  cross join pg_class r
  join pg_namespace rn on rn.oid = r.relnamespace and rn.nspname = 'public' and r.relname = 'guest_checkout_rate_limits'
  cross join pg_attribute a
  join pg_class pp on pp.oid = a.attrelid
  join pg_namespace ppn on ppn.oid = pp.relnamespace
  cross join pg_proc ap
  join pg_namespace apn on apn.oid = ap.pronamespace
  where ppn.nspname = 'public'
    and pp.relname = 'payment_proofs'
    and a.attname = 'user_id'
    and not a.attisdropped
    and apn.nspname = 'public'
    and ap.proname = 'approve_manual_payment'
    and pg_get_function_identity_arguments(ap.oid) = 'p_payment_proof_id bigint';
$$;

revoke all on function public.kantu_guest_checkout_health_check() from public, anon, authenticated;
grant execute on function public.kantu_guest_checkout_health_check() to service_role;
