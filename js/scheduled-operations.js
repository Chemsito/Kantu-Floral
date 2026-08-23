/* Kantu Floral - agenda operativa para pedidos programados */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let adminAgendaLoading = false;
    let staffGiftRows = new Map();
    let staffDecorateTimer = null;
    let staffLastFetchAt = 0;

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (
            document.querySelector('link[data-kantu-scheduled-operations-style="true"]')
            || document.querySelector('link[href="css/scheduled-operations.css"]')
        ) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/scheduled-operations.css";
        link.dataset.kantuScheduledOperationsStyle = "true";
        document.head.appendChild(link);
    }

    function limaDateParts(date = new Date()) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Lima",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(date);
        const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${map.year}-${map.month}-${map.day}`;
    }

    function limaClock(date = new Date()) {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Lima",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(date);
        const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${map.hour}:${map.minute}`;
    }

    function addDays(iso, days) {
        const [year, month, day] = String(iso || "").split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(`${value}T12:00:00Z`);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat("es-PE", {
            dateStyle: "medium",
            timeZone: "America/Lima"
        }).format(date);
    }

    function formatSlot(value) {
        const [start, end] = String(value || "").split("-");
        return start && end ? `${start} – ${end}` : String(value || "");
    }

    function relativeDateLabel(value) {
        const today = limaDateParts();
        if (value === today) return "Hoy";
        if (value === addDays(today, 1)) return "Mañana";
        return formatDate(value);
    }

    function timingState(row) {
        if (!row?.requested_delivery_date) return "asap";
        const today = limaDateParts();
        if (row.requested_delivery_date < today) return "overdue";
        if (row.requested_delivery_date > today) {
            return row.requested_delivery_date === addDays(today, 1) ? "tomorrow" : "future";
        }

        const end = String(row.requested_delivery_slot || "").split("-")[1] || "";
        if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end) && end < limaClock()) return "overdue";
        return "today";
    }

    function timingStateLabel(state) {
        return ({
            overdue: "Ventana vencida",
            today: "Entrega hoy",
            tomorrow: "Entrega mañana",
            future: "Programado",
            asap: "Lo antes posible"
        })[state] || "Programado";
    }

    function ensureAdminAgendaCard() {
        const dashboard = el("adminDashboardView");
        if (!dashboard) return null;
        let card = el("adminDeliveryAgendaCard");
        if (card) return card;

        card = document.createElement("section");
        card.id = "adminDeliveryAgendaCard";
        card.className = "admin-delivery-agenda-card";
        card.hidden = true;
        card.innerHTML = `
            <div class="admin-delivery-agenda-heading">
                <div>
                    <h4>Agenda de entregas</h4>
                    <p>Próximos 14 días. Solo pedidos con pago aprobado y una fecha programada.</p>
                </div>
                <button id="adminDeliveryAgendaRefresh" type="button" class="admin-refresh">Actualizar</button>
            </div>
            <div id="adminDeliveryAgendaContent"><div class="admin-loader">Cargando agenda...</div></div>
        `;

        const anchor = el("adminScheduleCard") || el("commerceOverviewCard") || el("adminStatsGrid");
        if (anchor) anchor.insertAdjacentElement("afterend", card);
        else dashboard.appendChild(card);
        el("adminDeliveryAgendaRefresh")?.addEventListener("click", loadAdminAgenda);
        return card;
    }

    function agendaStatusText(row) {
        const chunks = [];
        const values = [
            ["confirmados", row.confirmed_count],
            ["preparando", row.preparing_count],
            ["listos", row.ready_count],
            ["en camino", row.in_transit_count],
            ["entregados", row.delivered_count]
        ];
        values.forEach(([label, value]) => {
            const count = Number(value) || 0;
            if (count) chunks.push(`${count} ${label}`);
        });
        return chunks.join(" · ") || "Sin actividad pendiente";
    }

    function renderAdminAgenda(rows) {
        const content = el("adminDeliveryAgendaContent");
        const card = ensureAdminAgendaCard();
        if (!content || !card) return;
        card.hidden = false;

        const values = Array.isArray(rows) ? rows : [];
        content.innerHTML = values.length
            ? `<div class="admin-delivery-agenda-list">${values.map(row => `
                <article class="admin-delivery-agenda-row">
                    <div>
                        <strong>${core.escapeHtml(relativeDateLabel(row.delivery_date))}</strong>
                        <span>${core.escapeHtml(formatSlot(row.delivery_slot) || "Sin franja")}</span>
                    </div>
                    <div>
                        <strong>${Number(row.order_count) || 0} ${Number(row.order_count) === 1 ? "pedido" : "pedidos"}</strong>
                        <small>${core.escapeHtml(agendaStatusText(row))}</small>
                    </div>
                </article>`).join("")}</div>`
            : '<p class="scheduled-operations-empty">No hay entregas programadas con pago aprobado en los próximos 14 días.</p>';
    }

    async function loadAdminAgenda() {
        if (adminAgendaLoading || !ensureAdminAgendaCard()) return null;
        adminAgendaLoading = true;
        const content = el("adminDeliveryAgendaContent");
        if (content) content.innerHTML = '<div class="admin-loader">Cargando agenda...</div>';

        const { data, error } = await supabaseClient.rpc("admin_delivery_agenda", { p_days: 14 });
        adminAgendaLoading = false;
        if (error) {
            const card = el("adminDeliveryAgendaCard");
            if (card) card.hidden = true;
            return null;
        }

        renderAdminAgenda(data || []);
        return data || [];
    }

    function staffOrderId(card) {
        const action = card.querySelector("[data-order-id]");
        if (action?.dataset?.orderId) return String(action.dataset.orderId);
        const text = card.querySelector(".staff-order-id strong")?.textContent || "";
        return text.replace(/[^0-9]/g, "") || null;
    }

    async function loadStaffScheduleRows({ force = false } = {}) {
        if (!document.querySelector(".staff-order-card") && !force) return staffGiftRows;
        if (!force && Date.now() - staffLastFetchAt < 900) return staffGiftRows;
        staffLastFetchAt = Date.now();

        const { data, error } = await supabaseClient.rpc("staff_get_order_gift_details");
        if (error) return staffGiftRows;
        staffGiftRows = new Map((data || []).map(row => [String(row.order_id), row]));
        return staffGiftRows;
    }

    function renderStaffScheduleSummary() {
        const app = el("staffApp");
        const stats = el("staffStats");
        if (!app || !stats) return;
        let summary = el("staffScheduleSummary");
        if (!summary) {
            summary = document.createElement("section");
            summary.id = "staffScheduleSummary";
            summary.className = "staff-schedule-summary";
            summary.setAttribute("aria-label", "Resumen de entregas programadas");
            stats.insertAdjacentElement("afterend", summary);
        }

        const scheduled = [...staffGiftRows.values()].filter(row => row.requested_delivery_date);
        const counts = scheduled.reduce((acc, row) => {
            const state = timingState(row);
            if (state === "overdue") acc.overdue += 1;
            else if (state === "today") acc.today += 1;
            else acc.future += 1;
            return acc;
        }, { overdue: 0, today: 0, future: 0 });

        summary.hidden = scheduled.length === 0;
        summary.innerHTML = scheduled.length
            ? `
                <div><span>Programados hoy</span><strong>${counts.today}</strong></div>
                <div class="${counts.overdue ? "urgent" : ""}"><span>Ventana vencida</span><strong>${counts.overdue}</strong></div>
                <div><span>Próximos</span><strong>${counts.future}</strong></div>
            `
            : "";
    }

    function decorateStaffCards() {
        document.querySelectorAll(".staff-order-card").forEach(card => {
            const id = staffOrderId(card);
            const row = id ? staffGiftRows.get(String(id)) : null;
            if (!row?.requested_delivery_date) return;

            const state = timingState(row);
            card.classList.toggle("scheduled-overdue", state === "overdue");
            let strip = card.querySelector("[data-scheduled-operation]");
            if (!strip) {
                strip = document.createElement("div");
                strip.dataset.scheduledOperation = "true";
                strip.className = "staff-scheduled-operation";
                const top = card.querySelector(".staff-order-top");
                if (top) top.insertAdjacentElement("afterend", strip);
                else card.prepend(strip);
            }
            strip.className = `staff-scheduled-operation ${state}`;
            strip.innerHTML = `
                <span>${core.escapeHtml(timingStateLabel(state))}</span>
                <strong>${core.escapeHtml(relativeDateLabel(row.requested_delivery_date))}${row.requested_delivery_slot ? ` · ${core.escapeHtml(formatSlot(row.requested_delivery_slot))}` : ""}</strong>
            `;
        });

        renderStaffScheduleSummary();
        const subtitle = el("staffSubtitle");
        if (subtitle) subtitle.textContent = "Los pedidos se priorizan por la entrega solicitada; los pedidos inmediatos conservan su orden por pago.";
        const prepHint = document.querySelector("#staffPreparationSection .staff-auto-refresh");
        if (prepHint) prepHint.textContent = "Prioridad por entrega solicitada · ETA de armado 30 min";
    }

    async function refreshStaffScheduledOperations({ force = false } = {}) {
        await loadStaffScheduleRows({ force });
        decorateStaffCards();
    }

    function scheduleStaffRefresh() {
        window.clearTimeout(staffDecorateTimer);
        staffDecorateTimer = window.setTimeout(() => refreshStaffScheduledOperations(), 120);
    }

    function observeStaffContainer(id) {
        const container = el(id);
        if (!container) return;
        new MutationObserver(mutations => {
            const onlyOwn = mutations.every(mutation => [...mutation.addedNodes].every(node =>
                node.nodeType !== Node.ELEMENT_NODE
                || node.matches?.("[data-scheduled-operation]")
                || node.closest?.("[data-scheduled-operation]")
            ));
            if (!onlyOwn) scheduleStaffRefresh();
        }).observe(container, { childList: true, subtree: true });
    }

    function initialize() {
        ensureStyles();
        ensureAdminAgendaCard();
        loadAdminAgenda();

        ["staffPreparationOrders", "staffDeliveryOrders"].forEach(observeStaffContainer);
        el("staffRefresh")?.addEventListener("click", () => window.setTimeout(() => refreshStaffScheduledOperations({ force: true }), 250));
        refreshStaffScheduledOperations({ force: true });

        document.querySelector('[data-admin-view="dashboard"]')?.addEventListener("click", () => window.setTimeout(loadAdminAgenda, 0));
        el("accountAdminButton")?.addEventListener("click", () => window.setTimeout(loadAdminAgenda, 450));
    }

    window.KantuScheduledOperations = Object.freeze({
        refreshAdminAgenda: loadAdminAgenda,
        refreshStaff: () => refreshStaffScheduledOperations({ force: true })
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
