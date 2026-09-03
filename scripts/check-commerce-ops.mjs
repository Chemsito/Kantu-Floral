import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823212500_add_commerce_operations.sql", "utf8");
const sourceFix = fs.readFileSync("supabase/migrations/20260823213200_clarify_inventory_movement_sources.sql", "utf8");
const module = fs.readFileSync("js/commerce-ops.js", "utf8");
const inventoryView = fs.readFileSync("js/admin-inventory-view.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");

assert.match(migration, /add column if not exists featured boolean not null default false/i,
    "Productos debe soportar destacados sin cambiar precios o variantes.");
assert.match(migration, /create table if not exists public\.inventory_movements/i,
    "Debe existir un ledger de inventario.");
assert.match(migration, /enable row level security/i,
    "El ledger debe tener RLS.");
assert.match(migration, /revoke all on table public\.inventory_movements from public, anon, authenticated/i,
    "El ledger debe retirar grants heredados antes de conceder lectura mínima.");
assert.match(migration, /grant select on table public\.inventory_movements to authenticated/i,
    "Authenticated solo necesita leer el ledger bajo RLS Admin.");
assert.match(migration, /using \(public\.is_admin\(\)\)/i,
    "Solo Admin debe poder leer movimientos.");
assert.match(migration, /products_inventory_movement_trigger/,
    "Los cambios de stock deben registrarse automáticamente.");
assert.match(migration, /create or replace function public\.admin_commerce_overview\(\)/i,
    "Admin debe contar con un resumen comercial server-side.");
assert.match(migration, /payment_status = 'approved'|payment_status='approved'/,
    "Las ventas del dashboard deben basarse en pagos aprobados.");
assert.match(migration, /create or replace function public\.kantu_commerce_ops_health_check\(\)/i,
    "Las nuevas capacidades deben tener health check privado.");
assert.match(migration, /revoke all on function public\.kantu_commerce_ops_health_check\(\) from public, anon, authenticated/i,
    "El health check de comercio no debe quedar expuesto al cliente.");

assert.match(sourceFix, /stock_increase/,
    "El ledger debe registrar aumentos sin inferir causas falsas.");
assert.match(sourceFix, /stock_decrease/,
    "El ledger debe registrar disminuciones sin inferir causas falsas.");
assert.doesNotMatch(sourceFix, /paid_order.*v_source|admin_adjustment.*v_source/,
    "El trigger no debe afirmar que una variación provino de un pago o ajuste manual sin contexto demostrable.");

assert.match(module, /stock_increase:\s*"Aumento de stock"/,
    "La interfaz debe explicar los aumentos de stock con texto legible.");
assert.match(module, /stock_decrease:\s*"Disminución de stock"/,
    "La interfaz debe explicar las disminuciones de stock con texto legible.");
assert.match(module, /category === "complementos"/,
    "El upsell debe reutilizar complementos reales del catálogo.");
assert.match(module, /await addToCart\(productId\)/,
    "Los complementos deben usar el carrito existente y su sincronización.");
assert.match(module, /admin_commerce_overview/,
    "El dashboard extendido debe usar el RPC Admin.");
assert.match(module, /inventory_movements/,
    "Admin debe poder consultar el ledger.");
assert.match(module, /data-admin-featured-product/,
    "Admin debe poder marcar productos destacados.");
assert.match(module, /producto\.html\?id=/,
    "Los destacados deben enlazar al detalle del producto.");
assert.match(inventoryView, /data\.adminView = VIEW_NAME/,
    "Inventario debe tener una pestaña Admin dedicada.");
assert.match(inventoryView, /productsButton\.insertAdjacentElement\("afterend", button\)/,
    "La pestaña Inventario debe ubicarse inmediatamente después de Productos.");
assert.match(inventoryView, /mount\.appendChild\(card\)/,
    "El historial existente debe trasladarse a la vista Inventario sin duplicar su lógica.");
assert.match(loader, /js\/commerce-ops\.js/,
    "El loader debe cargar el módulo comercial.");
assert.match(loader, /js\/admin-inventory-view\.js/,
    "El loader debe cargar la navegación dedicada de inventario.");

console.log("Commerce operations checks OK");
