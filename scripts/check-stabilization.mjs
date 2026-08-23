import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const cart = read("js/cart.js");
const app = read("js/app.js");
const products = read("js/products.js");
const webhook = read("supabase/functions/mercadopago-webhook/index.ts");
const migration = read("supabase/migrations/20260823133500_harden_webhook_audit_and_rpc_surface.sql");

assert.match(cart, /cartSyncState\s*=\s*["']idle["']/, "El carrito debe mantener un estado explícito de sincronización.");
assert.match(cart, /rollbackCart\(/, "Las mutaciones autenticadas del carrito deben poder hacer rollback.");
assert.match(cart, /if \(!persisted\)/, "El carrito debe reaccionar a fallos de persistencia remota.");
assert.match(cart, /cartSyncState === ["']error["']/, "Checkout debe detectar un carrito sin sincronizar.");
assert.match(cart, /aria-live/, "El estado de sincronización debe anunciarse a tecnologías de asistencia.");

assert.match(app, /removeAttribute\(["']onclick["']\)/, "El menú móvil debe eliminar el handler inline legado.");
assert.match(app, /dataset\.kantuMenuBound/, "El menú móvil debe protegerse contra listeners duplicados.");
assert.match(app, /aria-expanded/, "El menú móvil debe exponer su estado accesible.");
assert.match(app, /MutationObserver/, "Los overlays deben sincronizar aria-hidden y foco al abrir/cerrar.");
assert.match(app, /visibleFocusableElements/, "Los modales deben implementar una política de foco explícita.");
assert.doesNotMatch(app, /stopImmediatePropagation\(\)/, "No se debe bloquear globalmente Escape/click con stopImmediatePropagation.");
assert.doesNotMatch(app, /initializeModalDismissalPolicy/, "La política antigua que impedía cerrar modales no debe volver.");

assert.match(products, /KantuProductConfig/, "La configuración de productos debe exponerse desde una fuente autoritativa.");
assert.match(products, /aria-pressed=\\?/, "Las categorías/favoritos deben mantener estado accesible.");
assert.match(products, /favoriteAction/, "El texto accesible de favoritos debe cambiar según su estado.");

assert.match(webhook, /@supabase\/supabase-js@2\.112\.3/, "La Edge Function debe fijar la versión exacta de Supabase JS.");
assert.match(webhook, /MAX_SIGNATURE_AGE_MS/, "El webhook debe limitar la antigüedad de la firma.");
assert.match(webhook, /signatureTimestampIsFresh/, "El timestamp de Mercado Pago debe validarse antes de procesar el evento.");
assert.match(webhook, /mercadopago_webhook_events/, "El webhook debe dejar trazabilidad de eventos validados.");

assert.match(migration, /enable row level security/i, "La tabla de auditoría debe tener RLS habilitado.");
assert.match(migration, /revoke all on table public\.mercadopago_webhook_events from public, anon, authenticated/i,
    "La auditoría de webhooks no debe quedar expuesta a clientes.");
assert.match(migration, /revoke execute on function public\.create_order\(text, text, text\) from public, anon, authenticated/i,
    "El overload legado de create_order debe retirarse de la superficie del navegador.");
assert.match(migration, /alter function public\.is_admin\(\) set search_path = ''/i,
    "is_admin debe usar search_path endurecido.");

console.log("Stabilization checks OK");
