-- Kantu Floral: elimina privilegios heredados innecesarios de la tabla de agenda.

revoke all on table public.delivery_schedule_settings from public, anon, authenticated;
grant select, update on table public.delivery_schedule_settings to authenticated;
grant all on table public.delivery_schedule_settings to service_role;

-- Refuerza el health check para detectar si los grants vuelven a ampliarse.
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
schedule_privilege_state as (
  select
    has_table_privilege('authenticated', 'public.delivery_schedule_settings', 'select')
      and has_table_privilege('authenticated', 'public.delivery_schedule_settings', 'update')
      and not has_table_privilege('authenticated', 'public.delivery_schedule_settings', 'insert')
      and not has_table_privilege('authenticated', 'public.delivery_schedule_settings', 'delete')
      and not has_table_privilege('authenticated', 'public.delivery_schedule_settings', 'truncate')
    as configured
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
    and (select configured from schedule_privilege_state)
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
  'delivery_schedule_privileges', (select configured from schedule_privilege_state),
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
