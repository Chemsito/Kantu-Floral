import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("producto.html", "utf8");
const detail = fs.readFileSync("js/product-detail.js", "utf8");
const bridge = fs.readFileSync("js/navigation-bridge.js", "utf8");
const loader = fs.readFileSync("js/experience-loader.js", "utf8");

assert.match(html, /class="site-header product-detail-site-header"/, "El detalle debe reutilizar la cabecera principal.");
assert.match(html, /id="siteNavigation"/, "El detalle debe conservar la navegación principal.");
assert.match(html, /id="favoritesButton"/, "El detalle debe mostrar Favoritos.");
assert.match(html, /id="cartButton"/, "El detalle debe mostrar Carrito.");
assert.match(html, /id="loginButton"/, "El detalle debe mostrar la acción de cuenta.");
assert.match(html, /class="icon-button mobile-menu"/, "El detalle debe conservar el menú móvil.");
assert.doesNotMatch(html, /product-page-header/, "No debe quedar la cabecera secundaria anterior.");

assert.match(detail, /navigateToMain\("favorites", "catalogo"\)/, "Favoritos debe enlazar con la acción real de la tienda.");
assert.match(detail, /navigateToMain\("cart", "catalogo"\)/, "Carrito debe enlazar con la acción real de la tienda.");
assert.match(detail, /navigateToMain\("account"\)/, "Cuenta debe enlazar con la acción real de la tienda.");
assert.match(detail, /navigator\.maxTouchPoints/, "El share nativo debe limitarse a dispositivos táctiles.");
assert.match(detail, /navigator\.clipboard\?\.writeText/, "En escritorio debe existir copia mediante Clipboard API.");
assert.match(detail, /document\.execCommand\("copy"\)/, "Debe existir fallback de copia para navegadores sin Clipboard API.");
assert.match(detail, /Enlace copiado/, "La interfaz debe confirmar la copia del enlace.");

assert.match(loader, /js\/navigation-bridge\.js/, "La tienda principal debe cargar el puente de navegación.");
assert.match(bridge, /kantu_open/, "El puente debe consumir la acción solicitada desde la página de producto.");
assert.match(bridge, /#favoritesButton/, "El puente debe poder abrir Favoritos.");
assert.match(bridge, /#cartButton/, "El puente debe poder abrir el carrito.");
assert.match(bridge, /#loginButton/, "El puente debe poder abrir la cuenta o login.");

console.log("Product detail navigation and sharing contracts OK");
