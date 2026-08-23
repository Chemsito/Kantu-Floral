-- Kantu Floral: destinatario, tarjeta de regalo y entrega programable.

alter table public.orders
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists gift_message text,
  add column if not exists is_surprise boolean not null default false,
  add column if not exists requested_delivery_date date,
  add column if not exists requested_delivery_slot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_recipient_name_length_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_recipient_name_length_check
      check (recipient_name is null or char_length(recipient_name) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_recipient_phone_length_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_recipient_phone_length_check
      check (recipient_phone is null or char_length(recipient_phone) <= 40);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_gift_message_length_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_gift_message_length_check
      check (gift_message is null or char_length(gift_message) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_slot_length_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_slot_length_check
      check (requested_delivery_slot is null or char_length(requested_delivery_slot) <= 32);
  end if;
end
$$;

create table if not exists public.delivery_schedule_settings (
  id smallint primary key default 1 check (id = 1),
  scheduling_enabled boolean not null default false,
  min_lead_hours integer not null default 0 check (min_lead_hours between 0 and 168),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  slots text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

insert into public.delivery_schedule_settings (
  id,
  scheduling_enabled,
  min_lead_hours,
  max_days_ahead,
  slots
) values (1, false, 0, 30, '{}'::text[])
on conflict (id) do nothing;

alter table public.delivery_schedule_settings enable row level security;

revoke all on table public.delivery_schedule_settings from public, anon;
grant select, update on table public.delivery_schedule_settings to authenticated;
grant all on table public.delivery_schedule_settings to service_role;

drop policy if exists "Authenticated users can read delivery schedule" on public.delivery_schedule_settings;
create policy "Authenticated users can read delivery schedule"
on public.delivery_schedule_settings
for select
to authenticated
using (true);

drop policy if exists "Admins can update delivery schedule" on public.delivery_schedule_settings;
create policy "Admins can update delivery schedule"
on public.delivery_schedule_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

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
returns table(
  order_id bigint,
  total numeric,
  subtotal numeric,
  delivery_fee numeric,
  delivery_distance_km numeric,
  estimated_delivery_minutes integer
)
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

  select
    s.scheduling_enabled,
    s.min_lead_hours,
    s.max_days_ahead,
    s.slots
  into
    v_schedule_enabled,
    v_min_lead_hours,
    v_max_days_ahead,
    v_slots
  from public.delivery_schedule_settings s
  where s.id = 1;

  if p_requested_delivery_date is null and v_delivery_slot is not null then
    raise exception 'DELIVERY_DATE_REQUIRED_FOR_SLOT';
  end if;

  if p_requested_delivery_date is not null then
    if not coalesce(v_schedule_enabled, false) then
      raise exception 'DELIVERY_SCHEDULING_DISABLED';
    end if;
    if p_requested_delivery_date < v_today then
      raise exception 'INVALID_DELIVERY_DATE';
    end if;
    if p_requested_delivery_date > (v_today + coalesce(v_max_days_ahead, 30)) then
      raise exception 'DELIVERY_DATE_TOO_FAR';
    end if;
    if v_delivery_slot is null then
      raise exception 'DELIVERY_SLOT_REQUIRED';
    end if;
    if not (v_delivery_slot = any(coalesce(v_slots, '{}'::text[]))) then
      raise exception 'INVALID_DELIVERY_SLOT';
    end if;
    if v_delivery_slot !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'INVALID_DELIVERY_SLOT';
    end if;

    v_slot_start := split_part(v_delivery_slot, '-', 1)::time;
    if (p_requested_delivery_date::timestamp + v_slot_start)
       < (v_now_local + make_interval(hours => coalesce(v_min_lead_hours, 0))) then
      raise exception 'DELIVERY_SLOT_TOO_SOON';
    end if;
  end if;

  select q.distance_km, q.delivery_fee, q.estimated_minutes, q.service_available
    into v_delivery_distance, v_delivery_fee, v_estimated_minutes, v_service_available
  from public.quote_delivery_fee(p_delivery_lat, p_delivery_lng) q;

  if not coalesce(v_service_available, false) then
    raise exception 'DELIVERY_OUT_OF_RANGE';
  end if;

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
  v_total := v_subtotal + v_delivery_fee;

  insert into public.orders (
    user_id,
    total,
    subtotal,
    delivery_fee,
    delivery_distance_km,
    delivery_lat,
    delivery_lng,
    estimated_delivery_minutes,
    status,
    customer_name,
    customer_phone,
    delivery_address,
    recipient_name,
    recipient_phone,
    gift_message,
    is_surprise,
    requested_delivery_date,
    requested_delivery_slot
  ) values (
    v_user_id,
    v_total,
    v_subtotal,
    v_delivery_fee,
    v_delivery_distance,
    p_delivery_lat,
    p_delivery_lng,
    v_estimated_minutes,
    'pendiente',
    btrim(p_customer_name),
    btrim(p_customer_phone),
    btrim(p_delivery_address),
    v_recipient_name,
    v_recipient_phone,
    v_gift_message,
    coalesce(p_is_surprise, false),
    p_requested_delivery_date,
    v_delivery_slot
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price)
  select v_order_id, ci.product_id, ci.quantity, p.price
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = v_user_id;

  delete from public.cart_items where user_id = v_user_id;

  return query
  select v_order_id, v_total, v_subtotal, v_delivery_fee, v_delivery_distance, v_estimated_minutes;
end;
$$;

-- Mantiene compatibilidad con clientes que todavía llamen la firma histórica de 5 argumentos.
create or replace function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_lat numeric,
  p_delivery_lng numeric
)
returns table(
  order_id bigint,
  total numeric,
  subtotal numeric,
  delivery_fee numeric,
  delivery_distance_km numeric,
  estimated_delivery_minutes integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from public.create_order(
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_delivery_lat,
    p_delivery_lng,
    null::text,
    null::text,
    null::text,
    false,
    null::date,
    null::text
  );
$$;

revoke all on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) from public, anon;
grant execute on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) to authenticated, service_role;
revoke all on function public.create_order(text,text,text,numeric,numeric) from public, anon;
grant execute on function public.create_order(text,text,text,numeric,numeric) to authenticated, service_role;

create or replace function public.staff_get_order_gift_details()
returns table(
  order_id bigint,
  recipient_name text,
  recipient_phone text,
  gift_message text,
  is_surprise boolean,
  requested_delivery_date date,
  requested_delivery_slot text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role not in ('admin', 'florist', 'delivery') then
    raise exception 'STAFF_PERMISSION_REQUIRED';
  end if;

  return query
  select
    o.id,
    o.recipient_name,
    case when v_role in ('admin', 'delivery') then o.recipient_phone else null end,
    o.gift_message,
    o.is_surprise,
    o.requested_delivery_date,
    o.requested_delivery_slot
  from public.orders o
  where o.payment_status = 'approved'
    and (
      (v_role = 'admin' and (
        o.status in ('confirmado', 'preparando', 'en_camino')
        or (o.status = 'entregado' and o.delivered_at >= now() - interval '12 hours')
      ))
      or
      (v_role = 'florist' and (
        o.status = 'confirmado'
        or (o.status = 'preparando' and o.ready_for_delivery_at is null)
      ))
      or
      (v_role = 'delivery' and (
        (o.status = 'preparando' and o.ready_for_delivery_at is not null)
        or o.status = 'en_camino'
        or (o.status = 'entregado' and o.delivered_at >= now() - interval '12 hours')
      ))
    )
  order by coalesce(o.paid_at, o.created_at), o.id;
end;
$$;

revoke all on function public.staff_get_order_gift_details() from public, anon;
grant execute on function public.staff_get_order_gift_details() to authenticated, service_role;

-- Health check v3: incluye el nuevo contrato de destinatario y agenda de entrega.
create or replace function public.kantu_deployment_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with required_tables(table_name) as (
  values
    ('products'::text),
    ('profiles'::text),
    ('cart_items'::text),
    ('orders'::text),
    ('order_items'::text),
    ('payment_proofs'::text),
    ('delivery_pricing_settings'::text),
    ('delivery_schedule_settings'::text),
    ('mercadopago_webhook_events'::text)
),
rls_state as (
  select
    r.table_name,
    coalesce(c.relrowsecurity, false) as rls_enabled
  from required_tables r
  left join pg_catalog.pg_class c
    on c.relname = r.table_name
   and c.relnamespace = 'public'::regnamespace
),
delivery_state as (
  select exists (
    select 1
    from public.delivery_pricing_settings d
    where d.settings_key = 'default'
      and d.base_fee >= 0
      and d.max_distance_km > 0
  ) as configured
),
schedule_state as (
  select exists (
    select 1
    from public.delivery_schedule_settings s
    where s.id = 1
      and s.min_lead_hours between 0 and 168
      and s.max_days_ahead between 1 and 365
      and (not s.scheduling_enabled or cardinality(s.slots) > 0)
  ) as configured
),
gifting_state as (
  select count(*) = 6 as configured
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'orders'
    and c.column_name in (
      'recipient_name',
      'recipient_phone',
      'gift_message',
      'is_surprise',
      'requested_delivery_date',
      'requested_delivery_slot'
    )
),
payment_proof_bucket_state as (
  select exists (
    select 1
    from storage.buckets b
    where b.id = 'payment-proofs'
      and b.public = false
      and b.file_size_limit = 5242880
      and b.allowed_mime_types @> array['image/jpeg','image/png']::text[]
  ) as configured
),
product_image_bucket_state as (
  select exists (
    select 1
    from storage.buckets b
    where b.id = 'product-images'
      and b.public = true
      and b.file_size_limit = 5242880
      and b.allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
  ) as configured
),
product_image_policy_state as (
  select (
    select count(*)
    from pg_catalog.pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname in (
        'Admins can upload product images',
        'Admins can update product images',
        'Admins can delete product images'
      )
  ) = 3 as configured
),
realtime_state as (
  select
    exists (
      select 1
      from pg_catalog.pg_publication_tables p
      where p.pubname = 'supabase_realtime'
        and p.schemaname = 'public'
        and p.tablename = 'orders'
    ) as orders_present,
    exists (
      select 1
      from pg_catalog.pg_publication_tables p
      where p.pubname = 'supabase_realtime'
        and p.schemaname = 'public'
        and p.tablename = 'payment_proofs'
    ) as payment_proofs_present
),
rpc_state as (
  select
    to_regprocedure('public.create_order(text,text,text,numeric,numeric)') is not null as create_order_legacy_present,
    to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text)') is not null as create_order_gifting_present,
    to_regprocedure('public.staff_get_order_gift_details()') is not null as staff_gifting_present,
    to_regprocedure('public.customer_cancel_order(bigint)') is not null as customer_cancel_present,
    to_regprocedure('public.confirm_paid_order(bigint,text,timestamp with time zone)') is not null as confirm_paid_order_present
)
select jsonb_build_object(
  'healthy',
    (select bool_and(rls_enabled) from rls_state)
    and (select configured from delivery_state)
    and (select configured from schedule_state)
    and (select configured from gifting_state)
    and (select configured from payment_proof_bucket_state)
    and (select configured from product_image_bucket_state)
    and (select configured from product_image_policy_state)
    and (select orders_present and payment_proofs_present from realtime_state)
    and (
      select create_order_legacy_present
        and create_order_gifting_present
        and staff_gifting_present
        and customer_cancel_present
        and confirm_paid_order_present
      from rpc_state
    ),
  'rls', (select jsonb_object_agg(table_name, rls_enabled) from rls_state),
  'delivery_pricing', (select configured from delivery_state),
  'delivery_schedule', (select configured from schedule_state),
  'order_gifting', (select configured from gifting_state),
  'payment_proofs_bucket', (select configured from payment_proof_bucket_state),
  'product_images_bucket', (select configured from product_image_bucket_state),
  'product_images_admin_policies', (select configured from product_image_policy_state),
  'realtime', (select to_jsonb(realtime_state) from realtime_state),
  'rpc', (select to_jsonb(rpc_state) from rpc_state)
);
$$;

revoke all on function public.kantu_deployment_health_check() from public, anon, authenticated;
grant execute on function public.kantu_deployment_health_check() to service_role;
