-- Política explícita para documentar que la auditoría de Mercado Pago no es
-- una tabla de cliente. service_role continúa accediendo por bypass de RLS.

drop policy if exists "No client access to Mercado Pago webhook audit" on public.mercadopago_webhook_events;
create policy "No client access to Mercado Pago webhook audit"
on public.mercadopago_webhook_events
for all
to public
using (false)
with check (false);

revoke all on table public.mercadopago_webhook_events from public, anon, authenticated;
