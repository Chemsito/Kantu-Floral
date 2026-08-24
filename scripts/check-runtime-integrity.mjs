import fs from "node:fs";
import assert from "node:assert/strict";

const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const runtime = fs.readFileSync("js/runtime-integrity.js", "utf8");
const runtimeCss = fs.readFileSync("css/runtime-integrity.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260824154500_fix_occasion_reminder_rpc.sql", "utf8");

assert.match(loader, /runtime-integrity\.js/, "El loader debe activar las defensas de integridad dinámica.");
assert.match(runtime, /MutationObserver\(queueFeaturedSync\)/, "Destacados debe resincronizarse cuando el catálogo se renderiza después de Supabase.");
assert.match(runtime, /featured && Number\(product\?\.stock\) > 0/, "Destacados debe conservar la fuente autoritativa products.");
assert.doesNotMatch(runtime, /slice\(0,\s*6\)/, "Destacados no debe limitar la selección manual a seis productos.");
assert.match(runtime, /catalog-featured-track/, "Destacados debe usar una pista continua para el desplazamiento infinito.");
assert.match(runtime, /aria-hidden=\"true\"/, "La copia visual del carrusel debe ocultarse a lectores de pantalla.");
assert.doesNotMatch(runtime, /Selección manual del equipo/, "El texto interno anterior no debe formar parte del strip reparado.");
assert.match(runtimeCss, /kantu-featured-marquee-right/, "La cinta de destacados debe desplazarse continuamente hacia la derecha.");
assert.match(runtimeCss, /animation-play-state:\s*paused/, "La cinta debe pausarse cuando el cliente interactúa con ella.");
assert.match(runtime, /preventBackdropDismissal/, "Debe existir una política global que impida cerrar ventanas pulsando el difuminado.");
assert.match(runtime, /\.modal-overlay, \.kantu-customization-overlay/, "La protección de backdrop debe cubrir modales estáticos y personalizaciones dinámicas.");
assert.match(runtime, /stopImmediatePropagation\(\)/, "El click del backdrop debe bloquear handlers antiguos de cierre.");
assert.match(runtime, /adminProductCategoryFilter/, "Admin Productos debe ofrecer filtro por categoría.");
assert.match(runtime, /adminProductSearch/, "Admin Productos debe ofrecer búsqueda para reducir scroll.");
assert.match(runtime, /__kantuProductFilters/, "El render de productos Admin debe conservar filtros después de recargas.");
assert.match(runtime, /accountOccasionsSection/, "La pestaña de fechas debe aislarse explícitamente.");
assert.match(runtimeCss, /\.account-modal \[hidden\][\s\S]*display:\s*none\s*!important/, "Las secciones hidden de Mi cuenta nunca deben filtrarse a otra pestaña.");
assert.match(migration, /security invoker/i, "El RPC de recordatorios debe conservar SECURITY INVOKER.");
assert.doesNotMatch(migration, /private\.next_occasion_date\(r\.month/, "El RPC cliente no debe depender de una función privada sin privilegios.");
assert.match(migration, /generate_series/, "El cálculo de próxima fecha debe resolverse dentro del RPC invoker.");
assert.match(migration, /customer_rpc_private_helper_independent/, "El health check debe detectar regresiones hacia el helper privado.");

console.log("Dynamic UX integrity contracts OK");
