begin;

revoke execute on function public.create_order(text, text, text) from public, anon;
grant execute on function public.create_order(text, text, text) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.protect_payment_proof_fields() from public, anon, authenticated;

create index if not exists cart_items_product_id_idx on public.cart_items(product_id);
create index if not exists favorites_product_id_idx on public.favorites(product_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_user_active_idx on public.orders(user_id, created_at desc) where status not in ('entregado', 'cancelado');
create index if not exists payment_proofs_reviewed_by_idx on public.payment_proofs(reviewed_by);

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view own cart" on public.cart_items;
create policy "Users can view own cart" on public.cart_items
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add to own cart" on public.cart_items;
create policy "Users can add to own cart" on public.cart_items
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own cart" on public.cart_items;
create policy "Users can update own cart" on public.cart_items
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own cart" on public.cart_items;
create policy "Users can delete own cart" on public.cart_items
for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own orders" on public.orders;
create policy "Users can view their own orders" on public.orders
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own order items" on public.order_items;
create policy "Users can view their own order items" on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.user_id = (select auth.uid())
  )
);

drop policy if exists "payment_proofs_customer_select_own" on public.payment_proofs;
create policy "payment_proofs_customer_select_own" on public.payment_proofs
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "payment_proofs_customer_insert_own" on public.payment_proofs;
create policy "payment_proofs_customer_insert_own" on public.payment_proofs
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and verification_status = 'uploaded'
  and verification_notes is null
  and reviewed_at is null
  and reviewed_by is null
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = order_id::text
  and split_part(storage_path, '/', 3) <> ''
  and exists (
    select 1 from public.orders o
    where o.id = payment_proofs.order_id
      and o.user_id = (select auth.uid())
      and o.status = 'pendiente'
      and o.payment_status = 'pending'
      and o.total = payment_proofs.amount
  )
);

commit;
