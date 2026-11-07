/* =====================================================
   KANTU FLORAL
   kantu-analytics.js
   Medición anónima del embudo de ventas (visita, producto,
   carrito, checkout). Sin cookies ni datos personales: un id
   aleatorio por pestaña en sessionStorage. Respeta Do Not Track.
===================================================== */

(() => {
    if (window.KantuAnalytics) return;

    const params = new URLSearchParams(window.location.search);
    const disabled = params.get("admin") === "1"
        || navigator.doNotTrack === "1"
        || window.doNotTrack === "1"
        || /bot|crawler|spider|headless/i.test(navigator.userAgent || "");

    function sessionId() {
        try {
            let id = sessionStorage.getItem("kantu_session_id");
            if (!id) {
                id = window.crypto?.randomUUID?.() || "";
                if (id) sessionStorage.setItem("kantu_session_id", id);
            }
            return id || null;
        } catch {
            return null;
        }
    }

    const sent = new Set();

    function track(event, productId = null) {
        if (disabled || typeof supabaseClient === "undefined") return;
        const session = sessionId();
        if (!session) return;
        const id = Number(productId);
        const product = Number.isSafeInteger(id) && id > 0 ? id : null;
        // Evita repetir el mismo evento del mismo producto en la pestaña.
        const key = `${event}:${product ?? ""}`;
        if (event !== "add_to_cart" && sent.has(key)) return;
        sent.add(key);
        supabaseClient
            .rpc("track_storefront_event", { p_session_id: session, p_event: event, p_product_id: product })
            .then(() => {}, () => {});
    }

    function productIdFromOnclick(element) {
        const match = String(element?.getAttribute?.("onclick") || "").match(/\((\d+)/);
        return match ? Number(match[1]) : null;
    }

    function initialize() {
        if (disabled) return;
        track("visit");

        if (document.body.classList.contains("product-detail-page")) {
            track("product_view", params.get("id"));
        }

        document.addEventListener("click", event => {
            const add = event.target.closest(".add-cart, .product-detail-add, [data-upsell-add], [data-add-to-cart]");
            if (add && !add.disabled) {
                const id = add.dataset.productId || add.dataset.upsellAdd || add.dataset.addToCart
                    || productIdFromOnclick(add)
                    || (document.body.classList.contains("product-detail-page") ? params.get("id") : null);
                track("add_to_cart", id);
                return;
            }

            if (event.target.closest("#cartCheckoutButton, .checkout-btn")) track("checkout_start");
        }, true);
    }

    window.KantuAnalytics = Object.freeze({ track });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
