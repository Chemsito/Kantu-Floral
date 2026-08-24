/* Kantu Floral - volver desde detalle conservando la posición del catálogo */

(() => {
    const FALLBACK_URL = "index.html#catalogo";

    function cameFromStorefront() {
        if (!document.referrer) return false;
        try {
            const referrer = new URL(document.referrer);
            if (referrer.origin !== window.location.origin) return false;
            const path = referrer.pathname.replace(/\/+$/, "");
            return path.endsWith("/index.html") || path.endsWith("/Kantu-Floral") || path === "";
        } catch {
            return false;
        }
    }

    function goBackToCatalogPosition() {
        if (cameFromStorefront() && window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = FALLBACK_URL;
    }

    function ensureBackControl() {
        if (document.getElementById("productDetailBack")) return;
        const shell = document.getElementById("productDetailRoot");
        if (!shell) return;

        const row = document.createElement("div");
        row.className = "product-detail-back-row";

        const button = document.createElement("button");
        button.id = "productDetailBack";
        button.type = "button";
        button.className = "product-detail-back";
        button.setAttribute("aria-label", "Volver a la posición anterior del catálogo");
        button.innerHTML = '<span aria-hidden="true">←</span><span>Volver</span>';
        button.addEventListener("click", goBackToCatalogPosition);

        row.appendChild(button);
        shell.insertAdjacentElement("beforebegin", row);
    }

    function ensureStyles() {
        if (document.getElementById("productDetailBackStyle")) return;
        const style = document.createElement("style");
        style.id = "productDetailBackStyle";
        style.textContent = `
            .product-detail-back-row {
                width: min(1120px, calc(100% - 32px));
                margin: 24px auto -18px;
            }
            .product-detail-back {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                min-height: 40px;
                padding: 8px 12px;
                border: 1px solid rgba(139, 47, 69, 0.16);
                border-radius: 999px;
                background: rgba(255,255,255,.88);
                color: #8b2f45;
                font: inherit;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 8px 20px rgba(74,43,50,.06);
            }
            .product-detail-back:hover {
                background: #fff;
                transform: translateX(-1px);
            }
            .product-detail-back:focus-visible {
                outline: 3px solid rgba(139,47,69,.18);
                outline-offset: 2px;
            }
            .product-detail-back span[aria-hidden="true"] {
                font-size: 18px;
                line-height: 1;
            }
            @media (max-width: 520px) {
                .product-detail-back-row {
                    width: min(100% - 20px, 1120px);
                    margin-top: 14px;
                    margin-bottom: -8px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function initialize() {
        ensureStyles();
        ensureBackControl();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
