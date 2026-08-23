-- Kantu Floral: Realtime operativo con el mínimo de tablas necesarias.
-- RLS sigue siendo la capa que decide qué filas puede recibir cada cliente.

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'orders'
    ) then
        execute 'alter publication supabase_realtime add table public.orders';
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'payment_proofs'
    ) then
        execute 'alter publication supabase_realtime add table public.payment_proofs';
    end if;
end
$$;
