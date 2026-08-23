/* =====================================================
   KANTU FLORAL
   admin-product-manager.js

   Compatibilidad temporal.
   La gestión de categorías, talla y nota vive en products.js.
   Este archivo se mantiene como cargador liviano para las mejoras
   generales de experiencia del cliente.
===================================================== */

(() => {
    window.KantuAdminProductManagerLoaded = true;

    // El cliente ya usa una publishable key. Exponer la misma instancia en
    // window permite que los módulos cargados dinámicamente la reutilicen sin
    // crear sesiones paralelas ni clientes adicionales.
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
    loadScriptOnce("js/sakura.js?v=20260823-1149", "data-kantu-sakura", "true");
})();
