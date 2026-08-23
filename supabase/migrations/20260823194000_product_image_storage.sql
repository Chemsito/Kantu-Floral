-- Kantu Floral: bucket público para imágenes comerciales del catálogo.
-- Solo administradores autenticados pueden escribir/eliminar objetos.

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'product-images',
    'product-images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'product-images'
    and public.is_admin()
);

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'product-images'
    and public.is_admin()
)
with check (
    bucket_id = 'product-images'
    and public.is_admin()
);

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'product-images'
    and public.is_admin()
);
