import fs from "node:fs";
import assert from "node:assert/strict";

const frontend = fs.readFileSync("js/guest-checkout.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260823224500_add_guest_checkout.sql", "utf8");
const guestEdge = fs.readFileSync("supabase/functions/guest-checkout/index.ts", "utf8");
const guestMpEdge = fs.readFileSync("supabase/functions/create-guest-mp-preference/index.ts", "utf8");

assert.match(loader, /js\/guest-checkout\.js/, "El loader debe cargar el checkout invitado.");
assert.match(frontend, /kantuGuestOrders:v1/, "El acceso invitado debe persistirse bajo una clave dedicada.");
assert.match(frontend, /create-guest-mp-preference/, "El frontend invitado debe usar la Edge Function de Mercado Pago dedicada.");
assert.match(frontend, /uploadToSignedUrl/, "Los comprobantes invitados deben usar subida firmada.");
assert.match(frontend, /manual_cleanup/, "El frontend debe limpiar comprobantes temporales si falla el registro.");
assert.doesNotMatch(frontend, /\.rpc\(["']create_order["']/, "El invitado nunca debe invocar create_order directamente.");
assert.doesNotMatch(frontend, /\.from\(["']orders["']/, "El navegador invitado no debe leer orders directamente.");
assert.doesNotMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY/, "El service role jamás debe aparecer en el frontend.");

assert.match(config, /\[functions\.guest-checkout\][\s\S]*?verify_jwt\s*=\s*false/, "guest-checkout usa autenticación propia por token opaco.");
assert.match(config, /\[functions\.create-guest-mp-preference\][\s\S]*?verify_jwt\s*=\s*false/, "Mercado Pago invitado usa autenticación propia por token opaco.");

assert.match(migration, /create table if not exists public\.guest_order_access/i, "Debe existir almacenamiento privado del hash de acceso.");
assert.match(migration, /token_hash text not null unique/i, "El token crudo no debe almacenarse: solo su hash único.");
assert.match(migration, /revoke all on table public\.guest_order_access from public, anon, authenticated/i, "Clientes no deben leer hashes de acceso.");
assert.match(migration, /grant execute on function public\.create_guest_order[\s\S]*?to service_role/i, "create_guest_order debe ser solo service_role.");
assert.match(migration, /alter table public\.payment_proofs alter column user_id drop not null/i, "Los comprobantes invitados deben admitir user_id NULL.");
assert.match(migration, /kantu_guest_checkout_health_check/i, "La migración debe incluir health check específico.");

assert.match(guestEdge, /randomGuestToken\(\)/, "El token invitado debe generarse criptográficamente en Edge.");
assert.match(guestEdge, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/, "El token debe tener 256 bits aleatorios.");
assert.match(guestEdge, /sha256Hex\(guestToken\)/, "Solo el hash del token debe llegar a PostgreSQL.");
assert.match(guestEdge, /consume_guest_checkout_rate_limit/, "La Edge Function pública debe aplicar rate limiting.");
assert.match(guestEdge, /createSignedUploadUrl/, "La subida de comprobantes debe prepararse server-side.");
assert.match(guestEdge, /ONLINE_PAYMENT_ALREADY_STARTED/, "No debe iniciarse pago manual después de iniciar Mercado Pago.");
assert.match(guestEdge, /action === "availability"/, "Invitados deben poder consultar cupos sin abrir RPCs autenticados.");

assert.match(guestMpEdge, /guest_order_access/, "Mercado Pago invitado debe validar el token contra el hash almacenado.");
assert.match(guestMpEdge, /ACTIVE_PROOF_STATUSES/, "Mercado Pago debe bloquearse cuando exista un comprobante manual activo.");
assert.match(guestMpEdge, /\.is\("user_id", null\)/, "La preferencia invitada solo puede operar sobre pedidos guest.");
assert.match(guestMpEdge, /external_reference: String\(orderId\)/, "Mercado Pago debe conservar la referencia autoritativa del pedido.");
assert.match(guestMpEdge, /guest=1/, "El retorno de Mercado Pago debe marcar el flujo invitado sin exponer el token.");
assert.doesNotMatch(guestMpEdge, /guest_token=.*back_urls/, "El token invitado no debe aparecer en URLs de retorno.");

console.log("Guest checkout security contracts OK");
