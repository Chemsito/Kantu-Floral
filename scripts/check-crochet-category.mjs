import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const products = read("js/products.js");
const admin = read("js/admin.js");
const customerUx = read("js/customer-ux.js");
const detail = read("js/product-detail.js");
const match = read("js/kantu-match-v2.js");
const migration = read("supabase/migrations/20261018235900_add_crochet_category.sql");

assert.match(products, /\["crochet",\s*"Crochet"\]/, "El catálogo debe exponer Crochet.");
assert.match(admin, /"crochet"/, "El formulario Admin debe aceptar Crochet.");
assert.match(customerUx, /\["crochet",\s*"Crochet"\]/, "El footer debe listar Crochet.");
assert.match(detail, /\["crochet",\s*"Crochet"\]/, "El detalle de producto debe etiquetar Crochet.");
assert.match(match, /"crochet"/, "Kantu Match debe considerar Crochet como regalo principal.");
assert.match(migration, /'crochet'/, "La migración debe permitir la categoría Crochet.");
assert.match(migration, /ETERNA\/eterna-primavera\.webp/, "La migración debe apuntar a la imagen nueva.");
assert.ok(fs.existsSync(path.join(root, "assets/catalog/ETERNA/eterno-amor.jpeg")), "Falta la imagen de Eterno Amor en ETERNA.");
assert.ok(fs.existsSync(path.join(root, "assets/catalog/ETERNA/bouquet-de-rosas.jpeg")), "Falta la imagen de Bouquet de rosas en ETERNA.");
assert.ok(fs.existsSync(path.join(root, "assets/catalog/ETERNA/eterna-primavera.webp")), "Falta la imagen de Eterna Primavera en ETERNA.");
assert.ok(!fs.existsSync(path.join(root, "assets/catalog/blume-2026/097.webp")), "La imagen antigua de Eterno Amor no debe permanecer en blume-2026.");
assert.ok(!fs.existsSync(path.join(root, "assets/catalog/blume-2026/Bouquet de rosas.jpeg")), "La imagen antigua de Bouquet de rosas no debe permanecer en blume-2026.");

console.log("Crochet category and ETERNA assets checks passed.");
