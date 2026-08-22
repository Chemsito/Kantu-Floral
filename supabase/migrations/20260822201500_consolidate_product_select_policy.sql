-- Evita políticas SELECT permisivas duplicadas para authenticated.

drop policy if exists "Admins can view all products" on public.products;
drop policy if exists "Public can view active products" on public.products;

create policy "Anon can view active products"
on public.products
for select
to anon
using (active = true);

create policy "Authenticated can view permitted products"
on public.products
for select
to authenticated
using (active = true or public.is_admin());
