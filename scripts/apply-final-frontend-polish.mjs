import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);

function replaceOrThrow(source, search, replacement, label) {
    if (!source.includes(search)) {
        if (source.includes(replacement)) return source;
        throw new Error(`No encontramos el bloque esperado: ${label}`);
    }
    return source.replace(search, replacement);
}

const heartSvg = `<svg class="kantu-source-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>`;
const cartSvg = `<svg class="kantu-source-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6"/></svg>`;
const menuSvg = `<svg class="kantu-source-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const lockSvg = `<svg class="staff-static-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`;
const scooterSvg = `<svg class="staff-static-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 18h6l2-5h-5l-2-5h4M16 13h3l2 5"/></svg>`;

function addFinalCss(html) {
    if (html.includes('href="css/final-polish.css"')) return html;
    const anchor = '    <link rel="stylesheet" href="css/brand-experience.css" data-kantu-brand-experience="true">';
    return replaceOrThrow(html, anchor, `${anchor}\n    <link rel="stylesheet" href="css/final-polish.css" data-kantu-final-polish="true">`, "final-polish.css");
}

function modernizeStoreHeader(html) {
    html = html.replace('<div class="logo-icon" aria-hidden="true">✿</div>', '<div class="logo-icon" aria-hidden="true"><img src="assets/brand/kantu-mark-512.png" alt=""></div>');
    html = html.replace(/<button type="button" class="icon-button" id="favoritesButton"[^>]*>♡<\/button>/, `<button type="button" class="icon-button" id="favoritesButton" data-kantu-icon-ready="true" aria-label="Ver productos favoritos">${heartSvg}</button>`);
    html = html.replace(/<button type="button" class="icon-button" id="cartButton"[^>]*>\s*<span aria-hidden="true">🛒<\/span>/, `<button type="button" class="icon-button" id="cartButton" data-kantu-icon-ready="true" aria-label="Abrir carrito">\n                    <span aria-hidden="true">${cartSvg}</span>`);
    html = html.replace('<span aria-hidden="true">☰</span>', `<span aria-hidden="true">${menuSvg}</span>`);
    return html;
}

let index = read("index.html");
index = addFinalCss(index);
index = modernizeStoreHeader(index);
index = index.replace('id="registerForm" style="display:none;"', 'id="registerForm" hidden');
index = index.replace('id="forgotForm" style="display:none;"', 'id="forgotForm" hidden');
index = index.replace('<a href="#catalogo">Preguntas frecuentes</a>', '<a href="#ayuda-faq">Preguntas frecuentes</a>');
index = index.replace('<a href="#catalogo">Delivery</a>', '<a href="#ayuda-delivery">Delivery</a>');
index = index.replace('<a href="#catalogo">Métodos de pago</a>', '<a href="#ayuda-pagos">Métodos de pago</a>');
if (!index.includes('id="ayuda-faq"')) {
    const helpSection = `\n    <section class="store-help-section" id="ayuda" aria-labelledby="storeHelpTitle">\n        <div class="store-help-inner">\n            <div class="store-help-heading">\n                <span>Compra con tranquilidad</span>\n                <h2 id="storeHelpTitle">Información antes de hacer tu pedido</h2>\n                <p>Lo esencial sobre compra, entrega y pago sin sacarte del catálogo.</p>\n            </div>\n            <div class="store-help-grid">\n                <article class="store-help-card" id="ayuda-faq">\n                    <h3>Preguntas frecuentes</h3>\n                    <p><strong>¿Cómo compro?</strong> Elige tu arreglo, agrega los complementos que quieras y completa los datos del destinatario en checkout. Antes de confirmar verás el resumen, disponibilidad y costo de entrega.</p>\n                </article>\n                <article class="store-help-card" id="ayuda-delivery">\n                    <h3>Delivery</h3>\n                    <p>Realizamos entregas programadas en Arequipa según la cobertura y disponibilidad que muestre el checkout. El costo se calcula con la dirección de entrega antes de confirmar el pedido.</p>\n                </article>\n                <article class="store-help-card" id="ayuda-pagos">\n                    <h3>Métodos de pago</h3>\n                    <p>Los medios habilitados se muestran durante el checkout. Los pagos en línea se procesan mediante Mercado Pago y, cuando corresponda, Kantu puede validar comprobantes de Yape, Plin o transferencia.</p>\n                </article>\n            </div>\n        </div>\n    </section>\n\n`;
    index = replaceOrThrow(index, '    <footer id="contacto">', `${helpSection}    <footer id="contacto">`, "sección de ayuda antes del footer");
}
write("index.html", index);

let auth = read("js/auth.js");
auth = auth.replace('    loginForm.style.display = type === "login" ? "block" : "none";\n    registerForm.style.display = type === "register" ? "block" : "none";\n    forgotForm.style.display = type === "forgot" ? "block" : "none";', '    loginForm.hidden = type !== "login";\n    registerForm.hidden = type !== "register";\n    forgotForm.hidden = type !== "forgot";');
write("js/auth.js", auth);

let product = read("producto.html");
product = addFinalCss(product);
product = modernizeStoreHeader(product);
product = product.replace('        <div class="product-detail-loading" role="status" aria-live="polite">Cargando producto...</div>', `        <div class="product-detail-skeleton" role="status" aria-live="polite" aria-label="Cargando producto">\n            <div class="product-detail-skeleton-media"></div>\n            <div class="product-detail-skeleton-copy">\n                <div class="product-detail-skeleton-line eyebrow"></div>\n                <div class="product-detail-skeleton-line title"></div>\n                <div class="product-detail-skeleton-line medium"></div>\n                <div class="product-detail-skeleton-line short"></div>\n                <div class="product-detail-skeleton-line price"></div>\n                <div class="product-detail-skeleton-actions">\n                    <div class="product-detail-skeleton-button"></div>\n                    <div class="product-detail-skeleton-button"></div>\n                </div>\n            </div>\n        </div>`);
if (!product.includes('class="product-compact-footer"')) {
    const productFooter = `\n    <footer class="product-compact-footer">\n        <div class="product-compact-footer-inner">\n            <div>\n                <strong>Kantu Floral</strong>\n                <p>Flores que cuentan historias · Arequipa</p>\n            </div>\n            <nav class="product-compact-footer-links" aria-label="Ayuda y contacto">\n                <a href="index.html#ayuda-faq">Preguntas frecuentes</a>\n                <a href="index.html#ayuda-delivery">Delivery</a>\n                <a href="index.html#ayuda-pagos">Métodos de pago</a>\n                <a href="https://wa.me/51967539019" target="_blank" rel="noopener noreferrer">WhatsApp</a>\n            </nav>\n        </div>\n    </footer>\n\n`;
    product = replaceOrThrow(product, '    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>', `${productFooter}    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>`, "footer de producto");
}
write("producto.html", product);

let productJs = read("js/product-detail.js");
productJs = productJs.replace('Al agregarlo, tu carrito seguirá disponible en la tienda principal. En checkout podrás indicar destinatario, mensaje para tarjeta y, cuando Kantu active horarios, programar la entrega.', 'Al agregarlo, tu carrito seguirá disponible en la tienda principal. En checkout podrás indicar destinatario, mensaje para tarjeta, dirección y programar la entrega según la disponibilidad mostrada.');
write("js/product-detail.js", productJs);

let staff = read("staff.html");
staff = addFinalCss(staff);
staff = staff.replace('<span class="staff-brand-mark" aria-hidden="true">✿</span>', '<span class="staff-brand-mark" aria-hidden="true"><img src="assets/brand/kantu-mark-512.png" alt=""></span>');
staff = staff.replace('<span class="staff-access-icon" aria-hidden="true">🔒</span>', `<span class="staff-access-icon" aria-hidden="true">${lockSvg}</span>`);
staff = staff.replace('<span aria-hidden="true">✿</span>\n                    <h3>No hay ramos esperando preparación</h3>', '<span aria-hidden="true"><img src="assets/brand/kantu-mark-512.png" alt="" width="34" height="34"></span>\n                    <h3>No hay ramos esperando preparación</h3>');
staff = staff.replace('<span aria-hidden="true">🛵</span>', `<span aria-hidden="true">${scooterSvg}</span>`);
write("staff.html", staff);

const resetHtml = `<!DOCTYPE html>\n<html lang="es">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <meta name="theme-color" content="#fff8f4">\n    <meta name="robots" content="noindex,nofollow">\n    <link rel="icon" href="assets/brand/favicon.ico" sizes="any">\n    <link rel="icon" type="image/png" sizes="32x32" href="assets/brand/favicon-32x32.png">\n    <link rel="icon" type="image/png" sizes="16x16" href="assets/brand/favicon-16x16.png">\n    <link rel="apple-touch-icon" sizes="180x180" href="assets/brand/apple-touch-icon.png">\n    <link rel="manifest" href="site.webmanifest">\n    <title>Nueva contraseña | Kantu Floral</title>\n    <link rel="preconnect" href="https://fonts.googleapis.com">\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">\n    <link rel="stylesheet" href="css/brand-experience.css" data-kantu-brand-experience="true">\n    <link rel="stylesheet" href="css/reset-password.css">\n</head>\n<body class="reset-password-page">\n    <main class="reset-shell">\n        <section class="reset-card" aria-labelledby="resetTitle">\n            <header class="reset-brand">\n                <div class="reset-brand-mark" aria-hidden="true"><img src="assets/brand/kantu-mark-512.png" alt=""></div>\n                <h1 id="resetTitle">Nueva contraseña</h1>\n                <p>Crea una nueva contraseña para tu cuenta de Kantu Floral.</p>\n            </header>\n\n            <p id="resetAccessState" class="reset-access-state" role="status" aria-live="polite">Verificando el enlace de recuperación…</p>\n\n            <form id="newPasswordForm" class="reset-form" hidden>\n                <div class="reset-field">\n                    <label for="newPassword">Nueva contraseña</label>\n                    <div class="reset-password-control">\n                        <input type="password" id="newPassword" placeholder="Mínimo 8 caracteres" minlength="8" autocomplete="new-password" required>\n                        <button type="button" class="reset-password-toggle" data-password-toggle="newPassword" aria-pressed="false">Mostrar</button>\n                    </div>\n                    <div id="resetStrength" class="reset-strength" data-strength="">\n                        <div class="reset-strength-track" aria-hidden="true"><div class="reset-strength-fill"></div></div>\n                        <small id="resetStrengthLabel">Usa al menos 8 caracteres.</small>\n                    </div>\n                </div>\n\n                <div class="reset-field">\n                    <label for="confirmNewPassword">Confirmar contraseña</label>\n                    <div class="reset-password-control">\n                        <input type="password" id="confirmNewPassword" placeholder="Repite tu contraseña" minlength="8" autocomplete="new-password" required>\n                        <button type="button" class="reset-password-toggle" data-password-toggle="confirmNewPassword" aria-pressed="false">Mostrar</button>\n                    </div>\n                </div>\n\n                <button id="resetSubmit" type="submit" class="reset-submit">Cambiar contraseña</button>\n                <p id="resetMessage" class="reset-message" role="status" aria-live="polite"></p>\n            </form>\n\n            <div class="reset-back"><a href="index.html">← Volver a Kantu Floral</a></div>\n        </section>\n    </main>\n\n    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>\n    <script src="js/supabase.js"></script>\n    <script src="js/reset-password.js"></script>\n</body>\n</html>\n`;
write("reset-password.html", resetHtml);

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts["check:final-frontend-polish"]) {
    pkg.scripts["check:final-frontend-polish"] = "node scripts/check-final-frontend-polish.mjs";
}
if (!pkg.scripts["check:js"].includes("js/reset-password.js")) {
    pkg.scripts["check:js"] += " && node --check js/reset-password.js";
}
if (!pkg.scripts.check.includes("npm run check:final-frontend-polish")) {
    pkg.scripts.check += " && npm run check:final-frontend-polish";
}
write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

console.log("Final frontend polish applied");
