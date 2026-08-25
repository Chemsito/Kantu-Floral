/* =====================================================
   KANTU FLORAL
   experience-loader.js
   Carga diferida de módulos visuales no críticos.
===================================================== */

(() => {
    window.KantuExperienceLoaderReady = true;

    if (typeof supabaseClient !== "undefined" && !window.supabaseClient) {
        window.supabaseClient = supabaseClient;
    }

    function removeLegacyHero() {
        const legacyHero = document.querySelector("body:not(.product-detail-page) > main > .hero");
        if (!legacyHero) return;
        legacyHero.remove();
    }

    function loadStyleOnce(href, dataAttribute, dataValue) {
        if (document.querySelector(`link[${dataAttribute}="${dataValue}"]`)) return;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute(dataAttribute, dataValue);
        document.head.appendChild(link);
    }

    function loadScriptOnce(src, dataAttribute, dataValue) {
        if (document.querySelector(`script[${dataAttribute}="${dataValue}"]`)) return;

        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.setAttribute(dataAttribute, dataValue);
        document.head.appendChild(script);
    }

    removeLegacyHero();

    const isStandaloneAdmin = new URLSearchParams(window.location.search).get("admin") === "1";

    loadStyleOnce("css/ui-polish.css", "data-kantu-ui-polish", "true");
    loadScriptOnce("js/ui-polish.js", "data-kantu-ui-polish-script", "true");

    loadScriptOnce("js/admin-standalone.js", "data-kantu-admin-standalone", "true");
    loadScriptOnce("js/navigation-bridge.js", "data-kantu-navigation-bridge", "true");
    loadScriptOnce("js/catalog-position.js", "data-kantu-catalog-position", "true");
    loadScriptOnce("js/customer-ux.js", "data-kantu-customer-ux", "true");
    loadScriptOnce("js/checkout-gifting.js", "data-kantu-checkout-gifting", "true");
    loadScriptOnce("js/order-gifting-ui.js", "data-kantu-order-gifting-ui", "true");
    loadScriptOnce("js/order-customizations-ui.js", "data-kantu-order-customizations-ui", "true");
    loadScriptOnce("js/commerce-ops.js", "data-kantu-commerce-ops", "true");
    loadScriptOnce("js/product-customizations.js", "data-kantu-product-customizations", "true");
    loadScriptOnce("js/promotions.js", "data-kantu-promotions", "true");
    loadScriptOnce("js/promotion-rules.js", "data-kantu-promotion-rules", "true");
    loadScriptOnce("js/admin-schedule.js", "data-kantu-admin-schedule", "true");
    loadScriptOnce("js/delivery-availability.js", "data-kantu-delivery-availability", "true");
    loadScriptOnce("js/scheduled-operations.js", "data-kantu-scheduled-operations", "true");
    loadScriptOnce("js/occasion-reminders.js", "data-kantu-occasion-reminders", "true");
    loadScriptOnce("js/favorites-sync.js", "data-kantu-favorites-sync", "true");
    loadScriptOnce("js/checkout-flow.js", "data-kantu-checkout-flow", "true");
    loadScriptOnce("js/guest-checkout.js", "data-kantu-guest-checkout", "true");
    loadScriptOnce("js/guest-customization-router.js", "data-kantu-guest-customization-router", "true");
    loadScriptOnce("js/checkout-review-editing.js", "data-kantu-checkout-review-editing", "true");
    loadScriptOnce("js/ux-audit-fixes.js", "data-kantu-ux-audit-fixes", "true");
    loadScriptOnce("js/runtime-integrity.js", "data-kantu-runtime-integrity", "true");
    loadScriptOnce("js/admin-growth.js", "data-kantu-admin-growth", "true");
    if (!isStandaloneAdmin) {
        loadScriptOnce("js/kantu-growth.js", "data-kantu-growth", "true");
    }
    loadScriptOnce("js/admin-image-upload.js", "data-kantu-admin-image-upload", "true");
    loadScriptOnce("js/sakura.js?v=20260823-1149", "data-kantu-sakura", "true");
})();
