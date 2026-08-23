/* Kantu Floral - cupones server-authoritative en checkout */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let couponState = null;
    let couponBusy = false;
    let orderCompleted = false;
    let summaryRefreshQueued = false;

    const COUPON_ERRORS = Object.freeze({
        COUPON_REQUIRED: "Escribe un código de cupón.",
        COUPON_INVALID: "Ese cupón no existe.",
        COUPON_INACTIVE: "Ese cupón no está activo.",
        COUPON_NOT_STARTED: "Ese cupón todavía no está disponible.",
        COUPON_EXPIRED: "Ese cupón ya venció.",
        COUPON_MIN_SUBTOTAL: "Tu compra todavía no alcanza el mínimo requerido por ese cupón.",
        COUPON_NOT_APPLICABLE: "Ese cupón no aplica a los productos de tu carrito.",
        COUPON_USAGE_LIMIT: "Ese cupón alcanzó su límite de usos.",
        COUPON_USER_LIMIT: "Ya utilizaste el máximo permitido de este cupón.",
        CART_EMPTY: "Agrega productos al carrito antes de aplicar un cupón."
    });

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-coupons-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/coupons.css";
        link.dataset.kantuCouponsStyle = "true";
        document.head.appendChild(link);
    }

    function localCartSubtotal() {
        if (typeof cart === "undefined" || !Array.isArray(cart) || typeof products === "undefined") return 0;
        return cart.reduce((sum, item) => {
            const product = products.find(row => Number(row.id) === Number(item.id));
            return sum + ((Number(product?.price) || 0) * (Number(item.quantity) || 0));
        }, 0);
    }

    function errorMessage(error) {
        return core.resolveErrorMessage(error, COUPON_ERRORS, "No pudimos validar el cupón.");
    }

    function extendOrderErrors() {
        try {
            if (typeof orderErrorMessages !== "undefined") Object.assign(orderErrorMessages, COUPON_ERRORS);
        } catch {}
    }

    function ensureCouponControl() {
        const form = el("checkoutForm");
        const summary = form?.querySelector(".checkout-summary");
        if (!form || !summary) return null;

        let section = el("checkoutCouponSection");
        if (section) return section;

        section = document.createElement("section");
        section.id = "checkoutCouponSection";
        section.className = "checkout-coupon-section";
        section.innerHTML = `
            <div class="checkout-coupon-heading">
                <div><strong>¿Tienes un cupón?</strong><small>El descuento se valida de forma segura antes de crear el pedido.</small></div>
            </div>
            <div class="checkout-coupon-row">
                <input id="checkoutCouponCode" type="text" maxlength="32" autocomplete="off" placeholder="Código de cupón" aria-label="Código de cupón">
                <button id="checkoutCouponApply" type="button">Aplicar</button>
                <button id="checkoutCouponClear" type="button" class="secondary" hidden>Quitar</button>
            </div>
            <p id="checkoutCouponStatus" class="checkout-coupon-status" role="status" aria-live="polite" hidden></p>
        `;
        summary.insertAdjacentElement("beforebegin", section);

        el("checkoutCouponApply")?.addEventListener("click", applyCouponFromInput);
        el("checkoutCouponClear")?.addEventListener("click", clearCoupon);
        el("checkoutCouponCode")?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyCouponFromInput();
            }
        });
        return section;
    }

    function setStatus(message = "", type = "") {
        const status = el("checkoutCouponStatus");
        if (!status) return;
        status.textContent = message;
        status.className = `checkout-coupon-status${type ? ` ${type}` : ""}`;
        status.hidden = !message;
    }

    function setBusy(value) {
        couponBusy = value;
        const apply = el("checkoutCouponApply");
        const clear = el("checkoutCouponClear");
        if (apply) {
            apply.disabled = value;
            apply.textContent = value ? "Validando..." : "Aplicar";
        }
        if (clear) clear.disabled = value;
    }

    function renderCouponSummary() {
        const summary = el("checkoutSummary");
        const total = el("checkoutTotal");
        if (!summary || !total) return;

        summary.querySelector(".checkout-coupon-summary-row")?.remove();
        if (!couponState?.coupon_code || !(Number(couponState.discount_amount) > 0)) return;

        const deliveryLine = summary.querySelector(".checkout-delivery-line");
        const row = document.createElement("div");
        row.className = "checkout-summary-item checkout-coupon-summary-row";
        row.innerHTML = `<span><strong>Cupón ${core.escapeHtml(couponState.coupon_code)}</strong></span><strong>- ${core.escapeHtml(core.formatMoney(couponState.discount_amount))}</strong>`;
        if (deliveryLine) deliveryLine.insertAdjacentElement("beforebegin", row);
        else summary.appendChild(row);

        const deliveryFee = typeof currentDeliveryQuote !== "undefined" && currentDeliveryQuote?.service_available
            ? Number(currentDeliveryQuote.delivery_fee) || 0
            : 0;
        total.textContent = core.formatMoney((Number(couponState.subtotal_after_discount) || 0) + deliveryFee);
    }

    async function validateCoupon(code, { silent = false } = {}) {
        const normalized = String(code || "").trim().toUpperCase();
        if (!normalized) {
            if (!silent) setStatus(COUPON_ERRORS.COUPON_REQUIRED, "error");
            return false;
        }
        if (couponBusy) return false;

        setBusy(true);
        if (!silent) setStatus("Validando cupón...");
        const { data, error } = await supabaseClient.rpc("select_checkout_coupon", { p_code: normalized });
        setBusy(false);

        if (error) {
            couponState = null;
            setStatus(errorMessage(error), "error");
            if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
            return false;
        }

        const quote = Array.isArray(data) ? data[0] : data;
        if (!quote?.coupon_code) {
            couponState = null;
            setStatus("No pudimos obtener una cotización válida para el cupón.", "error");
            return false;
        }

        couponState = {
            coupon_code: String(quote.coupon_code),
            cart_subtotal: Number(quote.cart_subtotal) || 0,
            eligible_subtotal: Number(quote.eligible_subtotal) || 0,
            discount_amount: Number(quote.discount_amount) || 0,
            subtotal_after_discount: Number(quote.subtotal_after_discount) || 0
        };

        const input = el("checkoutCouponCode");
        const clear = el("checkoutCouponClear");
        if (input) input.value = couponState.coupon_code;
        if (clear) clear.hidden = false;
        setStatus(`Cupón aplicado. Ahorras ${core.formatMoney(couponState.discount_amount)}.`, "success");
        if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
        return true;
    }

    function applyCouponFromInput() {
        validateCoupon(el("checkoutCouponCode")?.value || "");
    }

    async function clearCoupon({ remote = true, quiet = false } = {}) {
        if (couponBusy) return;
        if (remote) {
            setBusy(true);
            await supabaseClient.rpc("clear_checkout_coupon");
            setBusy(false);
        }
        couponState = null;
        const input = el("checkoutCouponCode");
        const clear = el("checkoutCouponClear");
        if (input) input.value = "";
        if (clear) clear.hidden = true;
        if (!quiet) setStatus("Cupón retirado.", "success");
        else setStatus();
        if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
    }

    function maybeRefreshCoupon() {
        if (!couponState?.coupon_code || couponBusy || summaryRefreshQueued) return;
        const subtotal = localCartSubtotal();
        if (Math.abs(subtotal - Number(couponState.cart_subtotal || 0)) < 0.005) return;
        summaryRefreshQueued = true;
        window.setTimeout(async () => {
            summaryRefreshQueued = false;
            if (couponState?.coupon_code) await validateCoupon(couponState.coupon_code, { silent: true });
        }, 80);
    }

    function installSummaryAdapter() {
        if (typeof renderCheckoutSummary !== "function" || renderCheckoutSummary.__kantuCoupons) return;
        const base = renderCheckoutSummary;
        const wrapped = function couponAwareSummary(...args) {
            const result = base(...args);
            renderCouponSummary();
            maybeRefreshCoupon();
            return result;
        };
        wrapped.__kantuCoupons = true;
        renderCheckoutSummary = wrapped;
    }

    function installSuccessAdapter() {
        if (typeof showOrderSuccess !== "function" || showOrderSuccess.__kantuCoupons) return;
        const base = showOrderSuccess;
        const wrapped = function couponAwareSuccess(order, ...args) {
            const result = base(order, ...args);
            const subtotal = Number(order?.subtotal);
            const deliveryFee = Number(order?.delivery_fee);
            const total = Number(order?.total);
            const actualDiscount = Number.isFinite(subtotal) && Number.isFinite(deliveryFee) && Number.isFinite(total)
                ? Math.max(0, subtotal + deliveryFee - total)
                : Number(couponState?.discount_amount) || 0;

            if (actualDiscount > 0) {
                const breakdown = document.querySelector("#checkoutSuccess .checkout-payment-breakdown");
                const totalRow = breakdown?.querySelector(".total");
                if (breakdown && totalRow && !breakdown.querySelector(".coupon-discount")) {
                    const row = document.createElement("div");
                    row.className = "coupon-discount";
                    row.innerHTML = `<span>Descuento${couponState?.coupon_code ? ` · ${core.escapeHtml(couponState.coupon_code)}` : ""}</span><strong>- ${core.escapeHtml(core.formatMoney(actualDiscount))}</strong>`;
                    totalRow.insertAdjacentElement("beforebegin", row);
                }
            }
            orderCompleted = true;
            return result;
        };
        wrapped.__kantuCoupons = true;
        showOrderSuccess = wrapped;
    }

    function installOpenCheckoutAdapter() {
        if (typeof openCheckout !== "function" || openCheckout.__kantuCoupons) return;
        const base = openCheckout;
        const wrapped = function couponAwareOpenCheckout(...args) {
            if (orderCompleted) {
                couponState = null;
                orderCompleted = false;
                const input = el("checkoutCouponCode");
                const clear = el("checkoutCouponClear");
                if (input) input.value = "";
                if (clear) clear.hidden = true;
                setStatus();
            }
            const result = base(...args);
            window.setTimeout(() => {
                ensureCouponControl();
                renderCouponSummary();
            }, 0);
            return result;
        };
        wrapped.__kantuCoupons = true;
        openCheckout = wrapped;
    }

    async function clearStaleServerSelection() {
        try {
            const { data } = await supabaseClient.auth.getUser();
            if (data?.user) await supabaseClient.rpc("clear_checkout_coupon");
        } catch {}
    }

    function initialize() {
        ensureStyles();
        ensureCouponControl();
        extendOrderErrors();
        installSummaryAdapter();
        installSuccessAdapter();
        installOpenCheckoutAdapter();
        clearStaleServerSelection();

        supabaseClient.auth.onAuthStateChange(event => {
            if (event === "SIGNED_IN") clearStaleServerSelection();
            if (event === "SIGNED_OUT") {
                couponState = null;
                setStatus();
            }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
