import fs from "node:fs";
import assert from "node:assert/strict";

const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const runtime = fs.readFileSync("js/runtime-integrity.js", "utf8");
const runtimeCss = fs.readFileSync("css/runtime-integrity.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260824154500_fix_occasion_reminder_rpc.sql", "utf8");

assert.match(loader, /runtime-integrity\.js/, "El loader debe activar las defensas de integridad dinámica.");
assert.match(runtime, /MutationObserver\(queueFeaturedSync\)/, "Destacados debe resincronizarse cuando el catálogo se renderiza después de Supabase.");
assert.match(runtime, /featured && Number\(product\?\.stock\) > 0/, "Destacados debe conservar la fuente autoritativa products.");
assert.doesNotMatch(runtime, /Selección manual del equipo/, "El texto interno anterior no debe formar parte del strip reparado.");
assert.match(runtime, /accountOccasionsSection/, "La pestaña de fechas debe aislarse explícitamente.");
assert.match(runtimeCss, /\.account-modal \[hidden\][\s\S]*display:\s*none\s*!important/, "Las secciones hidden de Mi cuenta nunca deben filtrarse a otra pestaña.");
assert.match(migration, /security invoker/i, "El RPC de recordatorios debe conservar SECURITY INVOKER.");
assert.doesNotMatch(migration, /private\.next_occasion_date\(r\.month/, "El RPC cliente no debe depender de una función privada sin privilegios.");
assert.match(migration, /generate_series/, "El cálculo de próxima fecha debe resolverse dentro del RPC invoker.");
assert.match(migration, /customer_rpc_private_helper_independent/, "El health check debe detectar regresiones hacia el helper privado.");

console.log("Dynamic refresh and account tab integrity contracts OK");
