import fs from "node:fs";
import assert from "node:assert/strict";

const frontend = fs.readFileSync("js/guest-checkout.js", "utf8");
const router = fs.readFileSync("js/guest-customization-router.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260823224500_add_guest_checkout.sql", "utf8");
const customizationMigration = fs.readFileSync("supabase/migrations/20260824141500_add_product_customizations.sql", "utf8");
const atomicMigration = fs.readFileSync("supabase/migrations/20260824144000_atomic_guest_product_customizations.sql", "utf8");
const guestEdge = fs.readFileSync("supabase/functions/guest-checkout/index.ts", "utf8");
const guestCreateEdge = fs.readFileSync("supabase/functions/guest-order-create/index.ts", "utf8");
const guestCustomizationEdge = fs.readFileSync("supabase/functions/guest-order-customizations/index.ts", "utf8");
const guestMpEdge = fs.readFileSync("supabase/functions/create-guest-mp-preference/index.ts", "utf8");

assert.match(loader, /js\/guest-checkout\.js/, "El loader debe cargar el checkout invitado.");
assert.match(loader, /js\/guest-customization-router\.js/, "El loader debe activar la creación invitada atómica.");
assert.match(frontend, /kantuGuestOrders:v1/, "El acceso invitado debe persistirse bajo una clave dedicada.");
assert.match(frontend, /create-guest-mp-preference/, "El frontend invitado debe usar la Edge Function de Mercado Pago dedicada.");
assert.match(frontend, /uploadToSignedUrl/, "Los comprobantes invitados deben usar subida firmada.");
assert.match(frontend, /manual_cleanup/, "El frontend debe limpiar comprobantes temporales si falla el registro.");
assert.doesNotMatch(frontend, /\.rpc\(["']create_order["']/, "El invitado nunca debe invocar create_order directamente.");
assert.doesNotMatch(frontend, /\.from\(["']orders["']/, "El navegador invitado no debe leer orders directamente.");
assert.doesNotMatch(frontend + router, /SUPABASE_SERVICE_ROLE_KEY/, "El service role jamás debe aparecer en el frontend.");

assert.match(router, /functionName === "guest-checkout"[\s\S]*action === "create"/, "Solo la creación invitada debe redirigirse al endpoint atómico.");
assert.match(router, /KantuProductCustomizations\?\.payload/, "La creación invitada debe enviar las personalizaciones elegidas.");
assert.match(router, /guest-order-create/, "La creación invitada debe usar la Edge Function atómica.");

assert.match(config, /\[functions\.guest-checkout\][\s\S]*?verify_jwt\s*=\s*false/, "guest-checkout usa autenticación propia por token opaco.");
assert.match(config, /\[functions\.create-guest-mp-preference\][\s\S]*?verify_jwt\s*=\s*false/, "Mercado Pago invitado usa autenticación propia por token opaco.");
assert.match(config, /\[functions\.guest-order-create\][\s\S]*?verify_jwt\s*=\s*false/, "La creación invitada atómica usa autenticación propia y rate limiting.");
assert.match(config, /\[functions\.guest-order-customizations\][\s\S]*?verify_jwt\s*=\s*false/, "La edición invitada de personalización debe validar token opaco.");

assert.match(migration, /create table if not exists public\.guest_order_access/i, "Debe existir almacenamiento privado del hash de acceso.");
assert.match(migration, /token_hash text not null unique/i, "El token crudo no debe almacenarse: solo su hash único.");
assert.match(migration, /revoke all on table public\.guest_order_access from public, anon, authenticated/i, "Clientes no deben leer hashes de acceso.");
assert.match(migration, /grant execute on function public\.create_guest_order[\s\S]*?to service_role/i, "create_guest_order debe ser solo service_role.");
assert.match(migration, /alter table public\.payment_proofs alter column user_id drop not null/i, "Los comprobantes invitados deben admitir user_id NULL.");
assert.match(migration, /kantu_guest_checkout_health_check/i, "La migración debe incluir health check específico.");

assert.match(customizationMigration, /PRODUCT_CUSTOMIZATION_REQUIRED/, "Los productos configurados deben exigir una opción válida server-side.");
assert.match(atomicMigration, /create_guest_order_customized/, "Debe existir creación atómica de pedido invitado con personalizaciones.");
assert.match(atomicMigration, /service_set_guest_order_customizations/, "La transacción debe validar y guardar personalizaciones antes de confirmar.");
assert.match(atomicMigration, /revoke all on function public\.create_guest_order_customized[\s\S]*?anon, authenticated/i, "La función atómica no debe exponerse al cliente.");
assert.match(atomicMigration, /grant execute on function public\.create_guest_order_customized[\s\S]*?service_role/i, "Solo service_role debe ejecutar la creación atómica.");

assert.match(guestEdge, /consume_guest_checkout_rate_limit/, "Las operaciones invitadas públicas deben aplicar rate limiting.");
assert.match(guestEdge, /createSignedUploadUrl/, "La subida de comprobantes debe prepararse server-side.");
assert.match(guestEdge, /ONLINE_PAYMENT_ALREADY_STARTED/, "No debe iniciarse pago manual después de iniciar Mercado Pago.");
assert.match(guestEdge, /action === "availability"/, "Invitados deben poder consultar cupos sin abrir RPCs autenticados.");

assert.match(guestCreateEdge, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/, "El endpoint atómico debe generar un token de 256 bits.");
assert.match(guestCreateEdge, /consume_guest_checkout_rate_limit/, "La creación atómica debe aplicar rate limiting.");
assert.match(guestCreateEdge, /create_guest_order_customized/, "La Edge atómica debe delegar la transacción a PostgreSQL.");
assert.match(guestCreateEdge, /PRODUCT_CUSTOMIZATION_REQUIRED/, "La Edge atómica debe devolver errores claros de personalización.");
assert.doesNotMatch(guestCreateEdge, /SUPABASE_SERVICE_ROLE_KEY[^\n]*return|serviceRoleKey[^\n]*json\(/, "La Edge no debe devolver el service role al cliente.");

assert.match(guestCustomizationEdge, /guest_order_access/, "La edición invitada debe validar el token contra el hash almacenado.");
assert.match(guestCustomizationEdge, /service_set_guest_order_customizations/, "La edición invitada debe validar opciones server-side.");

assert.match(guestMpEdge, /guest_order_access/, "Mercado Pago invitado debe validar el token contra el hash almacenado.");
assert.match(guestMpEdge, /ACTIVE_PROOF_STATUSES/, "Mercado Pago debe bloquearse cuando exista un comprobante manual activo.");
assert.match(guestMpEdge, /\.is\("user_id", null\)/, "La preferencia invitada solo puede operar sobre pedidos guest.");
assert.match(guestMpEdge, /external_reference: String\(orderId\)/, "Mercado Pago debe conservar la referencia autoritativa del pedido.");
assert.match(guestMpEdge, /guest=1/, "El retorno de Mercado Pago debe marcar el flujo invitado sin exponer el token.");
assert.doesNotMatch(guestMpEdge, /guest_token=.*back_urls/, "El token invitado no debe aparecer en URLs de retorno.");

console.log("Guest checkout security contracts OK");
