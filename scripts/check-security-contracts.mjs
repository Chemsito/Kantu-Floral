import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const supabaseBootstrap = read("js/supabase.js");
const hardening = read("supabase/migrations/20260822155818_harden_permissions_indexes_and_rls.sql");
const staffOps = read("supabase/migrations/20260822181000_staff_operations_and_delivery_pricing.sql");
const staffQueues = read("supabase/migrations/20260822185224_staff_search_and_role_specific_queues.sql");
const leastPrivilege = read("supabase/migrations/20260822235932_reduce_nonpayment_table_privileges.sql");

// Frontend credentials: only a publishable key may be shipped to the browser.
assert.match(
  supabaseBootstrap,
  /sb_publishable_[A-Za-z0-9_-]+/,
  "El frontend debe usar una publishable key de Supabase."
);
assert.doesNotMatch(
  supabaseBootstrap,
  /service[_-]?role|sb_secret_/i,
  "Nunca debe existir una service_role/secret key en JavaScript público."
);

// RLS ownership contracts for customer-controlled data.
assert.match(hardening, /Users can view own profile[\s\S]*auth\.uid\(\)\) = id/,
  "Profiles SELECT debe estar limitado al propietario.");
assert.match(hardening, /Users can update own profile[\s\S]*with check \(\(select auth\.uid\(\)\) = id\)/,
  "Profiles UPDATE debe conservar ownership en WITH CHECK.");
assert.match(hardening, /Users can view own cart[\s\S]*auth\.uid\(\)\) = user_id/,
  "El carrito debe estar aislado por usuario.");
assert.match(hardening, /Users can view their own orders[\s\S]*user_id = \(select auth\.uid\(\)\)/,
  "Los pedidos deben estar aislados por usuario.");

// Least privilege: anonymous users must not retain table mutation privileges,
// and authenticated users only get the operations used by the application.
assert.match(leastPrivilege, /revoke all on table public\.profiles from anon, authenticated;/i);
assert.match(leastPrivilege, /grant select, update on table public\.profiles to authenticated;/i);
assert.match(leastPrivilege, /revoke all on table public\.cart_items from anon, authenticated;/i);
assert.match(leastPrivilege, /grant select, insert, update, delete on table public\.cart_items to authenticated;/i);
assert.match(leastPrivilege, /revoke all on table public\.favorites from anon, authenticated;/i);
assert.match(leastPrivilege, /grant select, insert, update, delete on table public\.favorites to authenticated;/i);
assert.match(leastPrivilege, /revoke all on table public\.products from anon, authenticated;/i);
assert.match(leastPrivilege, /grant select on table public\.products to anon;/i);
assert.match(leastPrivilege, /grant select, insert, update, delete on table public\.products to authenticated;/i);
assert.doesNotMatch(leastPrivilege, /grant[^;]*\btruncate\b/i,
  "Ningún cliente web debe recibir privilegio TRUNCATE.");
assert.doesNotMatch(leastPrivilege, /grant[^;]*\btrigger\b/i,
  "Ningún cliente web debe recibir privilegio TRIGGER.");

// SECURITY DEFINER RPCs are intentionally callable by authenticated users only,
// so every privileged implementation must perform an explicit server-side
// authorization check before reading or mutating privileged data.
for (const [name, source, authPattern] of [
  ["admin_set_profile_role", staffOps, /admin_set_profile_role[\s\S]*auth\.uid\(\)[\s\S]*public\.is_admin\(\)/],
  ["staff_update_order_operation", staffOps, /staff_update_order_operation[\s\S]*auth\.uid\(\)[\s\S]*v_role not in \('admin', 'florist', 'delivery'\)/],
  ["admin_find_team_member", staffQueues, /admin_find_team_member[\s\S]*auth\.uid\(\)[\s\S]*public\.is_admin\(\)/],
  ["staff_get_orders", staffQueues, /staff_get_orders[\s\S]*auth\.uid\(\)[\s\S]*v_role not in \('admin', 'florist', 'delivery'\)/]
]) {
  assert.match(source, authPattern, `${name} debe validar identidad y autorización dentro del RPC.`);
}

// Public/anonymous callers must never receive EXECUTE on privileged RPCs.
for (const signature of [
  "public.admin_set_profile_role(uuid, text)",
  "public.staff_update_order_operation(bigint, text)",
  "public.admin_find_team_member(text)",
  "public.staff_get_orders()"
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const revokePattern = new RegExp(`revoke all on function ${escaped} from public, anon`, "i");
  assert.ok(
    revokePattern.test(staffOps) || revokePattern.test(staffQueues),
    `${signature} debe revocar EXECUTE a public y anon.`
  );
}

console.log("Security contract checks OK");
