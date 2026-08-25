/* =====================================================
   KANTU FLORAL
   checkout-review-editing.js
   Edición directa del resumen final + controles de modal consistentes.
===================================================== */

(() => {
    if (window.KantuCheckoutReviewEditingReady) return;
    window.KantuCheckoutReviewEditingReady = true;

    const core = window.KantuCore;
    if (!core) return;

    function ensureStyles() {
        if (document.getElementById("kantuCheckoutReviewEditingStyles")) return;

        const style = document.createElement("style");
        style.id = "kantuCheckoutReviewEditingStyles";
        style.textContent = `
            .checkout-summary-product-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto;
                align-items: center;
                gap: 10px;
            }

            .checkout-summary-product-row > span {
                min-width: 0;
            }

            .checkout-summary-remove {
                display: inline-grid;
                place-items: center;
                width: 30px;
                height: 30px;
                padding: 0;
                border: 1px solid #ead6da;
                border-radius: 999px;
                background: #fffaf8;
                color: #8f3348;
                cursor: pointer;
                font: inherit;
                font-size: 18px;
                line-height: 1;
                transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
            }

            .checkout-summary-remove:hover:not(:disabled) {
                background: #f9e9ed;
                border-color: #c77a8a;
                color: #76273b;
                transform: translateY(-1px);
            }

            .checkout-summary-remove:focus-visible {
                outline: 3px solid rgba(159, 47, 79, .18);
                outline-offset: 2px;
            }

            .checkout-summary-remove:disabled {
                opacity: .55;
                cursor: wait;
            }

            .modal,
            .cart-panel,
            .admin-main,
            .account-modal {
                scrollbar-width: thin;
                scrollbar-color: #a84a63 #f6ebe7;
            }

            .modal::-webkit-scrollbar,
            .cart-panel::-webkit-scrollbar,
            .admin-main::-webkit-scrollbar,
            .account-modal::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }

            .modal::-webkit-scrollbar-track,
            .cart-panel::-webkit-scrollbar-track,
            .admin-main::-webkit-scrollbar-track,
            .account-modal::-webkit-scrollbar-track {
                background: #f6ebe7;
                border-radius: 999px;
            }

            .modal::-webkit-scrollbar-thumb,
            .cart-panel::-webkit-scrollbar-thumb,
            .admin-main::-webkit-scrollbar-thumb,
            .account-modal::-webkit-scrollbar-thumb {
                background: #a84a63;
                border: 2px solid #f6ebe7;
                border-radius: 999px;
            }

            .modal::-webkit-scrollbar-thumb:hover,
            .cart-panel::-webkit-scrollbar-thumb:hover,
            .admin-main::-webkit-scrollbar-thumb:hover,
            .account-modal::-webkit-scrollbar-thumb:hover {
                background: #8f3348;
            }

            .modal > .close-modal {
                position: sticky !important;
                top: 12px !important;
                z-index: 80 !important;
                float: right;
                margin-left: 12px;
                background: rgba(255, 250, 248, .96) !important;
                box-shadow: 0 5px 18px rgba(92, 48, 59, .12);
                backdrop-filter: blur(8px);
            }

            .cart-panel .cart-header {
                position: sticky;
                top: 0;
                z-index: 70;
                background: rgba(255, 250, 248, .97);
                backdrop-filter: blur(10px);
            }

            @media (max-width: 640px) {
                .checkout-summary-product-row {
                    grid-template-columns: minmax(0, 1fr) auto auto;
                    gap: 8px;
                }

                .checkout-summary-remove {
                    width: 32px;
                    height: 32px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function decorateCheckoutSummary() {
        const summary = document.getElementById("checkoutSummary");
        if (!summary || typeof cart === "undefined" || !Array.isArray(cart)) return;

        const productRows = [...summary.children]
            .filter(node => node.classList?.contains("checkout-summary-item"))
            .slice(0, cart.length);

        productRows.forEach((row, index) => {
            const item = cart[index];
            if (!item || row.querySelector("[data-checkout-remove-product]")) return;

            row.classList.add("checkout-summary-product-row");
            const product = typeof products !== "undefined" && Array.isArray(products)
                ? products.find(entry => Number(entry?.id) === Number(item.id))
                : null;
            const label = String(product?.name || "producto");

            const button = document.createElement("button");
            button.type = "button";
            button.className = "checkout-summary-remove";
            button.dataset.checkoutRemoveProduct = String(item.id);
            button.setAttribute("aria-label", `Eliminar ${label} del pedido`);
            button.title = `Eliminar ${label}`;
            button.textContent = "×";
            row.appendChild(button);
        });
    }

    function wrapCheckoutSummaryRenderer() {
        const original = window.renderCheckoutSummary;
        if (typeof original !== "function" || original.__kantuEditableCheckoutSummary) return;

        function editableCheckoutSummary(...args) {
            const result = original.apply(this, args);
            decorateCheckoutSummary();
            return result;
        }

        editableCheckoutSummary.__kantuEditableCheckoutSummary = true;
        editableCheckoutSummary.__kantuOriginal = original;
        window.renderCheckoutSummary = editableCheckoutSummary;
    }

    async function removeProductFromCheckout(button) {
        if (typeof window.removeFromCart !== "function") return;
        const productId = Number(button.dataset.checkoutRemoveProduct);
        if (!Number.isSafeInteger(productId) || productId <= 0) return;

        button.disabled = true;
        button.setAttribute("aria-busy", "true");

        try {
            await window.removeFromCart(productId);

            if (typeof cart !== "undefined" && Array.isArray(cart) && cart.length === 0) {
                if (typeof window.closeCheckout === "function") window.closeCheckout();
                if (typeof window.closeCart === "function") window.closeCart();
                if (typeof window.showToast === "function") {
                    window.showToast("Tu pedido quedó vacío. Agrega un producto para continuar.");
                }
                return;
            }

            if (typeof window.renderCheckoutSummary === "function") {
                window.renderCheckoutSummary();
            }
            if (typeof window.renderUpsells === "function") window.renderUpsells();
        } finally {
            if (button.isConnected) {
                button.disabled = false;
                button.removeAttribute("aria-busy");
            }
        }
    }

    function bindCheckoutSummaryActions() {
        document.addEventListener("click", event => {
            const button = event.target.closest("[data-checkout-remove-product]");
            if (!button) return;
            event.preventDefault();
            removeProductFromCheckout(button);
        });
    }

    function initialize() {
        ensureStyles();
        wrapCheckoutSummaryRenderer();
        bindCheckoutSummaryActions();
        decorateCheckoutSummary();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
