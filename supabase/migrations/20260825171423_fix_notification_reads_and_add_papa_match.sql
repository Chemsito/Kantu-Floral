alter table public.products drop constraint if exists products_recommendation_audiences_check;
alter table public.products add constraint products_recommendation_audiences_check
    check (recommendation_audiences <@ array['pareja','mama','papa','amiga','familiar','otro']::text[]);

grant update on table public.customer_notification_reads to authenticated;

drop policy if exists customer_notification_reads_update_own on public.customer_notification_reads;
create policy customer_notification_reads_update_own on public.customer_notification_reads
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
