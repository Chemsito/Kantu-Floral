-- Kantu Floral: unifica cupones/promociones en un solo motor.
-- Conserva promotion_codes como fuente de verdad y elimina el modelo duplicado vacío.

alter table public.promotion_codes
  add column if not exists max_redemptions integer,
  add column if not exists per_user_limit integer,
  add column if not exists target_product_ids bigint[],
  add column if not exists target_categories text[];

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname='promotion_codes_max_redemptions_check' and conrelid='public.promotion_codes'::regclass) then
    alter table public.promotion_codes add constraint promotion_codes_max_redemptions_check check (max_redemptions is null or max_redemptions > 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname='promotion_codes_per_user_limit_check' and conrelid='public.promotion_codes'::regclass) then
    alter table public.promotion_codes add constraint promotion_codes_per_user_limit_check check (per_user_limit is null or per_user_limit > 0);
  end if;
end $$;

-- Si el modelo de cupones duplicado llegó a recibir datos en otro entorno, migra su configuración primero.
insert into public.promotion_codes (
  code, discount_type, discount_value, minimum_subtotal, starts_at, ends_at,
  max_redemptions, per_user_limit, target_product_ids, target_categories,
  active, created_by, created_at, updated_at
)
select
  c.code, c.discount_type, c.discount_value, c.min_subtotal, c.starts_at, c.ends_at,
  c.max_redemptions, c.per_user_limit, c.target_product_ids, c.target_categories,
  c.active, c.created_by, c.created_at, c.updated_at
from public.coupons c
where to_regclass('public.coupons') is not null
on conflict do nothing;

update public.orders o
set promotion_id = p.id,
    promotion_code = coalesce(o.promotion_code, o.coupon_code)
from public.promotion_codes p
where o.coupon_code is not null
  and lower(p.code) = lower(o.coupon_code)
  and o.promotion_id is null;

alter table public.orders
  drop column if exists coupon_id,
  drop column if exists coupon_code;

drop function if exists public.kantu_coupons_health_check();
drop function if exists public.select_checkout_coupon(text);
drop function if exists public.clear_checkout_coupon();
drop function if exists private.calculate_coupon_for_user(uuid,text);
drop function if exists public.normalize_coupon_row();
drop table if exists public.checkout_coupon_selections;
drop table if exists public.coupons;

-- Una única selección temporal para el wrapper compatible de create_order (11 args).
create table if not exists public.checkout_promotion_selections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  promotion_code text not null,
  updated_at timestamptz not null default now()
);
alter table public.checkout_promotion_selections enable row level security;
revoke all on table public.checkout_promotion_selections from public, anon, authenticated;
drop policy if exists "Clients cannot access promotion selections" on public.checkout_promotion_selections;
create policy "Clients cannot access promotion selections"
on public.checkout_promotion_selections for all to authenticated
using (false) with check (false);

-- Admin puede crear/editar/desactivar promociones, pero no eliminarlas desde el cliente.
revoke all on table public.promotion_codes from public, anon, authenticated;
grant select, insert, update on table public.promotion_codes to authenticated;
drop policy if exists "Admins can manage promotion codes" on public.promotion_codes;
drop policy if exists "Admins can view promotion codes" on public.promotion_codes;
drop policy if exists "Admins can create promotion codes" on public.promotion_codes;
drop policy if exists "Admins can update promotion codes" on public.promotion_codes;
create policy "Admins can view promotion codes" on public.promotion_codes
for select to authenticated using (public.is_admin());
create policy "Admins can create promotion codes" on public.promotion_codes
for insert to authenticated with check (public.is_admin());
create policy "Admins can update promotion codes" on public.promotion_codes
for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.orders drop constraint if exists orders_discount_amount_check;
alter table public.orders add constraint orders_discount_amount_check
check (discount_amount >= 0 and discount_amount <= subtotal);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Motor único: valida carrito, alcance, vigencia y límites para un usuario concreto.
create or replace function private.calculate_promotion_for_user(p_user_id uuid, p_code text)
returns table(
  promotion_id bigint,
  normalized_code text,
  promotion_description text,
  valid boolean,
  cart_subtotal numeric,
  eligible_subtotal numeric,
  discount_amount numeric,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_promotion public.promotion_codes%rowtype;
  v_cart_subtotal numeric(12,2) := 0;
  v_eligible_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_item_count integer := 0;
  v_global_used integer := 0;
  v_user_used integer := 0;
  v_invalid_cart boolean := false;
begin
  if p_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if v_code = '' or char_length(v_code) > 40 or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then
    return query select null::bigint, v_code, null::text, false, 0::numeric, 0::numeric, 0::numeric, 'PROMOTION_NOT_AVAILABLE'::text;
    return;
  end if;

  select p.* into v_promotion
  from public.promotion_codes p
  where lower(p.code)=lower(v_code)
  limit 1;

  if not found
     or not coalesce(v_promotion.active,false)
     or (v_promotion.starts_at is not null and now() < v_promotion.starts_at)
     or (v_promotion.ends_at is not null and now() >= v_promotion.ends_at) then
    return query select null::bigint, v_code, null::text, false, 0::numeric, 0::numeric, 0::numeric, 'PROMOTION_NOT_AVAILABLE'::text;
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(p.price * ci.quantity),0),
    coalesce(sum(
      case when
        (v_promotion.target_product_ids is null and v_promotion.target_categories is null)
        or (v_promotion.target_product_ids is not null and p.id = any(v_promotion.target_product_ids))
        or (v_promotion.target_categories is not null and p.category = any(v_promotion.target_categories))
      then p.price * ci.quantity else 0 end
    ),0),
    coalesce(bool_or(ci.quantity is null or ci.quantity <= 0 or p.active is not true or p.stock is null or p.stock < ci.quantity), false)
  into v_item_count, v_cart_subtotal, v_eligible_subtotal, v_invalid_cart
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  where ci.user_id=p_user_id;

  if v_item_count=0 then raise exception 'CART_EMPTY'; end if;
  if v_invalid_cart then raise exception 'INVALID_CART_OR_INSUFFICIENT_STOCK'; end if;

  if v_cart_subtotal < v_promotion.minimum_subtotal then
    return query select v_promotion.id, v_promotion.code, v_promotion.description, false, v_cart_subtotal, v_eligible_subtotal, 0::numeric, 'PROMOTION_MINIMUM_NOT_MET'::text;
    return;
  end if;
  if v_eligible_subtotal <= 0 then
    return query select v_promotion.id, v_promotion.code, v_promotion.description, false, v_cart_subtotal, 0::numeric, 0::numeric, 'PROMOTION_NOT_APPLICABLE'::text;
    return;
  end if;

  if v_promotion.max_redemptions is not null then
    select count(*)::integer into v_global_used
    from public.orders o
    where o.promotion_id=v_promotion.id and o.status <> 'cancelado';
    if v_global_used >= v_promotion.max_redemptions then
      return query select v_promotion.id, v_promotion.code, v_promotion.description, false, v_cart_subtotal, v_eligible_subtotal, 0::numeric, 'PROMOTION_USAGE_LIMIT'::text;
      return;
    end if;
  end if;

  if v_promotion.per_user_limit is not null then
    select count(*)::integer into v_user_used
    from public.orders o
    where o.promotion_id=v_promotion.id and o.user_id=p_user_id and o.status <> 'cancelado';
    if v_user_used >= v_promotion.per_user_limit then
      return query select v_promotion.id, v_promotion.code, v_promotion.description, false, v_cart_subtotal, v_eligible_subtotal, 0::numeric, 'PROMOTION_USER_LIMIT'::text;
      return;
    end if;
  end if;

  if v_promotion.discount_type='percent' then
    v_discount := round(v_eligible_subtotal * v_promotion.discount_value / 100.0,2);
    if v_promotion.maximum_discount is not null then v_discount := least(v_discount,v_promotion.maximum_discount); end if;
  else
    v_discount := least(v_promotion.discount_value,v_eligible_subtotal);
  end if;
  v_discount := greatest(0,least(v_discount,v_cart_subtotal));

  return query select v_promotion.id,v_promotion.code,v_promotion.description,true,v_cart_subtotal,v_eligible_subtotal,v_discount,null::text;
end;
$$;
revoke all on function private.calculate_promotion_for_user(uuid,text) from public,anon,authenticated;

drop function if exists public.calculate_promotion_discount(text,numeric);

create or replace function public.quote_promotion_code(p_code text)
returns table(code text,valid boolean,discount_amount numeric,subtotal numeric,discounted_subtotal numeric,reason text,description text)
language plpgsql
security definer
set search_path=''
as $$
declare v_user_id uuid:=auth.uid(); v_quote record;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_quote from private.calculate_promotion_for_user(v_user_id,p_code);
  return query select v_quote.normalized_code,v_quote.valid,v_quote.discount_amount,v_quote.cart_subtotal,
    greatest(0,v_quote.cart_subtotal-v_quote.discount_amount),v_quote.reason,v_quote.promotion_description;
end;
$$;
revoke all on function public.quote_promotion_code(text) from public,anon;
grant execute on function public.quote_promotion_code(text) to authenticated;

-- Compatibilidad con el frontend actual: cotiza y guarda la selección temporal.
create or replace function public.select_checkout_coupon(p_code text)
returns table(coupon_code text,cart_subtotal numeric,eligible_subtotal numeric,discount_amount numeric,subtotal_after_discount numeric)
language plpgsql
security definer
set search_path=''
as $$
declare v_user_id uuid:=auth.uid(); v_quote record;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_quote from private.calculate_promotion_for_user(v_user_id,p_code);
  if not coalesce(v_quote.valid,false) then raise exception '%',coalesce(v_quote.reason,'PROMOTION_NOT_AVAILABLE'); end if;
  insert into public.checkout_promotion_selections(user_id,promotion_code,updated_at)
  values(v_user_id,v_quote.normalized_code,now())
  on conflict(user_id) do update set promotion_code=excluded.promotion_code,updated_at=excluded.updated_at;
  return query select v_quote.normalized_code,v_quote.cart_subtotal,v_quote.eligible_subtotal,v_quote.discount_amount,
    greatest(0,v_quote.cart_subtotal-v_quote.discount_amount);
end;
$$;
revoke all on function public.select_checkout_coupon(text) from public,anon;
grant execute on function public.select_checkout_coupon(text) to authenticated;

create or replace function public.clear_checkout_coupon()
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then return false; end if;
  delete from public.checkout_promotion_selections s where s.user_id=v_user_id;
  return true;
end;
$$;
revoke all on function public.clear_checkout_coupon() from public,anon;
grant execute on function public.clear_checkout_coupon() to authenticated;

-- Función explícita con código promocional. Es la única que calcula el descuento al crear el pedido.
create or replace function public.create_order(
  p_customer_name text,p_customer_phone text,p_delivery_address text,p_delivery_lat numeric,p_delivery_lng numeric,
  p_recipient_name text,p_recipient_phone text,p_gift_message text,p_is_surprise boolean,
  p_requested_delivery_date date,p_requested_delivery_slot text,p_promotion_code text
)
returns table(order_id bigint,total numeric,subtotal numeric,delivery_fee numeric,delivery_distance_km numeric,estimated_delivery_minutes integer,discount_amount numeric)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid(); v_order_id bigint; v_subtotal numeric:=0; v_total numeric:=0;
  v_delivery_fee numeric:=0; v_delivery_distance numeric:=0; v_estimated_minutes integer:=20; v_service_available boolean:=false;
  v_item record; v_item_count integer:=0; v_recipient_name text; v_recipient_phone text; v_gift_message text; v_delivery_slot text;
  v_schedule_enabled boolean:=false; v_min_lead_hours integer:=0; v_max_days_ahead integer:=30; v_slots text[]:='{}'::text[];
  v_now_local timestamp without time zone:=timezone('America/Lima',now()); v_today date; v_slot_start time without time zone;
  v_quote record; v_promotion_id bigint:=null; v_promotion_code text:=null; v_discount numeric:=0; v_normalized_input text;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if nullif(btrim(p_customer_name),'') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if nullif(btrim(p_customer_phone),'') is null then raise exception 'CUSTOMER_PHONE_REQUIRED'; end if;
  if nullif(btrim(p_delivery_address),'') is null then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;

  v_recipient_name:=coalesce(nullif(btrim(p_recipient_name),''),btrim(p_customer_name));
  v_recipient_phone:=coalesce(nullif(btrim(p_recipient_phone),''),btrim(p_customer_phone));
  v_gift_message:=nullif(btrim(p_gift_message),''); v_delivery_slot:=nullif(btrim(p_requested_delivery_slot),''); v_today:=v_now_local::date;
  if char_length(v_recipient_name)>120 then raise exception 'RECIPIENT_NAME_TOO_LONG'; end if;
  if char_length(v_recipient_phone)>40 then raise exception 'RECIPIENT_PHONE_TOO_LONG'; end if;
  if v_gift_message is not null and char_length(v_gift_message)>500 then raise exception 'GIFT_MESSAGE_TOO_LONG'; end if;

  select s.scheduling_enabled,s.min_lead_hours,s.max_days_ahead,s.slots
  into v_schedule_enabled,v_min_lead_hours,v_max_days_ahead,v_slots from public.delivery_schedule_settings s where s.id=1;
  if p_requested_delivery_date is null and v_delivery_slot is not null then raise exception 'DELIVERY_DATE_REQUIRED_FOR_SLOT'; end if;
  if p_requested_delivery_date is not null then
    if not coalesce(v_schedule_enabled,false) then raise exception 'DELIVERY_SCHEDULING_DISABLED'; end if;
    if p_requested_delivery_date<v_today then raise exception 'INVALID_DELIVERY_DATE'; end if;
    if p_requested_delivery_date>(v_today+coalesce(v_max_days_ahead,30)) then raise exception 'DELIVERY_DATE_TOO_FAR'; end if;
    if v_delivery_slot is null then raise exception 'DELIVERY_SLOT_REQUIRED'; end if;
    if not(v_delivery_slot=any(coalesce(v_slots,'{}'::text[]))) then raise exception 'INVALID_DELIVERY_SLOT'; end if;
    if v_delivery_slot !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_DELIVERY_SLOT'; end if;
    v_slot_start:=split_part(v_delivery_slot,'-',1)::time;
    if (p_requested_delivery_date::timestamp+v_slot_start)<(v_now_local+make_interval(hours=>coalesce(v_min_lead_hours,0))) then raise exception 'DELIVERY_SLOT_TOO_SOON'; end if;
  end if;

  select q.distance_km,q.delivery_fee,q.estimated_minutes,q.service_available
  into v_delivery_distance,v_delivery_fee,v_estimated_minutes,v_service_available from public.quote_delivery_fee(p_delivery_lat,p_delivery_lng) q;
  if not coalesce(v_service_available,false) then raise exception 'DELIVERY_OUT_OF_RANGE'; end if;

  for v_item in select ci.product_id,ci.quantity,p.price,p.stock,p.active from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.user_id=v_user_id for update of ci,p
  loop
    v_item_count:=v_item_count+1;
    if v_item.quantity is null or v_item.quantity<=0 then raise exception 'INVALID_CART'; end if;
    if v_item.active is not true then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    if v_item.stock is null or v_item.stock<v_item.quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    v_subtotal:=v_subtotal+(v_item.price*v_item.quantity);
  end loop;
  if v_item_count=0 then raise exception 'CART_EMPTY'; end if;

  v_normalized_input:=upper(btrim(coalesce(p_promotion_code,'')));
  if v_normalized_input<>'' then
    perform 1 from public.promotion_codes p where lower(p.code)=lower(v_normalized_input) for update;
    if not found then raise exception 'PROMOTION_NOT_AVAILABLE'; end if;
    select * into v_quote from private.calculate_promotion_for_user(v_user_id,v_normalized_input);
    if not coalesce(v_quote.valid,false) then raise exception '%',coalesce(v_quote.reason,'PROMOTION_NOT_AVAILABLE'); end if;
    v_promotion_id:=v_quote.promotion_id; v_promotion_code:=v_quote.normalized_code; v_discount:=v_quote.discount_amount;
  end if;

  v_total:=greatest(0,v_subtotal+v_delivery_fee-v_discount);
  insert into public.orders(user_id,total,subtotal,delivery_fee,delivery_distance_km,delivery_lat,delivery_lng,estimated_delivery_minutes,status,
    customer_name,customer_phone,delivery_address,recipient_name,recipient_phone,gift_message,is_surprise,requested_delivery_date,requested_delivery_slot,
    promotion_id,promotion_code,discount_amount)
  values(v_user_id,v_total,v_subtotal,v_delivery_fee,v_delivery_distance,p_delivery_lat,p_delivery_lng,v_estimated_minutes,'pendiente',
    btrim(p_customer_name),btrim(p_customer_phone),btrim(p_delivery_address),v_recipient_name,v_recipient_phone,v_gift_message,coalesce(p_is_surprise,false),
    p_requested_delivery_date,v_delivery_slot,v_promotion_id,v_promotion_code,v_discount)
  returning id into v_order_id;

  insert into public.order_items(order_id,product_id,quantity,unit_price)
  select v_order_id,ci.product_id,ci.quantity,p.price from public.cart_items ci join public.products p on p.id=ci.product_id where ci.user_id=v_user_id;
  delete from public.cart_items where user_id=v_user_id;
  delete from public.checkout_promotion_selections where user_id=v_user_id;
  return query select v_order_id,v_total,v_subtotal,v_delivery_fee,v_delivery_distance,v_estimated_minutes,v_discount;
end;
$$;
revoke all on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text,text) from public,anon;
grant execute on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text,text) to authenticated;

-- Wrapper de 11 argumentos: mantiene clientes actuales y usa la selección segura si existe.
create or replace function public.create_order(
  p_customer_name text,p_customer_phone text,p_delivery_address text,p_delivery_lat numeric,p_delivery_lng numeric,
  p_recipient_name text,p_recipient_phone text,p_gift_message text,p_is_surprise boolean,p_requested_delivery_date date,p_requested_delivery_slot text
)
returns table(order_id bigint,total numeric,subtotal numeric,delivery_fee numeric,delivery_distance_km numeric,estimated_delivery_minutes integer)
language plpgsql
security invoker
set search_path=''
as $$
declare v_user_id uuid:=auth.uid(); v_code text;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select s.promotion_code into v_code from public.checkout_promotion_selections s where s.user_id=v_user_id;
  return query
  select c.order_id,c.total,c.subtotal,c.delivery_fee,c.delivery_distance_km,c.estimated_delivery_minutes
  from public.create_order(p_customer_name,p_customer_phone,p_delivery_address,p_delivery_lat,p_delivery_lng,
    p_recipient_name,p_recipient_phone,p_gift_message,p_is_surprise,p_requested_delivery_date,p_requested_delivery_slot,v_code) c;
end;
$$;
revoke all on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) from public,anon;
grant execute on function public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text) to authenticated;

create or replace function public.kantu_promotions_health_check()
returns jsonb language sql stable security invoker set search_path=''
as $$
select jsonb_build_object(
  'healthy',
    coalesce((select relrowsecurity from pg_catalog.pg_class where oid='public.promotion_codes'::regclass),false)
    and coalesce((select relrowsecurity from pg_catalog.pg_class where oid='public.checkout_promotion_selections'::regclass),false)
    and to_regprocedure('private.calculate_promotion_for_user(uuid,text)') is not null
    and to_regprocedure('public.quote_promotion_code(text)') is not null
    and to_regprocedure('public.select_checkout_coupon(text)') is not null
    and to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text,text)') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='max_redemptions')
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='target_product_ids')
    and to_regclass('public.coupons') is null
    and not has_table_privilege('authenticated','public.promotion_codes','DELETE')
    and not has_table_privilege('authenticated','public.promotion_codes','TRUNCATE'),
  'promotion_rls',coalesce((select relrowsecurity from pg_catalog.pg_class where oid='public.promotion_codes'::regclass),false),
  'selection_rls',coalesce((select relrowsecurity from pg_catalog.pg_class where oid='public.checkout_promotion_selections'::regclass),false),
  'single_engine',to_regclass('public.coupons') is null,
  'advanced_limits',exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='max_redemptions'),
  'targeting',exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='target_product_ids'),
  'authenticated_delete_blocked',not has_table_privilege('authenticated','public.promotion_codes','DELETE')
);
$$;
revoke all on function public.kantu_promotions_health_check() from public,anon,authenticated;
grant execute on function public.kantu_promotions_health_check() to service_role;
