create or replace function public.staff_update_order_operation(
  p_order_id bigint,
  p_action text
)
returns table(
  order_id bigint,
  status text,
  prep_started_at timestamptz,
  ready_for_delivery_at timestamptz,
  delivery_started_at timestamptz,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order public.orders%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role not in ('admin', 'florist', 'delivery') then
    raise exception 'STAFF_PERMISSION_REQUIRED';
  end if;
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'approved' then raise exception 'PAYMENT_NOT_APPROVED'; end if;

  if p_action = 'start_preparation' then
    if v_role not in ('admin', 'florist') then raise exception 'FLORIST_PERMISSION_REQUIRED'; end if;
    if v_order.status = 'preparando' then
      null;
    elsif v_order.status <> 'confirmado' then
      raise exception 'ORDER_NOT_READY_FOR_PREPARATION';
    else
      update public.orders as o
      set
        status = 'preparando',
        prep_started_at = coalesce(o.prep_started_at, now())
      where o.id = p_order_id;
    end if;

  elsif p_action = 'mark_ready' then
    if v_role not in ('admin', 'florist') then raise exception 'FLORIST_PERMISSION_REQUIRED'; end if;
    if v_order.status <> 'preparando' then raise exception 'ORDER_NOT_IN_PREPARATION'; end if;

    update public.orders as o
    set ready_for_delivery_at = coalesce(o.ready_for_delivery_at, now())
    where o.id = p_order_id;

  elsif p_action = 'start_delivery' then
    if v_role not in ('admin', 'delivery') then raise exception 'DELIVERY_PERMISSION_REQUIRED'; end if;
    if v_order.status = 'en_camino' then
      null;
    elsif v_order.status <> 'preparando' or v_order.ready_for_delivery_at is null then
      raise exception 'ORDER_NOT_READY_FOR_DELIVERY';
    else
      update public.orders as o
      set
        status = 'en_camino',
        delivery_started_at = coalesce(o.delivery_started_at, now())
      where o.id = p_order_id;
    end if;

  elsif p_action = 'mark_delivered' then
    if v_role not in ('admin', 'delivery') then raise exception 'DELIVERY_PERMISSION_REQUIRED'; end if;
    if v_order.status = 'entregado' then
      null;
    elsif v_order.status <> 'en_camino' then
      raise exception 'ORDER_NOT_IN_DELIVERY';
    else
      update public.orders as o
      set
        status = 'entregado',
        delivered_at = coalesce(o.delivered_at, now())
      where o.id = p_order_id;
    end if;

  else
    raise exception 'INVALID_STAFF_ACTION';
  end if;

  return query
  select o.id, o.status, o.prep_started_at, o.ready_for_delivery_at,
         o.delivery_started_at, o.delivered_at
  from public.orders o
  where o.id = p_order_id;
end;
$$;

revoke all on function public.staff_update_order_operation(bigint, text) from public, anon;
grant execute on function public.staff_update_order_operation(bigint, text) to authenticated;
