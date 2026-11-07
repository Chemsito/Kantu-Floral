import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const index = read("index.html");
const staff = read("staff.html");
const product = read("producto.html");
const loader = read("js/experience-loader.js");
const luxeJs = read("js/kantu-luxe.js");
const dashboard = read("js/admin-dashboard-pro.js");
const availability = read("js/delivery-availability.js");
const scheduled = read("js/scheduled-operations.js");
const migration = read("supabase/migrations/20261107131046_admin_dashboard_analytics.sql");

// La capa visual Luxe se declara en el HTML (sin parpadeo) y se carga al final.
assert.match(index, /css\/kantu-luxe\.css[^"]*" data-kantu-luxe="true"/, "La tienda debe cargar kantu-luxe.css.");
assert.match(index, /css\/kantu-luxe-admin\.css[^"]*" data-kantu-luxe-admin="true"/, "La tienda debe cargar el estilo del panel admin.");
assert.match(product, /css\/kantu-luxe\.css/, "El detalle de producto debe usar la capa Luxe.");
assert.match(staff, /css\/kantu-luxe-staff\.css/, "Operaciones debe usar la capa Luxe staff.");
assert.match(loader, /js\/kantu-luxe\.js/, "El loader debe cargar kantu-luxe.js.");
assert.match(loader, /js\/admin-dashboard-pro\.js/, "El loader debe cargar el dashboard admin.");

// Nunca re-insertar las hojas Luxe: provoca un parpadeo al desconectarlas.
assert.match(luxeJs, /insertBefore\(node, firstLuxe\)/, "Las hojas nuevas deben moverse antes de Luxe.");
assert.doesNotMatch(luxeJs, /head\.appendChild\(sheet\)/, "Luxe no debe re-insertarse a sí misma.");

// Portada nueva sin reintroducir el hero legado.
assert.match(index, /class="kf-hero"/, "La portada Luxe debe existir.");
assert.match(index, /data-kf-category="rosas"/, "Las ocasiones deben filtrar el catálogo.");

// Dashboard: una sola RPC agregada, solo administradores.
assert.match(dashboard, /rpc\("admin_dashboard_analytics"/, "El dashboard debe usar la RPC agregada.");
assert.match(migration, /if not public\.is_admin\(\) then/i, "La RPC debe exigir rol admin.");
assert.match(migration, /revoke all on function public\.admin_dashboard_analytics\(integer\) from public, anon;/i,
  "La RPC del dashboard no debe ser ejecutable por anon.");
assert.match(migration, /set search_path = ''/i, "La RPC debe fijar search_path vacío.");

// Plan gratuito: los visitantes no deben sondear endpoints de Admin/Staff.
assert.match(availability, /function adminPanelVisible\(\)/, "Disponibilidad debe verificar que el panel Admin esté visible.");
assert.match(availability, /ADMIN_RETRY_MS/, "Disponibilidad debe espaciar reintentos fallidos.");
assert.match(scheduled, /if \(!el\("staffApp"\)\) return staffGiftRows;/, "La tienda no debe consultar el RPC de staff.");
assert.match(scheduled, /!adminPanelVisible\(\)\) return null;/, "La agenda admin solo debe cargarse con el panel visible.");

console.log("Luxe redesign contracts OK");
