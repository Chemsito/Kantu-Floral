/* =====================================================
   KANTU FLORAL
   admin-dashboard-pro.js
   Shell del panel administrador (sidebar + topbar) y
   dashboard analítico con métricas, gráficos SVG y
   actividad en vivo vía Supabase Realtime.
   Datos: RPC public.admin_dashboard_analytics (solo admin).
===================================================== */

(() => {
    if (window.KantuAdminDashboardPro) return;

    const RANGES = [7, 30, 90];
    const STATUS_ORDER = ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"];
    const STATUS_COLORS = {
        pendiente: "#c9a26b",
        confirmado: "#7b1e3a",
        preparando: "#b5577a",
        en_camino: "#4f6fa8",
        entregado: "#55684b",
        cancelado: "#b8aaa6"
    };
    const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const NAV_SECTIONS = {
        dashboard: "General",
        alerts: "General",
        orders: "Ventas",
        payments: "Ventas",
        claims: "Atención",
        products: "Catálogo",
        inventory: "Catálogo",
        promotions: "Catálogo",
        settings: "Configuración"
    };

    const state = {
        days: 30,
        data: null,
        loading: false,
        error: null,
        channel: null,
        live: false,
        feed: [],
        reloadTimer: 0,
        requestId: 0
    };

    const el = id => document.getElementById(id);
    const core = () => window.KantuCore || {};

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    function safeImage(url) {
        if (typeof core().safeUrl === "function") return core().safeUrl(url) || "";
        try {
            const parsed = new URL(String(url || ""), window.location.href);
            return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
        } catch {
            return "";
        }
    }

    const moneyFormatter = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const compactFormatter = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });
    const intFormatter = new Intl.NumberFormat("es-PE");

    const money = value => `S/ ${moneyFormatter.format(Number(value) || 0)}`;
    const moneyCompact = value => {
        const number = Number(value) || 0;
        return number >= 10000 ? `S/ ${compactFormatter.format(number)}` : money(number);
    };
    const integer = value => intFormatter.format(Number(value) || 0);

    function statusLabel(status) {
        return core().orderStatusLabels?.[status] || String(status || "—").replace(/_/g, " ");
    }

    function providerLabel(provider) {
        return core().paymentMethodLabels?.[provider] || (provider === "otro" ? "Otro" : String(provider || "Otro"));
    }

    function categoryLabel(category) {
        if (typeof getCategoryName === "function") return getCategoryName(category);
        return String(category || "Otros");
    }

    function delta(current, previous) {
        const cur = Number(current) || 0;
        const prev = Number(previous) || 0;
        if (!prev && !cur) return { text: "Sin cambios", tone: "flat" };
        if (!prev) return { text: "Nuevo", tone: "up" };
        const pct = ((cur - prev) / prev) * 100;
        const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10;
        if (Math.abs(rounded) < .1) return { text: "0%", tone: "flat" };
        return { text: `${rounded > 0 ? "+" : ""}${rounded}%`, tone: rounded > 0 ? "up" : "down" };
    }

    function limaParts(date = new Date()) {
        const parts = new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima", hour: "numeric", hour12: false,
            weekday: "long", day: "numeric", month: "long"
        }).formatToParts(date);
        const get = type => parts.find(part => part.type === type)?.value || "";
        return { hour: Number(get("hour")) || 0, weekday: get("weekday"), day: get("day"), month: get("month") };
    }

    function greeting() {
        const { hour } = limaParts();
        if (hour < 12) return "Buenos días";
        if (hour < 19) return "Buenas tardes";
        return "Buenas noches";
    }

    function adminName() {
        try {
            // eslint-disable-next-line no-undef
            const user = typeof adminAuthorizedUser !== "undefined" ? adminAuthorizedUser : null;
            const name = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
            if (name) return String(name).split(" ")[0];
            const email = user?.email || "";
            return email ? email.split("@")[0] : "";
        } catch {
            return "";
        }
    }

    function relativeTime(value) {
        const time = new Date(value).getTime();
        if (!Number.isFinite(time)) return "";
        const seconds = Math.round((Date.now() - time) / 1000);
        if (seconds < 45) return "hace un momento";
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `hace ${minutes} min`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `hace ${hours} h`;
        const days = Math.round(hours / 24);
        return days === 1 ? "ayer" : `hace ${days} días`;
    }

    function shortDate(value) {
        const date = new Date(`${value}T12:00:00`);
        return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" }).format(date).replace(".", "");
    }

    /* =====================================================
       SHELL: sidebar, topbar y vista de configuración
    ===================================================== */
    function ensureShell() {
        const modal = el("adminModal");
        const nav = document.querySelector("#adminModal .admin-nav");
        if (!modal || !nav) return false;
        modal.classList.add("kf-admin");

        if (!nav.querySelector(".kf-admin-brand")) {
            const brand = document.createElement("div");
            brand.className = "kf-admin-brand";
            brand.innerHTML = `
                <img src="assets/brand/kantu-mark-512.png" alt="" width="38" height="38">
                <span><strong>Kantu Floral</strong><small>Centro de control</small></span>
            `;
            nav.prepend(brand);
        }

        if (!nav.querySelector('[data-admin-view="settings"]')) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = "settings";
            button.textContent = "Entregas y horarios";
            nav.appendChild(button);
            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView("settings");
                adoptSettingsCards();
            });
        }

        if (!nav.querySelector(".kf-admin-nav-footer")) {
            const footer = document.createElement("div");
            footer.className = "kf-admin-nav-footer";
            footer.innerHTML = `
                <a href="staff.html" target="_blank" rel="noopener" class="kf-admin-nav-link">
                    <span class="kf-live-dot" aria-hidden="true"></span> Operaciones en vivo
                </a>
                <a href="index.html" class="kf-admin-nav-link kf-admin-nav-store">Ver tienda</a>
            `;
            nav.appendChild(footer);
        }

        const content = el("adminContent");
        if (content && !el("adminSettingsView")) {
            const view = document.createElement("section");
            view.id = "adminSettingsView";
            view.className = "admin-view";
            view.hidden = true;
            view.innerHTML = `
                <div class="admin-section-heading">
                    <div><h3>Entregas y horarios</h3><p>Programación de entregas, franjas horarias, capacidad y fechas bloqueadas.</p></div>
                </div>
                <div id="kfSettingsSlot"></div>
            `;
            content.appendChild(view);
        }

        groupNavSections(nav);
        syncTopbarTitle();
        return true;
    }

    function groupNavSections(nav) {
        let previous = "";
        nav.querySelectorAll(".admin-nav-button").forEach(button => {
            const section = NAV_SECTIONS[button.dataset.adminView] || "Más";
            if (section !== previous) {
                button.dataset.kfSection = section;
                previous = section;
            } else {
                delete button.dataset.kfSection;
            }
        });
    }

    function adoptSettingsCards() {
        const slot = el("kfSettingsSlot");
        if (!slot) return;
        // La disponibilidad de entregas vive dentro de la tarjeta de horarios.
        const card = el("adminScheduleCard");
        if (card && card.parentElement !== slot) slot.appendChild(card);
    }

    function syncTopbarTitle() {
        const title = el("adminTitle");
        const active = document.querySelector("#adminModal .admin-nav-button.active");
        if (!title || !active) return;
        const label = active.textContent.replace(/\d+/g, "").trim();
        title.textContent = label === "Dashboard" ? "Resumen general" : label;
        const eyebrow = document.querySelector("#adminModal .admin-eyebrow");
        if (eyebrow) eyebrow.textContent = NAV_SECTIONS[active.dataset.adminView] || "Kantu Floral";
    }

    /* =====================================================
       DASHBOARD
    ===================================================== */
    function ensureDashboard() {
        const view = el("adminDashboardView");
        if (!view) return null;
        view.classList.add("kf-dashboard-view");
        let root = el("kfDashboard");
        if (root) return root;

        root = document.createElement("div");
        root.id = "kfDashboard";
        root.className = "kf-dash";
        root.innerHTML = `
            <header class="kf-dash-hero">
                <div>
                    <p class="kf-dash-date" id="kfDashDate"></p>
                    <h3 id="kfDashGreeting">Hola</h3>
                    <p class="kf-dash-sub">Así va Kantu Floral. Las cifras consideran solo pagos aprobados.</p>
                </div>
                <div class="kf-dash-controls">
                    <span class="kf-live" id="kfLiveBadge" data-state="off"><span class="kf-live-dot" aria-hidden="true"></span><span id="kfLiveText">Conectando…</span></span>
                    <div class="kf-segment" role="group" aria-label="Periodo del dashboard">
                        ${RANGES.map(days => `<button type="button" data-kf-range="${days}" aria-pressed="${days === state.days}">${days} días</button>`).join("")}
                    </div>
                    <button type="button" class="kf-icon-btn" id="kfDashExport" title="Descargar CSV" aria-label="Descargar ventas diarias en CSV">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
                    </button>
                    <button type="button" class="kf-icon-btn" id="kfDashRefresh" title="Actualizar" aria-label="Actualizar dashboard">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>
                    </button>
                </div>
            </header>
            <div id="kfDashBody" class="kf-dash-body" aria-live="polite"></div>
        `;
        view.prepend(root);

        root.addEventListener("click", event => {
            const range = event.target.closest("[data-kf-range]");
            if (range) {
                state.days = Number(range.dataset.kfRange) || 30;
                root.querySelectorAll("[data-kf-range]").forEach(button =>
                    button.setAttribute("aria-pressed", String(Number(button.dataset.kfRange) === state.days)));
                loadDashboard();
                return;
            }
            if (event.target.closest("#kfDashRefresh")) {
                loadDashboard();
                if (typeof loadAdminDashboard === "function") loadAdminDashboard();
                return;
            }
            if (event.target.closest("#kfDashExport")) {
                exportCsv();
                return;
            }
            const go = event.target.closest("[data-kf-go]");
            if (go) {
                const target = go.dataset.kfGo;
                if (target === "staff") {
                    window.open("staff.html", "_blank", "noopener");
                } else if (typeof switchAdminView === "function") {
                    document.querySelector(`#adminModal [data-admin-view="${target}"]`)?.click();
                    if (target === "orders" && go.dataset.kfFilter) {
                        const filter = el("adminOrderFilter");
                        if (filter) {
                            filter.value = go.dataset.kfFilter;
                            filter.dispatchEvent(new Event("change", { bubbles: true }));
                        }
                    }
                }
            }
        });

        root.addEventListener("pointermove", handleChartHover);
        root.addEventListener("pointerleave", () => hideTooltip());
        return root;
    }

    function renderHeaderText() {
        const date = el("kfDashDate");
        const hello = el("kfDashGreeting");
        const { weekday, day, month } = limaParts();
        if (date) date.textContent = `${weekday} ${day} de ${month}`;
        const name = adminName();
        if (hello) hello.textContent = `${greeting()}${name ? `, ${name}` : ""}`;
    }

    function renderSkeleton() {
        const body = el("kfDashBody");
        if (!body) return;
        body.innerHTML = `
            <div class="kf-grid kf-grid-kpi">${Array.from({ length: 4 }, () => '<div class="kf-card kf-skeleton" style="height:148px"></div>').join("")}</div>
            <div class="kf-grid kf-grid-main">
                <div class="kf-card kf-skeleton" style="height:360px"></div>
                <div class="kf-card kf-skeleton" style="height:360px"></div>
            </div>
        `;
    }

    function renderError(message) {
        const body = el("kfDashBody");
        if (!body) return;
        body.innerHTML = `
            <div class="kf-card kf-dash-error">
                <strong>No pudimos cargar las métricas</strong>
                <p>${escapeHtml(message)}</p>
                <button type="button" class="kf-btn-mini" id="kfDashRetry">Reintentar</button>
            </div>
        `;
        el("kfDashRetry")?.addEventListener("click", loadDashboard);
    }

    async function loadDashboard() {
        if (typeof supabaseClient === "undefined") return;
        const root = ensureDashboard();
        if (!root) return;
        renderHeaderText();
        const requestId = ++state.requestId;
        state.loading = true;
        if (!state.data) renderSkeleton();
        root.classList.add("is-loading");

        const { data, error } = await supabaseClient.rpc("admin_dashboard_analytics", { p_days: state.days });
        if (requestId !== state.requestId) return;
        state.loading = false;
        root.classList.remove("is-loading");

        if (error || !data) {
            console.error("Kantu dashboard:", error);
            const denied = error?.code === "42501" || /ADMIN_REQUIRED/.test(error?.message || "");
            renderError(denied
                ? "Tu cuenta no tiene permisos de administrador."
                : "Revisa tu conexión e inténtalo nuevamente.");
            return;
        }

        state.data = data;
        if (!state.feed.length) {
            state.feed = (data.recent_orders || []).map(order => ({
                kind: "order",
                id: order.id,
                title: `Pedido #${order.id}`,
                detail: `${order.customer_name || "Cliente"} · ${money(order.total)}`,
                status: order.status,
                at: order.created_at
            }));
        }
        renderDashboard(data);
    }

    function scheduleReload(delay = 2500) {
        window.clearTimeout(state.reloadTimer);
        state.reloadTimer = window.setTimeout(() => {
            if (isDashboardVisible()) loadDashboard();
        }, delay);
    }

    function renderDashboard(data) {
        const body = el("kfDashBody");
        if (!body) return;
        const k = data.kpis || {};
        const series = Array.isArray(data.series) ? data.series : [];
        const avgTicket = k.paid_orders ? k.revenue / k.paid_orders : 0;
        const avgTicketPrev = k.paid_orders_prev ? k.revenue_prev / k.paid_orders_prev : 0;
        const conversion = k.orders ? Math.round((k.paid_orders / k.orders) * 100) : 0;

        const kpis = [
            {
                key: "revenue", label: "Ingresos", value: moneyCompact(k.revenue), raw: k.revenue,
                delta: delta(k.revenue, k.revenue_prev), spark: series.map(row => Number(row.revenue) || 0),
                foot: `${money(k.delivery_fees)} en delivery · ${money(k.discounts)} en descuentos`,
                icon: '<path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.1 5 1.3 5 3.3-2.2 3.1-5 3.1-5-1.2-5-3.1"/>'
            },
            {
                key: "orders", label: "Pedidos", value: integer(k.orders), raw: k.orders,
                delta: delta(k.orders, k.orders_prev), spark: series.map(row => Number(row.orders) || 0),
                foot: `${integer(k.paid_orders)} pagados · ${conversion}% de conversión · ${integer(k.cancelled)} cancelados`,
                icon: '<path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>'
            },
            {
                key: "ticket", label: "Ticket promedio", value: money(avgTicket), raw: avgTicket,
                delta: delta(avgTicket, avgTicketPrev), spark: series.map(row => Number(row.orders) ? (Number(row.revenue) || 0) / Number(row.orders) : 0),
                foot: k.avg_fulfillment_minutes ? `Entrega promedio: ${integer(k.avg_fulfillment_minutes)} min desde el pago` : "Valor medio por pedido pagado",
                icon: '<path d="M4 7h16v10H4z"/><circle cx="12" cy="12" r="2.5"/><path d="M7 7V5h10v2"/>'
            },
            {
                key: "customers", label: "Clientes", value: integer(k.customers), raw: k.customers,
                delta: delta(k.customers, k.customers_prev), spark: [],
                foot: `${integer(data.customers?.repeat)} recurrentes · ${integer(data.customers?.new_in_range)} cuentas nuevas`,
                icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'
            }
        ];

        const pending = data.pending || {};
        const pipeline = [
            { label: "Comprobantes por revisar", value: pending.payment_proofs, go: "payments", tone: pending.payment_proofs ? "warn" : "ok" },
            { label: "Pedidos sin pagar", value: pending.unpaid_orders, go: "orders", filter: "pendiente", tone: pending.unpaid_orders ? "info" : "ok" },
            { label: "Por preparar", value: pending.to_prepare, go: "staff", tone: pending.to_prepare ? "brand" : "ok" },
            { label: "En camino", value: pending.in_delivery, go: "staff", tone: pending.in_delivery ? "blue" : "ok" }
        ];

        body.innerHTML = `
            <section class="kf-pipeline" aria-label="Operación en este momento">
                ${pipeline.map(item => `
                    <button type="button" class="kf-pipe kf-pipe-${item.tone}" data-kf-go="${item.go}" ${item.filter ? `data-kf-filter="${item.filter}"` : ""}>
                        <strong>${integer(item.value)}</strong>
                        <span>${escapeHtml(item.label)}</span>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                    </button>
                `).join("")}
            </section>

            <section class="kf-grid kf-grid-kpi" aria-label="Indicadores principales">
                ${kpis.map(kpi => `
                    <article class="kf-card kf-kpi kf-kpi-${kpi.key}">
                        <div class="kf-kpi-top">
                            <span class="kf-kpi-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${kpi.icon}</svg></span>
                            <span class="kf-delta kf-delta-${kpi.delta.tone}" title="Frente a los ${data.range?.days || state.days} días anteriores">${escapeHtml(kpi.delta.text)}</span>
                        </div>
                        <p class="kf-kpi-label">${escapeHtml(kpi.label)}</p>
                        <p class="kf-kpi-value">${escapeHtml(kpi.value)}</p>
                        ${kpi.spark.length ? sparkline(kpi.spark) : '<div class="kf-spark-spacer"></div>'}
                        <p class="kf-kpi-foot">${escapeHtml(kpi.foot)}</p>
                    </article>
                `).join("")}
            </section>

            <section class="kf-grid kf-grid-main">
                <article class="kf-card kf-chart-card">
                    <header class="kf-card-head">
                        <div>
                            <h4>Ventas del periodo</h4>
                            <p>${escapeHtml(shortDate(data.range?.start))} – ${escapeHtml(shortDate(data.range?.end))} · comparado con el periodo anterior</p>
                        </div>
                        <div class="kf-legend">
                            <span><i style="background:var(--kfa-brand)"></i>Actual</span>
                            <span><i class="kf-legend-dash"></i>Anterior</span>
                        </div>
                    </header>
                    <div class="kf-chart-wrap" id="kfRevenueChart">${revenueChart(series, data.series_prev || [])}</div>
                </article>

                <article class="kf-card">
                    <header class="kf-card-head"><div><h4>Estado de pedidos</h4><p>Todos los pedidos creados en el periodo</p></div></header>
                    ${statusDonut(data.status || {})}
                </article>
            </section>

            <section class="kf-grid kf-grid-three">
                <article class="kf-card">
                    <header class="kf-card-head"><div><h4>Más vendidos</h4><p>Por ingresos del periodo</p></div>
                        <button type="button" class="kf-link" data-kf-go="products">Catálogo</button></header>
                    ${topProducts(data.top_products || [])}
                </article>
                <article class="kf-card">
                    <header class="kf-card-head"><div><h4>Ventas por categoría</h4><p>Participación en ingresos</p></div></header>
                    ${categoryBars(data.categories || [])}
                    <div class="kf-divider"></div>
                    <header class="kf-card-head kf-card-head-sm"><div><h4>Medios de pago</h4></div></header>
                    ${providerBars(data.providers || [])}
                </article>
                <article class="kf-card kf-feed-card">
                    <header class="kf-card-head"><div><h4>Actividad en vivo</h4><p>Pedidos y comprobantes en tiempo real</p></div>
                        <span class="kf-live kf-live-sm" data-state="${state.live ? "on" : "off"}"><span class="kf-live-dot"></span></span></header>
                    <ol class="kf-feed" id="kfFeed">${feedItems()}</ol>
                </article>
            </section>

            <section class="kf-grid kf-grid-bottom">
                <article class="kf-card">
                    <header class="kf-card-head"><div><h4>¿Cuándo compran tus clientes?</h4><p>Pedidos por día y hora (hora de Lima)</p></div></header>
                    ${heatmap(data.heatmap || [])}
                </article>
                <article class="kf-card">
                    <header class="kf-card-head"><div><h4>Inventario</h4><p>Productos activos del catálogo</p></div>
                        <button type="button" class="kf-link" data-kf-go="inventory">Ver inventario</button></header>
                    ${inventory(data.inventory || {}, data.low_stock_items || [])}
                </article>
            </section>
        `;
    }

    /* =====================================================
       COMPONENTES GRÁFICOS (SVG, sin dependencias)
    ===================================================== */
    function sparkline(values) {
        const width = 220;
        const height = 44;
        const max = Math.max(...values, 0);
        if (!values.length) return "";
        const step = values.length > 1 ? width / (values.length - 1) : width;
        const points = values.map((value, index) => [index * step, max ? height - 4 - (value / max) * (height - 8) : height - 4]);
        const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const area = `${line} L${width},${height} L0,${height} Z`;
        return `<svg class="kf-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
            <path class="kf-spark-area" d="${area}"/><path class="kf-spark-line" d="${line}"/>
        </svg>`;
    }

    function niceMax(value) {
        if (value <= 0) return 100;
        const exponent = Math.pow(10, Math.floor(Math.log10(value)));
        const fraction = value / exponent;
        const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
        return nice * exponent;
    }

    function revenueChart(series, previous) {
        const width = 760;
        const height = 260;
        const pad = { top: 16, right: 12, bottom: 30, left: 56 };
        const innerW = width - pad.left - pad.right;
        const innerH = height - pad.top - pad.bottom;
        const values = series.map(row => Number(row.revenue) || 0);
        const prevValues = previous.map(value => Number(value) || 0);
        const max = niceMax(Math.max(...values, ...prevValues, 0));
        const count = Math.max(values.length, 1);
        const step = count > 1 ? innerW / (count - 1) : innerW;
        const x = index => pad.left + index * step;
        const y = value => pad.top + innerH - (value / max) * innerH;

        const toPath = list => list.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
        const current = toPath(values);
        const area = values.length ? `${current} L${x(values.length - 1).toFixed(1)},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z` : "";
        const prev = prevValues.length === values.length ? toPath(prevValues) : "";

        const ticks = [0, .25, .5, .75, 1].map(fraction => {
            const value = max * fraction;
            const ty = y(value);
            return `<line class="kf-grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${ty}" y2="${ty}"/>
                <text class="kf-axis" x="${pad.left - 10}" y="${ty + 4}" text-anchor="end">${escapeHtml(value >= 1000 ? `${compactFormatter.format(value)}` : Math.round(value))}</text>`;
        }).join("");

        const labelEvery = Math.ceil(count / 7);
        const xLabels = series.map((row, index) => (index % labelEvery === 0 || index === count - 1)
            ? `<text class="kf-axis" x="${x(index)}" y="${height - 8}" text-anchor="middle">${escapeHtml(shortDate(row.date))}</text>`
            : "").join("");

        const hit = series.map((row, index) => {
            const left = index === 0 ? pad.left : x(index) - step / 2;
            const w = count > 1 ? step : innerW;
            return `<rect class="kf-hit" x="${left}" y="${pad.top}" width="${w}" height="${innerH}"
                data-kf-tip="${escapeHtml(`${shortDate(row.date)}|${money(row.revenue)}|${integer(row.orders)} pedidos|${money(prevValues[index] || 0)}`)}"
                data-kf-x="${x(index)}" data-kf-y="${y(values[index])}"/>`;
        }).join("");

        const total = values.reduce((sum, value) => sum + value, 0);
        const empty = total === 0
            ? `<div class="kf-chart-empty"><strong>Aún no hay ventas pagadas en este periodo</strong><span>Cuando se aprueben pagos verás aquí la tendencia diaria.</span></div>`
            : "";

        return `${empty}<svg class="kf-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos diarios del periodo">
            <defs>
                <linearGradient id="kfAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="var(--kfa-brand)" stop-opacity=".28"/>
                    <stop offset="100%" stop-color="var(--kfa-brand)" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${ticks}
            ${xLabels}
            ${prev ? `<path class="kf-line-prev" d="${prev}"/>` : ""}
            ${area ? `<path class="kf-area" d="${area}"/>` : ""}
            <path class="kf-line" d="${current}"/>
            <line class="kf-cursor" id="kfCursor" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + innerH}" visibility="hidden"/>
            <circle class="kf-cursor-dot" id="kfCursorDot" r="5" cx="0" cy="0" visibility="hidden"/>
            ${hit}
        </svg>
        <div class="kf-tooltip" id="kfTooltip" hidden></div>`;
    }

    function handleChartHover(event) {
        const target = event.target.closest?.("[data-kf-tip]");
        if (!target) {
            hideTooltip();
            return;
        }
        const wrap = target.closest(".kf-chart-wrap");
        const svg = target.ownerSVGElement;
        const tooltip = wrap?.querySelector("#kfTooltip");
        if (!wrap || !svg || !tooltip) return;
        const [date, revenue, orders, prev] = target.dataset.kfTip.split("|");
        const cx = Number(target.dataset.kfX);
        const cy = Number(target.dataset.kfY);
        const cursor = svg.querySelector("#kfCursor");
        const dot = svg.querySelector("#kfCursorDot");
        cursor?.setAttribute("x1", cx);
        cursor?.setAttribute("x2", cx);
        cursor?.setAttribute("visibility", "visible");
        dot?.setAttribute("cx", cx);
        dot?.setAttribute("cy", cy);
        dot?.setAttribute("visibility", "visible");

        tooltip.innerHTML = `<small>${escapeHtml(date)}</small><strong>${escapeHtml(revenue)}</strong><span>${escapeHtml(orders)}</span><span class="kf-tip-prev">Periodo anterior: ${escapeHtml(prev)}</span>`;
        tooltip.hidden = false;
        const box = svg.getBoundingClientRect();
        const wrapBox = wrap.getBoundingClientRect();
        const scale = box.width / svg.viewBox.baseVal.width;
        const left = box.left - wrapBox.left + cx * scale;
        const top = box.top - wrapBox.top + cy * scale;
        const flip = left > wrapBox.width * .65;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.classList.toggle("kf-tooltip-left", flip);
    }

    function hideTooltip() {
        const tooltip = el("kfTooltip");
        if (tooltip) tooltip.hidden = true;
        el("kfCursor")?.setAttribute("visibility", "hidden");
        el("kfCursorDot")?.setAttribute("visibility", "hidden");
    }

    function statusDonut(statusCounts) {
        const entries = STATUS_ORDER.map(status => [status, Number(statusCounts[status]) || 0]);
        Object.keys(statusCounts).forEach(status => {
            if (!STATUS_ORDER.includes(status)) entries.push([status, Number(statusCounts[status]) || 0]);
        });
        const total = entries.reduce((sum, [, value]) => sum + value, 0);
        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;
        const arcs = total ? entries.filter(([, value]) => value > 0).map(([status, value]) => {
            const length = (value / total) * circumference;
            const arc = `<circle class="kf-donut-seg" r="${radius}" cx="90" cy="90" stroke="${STATUS_COLORS[status] || "#999"}"
                stroke-dasharray="${Math.max(length - 2, 0)} ${circumference}" stroke-dashoffset="${-offset}"><title>${escapeHtml(statusLabel(status))}: ${value}</title></circle>`;
            offset += length;
            return arc;
        }).join("") : "";

        return `<div class="kf-donut">
            <svg viewBox="0 0 180 180" role="img" aria-label="Distribución de pedidos por estado">
                <circle class="kf-donut-track" r="${radius}" cx="90" cy="90"/>
                <g transform="rotate(-90 90 90)">${arcs}</g>
                <text x="90" y="86" text-anchor="middle" class="kf-donut-total">${integer(total)}</text>
                <text x="90" y="108" text-anchor="middle" class="kf-donut-caption">pedidos</text>
            </svg>
            <ul class="kf-donut-legend">
                ${entries.map(([status, value]) => `
                    <li><i style="background:${STATUS_COLORS[status] || "#999"}"></i><span>${escapeHtml(statusLabel(status))}</span>
                    <strong>${integer(value)}</strong><em>${total ? Math.round((value / total) * 100) : 0}%</em></li>
                `).join("")}
            </ul>
        </div>`;
    }

    function emptyState(title, text) {
        return `<div class="kf-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M12 10c-3-1-4-5-1-6 3-1 4 3 2 6M14 12c1-3 5-4 6-1 1 3-3 4-6 2M12 14c3 1 4 5 1 6-3 1-4-3-2-6M10 12c-1 3-5 4-6 1-1-3 3-4 6-2"/></svg><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
    }

    function topProducts(rows) {
        if (!rows.length) return emptyState("Sin ventas todavía", "Aquí aparecerán tus diseños más vendidos.");
        const max = Math.max(...rows.map(row => Number(row.revenue) || 0), 1);
        return `<ol class="kf-top">${rows.map((row, index) => {
            const image = safeImage(row.image);
            return `<li>
                <span class="kf-top-rank">${index + 1}</span>
                ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<span class="kf-top-img"></span>'}
                <div class="kf-top-body">
                    <div class="kf-top-row"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(money(row.revenue))}</span></div>
                    <div class="kf-bar"><i style="width:${((Number(row.revenue) || 0) / max) * 100}%"></i></div>
                    <small>${integer(row.units)} unidades · ${escapeHtml(categoryLabel(row.category))}</small>
                </div>
            </li>`;
        }).join("")}</ol>`;
    }

    function categoryBars(rows) {
        if (!rows.length) return emptyState("Sin datos de categorías", "Las categorías se calculan con pedidos pagados.");
        const total = rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0) || 1;
        return `<ul class="kf-hbars">${rows.slice(0, 6).map(row => {
            const pct = ((Number(row.revenue) || 0) / total) * 100;
            return `<li><div class="kf-hbar-label"><span>${escapeHtml(categoryLabel(row.category))}</span><strong>${pct.toFixed(0)}%</strong></div>
                <div class="kf-bar"><i style="width:${pct}%"></i></div></li>`;
        }).join("")}</ul>`;
    }

    function providerBars(rows) {
        if (!rows.length) return '<p class="kf-muted-note">Sin pagos aprobados en el periodo.</p>';
        const total = rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0) || 1;
        const palette = ["var(--kfa-brand)", "var(--kfa-gold)", "var(--kfa-sage)", "#4f6fa8"];
        return `<div class="kf-stack">${rows.map((row, index) =>
            `<i style="width:${((Number(row.revenue) || 0) / total) * 100}%;background:${palette[index % palette.length]}" title="${escapeHtml(providerLabel(row.provider))}"></i>`).join("")}</div>
            <ul class="kf-stack-legend">${rows.map((row, index) => `<li><i style="background:${palette[index % palette.length]}"></i>${escapeHtml(providerLabel(row.provider))}<strong>${escapeHtml(money(row.revenue))}</strong></li>`).join("")}</ul>`;
    }

    function heatmap(rows) {
        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        rows.forEach(row => {
            const dow = Number(row.dow) - 1;
            const hour = Number(row.hour);
            if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) grid[dow][hour] += Number(row.orders) || 0;
        });
        const max = Math.max(...grid.flat(), 0);
        let peak = null;
        grid.forEach((hours, dow) => hours.forEach((value, hour) => {
            if (value && (!peak || value > peak.value)) peak = { dow, hour, value };
        }));
        const cells = grid.map((hours, dow) => `
            <div class="kf-heat-row"><span class="kf-heat-day">${DOW_LABELS[dow]}</span>
                ${hours.map((value, hour) => `<i style="--kf-heat:${max ? (value / max).toFixed(2) : 0}" title="${DOW_LABELS[dow]} ${String(hour).padStart(2, "0")}:00 · ${value} pedidos"></i>`).join("")}
            </div>`).join("");
        const hoursAxis = `<div class="kf-heat-row kf-heat-axis"><span></span>${Array.from({ length: 24 }, (_, hour) => `<b>${hour % 3 === 0 ? hour : ""}</b>`).join("")}</div>`;
        const insight = peak
            ? `<p class="kf-insight">Tu hora pico es el <strong>${DOW_LABELS[peak.dow].toLowerCase()} a las ${String(peak.hour).padStart(2, "0")}:00</strong>. Programa promociones y personal para ese momento.</p>`
            : '<p class="kf-insight">Aún no hay suficientes pedidos para detectar tus horas pico.</p>';
        return `<div class="kf-heat">${cells}${hoursAxis}</div>${insight}`;
    }

    function inventory(info, lowItems) {
        const stats = [
            ["Activos", integer(info.active), ""],
            ["Stock bajo", integer(info.low_stock), info.low_stock ? "warn" : ""],
            ["Agotados", integer(info.out_of_stock), info.out_of_stock ? "danger" : ""],
            ["Valor en stock", moneyCompact(info.stock_value), ""]
        ];
        const list = lowItems.length
            ? `<ul class="kf-low">${lowItems.map(item => `<li><span>${escapeHtml(item.name)}</span><strong class="${Number(item.stock) <= 0 ? "danger" : "warn"}">${Number(item.stock) <= 0 ? "Agotado" : `${integer(item.stock)} u.`}</strong></li>`).join("")}</ul>`
            : '<p class="kf-ok-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> Todo el catálogo activo tiene stock saludable.</p>';
        return `<div class="kf-inv">${stats.map(([label, value, tone]) => `<div class="kf-inv-stat ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>${list}`;
    }

    function feedItems() {
        if (!state.feed.length) return `<li class="kf-feed-empty">${emptyState("Todo tranquilo por ahora", "Los nuevos pedidos y comprobantes aparecerán aquí al instante.")}</li>`;
        return state.feed.slice(0, 8).map(item => `
            <li class="kf-feed-item kf-feed-${escapeHtml(item.kind)}${item.fresh ? " is-fresh" : ""}">
                <span class="kf-feed-icon" aria-hidden="true">${item.kind === "proof"
                    ? '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/></svg>'
                    : '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>'}</span>
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.detail)}</span>
                </div>
                <div class="kf-feed-meta">
                    ${item.status ? `<em class="kf-status kf-status-${escapeHtml(item.status)}">${escapeHtml(item.kind === "proof" ? item.status : statusLabel(item.status))}</em>` : ""}
                    <time datetime="${escapeHtml(item.at)}">${escapeHtml(relativeTime(item.at))}</time>
                </div>
            </li>`).join("");
    }

    function refreshFeed() {
        const feed = el("kfFeed");
        if (feed) feed.innerHTML = feedItems();
        document.querySelectorAll(".kf-live").forEach(badge => badge.dataset.state = state.live ? "on" : "off");
        const text = el("kfLiveText");
        if (text) text.textContent = state.live ? "En vivo" : (state.liveStatus ? "Reconectando…" : "Conectando…");
    }

    function exportCsv() {
        const data = state.data;
        if (!data?.series?.length) return;
        const rows = [["fecha", "ingresos_pagados", "pedidos"], ...data.series.map(row => [row.date, Number(row.revenue || 0).toFixed(2), row.orders])];
        const csv = rows.map(row => row.join(",")).join("\n");
        const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `kantu-ventas-${data.range?.start}-a-${data.range?.end}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* =====================================================
       REALTIME
    ===================================================== */
    function pushFeed(item) {
        state.feed = [{ ...item, fresh: true }, ...state.feed.filter(row => !(row.kind === item.kind && String(row.id) === String(item.id)))].slice(0, 20);
        refreshFeed();
        window.setTimeout(() => {
            state.feed.forEach(row => { row.fresh = false; });
        }, 4000);
    }

    function startRealtime() {
        if (state.channel || typeof supabaseClient === "undefined" || typeof supabaseClient.channel !== "function") return;
        state.channel = supabaseClient
            .channel("kantu-admin-dashboard")
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, payload => {
                const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
                if (!row?.id) return;
                const isNew = payload.eventType === "INSERT";
                pushFeed({
                    kind: "order",
                    id: row.id,
                    title: isNew ? `Nuevo pedido #${row.id}` : `Pedido #${row.id} actualizado`,
                    detail: `${row.customer_name || "Cliente"} · ${money(row.total)}${row.payment_status === "approved" ? " · pagado" : ""}`,
                    status: row.status,
                    at: new Date().toISOString()
                });
                scheduleReload();
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs" }, payload => {
                const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
                if (!row?.id) return;
                const labels = core().proofStatusLabels || {};
                pushFeed({
                    kind: "proof",
                    id: row.id,
                    title: payload.eventType === "INSERT" ? "Nuevo comprobante de pago" : `Comprobante #${row.id} actualizado`,
                    detail: `Pedido #${row.order_id} · ${money(row.amount)}`,
                    status: labels[row.verification_status] || row.verification_status,
                    at: new Date().toISOString()
                });
                scheduleReload();
            })
            .subscribe(status => {
                state.live = status === "SUBSCRIBED";
                state.liveStatus = status;
                refreshFeed();
            });
    }

    function stopRealtime() {
        if (!state.channel) return;
        try { supabaseClient.removeChannel(state.channel); } catch { /* best-effort */ }
        state.channel = null;
        state.live = false;
    }

    /* =====================================================
       CICLO DE VIDA
    ===================================================== */
    function isAdminOpen() {
        const modal = el("adminModal");
        const content = el("adminContent");
        return Boolean(modal?.classList.contains("show") && content && !content.hidden);
    }

    function isDashboardVisible() {
        return isAdminOpen() && el("adminDashboardView")?.hidden === false;
    }

    function onAdminStateChange() {
        ensureShell();
        syncTopbarTitle();
        const nav = document.querySelector("#adminModal .admin-nav");
        if (nav) groupNavSections(nav);

        adoptSettingsCards();
        if (isAdminOpen()) {
            startRealtime();
            if (isDashboardVisible()) {
                ensureDashboard();
                loadDashboard();
                // Los módulos de agenda y capacidad solo cargan con el panel visible.
                window.KantuScheduledOperations?.refreshAdminAgenda?.();
                window.KantuDeliveryAvailability?.refreshAdmin?.();
            }
            if (el("adminSettingsView")?.hidden === false) adoptSettingsCards();
        } else {
            stopRealtime();
        }
    }

    function initialize() {
        if (!ensureShell()) return;
        ensureDashboard();

        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => {
                scheduled = false;
                onAdminStateChange();
            });
        };

        const modal = el("adminModal");
        new MutationObserver(schedule).observe(modal, { attributes: true, attributeFilter: ["class"] });
        const content = el("adminContent");
        if (content) {
            new MutationObserver(mutations => {
                // Solo cambios de vista (no tooltips ni contenido interno).
                if (mutations.some(mutation => mutation.target === content || mutation.target.classList?.contains("admin-view"))) schedule();
            }).observe(content, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
        }
        const nav = document.querySelector("#adminModal .admin-nav");
        if (nav) {
            new MutationObserver(() => {
                groupNavSections(nav);
                syncTopbarTitle();
            }).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        }

        window.setInterval(() => {
            if (!isDashboardVisible()) return;
            document.querySelectorAll("#kfFeed time[datetime]").forEach(time => {
                time.textContent = relativeTime(time.getAttribute("datetime"));
            });
        }, 30000);

        window.addEventListener("beforeunload", stopRealtime);
        if (isAdminOpen()) onAdminStateChange();
    }

    window.KantuAdminDashboardPro = Object.freeze({
        reload: loadDashboard,
        getState: () => ({ days: state.days, live: state.live, hasData: Boolean(state.data) })
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
