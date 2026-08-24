/* Kantu Floral - visibilidad de personalizaciones en pedidos */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const cache = new Map();
    const loading = new Map();
    let activeAdminOrderId = null;
    let refreshTimer = null;

    function orderIdFromAccountCard(card) {
        return card.querySelector("[data-order-id]")?.dataset?.orderId || null;
    }

    function orderIdFromAdminCard(card) {
        return card.querySelector("[data-admin-order-detail]")?.dataset?.adminOrderDetail || null;
    }

    function orderIdFromStaffCard(card) {
        const action = card.querySelector("[data-order-id]");
        if (action?.dataset?.orderId) return action.dataset.orderId;
        const text = card.querySelector(".staff-order-id strong")?.textContent || "";
        return text.replace(/[^0-9]/g, "") || null;
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-order-customizations-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/product-customizations.css";
        link.dataset.kantuOrderCustomizationsStyle = "true";
        document.head.appendChild(link);
    }

    async function fetchRows(orderId) {
        const id = String(orderId || "").trim();
        if (!id) return [];
        if (cache.has(id)) return cache.get(id);
        if (loading.has(id)) return loading.get(id);

        const request = (async () => {
            const { data, error } = await supabaseClient.rpc("get_order_item_customizations", {
                p_order_id: id
            });
            if (error) {
                const message = String(error.message || "");
                if (!/AUTHENTICATION_REQUIRED|ORDER_ACCESS_DENIED/.test(message)) {
                    console.warn("No se pudieron cargar las personalizaciones del pedido:", error);
                }
                cache.set(id, []);
                return [];
            }
            const rows = Array.isArray(data)
                ? data.filter(row => String(row?.customization || "").trim())
                : [];
            cache.set(id, rows);
            return rows;
        })().finally(() => loading.delete(id));

        loading.set(id, request);
        return request;
    }

    function markup(rows) {
        if (!rows?.length) return "";
        return `<div class="kantu-order-customizations" data-kantu-order-customizations="true">
            <div class="kantu-order-customizations-title"><span aria-hidden="true">✦</span><strong>Personalización del pedido</strong></div>
            ${rows.map(row => `<p><span>${core.escapeHtml(row.product_name || "Producto")}</span><strong>${core.escapeHtml(row.customization)}</strong></p>`).join("")}
        </div>`;
    }

    async function decorateCard(card, orderId, targetSelector) {
        if (!card || card.querySelector("[data-kantu-order-customizations]")) return;
        const rows = await fetchRows(orderId);
        const html = markup(rows);
        if (!html || !card.isConnected) return;
        const target = card.querySelector(targetSelector) || card;
        target.insertAdjacentHTML("beforeend", html);
    }

    async function decorateLists() {
        const jobs = [];
        document.querySelectorAll("#accountOrdersList .account-order-card").forEach(card => {
            const id = orderIdFromAccountCard(card);
            if (id) jobs.push(decorateCard(card, id, ".account-order-data"));
        });
        document.querySelectorAll("#adminOrdersList .admin-order-card").forEach(card => {
            const id = orderIdFromAdminCard(card);
            if (id) jobs.push(decorateCard(card, id, ".admin-order-grid"));
        });
        document.querySelectorAll(".staff-order-card").forEach(card => {
            const id = orderIdFromStaffCard(card);
            if (id) jobs.push(decorateCard(card, id, ".staff-side"));
        });
        await Promise.all(jobs);
    }

    async function decorateAccountDetail() {
        const detail = document.getElementById("accountOrderDetail");
        if (!detail || detail.querySelector("[data-kantu-order-customizations]")) return;
        const id = detail.querySelector("[data-order-receipt]")?.dataset?.orderReceipt;
        if (!id) return;
        const html = markup(await fetchRows(id));
        if (!html || !detail.isConnected) return;
        const giftMeta = detail.querySelector("[data-kantu-gift-meta]");
        if (giftMeta) giftMeta.insertAdjacentHTML("afterend", html);
        else detail.insertAdjacentHTML("beforeend", html);
    }

    async function decorateAdminDetail() {
        const detail = document.getElementById("adminOrderDetail");
        if (!detail || !activeAdminOrderId || detail.querySelector("[data-kantu-order-customizations]")) return;
        const html = markup(await fetchRows(activeAdminOrderId));
        if (!html || !detail.isConnected) return;
        const giftMeta = detail.querySelector("[data-kantu-gift-meta]");
        if (giftMeta) giftMeta.insertAdjacentHTML("afterend", html);
        else detail.insertAdjacentHTML("beforeend", html);
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
            decorateLists();
            decorateAccountDetail();
            decorateAdminDetail();
        }, 90);
    }

    function observeContainer(id) {
        const container = document.getElementById(id);
        if (!container) return;
        new MutationObserver(records => {
            const onlyOwn = records.every(record =>
                [...record.addedNodes].every(node =>
                    node.nodeType !== Node.ELEMENT_NODE
                    || node.matches?.("[data-kantu-order-customizations]")
                    || node.closest?.("[data-kantu-order-customizations]")
                )
            );
            if (!onlyOwn) scheduleRefresh();
        }).observe(container, { childList: true, subtree: true });
    }

    function initialize() {
        ensureStyles();
        document.addEventListener("click", event => {
            const adminButton = event.target.closest?.("[data-admin-order-detail]");
            if (adminButton) {
                activeAdminOrderId = String(adminButton.dataset.adminOrderDetail || "");
                window.setTimeout(decorateAdminDetail, 80);
            }
        }, true);

        [
            "accountOrdersList",
            "accountOrderDetail",
            "adminOrdersList",
            "adminOrderDetail",
            "staffPreparationOrders",
            "staffDeliveryOrders"
        ].forEach(observeContainer);

        supabaseClient.auth.onAuthStateChange(() => {
            cache.clear();
            loading.clear();
            scheduleRefresh();
        });
        scheduleRefresh();
    }

    window.KantuOrderCustomizationsUi = Object.freeze({
        refresh: () => {
            cache.clear();
            scheduleRefresh();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
