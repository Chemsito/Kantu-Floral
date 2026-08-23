import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823205500_add_gift_delivery_preferences.sql", "utf8");
const privilegeMigration = fs.readFileSync("supabase/migrations/20260823211500_tighten_delivery_schedule_privileges.sql", "utf8");
const checkout = fs.readFileSync("js/checkout-gifting.js", "utf8");
const products = fs.readFileSync("js/products.js", "utf8");
const detailHtml = fs.readFileSync("producto.html", "utf8");
const detailJs = fs.readFileSync("js/product-detail.js", "utf8");
const scheduleAdmin = fs.readFileSync("js/admin-schedule.js", "utf8");
const giftingUi = fs.readFileSync("js/order-gifting-ui.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const staff = fs.readFileSync("staff.html", "utf8");

for (const column of [
    "recipient_name",
    "recipient_phone",
    "gift_message",
    "is_surprise",
    "requested_delivery_date",
    "requested_delivery_slot"
]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`), `La migración debe conservar ${column}.`);
}

assert.match(migration, /create table if not exists public\.delivery_schedule_settings/i,
    "Debe existir configuración server-side para horarios de entrega.");
assert.match(migration, /create or replace function public\.create_order\([\s\S]*p_recipient_name text[\s\S]*p_requested_delivery_slot text/i,
    "create_order debe recibir destinatario y programación server-side.");
assert.match(migration, /DELIVERY_SLOT_TOO_SOON/,
    "El backend debe validar la anticipación mínima de una franja.");
assert.match(migration, /for update of ci, p/,
    "La creación de pedido debe conservar bloqueo de carrito/producto antes del pago.");
assert.match(migration, /create or replace function public\.staff_get_order_gift_details\(\)/i,
    "Staff debe obtener detalles de regalo mediante RPC con control de rol.");
assert.match(migration, /v_role not in \('admin', 'florist', 'delivery'\)/,
    "El RPC operativo debe validar el rol internamente.");
assert.match(migration, /case when v_role in \('admin', 'delivery'\) then o\.recipient_phone else null end/,
    "Florista no debe recibir el teléfono privado del destinatario.");
assert.match(migration, /revoke all on function public\.kantu_deployment_health_check\(\) from public, anon, authenticated/i,
    "El health check debe seguir privado.");

assert.match(privilegeMigration, /revoke all on table public\.delivery_schedule_settings from public, anon, authenticated/i,
    "La agenda debe revocar los grants heredados antes de conceder el mínimo.");
assert.match(privilegeMigration, /grant select, update on table public\.delivery_schedule_settings to authenticated/i,
    "El navegador autenticado solo necesita SELECT y UPDATE sobre la agenda.");
for (const privilege of ["insert", "delete", "truncate"]) {
    assert.match(privilegeMigration, new RegExp(`not has_table_privilege\\('authenticated', 'public\\.delivery_schedule_settings', '${privilege}'\\)`, "i"),
        `El health check debe detectar si authenticated recupera ${privilege.toUpperCase()}.`);
}
assert.match(privilegeMigration, /delivery_schedule_privileges/,
    "El health check debe exponer el estado de privilegios de la agenda.");

for (const rpcParam of [
    "p_recipient_name",
    "p_recipient_phone",
    "p_gift_message",
    "p_is_surprise",
    "p_requested_delivery_date",
    "p_requested_delivery_slot"
]) {
    assert.match(checkout, new RegExp(`\\b${rpcParam}\\b`), `Checkout debe enviar ${rpcParam}.`);
}

assert.match(checkout, /delivery_schedule_settings/,
    "Checkout debe leer los horarios configurados, no inventarlos.");
assert.match(checkout, /America\/Lima/,
    "Checkout debe razonar las fechas en la zona horaria de Arequipa/Lima.");
assert.match(checkout, /form\.onsubmit = submitGiftOrder/,
    "El checkout enriquecido debe reemplazar únicamente el handler de creación de pedido.");

assert.match(products, /producto\.html\?id=\$\{productId\}/,
    "Cada tarjeta debe enlazar al detalle individual del producto.");
assert.match(detailHtml, /js\/product-detail\.js/,
    "La página individual debe cargar su controlador.");
assert.match(detailJs, /"@type": "Product"/,
    "El detalle debe publicar schema Product.");
assert.match(detailJs, /"@type": "Offer"/,
    "El detalle debe publicar la oferta/precio.");
assert.match(detailJs, /navigator\.share|clipboard/,
    "El producto debe poder compartirse.");
assert.match(detailJs, /cart_items/,
    "El detalle debe respetar el carrito autenticado existente.");

assert.match(scheduleAdmin, /delivery_schedule_settings/,
    "Admin debe configurar horarios en la tabla segura.");
assert.match(scheduleAdmin, /SLOT_PATTERN/,
    "Admin debe validar el formato de las franjas horarias.");
assert.match(scheduleAdmin, /enabled && slots\.length === 0/,
    "No se puede activar programación sin horarios reales.");

assert.match(giftingUi, /staff_get_order_gift_details/,
    "La UI operativa debe usar el RPC limitado para regalos.");
assert.match(giftingUi, /data-kantu-gift-meta/,
    "Las vistas deben marcar sus bloques de destinatario para evitar duplicados.");
assert.match(loader, /js\/checkout-gifting\.js/,
    "El loader debe cargar la integración del checkout.");
assert.match(loader, /js\/admin-schedule\.js/,
    "El loader debe cargar la configuración administrativa de horarios.");
assert.match(loader, /js\/order-gifting-ui\.js/,
    "El loader debe cargar la presentación de destinatario/regalo.");
assert.match(staff, /js\/order-gifting-ui\.js/,
    "Staff debe cargar la presentación de destinatario/regalo.");

console.log("Customer gifting and scheduling checks OK");
