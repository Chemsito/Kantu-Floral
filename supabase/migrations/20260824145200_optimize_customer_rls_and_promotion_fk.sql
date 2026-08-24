-- Kantu Floral - ajustes de rendimiento detectados por Supabase Advisor
-- Evita reevaluar auth.uid() por cada fila y cubre la FK de promoción en orders.

create index if not exists orders_promotion_id_idx
  on public.orders (promotion_id);

alter policy "Customers can read own favorites"
  on public.customer_favorites
  using ((select auth.uid()) = user_id);

alter policy "Customers can create own favorites"
  on public.customer_favorites
  with check ((select auth.uid()) = user_id);

alter policy "Customers can delete own favorites"
  on public.customer_favorites
  using ((select auth.uid()) = user_id);

alter policy "Customers can read own occasion reminders"
  on public.occasion_reminders
  using ((select auth.uid()) = user_id);

alter policy "Customers can create own occasion reminders"
  on public.occasion_reminders
  with check ((select auth.uid()) = user_id);

alter policy "Customers can update own occasion reminders"
  on public.occasion_reminders
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Customers can delete own occasion reminders"
  on public.occasion_reminders
  using ((select auth.uid()) = user_id);
