# Kantu Floral — Stabilization 2026-08-23

## Scope

This branch stabilizes the existing ecommerce without changing the payment source of truth or weakening Supabase RLS.

## Deployment gates

Before merging/deploying:

1. `npm run check` must pass.
2. Both Edge Functions must pass `deno check`.
3. Chromium public smoke tests must pass.
4. Apply the two stabilization migrations.
5. Execute `select public.kantu_deployment_health_check();` with a privileged deployment connection and require `healthy = true`.
6. Deploy `create-mp-preference` with JWT verification enabled.
7. Deploy `mercadopago-webhook` with JWT verification disabled; it authenticates Mercado Pago by HMAC signature.
8. Run Supabase Security/Performance Advisors again.

## Architecture decisions

- `admin.js` owns administrative state-transition policy and dashboard accounting.
- `products.js` owns product categories, sizes, metadata helpers and catalog rendering. Admin calls these helpers explicitly instead of monkey-patching functions.
- `experience-loader.js` owns deferred loading of non-critical customer UX modules.
- `app.js` remains the public orchestrator and accessibility layer. Payment/account adapters that cross modules are marked as temporary and should be moved only with dedicated payment regression coverage.
- Authenticated cart mutations use optimistic UI with rollback when Supabase persistence fails.
- Mercado Pago remains server-authoritative for payment validation; browser return parameters are informational only.

## Manual platform setting still required

Supabase Auth → Password security → enable leaked/compromised password protection.

This setting is not exposed by the connected management actions available to this maintenance run, so it must not be represented as completed by SQL or frontend code.

## Operational notes

- The webhook accepts only signatures inside a 10-minute freshness window, with 60 seconds of future clock skew tolerance.
- Valid webhook processing outcomes are written best-effort to `public.mercadopago_webhook_events`; client roles have no access.
- The legacy three-argument `create_order(text,text,text)` overload is removed from authenticated browser execution. The active checkout uses the coordinate-aware five-argument overload.
- `kantu_deployment_health_check()` is service-role only and verifies required RLS, delivery pricing, payment proof bucket settings and critical RPC presence.
