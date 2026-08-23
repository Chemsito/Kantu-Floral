-- Kantu Floral: priorización operativa de pedidos programados.
-- No impone cuándo preparar: solo ordena por la fecha/franja solicitada cuando existe.

create or replace function private.kantu_order_due_at(
  p_requested_delivery_date date,
  p_requested_delivery_slot text,
  p_paid_at timestamptz,
  p_created_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_requested_delivery_date is not null
      and p_requested_delivery_slot ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    then (p_requested_delivery_date::timestamp + split_part(p_requested_delivery_slot, '-', 1)::time)
         at time zone 'America/Lima'
    else coalesce(p_paid_at, p_created_at)
  end;
$$;

revoke all on function private.kantu_order_due_at(date,text,timestamptz,timestamptz) from public, anon, authenticated;

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
          and (
            private.kantu_order_due_at(q.requested_delivery_date, q.requested_delivery_slot, q.paid_at, q.created_at),
            q.id
          ) <= (
            private.kantu_order_due_at(o.requested_delivery_date, o.requested_delivery_slot, o.paid_at, o.created_at),
            o.id
          )
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
    private.kantu_order_due_at(o.requested_delivery_date, o.requested_delivery_slot, o.paid_at, o.created_at),
    o.id;
end;
$$;

revoke all on function public.staff_get_orders() from public, anon;
grant execute on function public.staff_get_orders() to authenticated, service_role;

create or replace function public.admin_delivery_agenda(p_days integer default 14)
returns table(
  delivery_date date,
  delivery_slot text,
  order_count bigint,
  confirmed_count bigint,
  preparing_count bigint,
  ready_count bigint,
  in_transit_count bigint,
  delivered_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_days integer;
  v_today date := timezone('America/Lima', now())::date;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;

  v_days := greatest(1, least(coalesce(p_days, 14), 90));

  return query
  select
    o.requested_delivery_date,
    o.requested_delivery_slot,
    count(*)::bigint,
    count(*) filter (where o.status = 'confirmado')::bigint,
    count(*) filter (where o.status = 'preparando' and o.ready_for_delivery_at is null)::bigint,
    count(*) filter (where o.status = 'preparando' and o.ready_for_delivery_at is not null)::bigint,
    count(*) filter (where o.status = 'en_camino')::bigint,
    count(*) filter (where o.status = 'entregado')::bigint
  from public.orders o
  where o.payment_status = 'approved'
    and o.status <> 'cancelado'
    and o.requested_delivery_date between v_today and (v_today + v_days)
  group by o.requested_delivery_date, o.requested_delivery_slot
  order by
    o.requested_delivery_date,
    case
      when o.requested_delivery_slot ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-'
      then split_part(o.requested_delivery_slot, '-', 1)::time
      else '23:59'::time
    end,
    o.requested_delivery_slot;
end;
$$;

revoke all on function public.admin_delivery_agenda(integer) from public, anon;
grant execute on function public.admin_delivery_agenda(integer) to authenticated, service_role;

create or replace function public.kantu_scheduled_operations_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
select jsonb_build_object(
  'healthy',
    to_regprocedure('private.kantu_order_due_at(date,text,timestamp with time zone,timestamp with time zone)') is not null
    and to_regprocedure('public.staff_get_orders()') is not null
    and to_regprocedure('public.admin_delivery_agenda(integer)') is not null
    and position(
      'kantu_order_due_at' in pg_get_functiondef('public.staff_get_orders()'::regprocedure)
    ) > 0
    and not has_function_privilege('anon', 'public.admin_delivery_agenda(integer)', 'EXECUTE'),
  'due_at_helper', to_regprocedure('private.kantu_order_due_at(date,text,timestamp with time zone,timestamp with time zone)') is not null,
  'staff_priority_uses_due_at', position(
    'kantu_order_due_at' in pg_get_functiondef('public.staff_get_orders()'::regprocedure)
  ) > 0,
  'admin_agenda_rpc', to_regprocedure('public.admin_delivery_agenda(integer)') is not null,
  'anon_agenda_blocked', not has_function_privilege('anon', 'public.admin_delivery_agenda(integer)', 'EXECUTE')
);
$$;

revoke all on function public.kantu_scheduled_operations_health_check() from public, anon, authenticated;
grant execute on function public.kantu_scheduled_operations_health_check() to service_role;
