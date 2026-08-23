import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823220500_add_advanced_promotion_rules.sql", "utf8");
const ui = fs.readFileSync("js/promotion-rules.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");

for (const column of ["max_redemptions", "per_user_limit", "target_product_ids", "target_categories"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`), `La promoción debe conservar ${column}.`);
}
assert.match(migration, /for update/i,
    "El cálculo debe bloquear la promoción para serializar límites de uso.");
assert.match(migration, /o\.status<>'cancelado'/,
    "Los pedidos cancelados no deben consumir límites de promoción.");
assert.match(migration, /p\.id=any\(v_promotion\.target_product_ids\)/,
    "El backend debe aplicar alcance por productos.");
assert.match(migration, /p\.category=any\(v_promotion\.target_categories\)/,
    "El backend debe aplicar alcance por categorías.");
assert.match(migration, /maximum_discount/,
    "El tope máximo de descuento debe seguir siendo autoritativo.");
assert.match(migration, /revoke all on table public\.promotion_codes from public, anon, authenticated/i,
    "Los grants de la tabla deben reducirse antes de reabrir permisos mínimos.");
assert.match(migration, /grant select, insert, update on table public\.promotion_codes to authenticated/i,
    "Admin debe poder gestionar sin conceder DELETE/TRUNCATE.");
assert.match(migration, /authenticated_delete_blocked/,
    "El health check debe vigilar que DELETE siga bloqueado.");

assert.match(ui, /adminPromotionMaxRedemptions/,
    "Admin debe configurar máximo global de usos.");
assert.match(ui, /adminPromotionPerUserLimit/,
    "Admin debe configurar máximo por cliente.");
assert.match(ui, /adminPromotionTargetProducts/,
    "Admin debe poder seleccionar productos objetivo.");
assert.match(ui, /adminPromotionTargetCategories/,
    "Admin debe poder seleccionar categorías objetivo.");
assert.match(ui, /addEventListener\("submit", handleSubmit, true\)/,
    "La capa avanzada debe sustituir el guardado base antes de que se ejecute dos veces.");
assert.match(loader, /js\/promotion-rules\.js/,
    "El loader debe cargar las reglas avanzadas después del módulo de promociones.");

console.log("Advanced promotion rules checks OK");
