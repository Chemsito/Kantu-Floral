import fs from "node:fs";
import assert from "node:assert/strict";

const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const customer = fs.readFileSync("js/kantu-growth.js", "utf8");
const admin = fs.readFileSync("js/admin-growth.js", "utf8");
const standalone = fs.readFileSync("js/admin-standalone.js", "utf8");
const css = fs.readFileSync("css/kantu-growth.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260824213000_add_growth_notifications_and_claims.sql", "utf8");
const hardeningMigration = fs.readFileSync("supabase/migrations/20260825145500_harden_roles_and_notification_feed.sql", "utf8");
const edge = fs.readFileSync("supabase/functions/submit-customer-claim/index.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/check.yml", "utf8");

assert.match(loader, /kantu-growth\.js/, "El loader debe cargar Kantu Match y notificaciones del cliente.");
assert.match(loader, /admin-growth\.js/, "El loader debe cargar las alertas administrativas.");
assert.match(loader, /admin-standalone\.js/, "El panel Admin debe poder abrirse en una pestaña dedicada.");

assert.match(customer, /notificationButton/, "Debe existir la campana de notificaciones junto al carrito.");
assert.match(customer, /get_customer_notification_feed/, "El cliente debe consumir el feed autoritativo de notificaciones.");
assert.match(customer, /AudioContext/, "Las notificaciones deben soportar sonido dentro de la página.");
assert.match(customer, /KANTU MATCH/, "Debe existir Kantu Match.");
assert.match(customer, /recommendation_priority/, "Kantu Match debe considerar la prioridad comercial configurada por Admin.");
assert.match(customer, /submit-customer-claim/, "El Libro de Reclamaciones debe usar la Edge Function controlada.");
assert.doesNotMatch(customer, /SUPABASE_SERVICE_ROLE_KEY/, "El frontend nunca debe contener service_role.");

assert.match(admin, /admin_operational_alerts/, "Admin debe consumir alertas operativas del servidor.");
assert.match(admin, /5 \* 60_000/, "Las alertas urgentes deben poder repetir el aviso sonoro.");
assert.match(admin, /customer_claims/, "Admin debe gestionar el Libro de Reclamaciones.");
assert.match(admin, /recommendation_priority/, "Admin debe controlar la prioridad comercial de Kantu Match.");
assert.match(admin, /recommendation_occasions/, "Admin debe poder clasificar productos por ocasión.");
assert.match(standalone, /window\.open\(adminUrl\(\)/, "Panel administrador debe abrirse en otra pestaña.");
assert.match(standalone, /admin-standalone-mode/, "La pestaña Admin debe usar una presentación dedicada.");
assert.match(css, /body\.admin-standalone-mode/, "La vista Admin dedicada debe ocultar la tienda detrás.");

assert.match(migration, /customer_claims[\s\S]*enable row level security/i, "Los reclamos deben tener RLS.");
assert.match(migration, /service_submit_customer_claim/, "El alta de reclamos debe pasar por una función de servicio.");
assert.match(migration, /grant execute on function public\.service_submit_customer_claim\(jsonb,text,uuid\) to service_role/i, "Solo service_role puede registrar el reclamo en backend.");
assert.match(migration, /revoke all on function public\.service_submit_customer_claim\(jsonb,text,uuid\) from public, anon, authenticated/i, "Anon/authenticated no deben invocar directamente el alta privada.");
assert.match(migration, /admin_operational_alerts/, "Debe existir el feed operativo Admin.");
assert.match(migration, /recommendation_priority/, "Productos debe soportar prioridad comercial.");

assert.match(hardeningMigration, /revoke update on table public\.profiles from authenticated/i, "Authenticated no debe conservar UPDATE global sobre profiles.");
assert.match(hardeningMigration, /grant update \(full_name, phone, address, district, city, avatar_url\)/i, "El cliente solo debe editar columnas seguras del perfil.");
assert.match(hardeningMigration, /profiles_guard_role_change/i, "Debe existir defensa en profundidad contra cambios de rol.");
assert.doesNotMatch(hardeningMigration, /'florista'/i, "El rol operativo debe llamarse florist, no florista.");
assert.match(hardeningMigration, /'florist'/i, "Las personalizaciones deben autorizar al rol florist.");
assert.match(hardeningMigration, /get_customer_notification_feed\(\)[\s\S]*security invoker/i, "El feed público no debe permanecer SECURITY DEFINER.");
assert.match(hardeningMigration, /private\.get_public_promotion_notification_feed/i, "La lectura privilegiada de promociones debe quedar fuera del esquema expuesto.");
assert.match(hardeningMigration, /revoke all on function public\.get_customer_notification_feed\(\) from public/i, "El feed debe usar grants explícitos.");

assert.match(edge, /service_submit_customer_claim/, "La Edge Function debe delegar validación al backend.");
assert.match(edge, /consume_guest_checkout_rate_limit|p_fingerprint_hash/, "El formulario público debe estar protegido por rate limit.");
assert.doesNotMatch(edge, /return jsonResponse\([^)]*serviceRoleKey/, "La Edge Function nunca debe devolver la clave de servicio.");
assert.match(workflow, /submit-customer-claim\/index\.ts/, "CI debe hacer deno check de la Edge Function nueva.");

console.log("Kantu growth, notifications, claims and security hardening contracts OK");
