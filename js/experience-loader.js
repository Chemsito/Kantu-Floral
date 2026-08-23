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

    function loadScriptOnce(src, dataAttribute, dataValue) {
        if (document.querySelector(`script[${dataAttribute}="${dataValue}"]`)) return;

        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.setAttribute(dataAttribute, dataValue);
        document.head.appendChild(script);
    }

    loadScriptOnce("js/customer-ux.js", "data-kantu-customer-ux", "true");
    loadScriptOnce("js/checkout-gifting.js", "data-kantu-checkout-gifting", "true");
    loadScriptOnce("js/order-gifting-ui.js", "data-kantu-order-gifting-ui", "true");
    loadScriptOnce("js/commerce-ops.js", "data-kantu-commerce-ops", "true");
    loadScriptOnce("js/coupons.js", "data-kantu-coupons", "true");
    loadScriptOnce("js/admin-coupons.js", "data-kantu-admin-coupons", "true");
    loadScriptOnce("js/admin-schedule.js", "data-kantu-admin-schedule", "true");
    loadScriptOnce("js/admin-image-upload.js", "data-kantu-admin-image-upload", "true");
    loadScriptOnce("js/sakura.js?v=20260823-1149", "data-kantu-sakura", "true");
})();
