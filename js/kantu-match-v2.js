/* Kantu Floral - Kantu Match v2: solo regalos principales, fallback seguro y UX ampliada */

(() => {
    const MAIN_GIFT_CATEGORIES = new Set([
        "tulipanes", "girasoles", "ramos", "rosas", "box", "boxes",
        "canasta", "canastas", "flores", "cajas", "ramos_buchones"
    ]);
    const EXCLUDED_GIFT_CATEGORIES = new Set([
        "complementos", "complemento", "accesorios", "accesorio", "addons", "addon"
    ]);

    const MATCH_OPTIONS_V2 = Object.freeze({
        audiences: [
            ["pareja", "❤️ Pareja"],
            ["mama", "🌷 Mamá"],
            ["papa", "🎁 Papá"],
            ["hermano", "🎈 Hermano/a"],
            ["novio", "❤️ Novio/a"],
            ["esposo", "💍 Esposo/a"],
            ["amigo", "✨ Amigo/a"],
            ["companero", "🌿 Compañero/a"],
            ["familiar", "🎁 Familiar"],
            ["otro", "💐 Otra persona"]
        ],
        occasions: [
            ["cumpleanos", "🎂 Cumpleaños"],
            ["aniversario", "🥂 Aniversario"],
            ["amor", "❤️ Te amo"],
            ["perdon", "🤍 Perdón"],
            ["gracias", "🌼 Agradecimiento"],
            ["primera_cita", "🌹 Primera cita"],
            ["sorpresa", "✨ Solo quiero sorprender"],
            ["graduacion", "🎓 Graduación"],
            ["nacimiento", "🍼 Nacimiento"],
            ["recuperacion", "🌷 Que te mejores"],
            ["dia_padre", "🎁 Día del Padre"],
            ["dia_madre", "🌸 Día de la Madre"]
        ],
        styles: [
            ["romantico", "❤️ Romántico"],
            ["tierno", "🌷 Tierno"],
            ["elegante", "✨ Elegante"],
            ["impactante", "🔥 Impactante"],
            ["alegre", "🌻 Alegre"],
            ["sobrio", "🤎 Sobrio"],
            ["moderno", "◻️ Moderno"],
            ["delicado", "🌸 Delicado"],
            ["lujoso", "👑 Lujoso"]
        ]
    });

    const AUDIENCE_ALIASES = Object.freeze({
        pareja: ["pareja"],
        mama: ["mama"],
        papa: ["papa"],
        hermano: ["hermano", "familiar"],
        novio: ["novio", "pareja"],
        esposo: ["esposo", "pareja"],
        amigo: ["amigo", "amiga", "otro"],
        companero: ["companero", "otro"],
        familiar: ["familiar"],
        otro: ["otro"]
    });

    function ensureStyle() {
        if (document.querySelector('link[data-kantu-match-v2-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/kantu-match-v2.css";
        link.setAttribute("data-kantu-match-v2-style", "true");
        document.head.appendChild(link);
    }

    function storeProducts() {
        try {
            return typeof products !== "undefined" && Array.isArray(products) ? products : [];
        } catch {
            return [];
        }
    }

    function normalizeCategory(value) {
        return String(value || "").trim().toLowerCase();
    }

    function normalizedArray(value) {
        return Array.isArray(value) ? value.map(item => String(item).trim().toLowerCase()).filter(Boolean) : [];
    }

    function isPrimaryGift(product) {
        const category = normalizeCategory(product?.category);
        if (!category || EXCLUDED_GIFT_CATEGORIES.has(category)) return false;
        return MAIN_GIFT_CATEGORIES.has(category);
    }

    function isAvailablePrimaryGift(product) {
        return isPrimaryGift(product)
            && product?.active !== false
            && Number(product?.stock) > 0
            && Number(product?.price) > 0;
    }

    function audienceTargets(answer) {
        const value = String(answer || "").toLowerCase();
        return AUDIENCE_ALIASES[value] || [value];
    }

    function signalMatches(values, targets) {
        const normalized = normalizedArray(values);
        if (!normalized.length) return false;
        const targetSet = new Set((Array.isArray(targets) ? targets : [targets]).map(value => String(value).toLowerCase()));
        return normalized.some(value => targetSet.has(value));
    }

    function audienceMatches(product, answer) {
        return signalMatches(product?.recommendation_audiences, audienceTargets(answer));
    }

    function occasionMatches(product, answer) {
        return signalMatches(product?.recommendation_occasions, String(answer || "").toLowerCase());
    }

    function styleMatches(product, answer) {
        return signalMatches(product?.recommendation_styles, String(answer || "").toLowerCase());
    }

    function categoryHeuristic(product, answers) {
        const category = normalizeCategory(product?.category);
        const audience = String(answers?.audience || "");
        const occasion = String(answers?.occasion || "");
        const style = String(answers?.style || "");
        let score = 0;

        if (["pareja", "novio", "esposo"].includes(audience) && ["rosas", "tulipanes", "ramos_buchones", "box", "cajas"].includes(category)) score += 8;
        if (audience === "mama" && ["ramos", "flores", "canasta", "girasoles", "tulipanes"].includes(category)) score += 7;
        if (audience === "papa" && ["box", "cajas", "ramos", "ramos_buchones"].includes(category)) score += 6;
        if (["hermano", "familiar"].includes(audience) && ["ramos", "flores", "girasoles", "box"].includes(category)) score += 5;
        if (["amigo", "companero"].includes(audience) && ["girasoles", "ramos", "flores", "box"].includes(category)) score += 5;

        if (["aniversario", "amor", "primera_cita"].includes(occasion) && ["rosas", "tulipanes", "ramos_buchones"].includes(category)) score += 9;
        if (["cumpleanos", "graduacion", "sorpresa"].includes(occasion) && ["girasoles", "ramos", "box", "cajas"].includes(category)) score += 7;
        if (occasion === "perdon" && ["rosas", "tulipanes", "ramos"].includes(category)) score += 6;
        if (occasion === "nacimiento" && ["ramos", "flores", "tulipanes", "canasta"].includes(category)) score += 6;
        if (occasion === "recuperacion" && ["ramos", "flores", "girasoles", "tulipanes"].includes(category)) score += 6;
        if (occasion === "dia_madre" && ["ramos", "flores", "girasoles", "tulipanes", "canasta"].includes(category)) score += 9;
        if (occasion === "dia_padre" && ["box", "cajas", "ramos", "ramos_buchones"].includes(category)) score += 8;

        if (style === "romantico" && ["rosas", "tulipanes"].includes(category)) score += 10;
        if (["elegante", "lujoso"].includes(style) && ["box", "tulipanes", "cajas", "ramos_buchones"].includes(category)) score += 8;
        if (style === "impactante" && ["ramos_buchones", "box"].includes(category)) score += 9;
        if (style === "alegre" && ["girasoles", "ramos", "flores"].includes(category)) score += 9;
        if (["tierno", "delicado"].includes(style) && ["ramos", "flores", "tulipanes"].includes(category)) score += 7;
        if (style === "sobrio" && ["box", "cajas", "ramos"].includes(category)) score += 6;
        if (style === "moderno" && ["box", "cajas", "ramos_buchones", "tulipanes"].includes(category)) score += 7;
        return score;
    }

    function scoreProduct(product, answers) {
        let score = categoryHeuristic(product, answers);
        if (audienceMatches(product, answers.audience)) score += 28;
        if (occasionMatches(product, answers.occasion)) score += 32;
        if (styleMatches(product, answers.style)) score += 26;
        score += Math.max(0, Math.min(10, Number(product?.recommendation_priority) || 0)) * 2.5;
        if (product?.featured) score += 6;
        score += Math.min(6, Math.log2((Number(product?.paid_order_count) || Number(product?.units_sold) || 0) + 1));

        const price = Number(product?.price) || 0;
        const budget = Number(answers?.budget) || 0;
        if (price <= budget) score += 10;
        else if (budget > 0) score -= Math.min(24, ((price - budget) / Math.max(20, budget)) * 20);
        return score;
    }

    function sortCandidates(source, answers) {
        const budget = Number(answers?.budget) || 0;
        return [...source]
            .map(product => ({ product, score: scoreProduct(product, answers) }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (Boolean(b.product?.featured) !== Boolean(a.product?.featured)) return Number(Boolean(b.product?.featured)) - Number(Boolean(a.product?.featured));
                const priorityDelta = (Number(b.product?.recommendation_priority) || 0) - (Number(a.product?.recommendation_priority) || 0);
                if (priorityDelta) return priorityDelta;
                const aDistance = Math.abs((Number(a.product?.price) || 0) - budget);
                const bDistance = Math.abs((Number(b.product?.price) || 0) - budget);
                if (aDistance !== bDistance) return aDistance - bDistance;
                return Number(a.product?.id) - Number(b.product?.id);
            })
            .map(row => row.product);
    }

    function findMatches(answers, source = storeProducts()) {
        const available = source.filter(isAvailablePrimaryGift);
        if (!available.length) return [];

        const budget = Number(answers?.budget) || 0;
        const withinBudget = product => Number(product?.price) <= budget;
        const audienceAndOccasion = product => audienceMatches(product, answers.audience) && occasionMatches(product, answers.occasion);
        const exactIntent = product => audienceAndOccasion(product) && styleMatches(product, answers.style);

        const stages = [
            available.filter(product => withinBudget(product) && exactIntent(product)),
            available.filter(product => withinBudget(product) && audienceAndOccasion(product)),
            available.filter(product => audienceAndOccasion(product)),
            available.filter(withinBudget),
            available
        ];

        const selected = [];
        const selectedIds = new Set();
        for (const stage of stages) {
            for (const product of sortCandidates(stage, answers)) {
                const key = String(product?.id);
                if (!key || selectedIds.has(key)) continue;
                selectedIds.add(key);
                selected.push(product);
                if (selected.length >= 3) return selected;
            }
        }
        return selected;
    }

    function matchReason(product, answers) {
        const reasons = [];
        if (occasionMatches(product, answers.occasion)) reasons.push("encaja con la ocasión");
        if (styleMatches(product, answers.style)) reasons.push(`estilo ${String(answers.style).replaceAll("_", " ")}`);
        if (audienceMatches(product, answers.audience)) reasons.push("pensado para esa persona");
        if (Number(product?.price) <= Number(answers?.budget)) reasons.push("dentro de tu presupuesto");
        if (product?.featured) reasons.push("destacado por Kantu");
        if (!reasons.length && categoryHeuristic(product, answers) > 0) reasons.push("buena afinidad con tu intención");
        if (!reasons.length) reasons.push("regalo principal disponible con stock");
        return reasons.slice(0, 2).join(" · ");
    }

    function optionButtons(items, name) {
        return items.map(([value, label], index) => `
            <label class="kantu-match-choice">
                <input type="radio" name="${name}" value="${value}" ${index === 0 ? "required" : ""}>
                <span>${label}</span>
            </label>`).join("");
    }

    function replaceOptions(modal, inputName, items) {
        const input = modal.querySelector(`input[name="${inputName}"]`);
        const container = input?.closest(".kantu-match-choices");
        if (!container) return;
        container.innerHTML = optionButtons(items, inputName);
    }

    function renderResults(answers) {
        const results = document.getElementById("kantuMatchResults");
        if (!results) return;
        const core = window.KantuCore;
        const matches = findMatches(answers);
        results.hidden = false;

        if (!matches.length) {
            results.innerHTML = '<div class="kantu-match-empty"><strong>Estamos preparando más opciones para ti.</strong><p>Ahora mismo no hay un regalo principal activo con stock. Revisa el catálogo o vuelve a intentarlo pronto.</p></div>';
            return;
        }

        const noun = matches.length === 1 ? "regalo" : "regalos";
        results.innerHTML = `<div class="kantu-match-result-head"><span>TUS MEJORES OPCIONES</span><h3>Encontramos ${matches.length} ${noun} para ti</h3></div>
            <div class="kantu-match-result-grid">${matches.map((product, index) => {
                const image = core?.safeUrl?.(product.image) || "";
                const category = normalizeCategory(product.category);
                const price = core?.formatMoney?.(product.price) || `S/ ${Number(product.price).toFixed(2)}`;
                return `<article class="kantu-match-card" data-kantu-match-primary="true" data-kantu-match-category="${core?.escapeHtml?.(category) || category}">
                    <span class="kantu-match-rank">${index === 0 ? "🥇 Recomendación Kantu" : `Opción ${index + 1}`}</span>
                    ${image ? `<img src="${core.escapeHtml(image)}" alt="${core.escapeHtml(product.name)}">` : '<div class="kantu-match-placeholder">✿</div>'}
                    <div><h4>${core.escapeHtml(product.name)}</h4><strong>${core.escapeHtml(price)}</strong><p>${core.escapeHtml(matchReason(product, answers))}</p></div>
                    <div class="kantu-match-card-actions"><button type="button" data-match-add="${Number(product.id)}">Agregar</button><a href="producto.html?id=${Number(product.id)}">Ver detalle</a></div>
                </article>`;
            }).join("")}</div>`;
        results.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function handleSubmit(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const formData = new FormData(event.currentTarget);
        renderResults({
            audience: String(formData.get("matchAudience") || ""),
            occasion: String(formData.get("matchOccasion") || ""),
            style: String(formData.get("matchStyle") || ""),
            budget: Number(formData.get("matchBudget")) || 100
        });
    }

    function makeCloseSticky(modal) {
        const close = modal.querySelector("#kantuMatchClose");
        if (!close || close.closest(".kantu-match-sticky-close")) return;
        const dock = document.createElement("div");
        dock.className = "kantu-match-sticky-close";
        close.before(dock);
        dock.appendChild(close);
    }

    function enhanceMatch() {
        ensureStyle();
        const modal = document.querySelector("#kantuMatchModal .kantu-match-modal");
        const form = document.getElementById("kantuMatchForm");
        if (!modal || !form) return false;

        if (modal.dataset.kantuMatchV2 !== "true") {
            replaceOptions(modal, "matchAudience", MATCH_OPTIONS_V2.audiences);
            replaceOptions(modal, "matchOccasion", MATCH_OPTIONS_V2.occasions);
            replaceOptions(modal, "matchStyle", MATCH_OPTIONS_V2.styles);
            makeCloseSticky(modal);
            modal.dataset.kantuMatchV2 = "true";
        }

        if (form.dataset.kantuMatchV2 !== "true") {
            form.addEventListener("submit", handleSubmit, true);
            form.dataset.kantuMatchV2 = "true";
        }
        return true;
    }

    function initialize() {
        if (enhanceMatch()) return;
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            if (enhanceMatch() || attempts >= 40) window.clearInterval(timer);
        }, 100);
    }

    window.KantuMatchV2 = Object.freeze({
        isPrimaryGift,
        findMatches,
        refresh: enhanceMatch,
        options: MATCH_OPTIONS_V2
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
