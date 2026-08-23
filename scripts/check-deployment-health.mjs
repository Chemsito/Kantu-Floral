import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
    "supabase/migrations/20260823194500_expand_deployment_health_check.sql",
    "utf8"
);

assert.match(migration, /product-images/, "Health check debe verificar el bucket de imágenes de producto.");
assert.match(migration, /product_images_admin_policies/, "Health check debe verificar políticas de escritura del bucket.");
assert.match(migration, /pg_catalog\.pg_publication_tables/, "Health check debe inspeccionar la publicación Realtime.");
assert.match(migration, /tablename = 'orders'/, "Health check debe exigir orders en Realtime.");
assert.match(migration, /tablename = 'payment_proofs'/, "Health check debe exigir payment_proofs en Realtime.");
assert.match(migration, /Admins can upload product images/, "Health check debe vigilar la política de subida Admin.");
assert.match(migration, /Admins can update product images/, "Health check debe vigilar la política de actualización Admin.");
assert.match(migration, /Admins can delete product images/, "Health check debe vigilar la política de eliminación Admin.");
assert.match(migration, /revoke all on function public\.kantu_deployment_health_check\(\) from public, anon, authenticated/i,
    "Health check debe seguir siendo privado.");
assert.match(migration, /grant execute on function public\.kantu_deployment_health_check\(\) to service_role/i,
    "Solo service_role debe ejecutar el health check.");

console.log("Deployment health checks OK");
