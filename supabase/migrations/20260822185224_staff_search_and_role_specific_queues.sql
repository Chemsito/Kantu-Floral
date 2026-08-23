create or replace function public.admin_find_team_member(p_email text)
returns table(user_id uuid, full_name text, email text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) <= 1 then
    raise exception 'VALID_EMAIL_REQUIRED';
  end if;

  return query
  select p.id, p.full_name, p.email, p.role
  from public.profiles p
  where lower(coalesce(p.email, '')) = v_email
  limit 1;
end;
$$;

revoke all on function public.admin_find_team_member(text) from public, anon;
grant execute on function public.admin_find_team_member(text) to authenticated;

revoke execute on function public.admin_list_team() from authenticated;

create or replace function public.staff_get_orders()
returns table(
  order_id bigint,
  status text,
  total numeric,
  subtotal numeric,
  delivery_fee numeric,
  delivery_distance_km numeric,
  estimated_delivery_minutes integer,
  customer_name text,
  customer_phone text,
  delivery_address text,
  paid_at timestamptz,
  prep_started_at timestamptz,
  ready_for_delivery_at timestamptz,
  delivery_started_at timestamptz,
  delivered_at timestamptz,
  queue_position integer,
  items jsonb
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
    o.status,
    o.total,
    o.subtotal,
    o.delivery_fee,
    o.delivery_distance_km,
    o.estimated_delivery_minutes,
    case when v_role in ('admin', 'delivery') then o.customer_name else null end,
    case when v_role in ('admin', 'delivery') then o.customer_phone else null end,
    case when v_role in ('admin', 'delivery') then o.delivery_address else null end,
    o.paid_at,
    o.prep_started_at,
    o.ready_for_delivery_at,
    o.delivery_started_at,
    o.delivered_at,
    case
      when o.payment_status = 'approved'
       and o.status in ('confirmado', 'preparando')
       and o.ready_for_delivery_at is null
      then (
        select count(*)::integer
        from public.orders q
        where q.payment_status = 'approved'
          and q.status in ('confirmado', 'preparando')
          and q.ready_for_delivery_at is null
          and (coalesce(q.paid_at, q.created_at), q.id)
              <= (coalesce(o.paid_at, o.created_at), o.id)
      )
      else null
    end,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id', oi.product_id,
          'name', p.name,
          'image', p.image,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price
        ) order by oi.id
      )
      from public.order_items oi
      left join public.products p on p.id = oi.product_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
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
  order by
    case
      when o.status = 'en_camino' then 0
      when o.ready_for_delivery_at is not null then 1
      else 2
    end,
    coalesce(o.paid_at, o.created_at),
    o.id;
end;
$$;

revoke all on function public.staff_get_orders() from public, anon;
grant execute on function public.staff_get_orders() to authenticated;
