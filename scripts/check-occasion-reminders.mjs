import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260823224000_add_occasion_reminders.sql", "utf8");
const ui = fs.readFileSync("js/occasion-reminders.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");

assert.match(migration, /create table if not exists public\.occasion_reminders/,
    "Debe existir una tabla privada de fechas importantes.");
assert.match(migration, /alter table public\.occasion_reminders enable row level security/,
    "Los recordatorios deben usar RLS.");
assert.match(migration, /auth\.uid\(\) = user_id/g,
    "Las políticas deben limitar lectura/escritura al propietario.");
assert.match(migration, /month smallint/,
    "Debe almacenarse el mes de la ocasión.");
assert.match(migration, /day smallint/,
    "Debe almacenarse el día de la ocasión.");
assert.doesNotMatch(migration, /birth_year|occasion_year|year smallint/i,
    "No debe almacenarse un año de nacimiento innecesario.");
assert.match(migration, /get_my_occasion_reminders\(\)/,
    "Debe existir un RPC para calcular próximas ocurrencias.");
assert.match(migration, /security invoker/i,
    "La lectura del cliente debe conservar RLS mediante SECURITY INVOKER.");
assert.match(migration, /next_occasion_date/,
    "El backend debe calcular la próxima fecha, incluyendo 29 de febrero.");
assert.match(migration, /anon_table_blocked/,
    "El health check debe vigilar que anon no lea los recordatorios.");

assert.match(ui, /data-account-tab = "occasions"|dataset\.accountTab = "occasions"/,
    "Mi cuenta debe exponer la pestaña de fechas importantes.");
assert.match(ui, /get_my_occasion_reminders/,
    "La interfaz debe consumir el cálculo server-side.");
assert.match(ui, /no enviará WhatsApp ni correo automáticamente/i,
    "La interfaz debe explicar que no existe mensajería automática implícita.");
assert.match(ui, /no necesita el año de nacimiento/i,
    "La interfaz debe explicar la minimización de datos.");
assert.match(ui, /No creamos ninguna automáticamente/i,
    "La interfaz no debe sugerir recordatorios precreados.");
assert.match(loader, /js\/occasion-reminders\.js/,
    "El loader debe cargar el módulo de recordatorios.");

console.log("Occasion reminder checks OK");
