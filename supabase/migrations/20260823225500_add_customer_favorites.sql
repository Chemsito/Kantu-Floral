-- Kantu Floral: favoritos persistentes para clientes autenticados.
-- Visitantes continúan usando almacenamiento local; no se crean favoritos automáticamente.

create table if not exists public.customer_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists customer_favorites_product_idx
  on public.customer_favorites (product_id);

alter table public.customer_favorites enable row level security;

revoke all on table public.customer_favorites from public, anon, authenticated;
grant select, insert, delete on table public.customer_favorites to authenticated;

drop policy if exists "Customers can read own favorites" on public.customer_favorites;
create policy "Customers can read own favorites"
on public.customer_favorites
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Customers can create own favorites" on public.customer_favorites;
create policy "Customers can create own favorites"
on public.customer_favorites
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Customers can delete own favorites" on public.customer_favorites;
create policy "Customers can delete own favorites"
on public.customer_favorites
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.kantu_favorites_health_check()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with policy_state as (
  select count(*)::integer as policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'customer_favorites'
)
select jsonb_build_object(
  'healthy',
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.customer_favorites'::regclass), false)
    and (select policy_count from policy_state) >= 3
    and not has_table_privilege('anon', 'public.customer_favorites', 'SELECT')
    and has_table_privilege('authenticated', 'public.customer_favorites', 'SELECT')
    and has_table_privilege('authenticated', 'public.customer_favorites', 'INSERT')
    and has_table_privilege('authenticated', 'public.customer_favorites', 'DELETE')
    and not has_table_privilege('authenticated', 'public.customer_favorites', 'UPDATE'),
  'rls', coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.customer_favorites'::regclass), false),
  'own_row_policies', (select policy_count from policy_state) >= 3,
  'anon_blocked', not has_table_privilege('anon', 'public.customer_favorites', 'SELECT'),
  'authenticated_minimal_write',
    has_table_privilege('authenticated', 'public.customer_favorites', 'INSERT')
    and has_table_privilege('authenticated', 'public.customer_favorites', 'DELETE')
    and not has_table_privilege('authenticated', 'public.customer_favorites', 'UPDATE')
);
$$;

revoke all on function public.kantu_favorites_health_check() from public, anon, authenticated;
grant execute on function public.kantu_favorites_health_check() to service_role;
