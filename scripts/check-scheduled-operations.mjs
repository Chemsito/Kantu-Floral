import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823222500_prioritize_scheduled_operations.sql", "utf8");
const ui = fs.readFileSync("js/scheduled-operations.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const staffHtml = fs.readFileSync("staff.html", "utf8");

assert.match(migration, /private\.kantu_order_due_at/,
    "Debe existir un helper privado para ordenar por la entrega solicitada.");
assert.match(migration, /create or replace function public\.staff_get_orders\(\)/i,
    "La cola operativa debe conservar el RPC existente.");
assert.match(migration, /kantu_order_due_at\(q\.requested_delivery_date/,
    "queue_position debe priorizar la fecha/franja solicitada.");
assert.match(migration, /kantu_order_due_at\(o\.requested_delivery_date/,
    "El orden final de staff debe usar la fecha/franja solicitada.");
assert.match(migration, /admin_delivery_agenda\(p_days integer default 14\)/,
    "Admin debe disponer de una agenda agregada de entregas.");
assert.match(migration, /o\.payment_status = 'approved'/,
    "La agenda operativa solo debe contar pedidos pagados.");
assert.match(migration, /o\.status <> 'cancelado'/,
    "La agenda no debe contar pedidos cancelados.");
assert.match(migration, /anon_agenda_blocked/,
    "El health check debe vigilar que anon no consulte la agenda.");

assert.match(ui, /admin_delivery_agenda/,
    "El dashboard Admin debe consumir la agenda agregada.");
assert.match(ui, /staff_get_order_gift_details/,
    "La vista operativa debe reutilizar metadatos autorizados de programación.");
assert.match(ui, /adminDeliveryAgendaCard/,
    "Admin debe tener un bloque visible de agenda.");
assert.match(ui, /staffScheduleSummary/,
    "Staff debe mostrar un resumen de entregas programadas.");
assert.match(ui, /Ventana vencida/,
    "Staff debe destacar ventanas solicitadas que ya vencieron.");
assert.match(loader, /js\/scheduled-operations\.js/,
    "El loader principal debe cargar el módulo de operaciones programadas.");
assert.match(staffHtml, /js\/scheduled-operations\.js/,
    "El portal Staff debe cargar directamente el módulo de operaciones programadas.");
assert.match(staffHtml, /css\/scheduled-operations\.css/,
    "El portal Staff debe cargar los estilos de operaciones programadas.");

console.log("Scheduled operations checks OK");
