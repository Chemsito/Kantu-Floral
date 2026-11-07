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

// Pulido 2: seguimiento, iconografía y controles.
const tracking = read("js/order-tracking.js");
const cart = read("js/cart.js");
const ordersJs = read("js/orders.js");
assert.ok(tracking.includes('order.status === "entregado" && order.payment_status === "approved") currentIndex = steps.length'),
  "Un pedido entregado debe mostrar todas las etapas completas.");
assert.ok(!cart.includes(">🗑<") && !cart.includes('<span aria-hidden="true">🌷</span>'),
  "El carrito no debe usar emoji como iconos funcionales.");
assert.ok(!ordersJs.includes('checkout-delivery-icon">🛵'), "El delivery del checkout debe usar icono SVG.");
assert.ok(luxeJs.includes("function syncRange(input)"), "Los sliders deben mostrar el tramo recorrido.");
assert.match(index, /rel="preload" as="image"/, "La imagen principal de la portada debe precargarse.");

// Crecimiento: metas, embudo, clientes y Telegram.
const growth = read("supabase/migrations/20261107154446_admin_growth_tools.sql");
const crm = read("js/admin-crm.js");
const analytics = read("js/kantu-analytics.js");
for (const fn of ["admin_set_sales_goal(date, numeric)", "admin_customer_insights()", "admin_telegram_status()",
    "admin_set_telegram_credentials(text, text)", "admin_set_notification_settings(jsonb)", "admin_send_telegram_test()",
    "admin_telegram_request_updates()", "admin_telegram_read_response(bigint)"]) {
    assert.ok(growth.includes(`revoke all on function public.${fn} from public, anon;`), `${fn} no debe ser ejecutable por anon.`);
}
assert.ok(growth.includes("grant execute on function public.track_storefront_event(uuid, text, bigint) to anon, authenticated;"),
    "La tienda debe poder registrar eventos anónimos.");
assert.ok(growth.includes(">= 30 then") && growth.includes(">= 3000 then"), "El registro de eventos debe tener límites anti-abuso.");
assert.ok(growth.includes("vault.create_secret") && !/'token',\s*v_token/.test(growth), "El token de Telegram vive en Vault y no se devuelve.");
assert.ok((growth.match(/exception when others then\s+return new;/g) || []).length >= 3,
    "Los avisos de Telegram nunca deben bloquear pedidos, pagos ni reclamos.");
assert.ok(growth.includes("as restrictive for all to anon, authenticated using (false)"), "Las tablas nuevas niegan acceso directo.");
assert.match(loader, /js\/admin-crm\.js/, "El loader debe cargar la vista de clientes.");
assert.match(loader, /js\/kantu-analytics\.js/, "El loader debe cargar la medición del embudo.");
assert.ok(analytics.includes("doNotTrack") && analytics.includes('get("admin") === "1"'), "La medición respeta Do Not Track y omite el panel admin.");
assert.ok(crm.includes('type="password" name="token"'), "El token se ingresa en un campo oculto.");
assert.ok(dashboard.includes("function goalCard(") && dashboard.includes("function funnelCard("), "El dashboard muestra meta y embudo.");

console.log("Luxe redesign contracts OK");
