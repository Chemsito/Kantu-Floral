-- Kantu Floral: fechas bloqueadas y capacidad configurable por franja.
-- Comportamiento neutro por defecto: sin fechas bloqueadas y sin límites de cupo.

alter table public.delivery_schedule_settings
  add column if not exists blackout_dates date[] not null default '{}'::date[],
  add column if not exists slot_capacities jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'delivery_schedule_slot_capacities_object_check'
      and conrelid = 'public.delivery_schedule_settings'::regclass
  ) then
    alter table public.delivery_schedule_settings
      add constraint delivery_schedule_slot_capacities_object_check
      check (jsonb_typeof(slot_capacities) = 'object');
  end if;
end $$;

create or replace function private.normalize_delivery_schedule_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_value numeric;
  v_clean jsonb := '{}'::jsonb;
begin
  select coalesce(array_agg(d order by d), '{}'::date[])
    into new.blackout_dates
  from (
    select distinct d
    from unnest(coalesce(new.blackout_dates, '{}'::date[])) as d
    where d is not null
  ) normalized;

  if new.slot_capacities is null or jsonb_typeof(new.slot_capacities) <> 'object' then
    raise exception 'INVALID_DELIVERY_SLOT_CAPACITIES';
  end if;

  for v_entry in
    select key, value
    from jsonb_each(new.slot_capacities)
  loop
    -- Si Admin elimina una franja, retiramos automáticamente su cupo obsoleto.
    if not (v_entry.key = any(coalesce(new.slots, '{}'::text[]))) then
      continue;
    end if;

    if jsonb_typeof(v_entry.value) <> 'number' then
      raise exception 'INVALID_DELIVERY_SLOT_CAPACITY';
    end if;

    v_value := (v_entry.value #>> '{}')::numeric;
    if v_value <> trunc(v_value) or v_value < 1 or v_value > 1000 then
      raise exception 'INVALID_DELIVERY_SLOT_CAPACITY';
    end if;

    v_clean := v_clean || jsonb_build_object(v_entry.key, v_value::integer);
  end loop;

  new.slot_capacities := v_clean;
  return new;
end;
$$;

revoke all on function private.normalize_delivery_schedule_availability() from public, anon, authenticated;

drop trigger if exists delivery_schedule_availability_normalize on public.delivery_schedule_settings;
create trigger delivery_schedule_availability_normalize
before insert or update of slots, blackout_dates, slot_capacities
on public.delivery_schedule_settings
for each row
execute function private.normalize_delivery_schedule_availability();

create or replace function public.get_delivery_schedule_availability(p_date date)
returns table(
  slot text,
  available boolean,
  capacity integer,
  reserved_count bigint,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_enabled boolean := false;
  v_min_lead_hours integer := 0;
  v_max_days_ahead integer := 30;
  v_slots text[] := '{}'::text[];
  v_blackout_dates date[] := '{}'::date[];
  v_capacities jsonb := '{}'::jsonb;
  v_now_local timestamp without time zone := timezone('America/Lima', now());
  v_today date;
  v_slot text;
  v_slot_start time without time zone;
  v_capacity integer;
  v_reserved bigint;
  v_available boolean;
  v_reason text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_date is null then raise exception 'INVALID_DELIVERY_DATE'; end if;

  select
    s.scheduling_enabled,
    s.min_lead_hours,
    s.max_days_ahead,
    s.slots,
    s.blackout_dates,
    s.slot_capacities
  into
    v_enabled,
    v_min_lead_hours,
    v_max_days_ahead,
    v_slots,
    v_blackout_dates,
    v_capacities
  from public.delivery_schedule_settings s
  where s.id = 1;

  v_today := v_now_local::date;

  foreach v_slot in array coalesce(v_slots, '{}'::text[])
  loop
    v_capacity := null;
    if coalesce(v_capacities, '{}'::jsonb) ? v_slot then
      v_capacity := (v_capacities ->> v_slot)::integer;
    end if;

    select count(*)
      into v_reserved
    from public.orders o
    where o.requested_delivery_date = p_date
      and o.requested_delivery_slot = v_slot
      and o.status <> 'cancelado';

    v_available := true;
    v_reason := null;

    if not coalesce(v_enabled, false) then
      v_available := false;
      v_reason := 'SCHEDULING_DISABLED';
    elsif p_date < v_today or p_date > (v_today + coalesce(v_max_days_ahead, 30)) then
      v_available := false;
      v_reason := 'DATE_OUT_OF_RANGE';
    elsif p_date = any(coalesce(v_blackout_dates, '{}'::date[])) then
      v_available := false;
      v_reason := 'DATE_BLOCKED';
    elsif v_slot !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      v_available := false;
      v_reason := 'INVALID_DELIVERY_SLOT';
    else
      v_slot_start := split_part(v_slot, '-', 1)::time;
      if (p_date::timestamp + v_slot_start)
         < (v_now_local + make_interval(hours => coalesce(v_min_lead_hours, 0))) then
        v_available := false;
        v_reason := 'TOO_SOON';
      elsif v_capacity is not null and v_reserved >= v_capacity then
        v_available := false;
        v_reason := 'SLOT_FULL';
      end if;
    end if;

    slot := v_slot;
    available := v_available;
    capacity := v_capacity;
    reserved_count := v_reserved;
    reason := v_reason;
    return next;
  end loop;
end;
$$;

revoke all on function public.get_delivery_schedule_availability(date) from public, anon;
grant execute on function public.get_delivery_schedule_availability(date) to authenticated, service_role;

create or replace function private.enforce_delivery_schedule_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_min_lead_hours integer := 0;
  v_max_days_ahead integer := 30;
  v_slots text[] := '{}'::text[];
  v_blackout_dates date[] := '{}'::date[];
  v_capacities jsonb := '{}'::jsonb;
  v_now_local timestamp without time zone := timezone('America/Lima', now());
  v_today date;
  v_slot_start time without time zone;
  v_capacity integer;
  v_reserved bigint;
begin
  if new.requested_delivery_date is null or new.status = 'cancelado' then
    return new;
  end if;

  -- Una sola fila de configuración actúa como candado corto para serializar
  -- reservas programadas y evitar exceder cupos bajo concurrencia.
  select
    s.scheduling_enabled,
    s.min_lead_hours,
    s.max_days_ahead,
    s.slots,
    s.blackout_dates,
    s.slot_capacities
  into
    v_enabled,
    v_min_lead_hours,
    v_max_days_ahead,
    v_slots,
    v_blackout_dates,
    v_capacities
  from public.delivery_schedule_settings s
  where s.id = 1
  for update;

  v_today := v_now_local::date;

  if not coalesce(v_enabled, false) then raise exception 'DELIVERY_SCHEDULING_DISABLED'; end if;
  if new.requested_delivery_date < v_today then raise exception 'INVALID_DELIVERY_DATE'; end if;
  if new.requested_delivery_date > (v_today + coalesce(v_max_days_ahead, 30)) then raise exception 'DELIVERY_DATE_TOO_FAR'; end if;
  if nullif(btrim(new.requested_delivery_slot), '') is null then raise exception 'DELIVERY_SLOT_REQUIRED'; end if;
  if not (new.requested_delivery_slot = any(coalesce(v_slots, '{}'::text[]))) then raise exception 'INVALID_DELIVERY_SLOT'; end if;
  if new.requested_delivery_date = any(coalesce(v_blackout_dates, '{}'::date[])) then
    raise exception 'DELIVERY_DATE_UNAVAILABLE';
  end if;

  v_slot_start := split_part(new.requested_delivery_slot, '-', 1)::time;
  if (new.requested_delivery_date::timestamp + v_slot_start)
     < (v_now_local + make_interval(hours => coalesce(v_min_lead_hours, 0))) then
    raise exception 'DELIVERY_SLOT_TOO_SOON';
  end if;

  if coalesce(v_capacities, '{}'::jsonb) ? new.requested_delivery_slot then
    v_capacity := (v_capacities ->> new.requested_delivery_slot)::integer;

    select count(*)
      into v_reserved
    from public.orders o
    where o.requested_delivery_date = new.requested_delivery_date
      and o.requested_delivery_slot = new.requested_delivery_slot
      and o.status <> 'cancelado'
      and (tg_op = 'INSERT' or o.id <> new.id);

    if v_reserved >= v_capacity then
      raise exception 'DELIVERY_SLOT_FULL';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_delivery_schedule_availability() from public, anon, authenticated;

drop trigger if exists orders_delivery_schedule_availability_guard on public.orders;
create trigger orders_delivery_schedule_availability_guard
before insert or update of requested_delivery_date, requested_delivery_slot
on public.orders
for each row
execute function private.enforce_delivery_schedule_availability();

create or replace function public.kantu_delivery_availability_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
select jsonb_build_object(
  'healthy',
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='delivery_schedule_settings' and column_name='blackout_dates'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='delivery_schedule_settings' and column_name='slot_capacities'
    )
    and to_regprocedure('public.get_delivery_schedule_availability(date)') is not null
    and exists (
      select 1 from pg_catalog.pg_trigger t
      where t.tgrelid='public.orders'::regclass
        and t.tgname='orders_delivery_schedule_availability_guard'
        and not t.tgisinternal
    )
    and has_function_privilege('authenticated', 'public.get_delivery_schedule_availability(date)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_delivery_schedule_availability(date)', 'EXECUTE'),
  'blackout_dates', exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='delivery_schedule_settings' and column_name='blackout_dates'
  ),
  'slot_capacities', exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='delivery_schedule_settings' and column_name='slot_capacities'
  ),
  'availability_rpc', to_regprocedure('public.get_delivery_schedule_availability(date)') is not null,
  'order_guard', exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.orders'::regclass
      and t.tgname='orders_delivery_schedule_availability_guard'
      and not t.tgisinternal
  ),
  'authenticated_quote_allowed', has_function_privilege('authenticated', 'public.get_delivery_schedule_availability(date)', 'EXECUTE'),
  'anon_quote_blocked', not has_function_privilege('anon', 'public.get_delivery_schedule_availability(date)', 'EXECUTE')
);
$$;

revoke all on function public.kantu_delivery_availability_health_check() from public, anon, authenticated;
grant execute on function public.kantu_delivery_availability_health_check() to service_role;
