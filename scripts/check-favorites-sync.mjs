import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/20260823225500_add_customer_favorites.sql");
const sync = read("js/favorites-sync.js");
const loader = read("js/experience-loader.js");
const app = read("js/app.js");
const css = read("css/favorites.css");

assert(migration.includes("create table if not exists public.customer_favorites"), "customer_favorites table is missing");
assert(migration.includes("alter table public.customer_favorites enable row level security"), "customer_favorites must use RLS");
assert(migration.includes("grant select, insert, delete on table public.customer_favorites to authenticated"), "favorites privileges must stay minimal");
assert(!migration.includes("grant select, insert, update, delete on table public.customer_favorites to authenticated"), "authenticated must not receive UPDATE on favorites");
assert(migration.includes("auth.uid() = user_id"), "favorites policies must be scoped to auth.uid()");
assert(migration.includes("kantu_favorites_health_check"), "favorites health check is missing");
assert(migration.includes("grant execute on function public.kantu_favorites_health_check() to service_role"), "favorites health check must stay private");

assert(sync.includes('const GUEST_STORAGE_KEY = "kantuFavorites"'), "guest favorites compatibility is missing");
assert(sync.includes('from("customer_favorites")'), "favorites sync must use customer_favorites");
assert(sync.includes("ignoreDuplicates: true"), "guest claim must avoid requiring UPDATE privileges");
assert(sync.includes("writeGuestFavorites([])"), "guest favorites must be cleared after a successful account claim");
assert(sync.includes("applyFavorites(before)"), "remote write failures must roll back optimistic favorites");
assert(sync.includes("onAuthStateChange"), "favorites must react to account changes");
assert(sync.includes("switchToGuestFavorites"), "logout must return to browser-local favorites");
assert(sync.includes("No pudimos guardar ese favorito"), "favorites write failures must be visible to the customer");

assert(loader.includes('loadScriptOnce("js/favorites-sync.js"'), "experience loader must load favorites-sync.js");
assert(app.includes('localStorage.getItem("kantuFavorites")'), "anonymous favorites fallback must remain available");
assert(css.includes(".favorites-count"), "favorites counter presentation is missing");

console.log("Favorites synchronization contracts OK");
