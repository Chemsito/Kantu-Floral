import fs from "node:fs";
import assert from "node:assert/strict";

const index = fs.readFileSync("index.html", "utf8");
const product = fs.readFileSync("producto.html", "utf8");
const staff = fs.readFileSync("staff.html", "utf8");
const reset = fs.readFileSync("reset-password.html", "utf8");
const auth = fs.readFileSync("js/auth.js", "utf8");
const productJs = fs.readFileSync("js/product-detail.js", "utf8");
const resetJs = fs.readFileSync("js/reset-password.js", "utf8");
const finalCss = fs.readFileSync("css/final-polish.css", "utf8");
const resetCss = fs.readFileSync("css/reset-password.css", "utf8");

for (const [name, html] of [["index", index], ["producto", product], ["staff", staff]]) {
    assert.match(html, /css\/final-polish\.css/, `${name} debe cargar el pulido final compartido.`);
}

assert.doesNotMatch(index, /id="favoritesButton"[^>]*title=/, "Favoritos no debe conservar title en el HTML fuente.");
assert.doesNotMatch(index, /id="cartButton"[^>]*title=/, "Carrito no debe conservar title en el HTML fuente.");
assert.match(index, /id="ayuda-faq"/, "La tienda debe incluir ayuda real para preguntas frecuentes.");
assert.match(index, /id="ayuda-delivery"/, "La tienda debe incluir información real de delivery.");
assert.match(index, /id="ayuda-pagos"/, "La tienda debe incluir información real de métodos de pago.");
assert.doesNotMatch(index, /href="#catalogo">Preguntas frecuentes/, "FAQ no debe redirigir engañosamente al catálogo.");
assert.doesNotMatch(index, /href="#catalogo">Delivery/, "Delivery no debe redirigir engañosamente al catálogo.");
assert.doesNotMatch(index, /href="#catalogo">Métodos de pago/, "Métodos de pago no debe redirigir engañosamente al catálogo.");
assert.match(index, /data-kantu-icon-ready="true"/, "Los iconos principales deben nacer listos en el HTML y evitar flashes legacy.");
assert.match(auth, /loginForm\.hidden\s*=\s*type\s*!==\s*"login"/, "Auth debe usar hidden en lugar de estilos inline para cambiar vistas.");

assert.match(product, /product-detail-skeleton/, "Producto debe iniciar con skeleton estructural.");
assert.match(product, /product-compact-footer/, "Producto debe tener footer compacto de confianza.");
assert.doesNotMatch(product, />♡<|>🛒<|>☰</, "Producto no debe renderizar iconos legacy antes de UI polish.");
assert.doesNotMatch(productJs, /cuando Kantu active horarios/i, "El detalle no debe comunicar que la programación todavía no existe.");
assert.match(productJs, /programar la entrega según la disponibilidad mostrada/i, "El copy debe reflejar programación de entrega actual.");

assert.doesNotMatch(staff, />✿<|>🔒<|>🛵</, "Staff no debe depender de emoji legacy en sus estados principales.");
assert.match(staff, /kantu-mark-512\.png/, "Staff debe usar el isotipo real de Kantu.");
assert.match(finalCss, /@media \(max-width: 640px\)[\s\S]*\.staff-header-actions/, "El header móvil de Staff debe tener layout específico.");

assert.match(reset, /assets\/brand\/favicon\.ico/, "Reset debe tener favicon Kantu.");
assert.match(reset, /site\.webmanifest/, "Reset debe cargar manifest.");
assert.match(reset, /css\/reset-password\.css/, "Reset debe usar CSS dedicado.");
assert.match(reset, /js\/reset-password\.js/, "Reset debe usar JS dedicado.");
assert.doesNotMatch(reset, /style="/, "Reset no debe contener estilos inline.");
assert.doesNotMatch(reset, /<script>[\s\S]*updateUser/, "Reset no debe contener lógica de Supabase inline.");
assert.match(resetJs, /getSession\(\)/, "Reset debe verificar la sesión/enlace antes de mostrar el formulario.");
assert.match(resetJs, /Cambiando contraseña…/, "Reset debe mostrar estado de loading y bloquear reenvíos.");
assert.match(resetJs, /data-password-toggle/, "Reset debe soportar mostrar/ocultar contraseña.");
assert.match(resetJs, /passwordStrength/, "Reset debe ofrecer feedback básico de fortaleza.");
assert.match(resetCss, /reset-strength/, "Reset debe estilizar el feedback de fortaleza.");

console.log("Final frontend polish contracts OK");
