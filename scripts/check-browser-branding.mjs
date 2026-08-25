import fs from "node:fs";
import assert from "node:assert/strict";

const index = fs.readFileSync("index.html", "utf8");
const product = fs.readFileSync("producto.html", "utf8");
const staff = fs.readFileSync("staff.html", "utf8");
const brand = fs.readFileSync("css/brand.css", "utf8");
const adminStandalone = fs.readFileSync("js/admin-standalone.js", "utf8");
const productDetail = fs.readFileSync("js/product-detail.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("site.webmanifest", "utf8"));

for (const [name, html] of [["storefront", index], ["product", product], ["staff", staff]]) {
  assert.match(html, /assets\/brand\/favicon\.ico/, `${name} debe declarar favicon Kantu`);
  assert.match(html, /apple-touch-icon/, `${name} debe declarar Apple Touch Icon`);
  assert.match(html, /site\.webmanifest/, `${name} debe declarar manifest`);
}
for (const asset of [
  "assets/brand/favicon.ico",
  "assets/brand/favicon-16x16.png",
  "assets/brand/favicon-32x32.png",
  "assets/brand/apple-touch-icon.png",
  "assets/brand/android-chrome-192x192.png",
  "assets/brand/android-chrome-512x512.png",
  "assets/brand/kantu-mark-512.png",
  "assets/brand/kantu-logo.jpg",
  "assets/brand/og-kantu-floral.jpg"
]) assert.equal(fs.existsSync(asset), true, `Falta asset de marca: ${asset}`);
assert.match(brand, /\.\.\/assets\/brand\/kantu-mark-512\.png/, "Header debe usar logo local");
assert.doesNotMatch(brand, /scontent-|facebook.*jpg/i, "Header no debe depender de Facebook CDN");
assert.match(adminStandalone, /Panel administrador \| Kantu Floral/, "Admin standalone debe tener título propio");
assert.match(productDetail, /document\.title = `\$\{row\.name\} \| Kantu Floral`/, "Producto debe usar título dinámico");
assert.equal(manifest.short_name, "Kantu Floral");
assert.equal(manifest.icons.length >= 2, true);
assert.match(index, /og-kantu-floral\.jpg/, "Storefront debe tener Open Graph image local");
assert.match(product, /og-kantu-floral\.jpg/, "Producto debe tener fallback Open Graph image local");
console.log("Browser branding contracts OK");
