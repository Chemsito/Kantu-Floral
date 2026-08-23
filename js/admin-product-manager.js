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

    if (document.querySelector('script[data-kantu-customer-ux="true"]')) return;

    const script = document.createElement("script");
    script.src = "js/customer-ux.js";
    script.async = false;
    script.dataset.kantuCustomerUx = "true";
    document.head.appendChild(script);
})();
