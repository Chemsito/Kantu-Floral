begin;

-- Profiles are created server-side by the auth trigger. Browser clients only
-- need to read/update their own row through RLS.
revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

-- Cart data is private to signed-in users and protected by ownership RLS.
revoke all on table public.cart_items from anon, authenticated;
grant select, insert, update, delete on table public.cart_items to authenticated;

-- Favorites are private to signed-in users. UPDATE remains available for safe
-- upsert compatibility while RLS continues to enforce ownership.
revoke all on table public.favorites from anon, authenticated;
grant select, insert, update, delete on table public.favorites to authenticated;

-- Public visitors only need to read active products. Signed-in admins retain
-- CRUD through existing admin RLS policies; ordinary users are denied writes.
revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon;
grant select, insert, update, delete on table public.products to authenticated;

commit;
