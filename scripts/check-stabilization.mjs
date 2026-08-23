import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const html = read("index.html");
const staffHtml = read("staff.html");
const cart = read("js/cart.js");
const app = read("js/app.js");
const admin = read("js/admin.js");
const products = read("js/products.js");
const orders = read("js/orders.js");
const manualPayments = read("js/manual-payments.js");
const staffRealtime = read("js/staff-realtime.js");
const supabaseCore = read("js/supabase.js");
const experienceLoader = read("js/experience-loader.js");
const webhook = read("supabase/functions/mercadopago-webhook/index.ts");
const preference = read("supabase/functions/create-mp-preference/index.ts");
const migration = read("supabase/migrations/20260823133500_harden_webhook_audit_and_rpc_surface.sql");
const healthMigration = read("supabase/migrations/20260823142000_add_deployment_health_check.sql");
const realtimeMigration = read("supabase/migrations/20260823193300_enable_realtime_operations.sql");

assert.match(html, /@supabase\/supabase-js@2\.112\.3/, "El cliente público debe fijar la versión exacta de Supabase JS.");
assert.doesNotMatch(html, /mobile-menu[^>]*onclick=/s, "El botón móvil no debe conservar un onclick inline.");
assert.match(html, /id="registerPassword"[\s\S]*?minlength="8"/, "El registro debe declarar 8 caracteres mínimos desde HTML.");
assert.match(html, /rel="canonical"/, "El HTML estático debe incluir canonical.");
assert.match(html, /property="og:title"/, "El HTML estático debe incluir Open Graph.");
assert.match(html, /application\/ld\+json/, "El HTML estático debe incluir datos estructurados.");
assert.match(html, /checkoutDeliveryMap[\s\S]*?tabindex="0"/, "El mapa de checkout debe ser alcanzable por teclado.");

assert.match(cart, /cartSyncState\s*=\s*["']idle["']/, "El carrito debe mantener un estado explícito de sincronización.");
assert.match(cart, /rollbackCart\(/, "Las mutaciones autenticadas del carrito deben poder hacer rollback.");
assert.match(cart, /if \(!persisted\)/, "El carrito debe reaccionar a fallos de persistencia remota.");
assert.match(cart, /cartSyncState === ["']error["']/, "Checkout debe detectar un carrito sin sincronizar.");
assert.match(cart, /aria-live/, "El estado de sincronización debe anunciarse a tecnologías de asistencia.");

assert.match(app, /removeAttribute\(["']onclick["']\)/, "El menú móvil debe neutralizar cualquier handler inline legado.");
assert.match(app, /dataset\.kantuMenuBound/, "El menú móvil debe protegerse contra listeners duplicados.");
assert.match(app, /aria-expanded/, "El menú móvil debe exponer su estado accesible.");
assert.match(app, /MutationObserver/, "Los overlays deben sincronizar aria-hidden y foco al abrir/cerrar.");
assert.match(app, /visibleFocusableElements/, "Los modales deben implementar una política de foco explícita.");
assert.match(app, /initializeCheckoutMapKeyboard/, "Checkout debe ofrecer selección de mapa por teclado.");
assert.doesNotMatch(app, /stopImmediatePropagation\(\)/, "No se debe bloquear globalmente Escape/click con stopImmediatePropagation.");
assert.doesNotMatch(app, /initializeModalDismissalPolicy/, "La política antigua que impedía cerrar modales no debe volver.");
assert.doesNotMatch(app, /applyAdminHardening/, "Admin no debe parchearse desde app.js.");
assert.match(app, /experience-loader\.js/, "Los módulos visuales deben cargarse desde un loader con responsabilidad explícita.");

assert.match(admin, /KantuProductConfig\?\.categoryValues/, "Admin debe consumir la configuración compartida de productos.");
assert.match(admin, /Ventas pagadas/, "El dashboard debe mostrar ventas pagadas, no pedidos simplemente no cancelados.");
assert.match(products, /KantuProductConfig/, "La configuración de productos debe exponerse desde una fuente autoritativa.");
assert.match(products, /aria-pressed=/, "Las categorías/favoritos deben mantener estado accesible.");
assert.match(products, /favoriteAction/, "El texto accesible de favoritos debe cambiar según su estado.");
assert.doesNotMatch(products, /saveEnhancedAdminProduct/, "Products no debe interceptar el submit administrativo.");
assert.match(experienceLoader, /customer-ux\.js/, "El loader de experiencia debe cargar el paquete UX.");

assert.match(orders, /checkoutDeliveryAddressText/, "Checkout debe solicitar una dirección legible además de coordenadas.");
assert.match(orders, /Dirección: \$\{addressLine\} \| \$\{selectedDeliveryMapsUrl\}/,
    "La dirección persistida debe conservar texto humano y ubicación exacta.");
assert.match(orders, /select\("full_name, phone, address, district, city"\)/,
    "Checkout debe reutilizar los datos guardados del perfil.");
assert.match(orders, /DELIVERY_ADDRESS_TEXT_REQUIRED/,
    "Checkout debe distinguir dirección escrita de ubicación geográfica.");
assert.match(supabaseCore, /addressLine/,
    "El parser compartido debe preservar la dirección legible.");
assert.match(supabaseCore, /<strong>Dirección:<\/strong>/,
    "Las vistas que usan el renderer compartido deben mostrar la dirección legible.");

assert.match(manualPayments, /MANUAL_PAYMENT_FALLBACK_POLL_INTERVAL = 30000/,
    "Pago manual debe conservar un polling lento como respaldo de Realtime.");
assert.match(manualPayments, /table: "payment_proofs"/,
    "Pago manual debe escuchar cambios del comprobante por Realtime.");
assert.match(manualPayments, /table: "orders"/,
    "Pago manual debe escuchar cambios del pedido por Realtime.");
assert.match(manualPayments, /removeChannel\(manualPaymentRealtimeChannel\)/,
    "Pago manual debe limpiar el canal Realtime al finalizar.");
assert.match(staffHtml, /js\/staff-realtime\.js/,
    "El portal Staff debe cargar el módulo Realtime dedicado.");
assert.match(staffRealtime, /table: "orders"/,
    "Staff debe reaccionar a cambios de pedidos en tiempo real.");
assert.match(staffRealtime, /STAFF_FALLBACK_REFRESH_INTERVAL = 60000/,
    "Staff debe mantener un refresco lento de respaldo.");
assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.orders/i,
    "La publicación Realtime debe incluir orders.");
assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.payment_proofs/i,
    "La publicación Realtime debe incluir payment_proofs.");

assert.match(preference, /@supabase\/supabase-js@2\.112\.3/, "La función de preferencias debe fijar Supabase JS.");
assert.match(webhook, /@supabase\/supabase-js@2\.112\.3/, "El webhook debe fijar la versión exacta de Supabase JS.");
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

assert.match(healthMigration, /kantu_deployment_health_check/, "Debe existir un health check de despliegue.");
assert.match(healthMigration, /delivery_pricing_settings/, "El health check debe verificar configuración de delivery.");
assert.match(healthMigration, /payment-proofs/, "El health check debe verificar el bucket privado de comprobantes.");
assert.match(healthMigration, /relrowsecurity/, "El health check debe verificar RLS de tablas críticas.");
assert.match(healthMigration, /revoke all on function public\.kantu_deployment_health_check\(\) from public, anon, authenticated/i,
    "El health check no debe ser ejecutable desde el navegador.");

console.log("Stabilization checks OK");
