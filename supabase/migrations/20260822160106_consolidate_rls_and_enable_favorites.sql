begin;

drop policy if exists "Users can view own favorites" on public.favorites;
create policy "Users can view own favorites" on public.favorites
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can add own favorites" on public.favorites;
create policy "Users can add own favorites" on public.favorites
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites" on public.favorites
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
create policy "Authenticated users can view permitted orders" on public.orders
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
);

drop policy if exists "Users can view their own order items" on public.order_items;
drop policy if exists "Admins can view all order items" on public.order_items;
create policy "Authenticated users can view permitted order items" on public.order_items
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.user_id = (select auth.uid())
  )
);

drop policy if exists "payment_proofs_customer_select_own" on public.payment_proofs;
drop policy if exists "payment_proofs_admin_select" on public.payment_proofs;
create policy "Authenticated users can view permitted payment proofs" on public.payment_proofs
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
);

commit;
