/* Kantu Floral - limpieza estable de controles compactos del header */

(() => {
    const HEADER_CONTROL_IDS = Object.freeze([
        "favoritesButton",
        "cartButton",
        "notificationButton"
    ]);

    function cleanControl(control) {
        if (!(control instanceof Element)) return false;
        control.removeAttribute("title");
        control.removeAttribute("data-kantu-tooltip");
        if (control.dataset) delete control.dataset.kantuTooltip;
        return true;
    }

    function cleanHeaderControlTooltips(root = document) {
        let cleaned = 0;
        HEADER_CONTROL_IDS.forEach(id => {
            const control = root.querySelector?.(`#${CSS.escape(id)}`) || (root.id === id ? root : null) || document.getElementById(id);
            if (control && cleanControl(control)) cleaned += 1;
        });

        // Defensa adicional: ningún tooltip visual debe materializarse dentro
        // del grupo compacto de acciones del header. Los aria-label se conservan.
        document.querySelectorAll(".header-actions [data-kantu-tooltip], .header-actions [title]").forEach(node => {
            if (cleanControl(node)) cleaned += 1;
        });
        return cleaned;
    }

    function initialize() {
        cleanHeaderControlTooltips();

        const headerActions = document.querySelector(".header-actions");
        if (!headerActions || headerActions.dataset.kantuTooltipGuard === "true") return;
        headerActions.dataset.kantuTooltipGuard = "true";

        // El guard anterior usaba reintentos temporales (attempts >= 20). Eso no
        // cubría títulos añadidos más tarde. Ahora observamos solo .header-actions,
        // sin instalar un observer global sobre el documento.
        const observer = new MutationObserver(mutations => {
            let shouldClean = false;
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    shouldClean = true;
                    break;
                }
                if (mutation.type === "attributes" && ["title", "data-kantu-tooltip"].includes(mutation.attributeName)) {
                    shouldClean = true;
                    break;
                }
            }
            if (shouldClean) queueMicrotask(() => cleanHeaderControlTooltips(headerActions));
        });

        observer.observe(headerActions, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["title", "data-kantu-tooltip"]
        });
    }

    window.KantuHeaderControls = Object.freeze({
        refresh: cleanHeaderControlTooltips
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
