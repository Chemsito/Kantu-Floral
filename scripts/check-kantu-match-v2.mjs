import fs from "node:fs";
import assert from "node:assert/strict";

const loader = fs.readFileSync("js/experience-loader.js", "utf8");
const match = fs.readFileSync("js/kantu-match-v2.js", "utf8");
const css = fs.readFileSync("css/kantu-match-v2.css", "utf8");

assert.match(loader, /kantu-growth\.js[\s\S]*kantu-match-v2\.js/, "Kantu Match v2 debe cargar después de la UI base.");
assert.match(match, /MAIN_GIFT_CATEGORIES/, "Debe existir una lista explícita de categorías de regalo principal.");
assert.match(match, /EXCLUDED_GIFT_CATEGORIES[\s\S]*complementos/, "Complementos debe estar excluido explícitamente.");
assert.match(match, /isAvailablePrimaryGift/, "Las recomendaciones deben exigir regalo principal, activo, stock y precio válido.");
assert.match(match, /active !== false[\s\S]*stock\) > 0[\s\S]*price\) > 0/, "El filtro debe conservar active, stock y precio.");
assert.match(match, /exactIntent/, "El primer nivel debe buscar intención exacta.");
assert.match(match, /audienceAndOccasion/, "Debe existir fallback relajando estilo.");
assert.match(match, /available\.filter\(withinBudget\)[\s\S]*available/, "El fallback debe terminar en regalos principales disponibles.");
assert.match(match, /selected\.length >= 3/, "El motor debe intentar completar hasta tres opciones sin duplicados.");
assert.match(match, /Hermano\/a/, "Kantu Match debe ampliar audiencias.");
assert.match(match, /Graduación/, "Kantu Match debe ampliar ocasiones.");
assert.match(match, /Día del Padre/, "Kantu Match debe incluir Día del Padre.");
assert.match(match, /Día de la Madre/, "Kantu Match debe incluir Día de la Madre.");
assert.match(match, /Lujoso/, "Kantu Match debe ampliar estilos.");
assert.match(match, /event\.stopImmediatePropagation\(\)/, "La capa v2 debe sustituir el submit anterior y evitar resultados legacy.");
assert.match(match, /data-kantu-match-primary/, "Los resultados deben marcar explícitamente regalos principales.");
assert.match(css, /position:\s*sticky/, "El cierre de Kantu Match debe permanecer visible durante scroll.");
assert.match(css, /#kantuMatchClose[\s\S]*48px/, "La X debe tener un área de interacción cercana a 48px.");

console.log("Kantu Match v2 primary gifts, fallback and sticky close contracts OK");
