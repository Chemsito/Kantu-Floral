import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823221500_add_delivery_availability_controls.sql", "utf8");
const ui = fs.readFileSync("js/delivery-availability.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");

assert.match(migration, /blackout_dates date\[\]/,
    "La agenda debe admitir fechas bloqueadas sin crear reglas por defecto.");
assert.match(migration, /slot_capacities jsonb/,
    "La agenda debe admitir capacidad configurable por franja.");
assert.match(migration, /default '\{\}'::date\[\]/,
    "Las fechas bloqueadas deben iniciar vacías.");
assert.match(migration, /default '\{\}'::jsonb/,
    "Los cupos deben iniciar sin límites.");
assert.match(migration, /get_delivery_schedule_availability\(p_date date\)/,
    "Debe existir una cotización server-side de disponibilidad.");
assert.match(migration, /orders_delivery_schedule_availability_guard/,
    "Los pedidos deben validar disponibilidad antes de persistirse.");
assert.match(migration, /for update;/i,
    "La reserva programada debe serializar el control de cupos.");
assert.match(migration, /o\.status <> 'cancelado'/,
    "Los pedidos cancelados deben liberar cupo.");
assert.match(migration, /DELIVERY_DATE_UNAVAILABLE/,
    "El backend debe bloquear fechas cerradas.");
assert.match(migration, /DELIVERY_SLOT_FULL/,
    "El backend debe bloquear franjas completas.");
assert.match(migration, /anon_quote_blocked/,
    "El health check debe vigilar que anon no consulte ocupación.");

assert.match(ui, /get_delivery_schedule_availability/,
    "Checkout debe consultar disponibilidad server-side.");
assert.match(ui, /adminDeliveryBlackoutDates/,
    "Admin debe poder configurar fechas sin entrega programada.");
assert.match(ui, /data-delivery-capacity-slot/,
    "Admin debe poder configurar cupo por franja.");
assert.match(ui, /Vacío = sin límite/,
    "La interfaz debe dejar claro que el comportamiento por defecto es ilimitado.");
assert.match(ui, /DELIVERY_SLOT_FULL/,
    "La interfaz debe traducir el error de cupo agotado.");
assert.match(loader, /js\/delivery-availability\.js/,
    "El loader debe cargar el módulo de disponibilidad avanzada.");

console.log("Delivery availability checks OK");
