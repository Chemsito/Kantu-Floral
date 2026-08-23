-- Kantu Floral: elimina el motor de cupones duplicado aplicado fuera del repositorio.
-- Seguridad: aborta si hubiera cualquier dato histórico que pudiera perderse.

do $$
begin
  if to_regclass('public.checkout_coupon_selections') is not null
     and exists (select 1 from public.checkout_coupon_selections limit 1) then
    raise exception 'LEGACY_COUPON_SELECTIONS_NOT_EMPTY';
  end if;

  if to_regclass('public.coupons') is not null
     and exists (select 1 from public.coupons limit 1) then
    raise exception 'LEGACY_COUPONS_NOT_EMPTY';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='coupon_id'
  ) and exists (
    select 1 from public.orders where coupon_id is not null limit 1
  ) then
    raise exception 'LEGACY_COUPON_ORDERS_NOT_EMPTY';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='coupon_code'
  ) and exists (
    select 1 from public.orders where coupon_code is not null limit 1
  ) then
    raise exception 'LEGACY_COUPON_ORDERS_NOT_EMPTY';
  end if;
end $$;

drop function if exists public.select_checkout_coupon(text);
drop function if exists public.clear_checkout_coupon();
drop function if exists public.kantu_coupons_health_check();
drop function if exists private.calculate_coupon_for_user(uuid,text);

drop table if exists public.checkout_coupon_selections;

alter table public.orders drop constraint if exists orders_coupon_id_fkey;
alter table public.orders drop column if exists coupon_id;
alter table public.orders drop column if exists coupon_code;

drop table if exists public.coupons;
drop function if exists public.normalize_coupon_row();

-- Reafirma la firma compatible de gifting: sin cupón implícito/persistido.
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
language sql
security invoker
set search_path = ''
as $$
  select c.order_id, c.total, c.subtotal, c.delivery_fee, c.delivery_distance_km, c.estimated_delivery_minutes
  from public.create_order(
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_delivery_lat,
    p_delivery_lng,
    p_recipient_name,
    p_recipient_phone,
    p_gift_message,
    p_is_surprise,
    p_requested_delivery_date,
    p_requested_delivery_slot,
    null::text
  ) c;
$$;

revoke all on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) from public, anon;
grant execute on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) to authenticated;

create or replace function public.kantu_promotions_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with wrapper_state as (
  select coalesce((
    select not p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.oid = to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text)')
  ), false) as is_invoker
)
select jsonb_build_object(
  'healthy',
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.promotion_codes'::regclass), false)
    and to_regprocedure('public.quote_promotion_code(text)') is not null
    and to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text,text)') is not null
    and (select is_invoker from wrapper_state)
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_amount')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='promotion_code')
    and not has_table_privilege('anon', 'public.promotion_codes', 'SELECT')
    and not has_table_privilege('authenticated', 'public.promotion_codes', 'TRUNCATE')
    and to_regclass('public.checkout_coupon_selections') is null
    and to_regclass('public.coupons') is null
    and to_regprocedure('public.select_checkout_coupon(text)') is null
    and to_regprocedure('public.clear_checkout_coupon()') is null,
  'promotion_rls', coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.promotion_codes'::regclass), false),
  'quote_rpc', to_regprocedure('public.quote_promotion_code(text)') is not null,
  'create_order_promotion_rpc', to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text,text)') is not null,
  'legacy_create_order_is_invoker', (select is_invoker from wrapper_state),
  'orders_discount_columns',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_amount')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='promotion_code'),
  'anon_promotion_table_blocked', not has_table_privilege('anon', 'public.promotion_codes', 'SELECT'),
  'authenticated_no_truncate', not has_table_privilege('authenticated', 'public.promotion_codes', 'TRUNCATE'),
  'duplicate_coupon_engine_absent',
    to_regclass('public.checkout_coupon_selections') is null
    and to_regclass('public.coupons') is null
    and to_regprocedure('public.select_checkout_coupon(text)') is null
    and to_regprocedure('public.clear_checkout_coupon()') is null
);
$$;

revoke all on function public.kantu_promotions_health_check() from public, anon, authenticated;
grant execute on function public.kantu_promotions_health_check() to service_role;
