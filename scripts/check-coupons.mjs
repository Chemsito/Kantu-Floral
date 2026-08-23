import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823214500_add_secure_coupons.sql", "utf8");
const checkout = fs.readFileSync("js/coupons.js", "utf8");
const admin = fs.readFileSync("js/admin-coupons.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");

assert.match(migration, /create table if not exists public\.coupons/i,
    "Debe existir una tabla de cupones administrable.");
assert.match(migration, /create table if not exists public\.checkout_coupon_selections/i,
    "La selección temporal de cupón debe quedar server-side.");
assert.match(migration, /revoke all on table public\.checkout_coupon_selections from public, anon, authenticated/i,
    "El cliente no debe escribir directamente la selección de cupones.");
assert.match(migration, /create or replace function private\.calculate_coupon_for_user/i,
    "El cálculo del descuento debe vivir fuera del navegador.");
assert.match(migration, /payment_status|status <> 'cancelado'/,
    "Los límites de uso deben considerar pedidos existentes.");
assert.match(migration, /for update[\s\S]*calculate_coupon_for_user/i,
    "create_order debe bloquear el cupón antes de reservar un uso.");
assert.match(migration, /v_total := greatest\(0, v_subtotal - v_discount\) \+ v_delivery_fee/i,
    "El total del pedido debe incluir el descuento antes de Mercado Pago o pago manual.");
assert.match(migration, /coupon_id, coupon_code, discount_amount/i,
    "El pedido debe conservar trazabilidad del descuento aplicado.");
assert.match(migration, /target_product_ids|target_categories/,
    "Los cupones deben poder limitarse por productos o categorías.");
assert.match(migration, /max_redemptions|per_user_limit/,
    "Los cupones deben soportar límites globales y por cliente.");
assert.match(migration, /kantu_coupons_health_check/,
    "El subsistema de cupones debe tener health check privado.");
assert.doesNotMatch(migration, /insert\s+into\s+public\.coupons/i,
    "No se deben inventar ni sembrar códigos promocionales.");

assert.match(checkout, /select_checkout_coupon/,
    "Checkout debe cotizar el cupón mediante RPC server-side.");
assert.match(checkout, /clear_checkout_coupon/,
    "Checkout debe poder retirar la selección server-side.");
assert.match(checkout, /actualDiscount =/,
    "La pantalla de pago debe mostrar el descuento real derivado del total del pedido.");
assert.match(checkout, /Object\.assign\(orderErrorMessages, COUPON_ERRORS\)/,
    "Los errores server-side de cupón deben ser comprensibles para el cliente.");
assert.match(admin, /from\("coupons"\)/,
    "Admin debe gestionar cupones mediante RLS.");
assert.match(admin, /target_product_ids/,
    "Admin debe configurar productos objetivo.");
assert.match(admin, /target_categories/,
    "Admin debe configurar categorías objetivo.");
assert.match(loader, /js\/coupons\.js/,
    "El loader debe cargar la experiencia de cupones.");
assert.match(loader, /js\/admin-coupons\.js/,
    "El loader debe cargar la administración de cupones.");

console.log("Coupon security and integration checks OK");
