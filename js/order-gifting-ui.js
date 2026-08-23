/* Kantu Floral - presentación compartida de destinatario, regalo y programación */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const cache = new Map();
    let activeAdminOrderId = null;
    let refreshTimer = null;
    let staffRefreshAt = 0;

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-gifting-styles="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/gifting.css";
        link.dataset.kantuGiftingStyles = "true";
        document.head.appendChild(link);
    }

    function formatRequestedDate(value) {
        if (!value) return "Lo antes posible";
        const date = new Date(`${value}T12:00:00`);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat("es-PE", {
            dateStyle: "medium",
            timeZone: "America/Lima"
        }).format(date);
    }

    function scheduleText(row) {
        if (!row?.requested_delivery_date) return "Lo antes posible";
        const date = formatRequestedDate(row.requested_delivery_date);
        return row.requested_delivery_slot
            ? `${date} · ${row.requested_delivery_slot}`
            : date;
    }

    function hasGiftMetadata(row) {
        return Boolean(
            row?.recipient_name
            || row?.recipient_phone
            || row?.gift_message
            || row?.is_surprise
            || row?.requested_delivery_date
            || row?.requested_delivery_slot
        );
    }

    function renderMetadata(row, { showPhone = true } = {}) {
        if (!row || !hasGiftMetadata(row)) return "";

        return `<div class="kantu-gift-meta" data-kantu-gift-meta="true">
            ${row.is_surprise ? '<span class="kantu-gift-badge">🎁 Entrega sorpresa</span>' : ""}
            ${row.recipient_name
                ? `<p class="kantu-gift-meta-row"><strong>Destinatario:</strong> ${core.escapeHtml(row.recipient_name)}</p>`
                : ""}
            ${showPhone && row.recipient_phone
                ? `<p class="kantu-gift-meta-row"><strong>Teléfono del destinatario:</strong> ${core.escapeHtml(row.recipient_phone)}</p>`
                : ""}
            <p class="kantu-gift-meta-row"><strong>Entrega solicitada:</strong> ${core.escapeHtml(scheduleText(row))}</p>
            ${row.gift_message
                ? `<p class="kantu-gift-meta-row kantu-gift-message"><strong>Mensaje para la tarjeta:</strong><br>${core.escapeHtml(row.gift_message)}</p>`
                : ""}
        </div>`;
    }

    async function loadOrderRows(ids) {
        const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
        const missing = uniqueIds.filter(id => !cache.has(id));
        if (!missing.length) return;

        const { data, error } = await supabaseClient
            .from("orders")
            .select("id, recipient_name, recipient_phone, gift_message, is_surprise, requested_delivery_date, requested_delivery_slot")
            .in("id", missing);

        if (error) return;
        (data || []).forEach(row => cache.set(String(row.id), row));
    }

    function extractOrderId(element, selector, datasetKey) {
        const control = element.querySelector(selector);
        return control?.dataset?.[datasetKey] ? String(control.dataset[datasetKey]) : null;
    }

    async function decorateAccountAndAdminLists() {
        const accountCards = [...document.querySelectorAll("#accountOrdersList .account-order-card")];
        const adminCards = [...document.querySelectorAll("#adminOrdersList .admin-order-card")];
        const ids = [
            ...accountCards.map(card => extractOrderId(card, "[data-order-id]", "orderId")),
            ...adminCards.map(card => extractOrderId(card, "[data-admin-order-detail]", "adminOrderDetail"))
        ].filter(Boolean);

        await loadOrderRows(ids);

        accountCards.forEach(card => {
            if (card.querySelector("[data-kantu-gift-meta]")) return;
            const id = extractOrderId(card, "[data-order-id]", "orderId");
            const markup = renderMetadata(cache.get(String(id)));
            if (!markup) return;
            const target = card.querySelector(".account-order-data") || card;
            target.insertAdjacentHTML("beforeend", markup);
        });

        adminCards.forEach(card => {
            if (card.querySelector("[data-kantu-gift-meta]")) return;
            const id = extractOrderId(card, "[data-admin-order-detail]", "adminOrderDetail");
            const markup = renderMetadata(cache.get(String(id)));
            if (!markup) return;
            const target = card.querySelector(".admin-order-grid") || card;
            target.insertAdjacentHTML("beforeend", markup);
        });
    }

    async function decorateAccountDetail() {
        const detail = document.getElementById("accountOrderDetail");
        if (!detail || detail.querySelector("[data-kantu-gift-meta]")) return;
        const id = detail.querySelector("[data-order-receipt]")?.dataset?.orderReceipt;
        if (!id) return;
        await loadOrderRows([id]);
        const markup = renderMetadata(cache.get(String(id)));
        if (!markup) return;
        const target = detail.querySelector(".account-delivery-summary") || detail;
        target.insertAdjacentHTML("afterend", markup);
    }

    async function decorateAdminDetail() {
        const detail = document.getElementById("adminOrderDetail");
        if (!detail || !activeAdminOrderId || detail.querySelector("[data-kantu-gift-meta]")) return;
        await loadOrderRows([activeAdminOrderId]);
        const markup = renderMetadata(cache.get(String(activeAdminOrderId)));
        if (!markup) return;
        const location = detail.querySelector(".admin-detail-location");
        if (location) location.insertAdjacentHTML("afterend", markup);
        else detail.insertAdjacentHTML("afterbegin", markup);
    }

    function getStaffOrderId(card) {
        const action = card.querySelector("[data-order-id]");
        if (action?.dataset?.orderId) return String(action.dataset.orderId);
        const text = card.querySelector(".staff-order-id strong")?.textContent || "";
        const value = text.replace(/[^0-9]/g, "");
        return value || null;
    }

    async function loadStaffGiftRows() {
        const now = Date.now();
        if (now - staffRefreshAt < 1000) return;
        staffRefreshAt = now;

        const { data, error } = await supabaseClient.rpc("staff_get_order_gift_details");
        if (error) return;
        (data || []).forEach(row => cache.set(String(row.order_id), row));
    }

    async function decorateStaff() {
        const cards = [...document.querySelectorAll(".staff-order-card")];
        if (!cards.length) return;
        await loadStaffGiftRows();

        cards.forEach(card => {
            if (card.querySelector("[data-kantu-gift-meta]")) return;
            const id = getStaffOrderId(card);
            const row = cache.get(String(id));
            const markup = renderMetadata(row, { showPhone: Boolean(row?.recipient_phone) });
            if (!markup) return;
            const side = card.querySelector(".staff-side") || card.querySelector(".staff-order-body") || card;
            const actions = side.querySelector(".staff-actions");
            if (actions) actions.insertAdjacentHTML("beforebegin", markup);
            else side.insertAdjacentHTML("beforeend", markup);
        });
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(async () => {
            await decorateAccountAndAdminLists();
            await decorateAccountDetail();
            await decorateAdminDetail();
            await decorateStaff();
        }, 80);
    }

    function observe(id) {
        const element = document.getElementById(id);
        if (!element) return;
        new MutationObserver(mutations => {
            const onlyOwnDecorations = mutations.every(mutation =>
                [...mutation.addedNodes].every(node =>
                    node.nodeType !== Node.ELEMENT_NODE
                    || node.matches?.("[data-kantu-gift-meta]")
                    || node.closest?.("[data-kantu-gift-meta]")
                )
            );
            if (!onlyOwnDecorations) scheduleRefresh();
        }).observe(element, { childList: true, subtree: true });
    }

    function initialize() {
        ensureStyles();

        document.addEventListener("click", event => {
            const adminButton = event.target.closest?.("[data-admin-order-detail]");
            if (adminButton) activeAdminOrderId = String(adminButton.dataset.adminOrderDetail || "");
        }, true);

        [
            "accountOrdersList",
            "accountOrderDetail",
            "adminOrdersList",
            "adminOrderDetail",
            "staffPreparationOrders",
            "staffDeliveryOrders"
        ].forEach(observe);

        scheduleRefresh();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
