import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);

const truckSvg = '<svg class="kantu-source-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
const flowerSvg = '<svg class="kantu-source-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="2"/><path d="M12 10c-3-1-4-5-1-6 3-1 4 3 2 6M14 12c1-3 5-4 6-1 1 3-3 4-6 2M12 14c3 1 4 5 1 6-3 1-4-3-2-6M10 12c-1 3-5 4-6 1-1-3 3-4 6-2"/></svg>';
const cardSvg = '<svg class="kantu-source-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h4"/></svg>';

let index = read("index.html");
index = index.replaceAll('>🔴 Google</button>', '><span class="google-mark" aria-hidden="true">G</span> Google</button>');
index = index.replace('<div class="footer-logo">Kantu Floral ✿</div>', '<div class="footer-logo">Kantu Floral</div>');
index = index.replace('<div class="feature-icon" aria-hidden="true">🚚</div>', `<div class="feature-icon" data-kantu-icon-ready="true" aria-hidden="true">${truckSvg}</div>`);
index = index.replace('<div class="feature-icon" aria-hidden="true">🌷</div>', `<div class="feature-icon" data-kantu-icon-ready="true" aria-hidden="true">${flowerSvg}</div>`);
index = index.replace('<div class="feature-icon" aria-hidden="true">💌</div>', `<div class="feature-icon" data-kantu-icon-ready="true" aria-hidden="true">${cardSvg}</div>`);
write("index.html", index);

let staff = read("staff.html");
staff = staff.replace('30 min por pedido · ordenado por pago', 'Prioridad operativa · ordenado por pago');
write("staff.html", staff);

let css = read("css/final-polish.css");
if (!css.includes(".google-mark")) {
    css += `\n.google-mark {\n    display: inline-grid;\n    place-items: center;\n    width: 20px;\n    height: 20px;\n    margin-right: 7px;\n    border: 1px solid #e0e0e0;\n    border-radius: 50%;\n    background: #fff;\n    color: #4285f4;\n    font-size: 12px;\n    font-weight: 900;\n    line-height: 1;\n    vertical-align: -2px;\n}\n`;
}
write("css/final-polish.css", css);

console.log("Final frontend follow-up applied");
