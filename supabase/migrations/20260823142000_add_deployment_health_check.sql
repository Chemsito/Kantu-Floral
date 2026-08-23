-- Kantu Floral: health check de configuración obligatoria para despliegues.
-- No se expone al navegador; se ejecuta con service_role/automatización segura.

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
bucket_state as (
  select exists (
    select 1
    from storage.buckets b
    where b.id = 'payment-proofs'
      and b.public = false
      and b.file_size_limit = 5242880
      and b.allowed_mime_types @> array['image/jpeg','image/png']::text[]
  ) as configured
),
edge_contracts as (
  select
    to_regprocedure('public.create_order(text,text,text,double precision,double precision)') is not null as create_order_present,
    to_regprocedure('public.customer_cancel_order(bigint)') is not null as customer_cancel_present,
    to_regprocedure('public.confirm_paid_order(bigint,text,timestamp with time zone)') is not null as confirm_paid_order_present
)
select jsonb_build_object(
  'healthy',
    (select bool_and(rls_enabled) from rls_state)
    and (select configured from delivery_state)
    and (select configured from bucket_state)
    and (select create_order_present and customer_cancel_present and confirm_paid_order_present from edge_contracts),
  'rls', (select jsonb_object_agg(table_name, rls_enabled) from rls_state),
  'delivery_pricing', (select configured from delivery_state),
  'payment_proofs_bucket', (select configured from bucket_state),
  'rpc', (select to_jsonb(edge_contracts) from edge_contracts)
);
$$;

revoke all on function public.kantu_deployment_health_check() from public, anon, authenticated;
grant execute on function public.kantu_deployment_health_check() to service_role;
