import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823215000_add_server_side_promotions.sql", "utf8");
const cleanup = fs.readFileSync("supabase/migrations/20260823215500_cleanup_untracked_coupon_engine.sql", "utf8");
const promotions = fs.readFileSync("js/promotions.js", "utf8");
const gifting = fs.readFileSync("js/checkout-gifting.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const mpPreference = fs.readFileSync("supabase/functions/create-mp-preference/index.ts", "utf8");
const mpWebhook = fs.readFileSync("supabase/functions/mercadopago-webhook/index.ts", "utf8");

assert.match(migration, /create table if not exists public\.promotion_codes/i,
    "Debe existir una tabla administrable de promociones.");
assert.match(migration, /alter table public\.promotion_codes enable row level security/i,
    "Las promociones deben tener RLS.");
assert.match(migration, /revoke all on table public\.promotion_codes from public, anon, authenticated/i,
    "La tabla debe retirar privilegios heredados antes de conceder mínimos.");
assert.match(migration, /using \(public\.is_admin\(\)\)[\s\S]*with check \(public\.is_admin\(\)\)/i,
    "Solo Admin debe gestionar códigos directamente.");
assert.doesNotMatch(migration, /insert\s+into\s+public\.promotion_codes/i,
    "La migración no debe inventar códigos comerciales por defecto.");
assert.match(migration, /create or replace function public\.quote_promotion_code\(p_code text\)/i,
    "El cliente debe validar promociones mediante RPC server-side.");
assert.match(migration, /create or replace function public\.calculate_promotion_discount/i,
    "El cálculo de descuento debe centralizarse en el backend.");
assert.match(migration, /revoke all on function public\.calculate_promotion_discount\(text,numeric\) from public, anon, authenticated/i,
    "El helper de cálculo no debe quedar expuesto directamente al cliente.");
assert.match(migration, /p_promotion_code text[\s\S]*returns table\([\s\S]*discount_amount numeric/i,
    "create_order debe recibir el código y devolver el descuento calculado por servidor.");
assert.match(migration, /v_total := greatest\(0::numeric, v_subtotal \+ v_delivery_fee - v_discount_amount\)/,
    "El total final debe incorporar el descuento únicamente en servidor.");
assert.match(migration, /promotion_id, promotion_code, discount_amount/,
    "El pedido debe conservar una instantánea auditable de la promoción aplicada.");
assert.match(migration, /create or replace function public\.kantu_promotions_health_check\(\)/i,
    "El bloque debe contar con health check privado.");
assert.match(migration, /revoke all on function public\.kantu_promotions_health_check\(\) from public, anon, authenticated/i,
    "El health check de promociones no debe exponerse al cliente.");

assert.match(cleanup, /LEGACY_COUPONS_NOT_EMPTY/,
    "La limpieza del drift debe abortar antes de borrar cupones históricos.");
assert.match(cleanup, /LEGACY_COUPON_ORDERS_NOT_EMPTY/,
    "La limpieza no debe borrar columnas históricas si ya fueron utilizadas.");
assert.match(cleanup, /drop function if exists public\.select_checkout_coupon\(text\)/i,
    "Debe retirarse el RPC duplicado de cupones.");
assert.match(cleanup, /drop table if exists public\.checkout_coupon_selections/i,
    "Debe retirarse la selección persistida del motor duplicado.");
assert.match(cleanup, /drop table if exists public\.coupons/i,
    "Debe existir un único catálogo de promociones versionado.");
assert.match(cleanup, /language sql\s+security invoker[\s\S]*null::text/i,
    "La firma histórica de create_order debe volver a ser un wrapper invoker sin cupón implícito.");
assert.match(cleanup, /duplicate_coupon_engine_absent/,
    "El health check debe detectar la reaparición del motor duplicado.");

assert.match(promotions, /quote_promotion_code/,
    "La interfaz debe cotizar el código en Supabase.");
assert.match(promotions, /getAppliedCode/,
    "El checkout debe poder obtener únicamente el código validado.");
assert.match(promotions, /promotion_codes/,
    "Admin debe gestionar códigos desde la tabla protegida.");
assert.match(promotions, /Ningún descuento se calcula en el navegador/,
    "La UI Admin debe dejar claro que el backend es autoritativo.");
assert.match(promotions, /adminPromotionsView/,
    "Debe existir una vista Admin para promociones.");
assert.match(promotions, /placeholder="KANTU20"/,
    "El formulario puede mostrar un ejemplo visual, pero no debe persistirlo automáticamente.");

assert.match(gifting, /p_promotion_code:\s*promotionCode/,
    "La creación atómica del pedido debe enviar la promoción validada.");
assert.match(gifting, /discount_amount:\s*order\.discount_amount/,
    "La pantalla de pago debe conservar el descuento retornado por Supabase.");
assert.match(loader, /js\/promotions\.js/,
    "El loader debe cargar el módulo de promociones.");

assert.match(mpPreference, /discount_amount, promotion_code/,
    "Mercado Pago debe consultar el descuento persistido del pedido.");
assert.match(mpPreference, /if \(discountAmount > 0\)[\s\S]*unit_price: orderTotal/,
    "Con promoción Checkout Pro debe cobrar exactamente orders.total.");
assert.match(mpPreference, /calculatedTotalCents[\s\S]*orderTotalCents/,
    "La preferencia debe conservar la validación exacta de monto antes de cobrar.");
assert.match(mpWebhook, /paidAmount !== orderAmount/,
    "El webhook debe seguir validando el monto cobrado contra orders.total.");

console.log("Promotions checks OK");
