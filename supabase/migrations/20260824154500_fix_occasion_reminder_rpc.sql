-- Kantu Floral: el RPC de recordatorios debe funcionar realmente con el rol authenticated.
-- Evita depender de private.next_occasion_date() desde una función SECURITY INVOKER.

create or replace function public.get_my_occasion_reminders()
returns table(
  id bigint,
  label text,
  occasion_type text,
  month smallint,
  day smallint,
  lead_days smallint,
  enabled boolean,
  next_occurrence date,
  days_until integer,
  is_due boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with local_today as (
    select timezone('America/Lima', now())::date as today
  )
  select
    r.id,
    r.label,
    r.occasion_type,
    r.month,
    r.day,
    r.lead_days,
    r.enabled,
    n.next_occurrence,
    (n.next_occurrence - t.today)::integer as days_until,
    (
      r.enabled
      and n.next_occurrence is not null
      and (n.next_occurrence - t.today) between 0 and r.lead_days
    ) as is_due
  from public.occasion_reminders r
  cross join local_today t
  cross join lateral (
    select make_date(candidate_year, r.month::integer, r.day::integer) as next_occurrence
    from generate_series(
      extract(year from t.today)::integer,
      extract(year from t.today)::integer + 8
    ) as candidate_year
    where r.day::integer <= extract(
      day from (
        date_trunc('month', make_date(candidate_year, r.month::integer, 1))
        + interval '1 month - 1 day'
      )
    )::integer
      and make_date(candidate_year, r.month::integer, r.day::integer) >= t.today
    order by candidate_year
    limit 1
  ) n
  where r.user_id = (select auth.uid())
  order by
    r.enabled desc,
    n.next_occurrence nulls last,
    lower(r.label),
    r.id;
$$;

revoke all on function public.get_my_occasion_reminders() from public, anon;
grant execute on function public.get_my_occasion_reminders() to authenticated, service_role;

create or replace function public.kantu_occasion_reminders_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with rpc_state as (
  select
    coalesce((
      select not p.prosecdef
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid = to_regprocedure('public.get_my_occasion_reminders()')
    ), false) as is_invoker,
    coalesce((
      select position('private.next_occasion_date' in pg_catalog.pg_get_functiondef(p.oid)) = 0
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid = to_regprocedure('public.get_my_occasion_reminders()')
    ), false) as private_helper_independent
), policy_state as (
  select count(*)::integer as policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'occasion_reminders'
)
select jsonb_build_object(
  'healthy',
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.occasion_reminders'::regclass), false)
    and (select policy_count from policy_state) >= 4
    and to_regprocedure('public.get_my_occasion_reminders()') is not null
    and (select is_invoker from rpc_state)
    and (select private_helper_independent from rpc_state)
    and not has_table_privilege('anon', 'public.occasion_reminders', 'SELECT')
    and has_table_privilege('authenticated', 'public.occasion_reminders', 'SELECT')
    and has_table_privilege('authenticated', 'public.occasion_reminders', 'INSERT')
    and has_table_privilege('authenticated', 'public.occasion_reminders', 'UPDATE')
    and has_table_privilege('authenticated', 'public.occasion_reminders', 'DELETE'),
  'rls', coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.occasion_reminders'::regclass), false),
  'own_row_policies', (select policy_count from policy_state) >= 4,
  'customer_rpc', to_regprocedure('public.get_my_occasion_reminders()') is not null,
  'customer_rpc_invoker', (select is_invoker from rpc_state),
  'customer_rpc_private_helper_independent', (select private_helper_independent from rpc_state),
  'anon_table_blocked', not has_table_privilege('anon', 'public.occasion_reminders', 'SELECT')
);
$$;

revoke all on function public.kantu_occasion_reminders_health_check() from public, anon, authenticated;
grant execute on function public.kantu_occasion_reminders_health_check() to service_role;
