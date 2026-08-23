import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const cart = read("js/cart.js");
const products = read("js/products.js");
const admin = read("js/admin.js");
const app = read("js/app.js");
const auth = read("js/auth.js");
const mpPreference = read("supabase/functions/create-mp-preference/index.ts");
const orderMigration = read("supabase/migrations/20260822200533_harden_admin_order_transitions.sql");
const operationalMigration = read("supabase/migrations/20260822201426_lock_admin_status_to_unpaid_cancellation.sql");

assert.match(cart, /onConflict:\s*["']user_id,product_id["']/, "El carrito debe resolver upserts por user_id + product_id.");
assert.match(cart, /KANTU_CART\.escapeHtml/, "El carrito debe escapar contenido de productos.");
assert.match(cart, /KANTU_CART\.safeUrl/, "El carrito debe validar URLs de imágenes.");
assert.match(cart, /ensureCartSessionReady/, "Las mutaciones del carrito deben esperar el ámbito correcto de sesión.");

assert.match(products, /productEscape\(/, "El catálogo debe escapar contenido dinámico.");
assert.match(products, /productSafeUrl\(/, "El catálogo debe validar URLs dinámicas.");
assert.match(products, /window\.KantuProductConfig/, "Catálogo y Admin deben compartir una única configuración de producto.");
assert.doesNotMatch(products, /openAdminProductForm\s*=/, "Products no debe reescribir funciones de Admin en runtime.");
assert.doesNotMatch(products, /renderAdminProducts\s*=/, "Products no debe reescribir el render de Admin.");

assert.match(app, /KANTU_APP\.escapeHtml/, "Favoritos debe escapar contenido dinámico.");
assert.doesNotMatch(app, /applyAdminHardening/, "Las reglas de Admin deben vivir en admin.js, no parchearse desde app.js.");
assert.match(admin, /payment_status === "approved"/, "Las ventas del dashboard deben contar pagos aprobados.");
assert.match(admin, /pendiente:\s*\["cancelado"\]/, "Admin no debe confirmar manualmente pedidos pendientes.");
assert.match(admin, /confirmado:\s*\[\]/, "Admin no debe saltarse el portal operativo desde confirmado.");
assert.match(admin, /preparando:\s*\[\]/, "Admin no debe saltarse timestamps de preparación.");
assert.match(admin, /en_camino:\s*\[\]/, "Admin no debe saltarse timestamps de reparto.");
assert.match(admin, /KantuProductConfig\?\.categoryValues/, "Admin debe consumir la configuración de categorías del catálogo.");

assert.match(app, /retryableStatuses = new Set\(\["pending", "rejected", "cancelled"\]\)/,
  "El frontend debe permitir reintentar Mercado Pago tras rechazo o cancelación.");
assert.match(app, /resetManualPayment\(\)/,
  "Un reintento de Mercado Pago rechazado/cancelado no debe habilitar pagos manuales fuera del estado pending.");

assert.match(mpPreference, /RETRYABLE_PAYMENT_STATUSES = new Set\(\["pending", "rejected", "cancelled"\]\)/,
  "La Edge Function debe aceptar reintentos de pagos rechazados o cancelados.");
assert.match(mpPreference, /\.select\("id, name, image, stock, active"\)/,
  "La preferencia debe volver a consultar stock y disponibilidad antes de enviar al cliente a pagar.");
assert.match(mpPreference, /stock < requiredQuantity/,
  "La preferencia debe bloquear checkout cuando el stock actual sea insuficiente.");
assert.match(mpPreference, /\.eq\("payment_status", order\.payment_status\)/,
  "La asociación de una nueva preferencia debe usar control optimista sobre el estado observado.");
assert.match(mpPreference, /@supabase\/supabase-js@2\.112\.3/,
  "La Edge Function de preferencias debe fijar la versión exacta de Supabase JS.");

assert.match(auth, /KANTU_MIN_PASSWORD_LENGTH = 8/, "La contraseña mínima del frontend debe ser de al menos 8 caracteres.");
assert.doesNotMatch(auth, /Usuario conectado:/, "No se debe registrar el correo del usuario al iniciar sesión.");
assert.doesNotMatch(auth, /Sesión iniciada:/, "No se debe volcar la sesión al log.");

assert.match(orderMigration, /PAYMENT_FLOW_REQUIRED/, "El backend debe bloquear pendiente -> confirmado desde Admin.");
assert.match(orderMigration, /PAID_ORDER_CANNOT_BE_CANCELLED/, "El backend debe bloquear cancelaciones pagadas sin reembolso.");
assert.match(orderMigration, /drop policy if exists "Admins can update orders"/, "No debe existir UPDATE directo de orders desde el navegador.");
assert.match(operationalMigration, /OPERATIONAL_FLOW_REQUIRED/, "Los estados operativos deben quedar reservados al portal staff.");
assert.match(operationalMigration, /v_old_status = 'pendiente' and p_new_status = 'cancelado'/, "Admin solo debe poder cancelar pedidos pendientes no pagados.");

console.log("Hardening checks OK");
