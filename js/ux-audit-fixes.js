/* Kantu Floral - correcciones visuales de auditoría */

(() => {
    function loadStyle(href, attribute) {
        if (document.querySelector(`link[${attribute}="true"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute(attribute, "true");
        document.head.appendChild(link);
    }

    function fixPromotionPlacement() {
        const promotion = document.getElementById("checkoutPromotionSection");
        const review = document.getElementById("checkoutReviewFlowSection");
        const summary = document.querySelector("#checkoutReviewFlowSection .checkout-summary");
        const heading = review?.querySelector(":scope > .checkout-flow-section-heading");
        if (!promotion || !review || !summary) return false;

        if (promotion.parentElement !== review || promotion.nextElementSibling !== summary) {
            if (heading) heading.insertAdjacentElement("afterend", promotion);
            else review.insertBefore(promotion, summary);
        }
        return true;
    }

    function keepAdminScheduleInViewport() {
        const card = document.getElementById("adminScheduleCard");
        if (!card) return;
        card.querySelectorAll("input, textarea, select").forEach(control => {
            control.setAttribute("autocomplete", control.getAttribute("autocomplete") || "off");
        });
    }

    function initialize() {
        loadStyle("css/admin-polish.css", "data-kantu-admin-polish");
        loadStyle("css/ux-audit.css", "data-kantu-ux-audit");
        fixPromotionPlacement();
        keepAdminScheduleInViewport();

        const observer = new MutationObserver(() => {
            fixPromotionPlacement();
            keepAdminScheduleInViewport();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.KantuUxAuditFixes = Object.freeze({ refresh: fixPromotionPlacement });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
