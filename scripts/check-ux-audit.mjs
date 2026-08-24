import fs from "node:fs";
import assert from "node:assert/strict";

const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const custom = fs.readFileSync("js/product-customizations.js", "utf8");
const orderCustomUi = fs.readFileSync("js/order-customizations-ui.js", "utf8");
const guestRouter = fs.readFileSync("js/guest-customization-router.js", "utf8");
const ux = fs.readFileSync("js/ux-audit-fixes.js", "utf8");
const uxCss = fs.readFileSync("css/ux-audit.css", "utf8");
const adminCss = fs.readFileSync("css/admin-polish.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260824141500_add_product_customizations.sql", "utf8");
const atomicMigration = fs.readFileSync("supabase/migrations/20260824144000_atomic_guest_product_customizations.sql", "utf8");
const guestEditEdge = fs.readFileSync("supabase/functions/guest-order-customizations/index.ts", "utf8");
const guestCreateEdge = fs.readFileSync("supabase/functions/guest-order-create/index.ts", "utf8");
const productHtml = fs.readFileSync("producto.html", "utf8");
const staffHtml = fs.readFileSync("staff.html", "utf8");

assert.match(loader, /product-customizations\.js/, "El storefront debe cargar opciones de producto.");
assert.match(loader, /order-customizations-ui\.js/, "La tienda/Admin debe mostrar la selección de productos personalizables.");
assert.match(loader, /guest-customization-router\.js/, "El checkout invitado debe usar creación atómica con personalizaciones.");
assert.match(loader, /ux-audit-fixes\.js/, "El storefront debe cargar correcciones UX.");
assert.match(productHtml, /product-customizations\.js/, "El detalle de producto debe permitir personalización.");
assert.match(staffHtml, /order-customizations-ui\.js/, "Operaciones debe mostrar el mensaje elegido del topper.");

for (const option of ["TE QUIERO", "FELIZ ANIVERSARIO", "TE AMO", "HAPPY BIRTHDAY", "FELIZ CUMPLEAÑOS"]) {
  assert.match(migration, new RegExp(option), `Debe existir la opción de topper ${option}.`);
}
assert.match(migration, /cart_items[\s\S]*customization/, "La selección debe persistirse en el carrito autenticado.");
assert.match(migration, /order_items[\s\S]*customization/, "La selección debe persistirse en el pedido.");
assert.match(migration, /PRODUCT_CUSTOMIZATION_REQUIRED/, "El servidor debe exigir personalización en productos configurados.");
assert.match(custom, /data-cart-customization/, "El carrito debe permitir revisar/cambiar la selección.");
assert.match(custom, /data-upsell-customization/, "Los toppers en Completa tu regalo deben mostrar sus opciones.");
assert.match(custom, /dataset\.signature/, "La decoración dinámica debe ser idempotente para evitar loops/lag.");
assert.match(orderCustomUi, /get_order_item_customizations/, "Las vistas de pedido deben leer la selección mediante RPC autorizado.");
assert.match(guestEditEdge, /guest_order_access/, "La edición invitada debe validar el token del pedido.");
assert.match(atomicMigration, /create_guest_order_customized/, "La creación invitada personalizada debe ser transaccional.");
assert.match(atomicMigration, /service_set_guest_order_customizations/, "La transacción invitada debe validar/guardar las opciones antes de confirmar.");
assert.match(guestCreateEdge, /create_guest_order_customized/, "La Edge de creación invitada debe usar el RPC atómico.");
assert.match(guestRouter, /guest-order-create/, "El frontend invitado debe rutear creación al endpoint atómico.");

assert.match(ux, /checkoutPromotionSection/, "Debe existir corrección de colocación de promociones.");
assert.match(ux, /checkoutReviewFlowSection/, "La promoción debe integrarse en Revisa y crea el pedido.");
assert.match(uxCss, /checkout-review-flow-section > \.checkout-promotion-section/, "La promoción debe tener layout explícito dentro de revisión.");
assert.match(adminCss, /admin-delivery-capacity-grid/, "El panel de capacidad debe tener layout responsive.");
assert.match(adminCss, /max-width: 100%/, "Los controles Admin deben prevenir desbordes.");

console.log("UX audit, topper customization and admin polish contracts OK");
