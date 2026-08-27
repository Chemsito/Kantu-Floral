/* Kantu Floral - limpieza de controles compactos del header */

(() => {
    const HEADER_CONTROL_IDS = Object.freeze([
        "favoritesButton",
        "cartButton",
        "notificationButton"
    ]);

    function cleanHeaderControlTooltips() {
        let cleaned = 0;
        HEADER_CONTROL_IDS.forEach(id => {
            const control = document.getElementById(id);
            if (!control) return;
            control.removeAttribute("title");
            control.removeAttribute("data-kantu-tooltip");
            if (control.dataset) delete control.dataset.kantuTooltip;
            cleaned += 1;
        });
        return cleaned;
    }

    function initialize() {
        cleanHeaderControlTooltips();

        // La campana se crea dinámicamente por Kantu Growth. Reintentamos por unos
        // segundos y luego detenemos el timer; no dejamos un observer global vivo.
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            cleanHeaderControlTooltips();
            if (document.getElementById("notificationButton") || attempts >= 20) {
                window.clearInterval(timer);
            }
        }, 250);
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
