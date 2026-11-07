/* =====================================================
   KANTU FLORAL
   admin-crm.js
   Vista "Clientes" (segmentos, valor, fechas especiales)
   y configuración de avisos por Telegram del panel admin.
   Datos: RPC admin_customer_insights y admin_telegram_*.
===================================================== */

(() => {
    if (window.KantuAdminCrm) return;

    const SEGMENTS = {
        vip: { label: "VIP", hint: "3+ compras o S/ 600+" },
        recurrente: { label: "Recurrente", hint: "2 compras" },
        nuevo: { label: "Nuevo", hint: "1 compra" },
        en_riesgo: { label: "En riesgo", hint: "Sin comprar hace 90+ días" },
        interesado: { label: "Interesado", hint: "Pedido sin pagar" },
        sin_compras: { label: "Registrado", hint: "Cuenta sin compras" }
    };

    const NOTIFY_OPTIONS = [
        ["notify_new_order", "Nuevo pedido creado", "Apenas un cliente crea un pedido (aún sin pagar)."],
        ["notify_payment_proof", "Comprobante de Yape / transferencia", "Para revisarlo y aprobarlo rápido."],
        ["notify_payment_approved", "Pago aprobado", "El pedido pasa a preparación."],
        ["notify_cancelled", "Pedido cancelado", ""],
        ["notify_delivered", "Pedido entregado", "Útil para confirmar el cierre del día."],
        ["notify_claims", "Nuevo reclamo", "Libro de Reclamaciones."]
    ];

    const state = {
        data: null,
        segment: "todos",
        search: "",
        loading: false,
        telegram: null,
        updatesRequest: null
    };

    const el = id => document.getElementById(id);

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    const moneyFormatter = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const money = value => `S/ ${moneyFormatter.format(Number(value) || 0)}`;

    function categoryLabel(category) {
        if (!category) return "—";
        return typeof getCategoryName === "function" ? getCategoryName(category) : category;
    }

    function shortDate(value) {
        if (!value) return "—";
        const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
        if (Number.isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric" }).format(date).replace(".", "");
    }

    function daysAgo(value) {
        if (!value) return null;
        const diff = Date.now() - new Date(value).getTime();
        return Math.max(0, Math.floor(diff / 86400000));
    }

    function initials(name) {
        return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
    }

    function whatsappUrl(phone, message = "") {
        let digits = String(phone || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.length === 9 && digits.startsWith("9")) digits = `51${digits}`;
        return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
    }

    function isAdminVisible() {
        const modal = el("adminModal");
        const content = el("adminContent");
        return Boolean(modal?.classList.contains("show") && content && !content.hidden);
    }

    /* =====================================================
       NAVEGACIÓN Y VISTAS
    ===================================================== */
    function ensureViews() {
        const nav = document.querySelector("#adminModal .admin-nav");
        const content = el("adminContent");
        if (!nav || !content) return false;

        if (!nav.querySelector('[data-admin-view="customers"]')) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = "customers";
            button.textContent = "Clientes";
            const anchor = nav.querySelector('[data-admin-view="claims"]')
                || nav.querySelector('[data-admin-view="products"]');
            if (anchor) anchor.insertAdjacentElement("beforebegin", button);
            else nav.appendChild(button);
            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView("customers");
                loadCustomers();
            });
        }

        if (!el("adminCustomersView")) {
            const view = document.createElement("section");
            view.id = "adminCustomersView";
            view.className = "admin-view";
            view.hidden = true;
            view.innerHTML = `
                <div class="admin-section-heading">
                    <div><h3>Clientes</h3><p>Quién te compra, cuánto y cuándo volver a escribirle. Solo visible para administradores.</p></div>
                    <div class="kf-crm-actions">
                        <button type="button" class="admin-refresh" id="kfCrmExport">Exportar CSV</button>
                        <button type="button" class="admin-refresh" id="kfCrmRefresh">Actualizar</button>
                    </div>
                </div>
                <div id="kfCrmBody"><div class="admin-loader">Cargando clientes...</div></div>
            `;
            content.appendChild(view);
            view.addEventListener("click", handleCrmClick);
            view.addEventListener("input", event => {
                if (event.target.id === "kfCrmSearch") {
                    state.search = event.target.value;
                    renderCustomerList();
                }
            });
        }

        const settingsSlot = el("kfSettingsSlot");
        if (settingsSlot && !el("kfTelegramCard")) {
            const card = document.createElement("section");
            card.id = "kfTelegramCard";
            card.className = "kf-card kf-telegram-card";
            card.innerHTML = '<div class="admin-loader">Cargando avisos...</div>';
            settingsSlot.prepend(card);
            card.addEventListener("click", handleTelegramClick);
            card.addEventListener("change", handleTelegramChange);
            card.addEventListener("submit", handleTelegramSubmit);
        }

        const settingsButton = nav.querySelector('[data-admin-view="settings"]');
        if (settingsButton && settingsButton.textContent !== "Ajustes y avisos") settingsButton.textContent = "Ajustes y avisos";
        const settingsHeading = document.querySelector("#adminSettingsView .admin-section-heading h3");
        if (settingsHeading && settingsHeading.textContent !== "Ajustes y avisos") {
            settingsHeading.textContent = "Ajustes y avisos";
            const p = settingsHeading.nextElementSibling;
            if (p) p.textContent = "Avisos al celular, programación de entregas, franjas, capacidad y fechas bloqueadas.";
        }
        return true;
    }

    /* =====================================================
       CLIENTES
    ===================================================== */
    async function loadCustomers() {
        if (state.loading || typeof supabaseClient === "undefined") return;
        state.loading = true;
        const body = el("kfCrmBody");
        if (body && !state.data) body.innerHTML = '<div class="admin-loader">Cargando clientes...</div>';
        const { data, error } = await supabaseClient.rpc("admin_customer_insights");
        state.loading = false;
        if (error || !data) {
            if (body) body.innerHTML = '<div class="admin-empty">No pudimos cargar los clientes. Inténtalo nuevamente.</div>';
            return;
        }
        state.data = data;
        renderCustomers();
    }

    function renderCustomers() {
        const body = el("kfCrmBody");
        const data = state.data;
        if (!body || !data) return;
        const s = data.summary || {};
        const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];

        const stat = (label, value, hint = "") => `<div class="kf-crm-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>`;

        body.innerHTML = `
            <section class="kf-crm-stats">
                ${stat("Clientes", s.total ?? 0, "Con pedidos o cuenta")}
                ${stat("Valor promedio", money(s.lifetime_value), "Gasto por cliente que compró")}
                ${stat("Recompra", `${s.repeat_rate ?? 0}%`, "Compraron 2 veces o más")}
                ${stat("En riesgo", s.en_riesgo ?? 0, "Hace 90+ días sin comprar")}
            </section>

            <div class="kf-crm-layout">
                <article class="kf-card kf-crm-main">
                    <div class="kf-crm-toolbar">
                        <input type="search" id="kfCrmSearch" placeholder="Buscar por nombre, teléfono o correo" value="${escapeHtml(state.search)}" aria-label="Buscar clientes">
                        <div class="kf-crm-segments" role="group" aria-label="Filtrar por segmento">
                            ${[["todos", "Todos", s.total], ...Object.entries(SEGMENTS).map(([key, info]) => [key, info.label, s[key]])]
                                .map(([key, label, count]) => `<button type="button" data-kf-segment="${key}" aria-pressed="${state.segment === key}">${escapeHtml(label)} <b>${Number(count) || 0}</b></button>`).join("")}
                        </div>
                    </div>
                    <div id="kfCrmList" class="kf-crm-list"></div>
                </article>

                <aside class="kf-card kf-crm-side">
                    <header class="kf-card-head"><div><h4>Fechas especiales próximas</h4><p>Próximos 45 días · recordatorios que tus clientes guardaron</p></div></header>
                    ${upcoming.length ? `<ul class="kf-crm-upcoming">${upcoming.map(item => {
                        const wa = whatsappUrl(item.phone, `Hola ${String(item.customer_name || "").split(" ")[0]}, se acerca ${item.label || "una fecha especial"} 🌸 ¿Te ayudamos a preparar un detalle con Kantu Floral?`);
                        return `<li>
                            <span class="kf-crm-date"><b>${escapeHtml(new Date(`${item.next_date}T12:00:00`).getDate())}</b>${escapeHtml(new Intl.DateTimeFormat("es-PE", { month: "short" }).format(new Date(`${item.next_date}T12:00:00`)).replace(".", ""))}</span>
                            <div><strong>${escapeHtml(item.label || "Fecha especial")}</strong><small>${escapeHtml(item.customer_name)}</small></div>
                            ${wa ? `<a class="kf-crm-wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp a ${escapeHtml(item.customer_name)}">WhatsApp</a>` : ""}
                        </li>`;
                    }).join("")}</ul>` : '<div class="kf-empty"><strong>Sin fechas próximas</strong><span>Cuando tus clientes guarden cumpleaños o aniversarios, aparecerán aquí para que les escribas a tiempo.</span></div>'}
                    <div class="kf-divider"></div>
                    <p class="kf-mini-title">¿Qué hacer con cada segmento?</p>
                    <ul class="kf-crm-tips">
                        <li><b>VIP:</b> agradéceles con un detalle o acceso anticipado a colecciones.</li>
                        <li><b>Nuevo:</b> escríbeles a los 7 días para saber si les gustó.</li>
                        <li><b>En riesgo:</b> un cupón de regreso suele reactivarlos.</li>
                        <li><b>Interesado:</b> pedido sin pagar: ofrece ayuda con el pago.</li>
                    </ul>
                </aside>
            </div>
        `;
        renderCustomerList();
    }

    function filteredCustomers() {
        const list = Array.isArray(state.data?.customers) ? state.data.customers : [];
        const query = state.search.trim().toLowerCase();
        return list.filter(customer => {
            if (state.segment !== "todos" && customer.segment !== state.segment) return false;
            if (!query) return true;
            return `${customer.name || ""} ${customer.phone || ""} ${customer.email || ""}`.toLowerCase().includes(query);
        });
    }

    function renderCustomerList() {
        const container = el("kfCrmList");
        if (!container) return;
        document.querySelectorAll("[data-kf-segment]").forEach(button =>
            button.setAttribute("aria-pressed", String(button.dataset.kfSegment === state.segment)));

        const rows = filteredCustomers();
        if (!rows.length) {
            container.innerHTML = '<div class="kf-empty"><strong>No hay clientes con ese filtro</strong><span>Prueba otro segmento o búsqueda.</span></div>';
            return;
        }

        container.innerHTML = rows.slice(0, 300).map(customer => {
            const segment = SEGMENTS[customer.segment] || { label: customer.segment };
            const ago = daysAgo(customer.last_paid_at || customer.last_order_at);
            const firstName = String(customer.name || "").split(" ")[0];
            const wa = whatsappUrl(customer.phone, `Hola ${firstName}, te saluda Kantu Floral 🌸`);
            return `<article class="kf-crm-row">
                <span class="kf-crm-avatar" aria-hidden="true">${escapeHtml(initials(customer.name))}</span>
                <div class="kf-crm-who">
                    <strong>${escapeHtml(customer.name)}</strong>
                    <small>${escapeHtml([customer.phone, customer.email].filter(Boolean).join(" · ") || "Sin contacto")}</small>
                </div>
                <span class="kf-crm-badge kf-seg-${escapeHtml(customer.segment)}" title="${escapeHtml(segment.hint || "")}">${escapeHtml(segment.label)}</span>
                <div class="kf-crm-metric"><span>Compras</span><strong>${Number(customer.paid_orders) || 0}</strong></div>
                <div class="kf-crm-metric"><span>Total</span><strong>${escapeHtml(money(customer.total_spent))}</strong></div>
                <div class="kf-crm-metric"><span>Última</span><strong>${ago === null ? "—" : ago === 0 ? "Hoy" : `Hace ${ago} d`}</strong></div>
                <div class="kf-crm-metric kf-crm-hide-sm"><span>Le gusta</span><strong>${escapeHtml(categoryLabel(customer.favorite_category))}</strong></div>
                <div class="kf-crm-row-actions">
                    ${wa ? `<a href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer" class="kf-crm-wa" aria-label="WhatsApp a ${escapeHtml(customer.name)}">WhatsApp</a>` : ""}
                    ${customer.email ? `<a href="mailto:${escapeHtml(customer.email)}" class="kf-link">Correo</a>` : ""}
                </div>
                ${customer.next_occasion ? `<p class="kf-crm-occasion">🎈 Fecha especial: ${escapeHtml(shortDate(customer.next_occasion))}</p>` : ""}
            </article>`;
        }).join("");
    }

    function handleCrmClick(event) {
        const segment = event.target.closest("[data-kf-segment]");
        if (segment) {
            state.segment = segment.dataset.kfSegment;
            renderCustomerList();
            return;
        }
        if (event.target.closest("#kfCrmRefresh")) {
            loadCustomers();
            return;
        }
        if (event.target.closest("#kfCrmExport")) exportCustomers();
    }

    function exportCustomers() {
        const rows = filteredCustomers();
        if (!rows.length) return;
        const header = ["nombre", "telefono", "correo", "segmento", "compras", "total", "ticket_promedio", "primera_compra", "ultima_compra", "categoria_favorita", "proxima_fecha_especial"];
        const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const lines = rows.map(c => [c.name, c.phone, c.email, (SEGMENTS[c.segment] || {}).label || c.segment, c.paid_orders, c.total_spent, c.avg_ticket,
            c.first_paid_at ? String(c.first_paid_at).slice(0, 10) : "", c.last_paid_at ? String(c.last_paid_at).slice(0, 10) : "",
            categoryLabel(c.favorite_category), c.next_occasion || ""].map(quote).join(","));
        const blob = new Blob([`﻿${[header.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `kantu-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* =====================================================
       TELEGRAM
    ===================================================== */
    async function loadTelegram() {
        const card = el("kfTelegramCard");
        if (!card || typeof supabaseClient === "undefined") return;
        const { data, error } = await supabaseClient.rpc("admin_telegram_status");
        if (error || !data) {
            card.innerHTML = '<div class="admin-empty">No pudimos cargar la configuración de avisos.</div>';
            return;
        }
        state.telegram = data;
        renderTelegram();
    }

    function renderTelegram(message = "", tone = "") {
        const card = el("kfTelegramCard");
        const t = state.telegram;
        if (!card || !t) return;
        const ready = t.token_configured && t.chat_configured;
        const settings = t.settings || {};
        const step = (done, number, title, content) => `
            <li class="kf-tg-step${done ? " is-done" : ""}">
                <span class="kf-tg-num">${done ? "✓" : number}</span>
                <div><strong>${title}</strong>${content}</div>
            </li>`;

        card.innerHTML = `
            <header class="kf-card-head">
                <div>
                    <h4>Avisos al celular por Telegram</h4>
                    <p>Recibe al instante cada pedido, pago y reclamo, sin tener el panel abierto. Gratis.</p>
                </div>
                <span class="kf-tg-state ${ready ? "is-on" : ""}">${ready ? (settings.telegram_enabled ? "Activo" : "En pausa") : "Sin configurar"}</span>
            </header>

            <ol class="kf-tg-steps">
                ${step(t.token_configured, 1, "Crea tu bot y pega el token", `
                    <p>En Telegram abre <b>@BotFather</b>, envía <code>/newbot</code>, ponle un nombre (ej. <i>Kantu Avisos</i>) y un usuario que termine en <i>bot</i>. Te dará un token parecido a <code>123456789:AA...</code>.</p>
                    <form class="kf-tg-form" data-kf-tg-form="token">
                        <input type="password" name="token" autocomplete="off" spellcheck="false" placeholder="${t.token_configured ? "Token guardado · pega uno nuevo para reemplazarlo" : "Pega aquí el token del bot"}" aria-label="Token del bot de Telegram">
                        <button type="submit" class="kf-btn-mini">Guardar token</button>
                    </form>`)}
                ${step(t.chat_configured, 2, "Conecta tu chat", `
                    <p>Abre tu bot en Telegram y envíale <code>/start</code> (o agrégalo a un grupo con tu equipo y escribe cualquier mensaje). Luego pulsa <b>Detectar chat</b>.</p>
                    <div class="kf-tg-inline">
                        <button type="button" class="kf-btn-mini" data-kf-tg="detect" ${t.token_configured ? "" : "disabled"}>Detectar chat</button>
                        ${t.chat_configured ? `<small>Chat conectado (…${escapeHtml(t.chat_hint)})</small>` : ""}
                    </div>
                    <div id="kfTgChats"></div>`)}
                ${step(false, 3, "Prueba que llegue", `
                    <div class="kf-tg-inline">
                        <button type="button" class="kf-btn-mini" data-kf-tg="test" ${ready ? "" : "disabled"}>Enviar mensaje de prueba</button>
                    </div>`)}
            </ol>

            <p class="kf-tg-message ${tone ? `is-${tone}` : ""}" role="status" aria-live="polite">${message}</p>

            <div class="kf-divider"></div>
            <div class="kf-tg-toggles">
                <label class="kf-switch kf-switch-main">
                    <input type="checkbox" data-kf-tg-setting="telegram_enabled" ${settings.telegram_enabled ? "checked" : ""}>
                    <span></span><b>Enviar avisos a Telegram</b>
                </label>
                ${NOTIFY_OPTIONS.map(([key, label, hint]) => `
                    <label class="kf-switch">
                        <input type="checkbox" data-kf-tg-setting="${key}" ${settings[key] ? "checked" : ""}>
                        <span></span><b>${escapeHtml(label)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
                    </label>`).join("")}
            </div>
            <p class="kf-muted-note">El token se guarda cifrado en Supabase Vault y nunca vuelve a mostrarse en el navegador.</p>
        `;
    }

    async function handleTelegramSubmit(event) {
        const form = event.target.closest("[data-kf-tg-form='token']");
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector("input[name='token']");
        const token = String(input?.value || "").trim();
        if (!token) return;
        const button = form.querySelector("button");
        if (button) button.disabled = true;
        const { data, error } = await supabaseClient.rpc("admin_set_telegram_credentials", { p_token: token, p_chat_id: null });
        if (button) button.disabled = false;
        if (input) input.value = "";
        if (error) {
            const invalid = /TELEGRAM_TOKEN_INVALID/.test(error.message || "");
            renderTelegram(invalid ? "Ese token no tiene el formato de BotFather (números:letras). Cópialo completo." : "No se pudo guardar el token.", "error");
            return;
        }
        state.telegram = data;
        renderTelegram("Token guardado. Ahora envía /start a tu bot y pulsa “Detectar chat”.", "success");
    }

    async function handleTelegramChange(event) {
        const input = event.target.closest("[data-kf-tg-setting]");
        if (!input) return;
        input.disabled = true;
        const { data, error } = await supabaseClient.rpc("admin_set_notification_settings", {
            p_settings: { [input.dataset.kfTgSetting]: input.checked }
        });
        input.disabled = false;
        if (error) {
            input.checked = !input.checked;
            renderTelegram("No se pudo guardar el cambio.", "error");
            return;
        }
        state.telegram = data;
    }

    async function readResponse(requestId, attempts = 8) {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            await new Promise(resolve => window.setTimeout(resolve, 900));
            const { data, error } = await supabaseClient.rpc("admin_telegram_read_response", { p_request_id: requestId });
            if (error) return null;
            if (data?.ready) return data;
        }
        return null;
    }

    async function handleTelegramClick(event) {
        const action = event.target.closest("[data-kf-tg]")?.dataset.kfTg;
        const chatButton = event.target.closest("[data-kf-tg-chat]");

        if (chatButton) {
            chatButton.disabled = true;
            const { data, error } = await supabaseClient.rpc("admin_set_telegram_credentials", { p_token: null, p_chat_id: chatButton.dataset.kfTgChat });
            if (error) {
                renderTelegram("No se pudo guardar el chat.", "error");
                return;
            }
            state.telegram = data;
            renderTelegram("Chat conectado. Envía un mensaje de prueba para confirmar.", "success");
            return;
        }

        if (action === "detect") {
            renderTelegram("Buscando mensajes recientes de tu bot…");
            const { data: requestId, error } = await supabaseClient.rpc("admin_telegram_request_updates");
            if (error || !requestId) {
                renderTelegram("Primero guarda el token del bot.", "error");
                return;
            }
            const response = await readResponse(requestId);
            if (!response) {
                renderTelegram("Telegram no respondió a tiempo. Inténtalo otra vez.", "error");
                return;
            }
            if (!response.ok) {
                renderTelegram(`Telegram rechazó el token${response.description ? `: ${escapeHtml(response.description)}` : ""}. Revisa que esté completo.`, "error");
                return;
            }
            const chats = Array.isArray(response.chats) ? response.chats : [];
            if (!chats.length) {
                renderTelegram("No encontramos mensajes. Abre tu bot, envía /start y vuelve a pulsar “Detectar chat”.", "error");
                return;
            }
            renderTelegram("Elige dónde quieres recibir los avisos:", "success");
            const box = el("kfTgChats");
            if (box) {
                box.innerHTML = `<div class="kf-tg-chats">${chats.map(chat => `
                    <button type="button" class="kf-tg-chat" data-kf-tg-chat="${escapeHtml(chat.id)}">
                        <strong>${escapeHtml(chat.title || "Chat")}</strong><small>${chat.type === "private" ? "Chat personal" : "Grupo"}</small>
                    </button>`).join("")}</div>`;
            }
            return;
        }

        if (action === "test") {
            renderTelegram("Enviando mensaje de prueba…");
            const { data: requestId, error } = await supabaseClient.rpc("admin_send_telegram_test");
            if (error || !requestId) {
                renderTelegram("No se pudo enviar. Revisa el token y el chat.", "error");
                return;
            }
            const response = await readResponse(requestId);
            if (response?.ok) renderTelegram("¡Mensaje enviado! Revisa tu Telegram. 🎉", "success");
            else renderTelegram(`Telegram no aceptó el mensaje${response?.description ? `: ${escapeHtml(response.description)}` : ""}.`, "error");
        }
    }

    /* =====================================================
       CICLO DE VIDA
    ===================================================== */
    function onStateChange() {
        if (!ensureViews() || !isAdminVisible()) return;
        if (el("adminCustomersView")?.hidden === false && !state.data) loadCustomers();
        if (el("adminSettingsView")?.hidden === false && !state.telegram) loadTelegram();
    }

    function initialize() {
        ensureViews();
        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => {
                scheduled = false;
                onStateChange();
            });
        };
        const modal = el("adminModal");
        if (modal) new MutationObserver(schedule).observe(modal, { attributes: true, attributeFilter: ["class"] });
        const content = el("adminContent");
        if (content) {
            new MutationObserver(mutations => {
                if (mutations.some(mutation => mutation.target === content || mutation.target.classList?.contains("admin-view"))) schedule();
            }).observe(content, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
        }
        // La vista de ajustes la crea admin-dashboard-pro: reintenta hasta que exista.
        let tries = 0;
        const timer = window.setInterval(() => {
            tries += 1;
            if (el("kfSettingsSlot") && ensureViews() && el("kfTelegramCard")) window.clearInterval(timer);
            if (tries > 40) window.clearInterval(timer);
        }, 250);
    }

    window.KantuAdminCrm = Object.freeze({ reloadCustomers: loadCustomers, reloadTelegram: loadTelegram });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
