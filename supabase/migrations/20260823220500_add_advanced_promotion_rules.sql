-- Kantu Floral: reglas avanzadas sobre el único motor promotion_codes.

alter table public.promotion_codes
  add column if not exists max_redemptions integer,
  add column if not exists per_user_limit integer,
  add column if not exists target_product_ids bigint[],
  add column if not exists target_categories text[];

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='promotion_codes_max_redemptions_check'
      and conrelid='public.promotion_codes'::regclass
  ) then
    alter table public.promotion_codes
      add constraint promotion_codes_max_redemptions_check
      check (max_redemptions is null or max_redemptions > 0);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='promotion_codes_per_user_limit_check'
      and conrelid='public.promotion_codes'::regclass
  ) then
    alter table public.promotion_codes
      add constraint promotion_codes_per_user_limit_check
      check (per_user_limit is null or per_user_limit > 0);
  end if;
end $$;

-- Admin puede crear/editar/desactivar, pero no borrar promociones históricas desde el cliente.
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

-- Mantiene la firma usada por quote/create_order; añade segmentación y límites dentro del cálculo autoritativo.
create or replace function public.calculate_promotion_discount(p_code text, p_subtotal numeric)
returns table(
  promotion_id bigint,
  normalized_code text,
  promotion_description text,
  valid boolean,
  discount_amount numeric,
  reason text
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_promotion public.promotion_codes%rowtype;
  v_eligible_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_global_used integer := 0;
  v_user_used integer := 0;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  if v_code='' or char_length(v_code)>40 or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then
    return query select null::bigint,v_code,null::text,false,0::numeric,'PROMOTION_NOT_AVAILABLE'::text;
    return;
  end if;

  if p_subtotal is null or p_subtotal<0 then
    return query select null::bigint,v_code,null::text,false,0::numeric,'INVALID_SUBTOTAL'::text;
    return;
  end if;

  -- El lock serializa la reserva de promociones con límite de usos.
  select p.* into v_promotion
  from public.promotion_codes p
  where lower(p.code)=lower(v_code)
  limit 1
  for update;

  if not found
     or not coalesce(v_promotion.active,false)
     or (v_promotion.starts_at is not null and now()<v_promotion.starts_at)
     or (v_promotion.ends_at is not null and now()>=v_promotion.ends_at) then
    return query select null::bigint,v_code,null::text,false,0::numeric,'PROMOTION_NOT_AVAILABLE'::text;
    return;
  end if;

  if p_subtotal<v_promotion.minimum_subtotal then
    return query select v_promotion.id,v_promotion.code,v_promotion.description,false,0::numeric,'PROMOTION_MINIMUM_NOT_MET'::text;
    return;
  end if;

  select coalesce(sum(p.price*ci.quantity),0)
  into v_eligible_subtotal
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  where ci.user_id=v_user_id
    and ci.quantity>0
    and p.active=true
    and (
      (v_promotion.target_product_ids is null and v_promotion.target_categories is null)
      or (v_promotion.target_product_ids is not null and p.id=any(v_promotion.target_product_ids))
      or (v_promotion.target_categories is not null and p.category=any(v_promotion.target_categories))
    );

  if v_eligible_subtotal<=0 then
    return query select v_promotion.id,v_promotion.code,v_promotion.description,false,0::numeric,'PROMOTION_NOT_APPLICABLE'::text;
    return;
  end if;

  if v_promotion.max_redemptions is not null then
    select count(*)::integer into v_global_used
    from public.orders o
    where o.promotion_id=v_promotion.id and o.status<>'cancelado';
    if v_global_used>=v_promotion.max_redemptions then
      return query select v_promotion.id,v_promotion.code,v_promotion.description,false,0::numeric,'PROMOTION_USAGE_LIMIT'::text;
      return;
    end if;
  end if;

  if v_promotion.per_user_limit is not null then
    select count(*)::integer into v_user_used
    from public.orders o
    where o.promotion_id=v_promotion.id and o.user_id=v_user_id and o.status<>'cancelado';
    if v_user_used>=v_promotion.per_user_limit then
      return query select v_promotion.id,v_promotion.code,v_promotion.description,false,0::numeric,'PROMOTION_USER_LIMIT'::text;
      return;
    end if;
  end if;

  if v_promotion.discount_type='percent' then
    v_discount:=round(v_eligible_subtotal*v_promotion.discount_value/100.0,2);
    if v_promotion.maximum_discount is not null then
      v_discount:=least(v_discount,v_promotion.maximum_discount);
    end if;
  elsif v_promotion.discount_type='fixed' then
    v_discount:=least(v_promotion.discount_value,v_eligible_subtotal);
  else
    return query select v_promotion.id,v_promotion.code,v_promotion.description,false,0::numeric,'PROMOTION_NOT_AVAILABLE'::text;
    return;
  end if;

  v_discount:=greatest(0,least(round(v_discount,2),p_subtotal));
  return query select v_promotion.id,v_promotion.code,v_promotion.description,true,v_discount,null::text;
end;
$$;

revoke all on function public.calculate_promotion_discount(text,numeric) from public,anon,authenticated;
grant execute on function public.calculate_promotion_discount(text,numeric) to service_role;

create or replace function public.kantu_promotions_health_check()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
with wrapper_state as (
  select coalesce((
    select not p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.oid=to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text)')
  ),false) as is_invoker
)
select jsonb_build_object(
  'healthy',
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.promotion_codes'::regclass),false)
    and to_regprocedure('public.quote_promotion_code(text)') is not null
    and to_regprocedure('public.create_order(text,text,text,numeric,numeric,text,text,text,boolean,date,text,text)') is not null
    and (select is_invoker from wrapper_state)
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='max_redemptions')
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='target_product_ids')
    and not has_table_privilege('anon','public.promotion_codes','SELECT')
    and not has_table_privilege('authenticated','public.promotion_codes','DELETE')
    and not has_table_privilege('authenticated','public.promotion_codes','TRUNCATE')
    and to_regclass('public.coupons') is null,
  'promotion_rls',coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.promotion_codes'::regclass),false),
  'advanced_limits',exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='max_redemptions'),
  'targeting',exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_codes' and column_name='target_product_ids'),
  'authenticated_delete_blocked',not has_table_privilege('authenticated','public.promotion_codes','DELETE'),
  'legacy_create_order_is_invoker',(select is_invoker from wrapper_state),
  'duplicate_coupon_engine_absent',to_regclass('public.coupons') is null
);
$$;
revoke all on function public.kantu_promotions_health_check() from public,anon,authenticated;
grant execute on function public.kantu_promotions_health_check() to service_role;
