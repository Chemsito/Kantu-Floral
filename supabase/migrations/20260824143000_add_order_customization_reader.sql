-- Lectura segura de personalizaciones para cliente, Admin y operación
create or replace function public.get_order_item_customizations(p_order_id bigint)
returns table(product_id bigint, product_name text, customization text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_owner uuid;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;

  select o.user_id into v_owner from public.orders o where o.id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_owner is distinct from v_user_id
     and coalesce(v_role, '') not in ('admin', 'florista', 'delivery') then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  return query
  select oi.product_id, coalesce(pr.name, 'Producto')::text, oi.customization
    from public.order_items oi
    left join public.products pr on pr.id = oi.product_id
   where oi.order_id = p_order_id
     and oi.customization is not null
   order by oi.id;
end;
$$;

revoke all on function public.get_order_item_customizations(bigint) from public, anon;
grant execute on function public.get_order_item_customizations(bigint) to authenticated;
