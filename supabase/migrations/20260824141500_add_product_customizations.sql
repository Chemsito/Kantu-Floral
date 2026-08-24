-- Kantu Floral: opciones de personalización para complementos como toppers

alter table public.products
  add column if not exists customization_label text,
  add column if not exists customization_options text[] not null default '{}'::text[],
  add column if not exists customization_required boolean not null default false;

alter table public.cart_items
  add column if not exists customization text;

alter table public.order_items
  add column if not exists customization text;

update public.products
set customization_label = 'Mensaje del topper',
    customization_options = array[
      'TE QUIERO',
      'FELIZ ANIVERSARIO',
      'TE AMO',
      'HAPPY BIRTHDAY',
      'FELIZ CUMPLEAÑOS'
    ]::text[],
    customization_required = true,
    note = 'Elige uno de los 5 mensajes disponibles. Precio incluye IGV.'
where id in (27, 51)
  and lower(name) like 'topper temático%';

create or replace function public.kantu_fill_order_item_customization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_required boolean := false;
  v_options text[] := '{}'::text[];
  v_selection text;
begin
  select o.user_id into v_user_id
  from public.orders o
  where o.id = new.order_id;

  if v_user_id is null then
    return new;
  end if;

  select p.customization_required, p.customization_options
    into v_required, v_options
  from public.products p
  where p.id = new.product_id;

  if not coalesce(v_required, false) and coalesce(array_length(v_options, 1), 0) = 0 then
    return new;
  end if;

  select nullif(btrim(ci.customization), '')
    into v_selection
  from public.cart_items ci
  where ci.user_id = v_user_id
    and ci.product_id = new.product_id;

  if coalesce(v_required, false) and v_selection is null then
    raise exception 'PRODUCT_CUSTOMIZATION_REQUIRED';
  end if;

  if v_selection is not null
     and not (v_selection = any(coalesce(v_options, '{}'::text[]))) then
    raise exception 'INVALID_PRODUCT_CUSTOMIZATION';
  end if;

  new.customization := v_selection;
  return new;
end;
$$;

revoke all on function public.kantu_fill_order_item_customization() from public, anon, authenticated;
grant execute on function public.kantu_fill_order_item_customization() to service_role;

drop trigger if exists order_items_fill_customization on public.order_items;
create trigger order_items_fill_customization
before insert on public.order_items
for each row execute function public.kantu_fill_order_item_customization();

create or replace function public.service_set_guest_order_customizations(
  p_order_id bigint,
  p_customizations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_selection text;
begin
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;
  if p_customizations is null then p_customizations := '{}'::jsonb; end if;
  if jsonb_typeof(p_customizations) <> 'object' then raise exception 'INVALID_PRODUCT_CUSTOMIZATIONS'; end if;

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.user_id is null and o.status = 'pendiente'
  ) then
    raise exception 'GUEST_ORDER_NOT_AVAILABLE';
  end if;

  for v_item in
    select oi.id as order_item_id,
           oi.product_id,
           p.customization_required,
           p.customization_options
      from public.order_items oi
      join public.products p on p.id = oi.product_id
     where oi.order_id = p_order_id
  loop
    v_selection := nullif(btrim(p_customizations ->> v_item.product_id::text), '');

    if coalesce(v_item.customization_required, false) and v_selection is null then
      raise exception 'PRODUCT_CUSTOMIZATION_REQUIRED';
    end if;

    if v_selection is not null
       and not (v_selection = any(coalesce(v_item.customization_options, '{}'::text[]))) then
      raise exception 'INVALID_PRODUCT_CUSTOMIZATION';
    end if;

    update public.order_items
       set customization = v_selection
     where id = v_item.order_item_id;
  end loop;
end;
$$;

revoke all on function public.service_set_guest_order_customizations(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.service_set_guest_order_customizations(bigint, jsonb) to service_role;

create or replace function public.kantu_product_customization_health_check()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'healthy',
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='customization_options')
      and exists(select 1 from information_schema.columns where table_schema='public' and table_name='cart_items' and column_name='customization')
      and exists(select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='customization')
      and (select count(*) = 2 from public.products where id in (27,51) and customization_required and cardinality(customization_options)=5),
    'configured_topper_products', (select count(*) from public.products where id in (27,51) and customization_required),
    'required_options', 5
  );
$$;

revoke all on function public.kantu_product_customization_health_check() from public, anon, authenticated;
grant execute on function public.kantu_product_customization_health_check() to service_role;
