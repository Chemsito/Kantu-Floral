import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const cart = read("js/cart.js");
const products = read("js/products.js");
const app = read("js/app.js");
const auth = read("js/auth.js");
const orderMigration = read("supabase/migrations/20260822200500_harden_admin_order_transitions.sql");

assert.match(cart, /onConflict:\s*["']user_id,product_id["']/, "El carrito debe resolver upserts por user_id + product_id.");
assert.match(cart, /KANTU_CART\.escapeHtml/, "El carrito debe escapar contenido de productos.");
assert.match(cart, /KANTU_CART\.safeUrl/, "El carrito debe validar URLs de imágenes.");

assert.match(products, /productEscape\(/, "El catálogo debe escapar contenido dinámico.");
assert.match(products, /productSafeUrl\(/, "El catálogo debe validar URLs dinámicas.");
assert.match(app, /KANTU_APP\.escapeHtml/, "Favoritos debe escapar contenido dinámico.");
assert.match(app, /payment_status === "approved"/, "Las ventas del dashboard deben contar pagos aprobados.");
assert.match(app, /ADMIN_ALLOWED_TRANSITIONS\.pendiente = \["cancelado"\]/, "Admin no debe confirmar manualmente pedidos pendientes.");

assert.match(auth, /KANTU_MIN_PASSWORD_LENGTH = 8/, "La contraseña mínima del frontend debe ser de al menos 8 caracteres.");
assert.doesNotMatch(auth, /Usuario conectado:/, "No se debe registrar el correo del usuario al iniciar sesión.");
assert.doesNotMatch(auth, /Sesión iniciada:/, "No se debe volcar la sesión al log.");

assert.match(orderMigration, /PAYMENT_FLOW_REQUIRED/, "El backend debe bloquear pendiente -> confirmado desde Admin.");
assert.match(orderMigration, /PAID_ORDER_CANNOT_BE_CANCELLED/, "El backend debe bloquear cancelaciones pagadas sin reembolso.");
assert.match(orderMigration, /drop policy if exists "Admins can update orders"/, "No debe existir UPDATE directo de orders desde el navegador.");

console.log("Hardening checks OK");
