-- Reduce browser-facing privileges on payment and delivery configuration tables.
-- RLS and privileged RPCs remain the source of authorization.

revoke all on table public.payment_proofs from anon, authenticated;
grant select, insert on table public.payment_proofs to authenticated;

revoke all on table public.delivery_pricing_settings from anon, authenticated;
grant select, update on table public.delivery_pricing_settings to authenticated;
