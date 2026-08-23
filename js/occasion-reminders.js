/* Kantu Floral - fechas importantes opt-in del cliente */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const typeLabels = Object.freeze({
        birthday: "Cumpleaños",
        anniversary: "Aniversario",
        special: "Fecha especial"
    });
    const monthLabels = Object.freeze([
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]);

    let reminders = [];
    let editingId = null;
    let loading = false;
    let installedSwitchAdapter = false;

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-occasion-reminders-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/occasion-reminders.css";
        link.dataset.kantuOccasionRemindersStyle = "true";
        document.head.appendChild(link);
    }

    function maxDayForMonth(month) {
        if ([4, 6, 9, 11].includes(Number(month))) return 30;
        if (Number(month) === 2) return 29;
        return 31;
    }

    function populateDateSelectors(monthValue = 1, dayValue = 1) {
        const month = el("occasionReminderMonth");
        const day = el("occasionReminderDay");
        if (!month || !day) return;

        if (!month.options.length) {
            month.innerHTML = monthLabels.map((label, index) =>
                `<option value="${index + 1}">${core.escapeHtml(label)}</option>`
            ).join("");
        }

        month.value = String(Math.max(1, Math.min(12, Number(monthValue) || 1)));
        const maxDay = maxDayForMonth(month.value);
        day.innerHTML = Array.from({ length: maxDay }, (_, index) =>
            `<option value="${index + 1}">${index + 1}</option>`
        ).join("");
        day.value = String(Math.max(1, Math.min(maxDay, Number(dayValue) || 1)));
    }

    function ensureAccountSection() {
        const modal = el("accountModal");
        const tabs = modal?.querySelector(".account-tabs");
        const profile = el("accountProfileSection");
        if (!modal || !tabs || !profile) return null;

        let tab = tabs.querySelector('[data-account-tab="occasions"]');
        if (!tab) {
            tab = document.createElement("button");
            tab.type = "button";
            tab.className = "account-tab";
            tab.dataset.accountTab = "occasions";
            tab.textContent = "Fechas importantes";
            tab.addEventListener("click", () => switchAccountTab("occasions"));
            tabs.appendChild(tab);
        }

        let section = el("accountOccasionsSection");
        if (!section) {
            section = document.createElement("section");
            section.id = "accountOccasionsSection";
            section.className = "account-section account-occasions-section";
            section.hidden = true;
            section.innerHTML = `
                <div class="occasion-reminder-intro">
                    <div>
                        <span class="occasion-reminder-eyebrow">Recordatorios personales</span>
                        <h3>No dejes pasar una fecha importante</h3>
                        <p>Guarda solo mes y día. Kantu no necesita el año de nacimiento y no enviará WhatsApp ni correo automáticamente.</p>
                    </div>
                    <span class="occasion-reminder-privacy" title="Solo tú puedes leer y editar estas fechas">🔒 Privado</span>
                </div>

                <form id="occasionReminderForm" class="occasion-reminder-form">
                    <input id="occasionReminderId" type="hidden">
                    <div class="form-group occasion-field-wide">
                        <label for="occasionReminderLabel">¿Qué quieres recordar?</label>
                        <input id="occasionReminderLabel" type="text" maxlength="80" placeholder="Ej.: Cumple de mamá" required>
                    </div>
                    <div class="form-group">
                        <label for="occasionReminderType">Ocasión</label>
                        <select id="occasionReminderType">
                            <option value="birthday">Cumpleaños</option>
                            <option value="anniversary">Aniversario</option>
                            <option value="special">Fecha especial</option>
                        </select>
                    </div>
                    <div class="occasion-date-fields">
                        <div class="form-group">
                            <label for="occasionReminderMonth">Mes</label>
                            <select id="occasionReminderMonth"></select>
                        </div>
                        <div class="form-group">
                            <label for="occasionReminderDay">Día</label>
                            <select id="occasionReminderDay"></select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="occasionReminderLeadDays">Avisarme con anticipación</label>
                        <div class="occasion-lead-control">
                            <input id="occasionReminderLeadDays" type="number" min="0" max="60" step="1" inputmode="numeric" value="7" required>
                            <span>días</span>
                        </div>
                    </div>
                    <label class="occasion-enabled-control">
                        <input id="occasionReminderEnabled" type="checkbox" checked>
                        <span>Recordatorio activo</span>
                    </label>
                    <div class="occasion-form-actions occasion-field-wide">
                        <button id="occasionReminderCancel" type="button" class="btn btn-light" hidden>Cancelar edición</button>
                        <button id="occasionReminderSave" type="submit" class="btn btn-primary">Guardar fecha</button>
                    </div>
                </form>

                <p id="occasionReminderStatus" class="occasion-reminder-status" role="status" aria-live="polite" hidden></p>
                <div id="occasionReminderLoading" class="account-loading" hidden>Cargando tus fechas...</div>
                <div id="occasionReminderSummary" class="occasion-reminder-summary" hidden></div>
                <div id="occasionReminderList" class="occasion-reminder-list"></div>
            `;

            const detail = el("accountOrderDetailSection");
            if (detail) detail.insertAdjacentElement("beforebegin", section);
            else profile.parentElement?.appendChild(section);

            populateDateSelectors();
            bindSection();
        }

        installAccountSwitchAdapter();
        return section;
    }

    function installAccountSwitchAdapter() {
        if (installedSwitchAdapter || typeof switchAccountTab !== "function") return;
        const baseSwitch = switchAccountTab;
        switchAccountTab = function occasionAwareAccountTab(tab, ...args) {
            const section = ensureAccountSection();
            if (tab !== "occasions") {
                if (section) section.hidden = true;
                return baseSwitch(tab, ...args);
            }

            el("accountProfileSection").hidden = true;
            el("accountOrdersSection").hidden = true;
            el("accountOrderDetailSection").hidden = true;
            if (section) section.hidden = false;

            document.querySelectorAll("[data-account-tab]").forEach(button => {
                const active = button.dataset.accountTab === "occasions";
                button.classList.toggle("active", active);
                button.setAttribute("aria-selected", String(active));
            });
            if (typeof clearAccountMessage === "function") clearAccountMessage();
            loadReminders();
        };
        installedSwitchAdapter = true;
    }

    function setStatus(message, type = "") {
        const target = el("occasionReminderStatus");
        if (!target) return;
        target.textContent = message || "";
        target.className = `occasion-reminder-status${type ? ` ${type}` : ""}`;
        target.hidden = !message;
    }

    function resetForm() {
        editingId = null;
        el("occasionReminderForm")?.reset();
        if (el("occasionReminderType")) el("occasionReminderType").value = "birthday";
        if (el("occasionReminderLeadDays")) el("occasionReminderLeadDays").value = "7";
        if (el("occasionReminderEnabled")) el("occasionReminderEnabled").checked = true;
        if (el("occasionReminderId")) el("occasionReminderId").value = "";
        populateDateSelectors();
        const cancel = el("occasionReminderCancel");
        if (cancel) cancel.hidden = true;
        const save = el("occasionReminderSave");
        if (save) save.textContent = "Guardar fecha";
        setStatus("");
    }

    function readPayload() {
        const label = String(el("occasionReminderLabel")?.value || "").trim();
        const occasionType = el("occasionReminderType")?.value || "special";
        const month = Number(el("occasionReminderMonth")?.value);
        const day = Number(el("occasionReminderDay")?.value);
        const leadDays = Number(el("occasionReminderLeadDays")?.value);

        if (!label || label.length > 80) throw new Error("Escribe una etiqueta de hasta 80 caracteres.");
        if (!Object.hasOwn(typeLabels, occasionType)) throw new Error("Selecciona una ocasión válida.");
        if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Selecciona un mes válido.");
        if (!Number.isInteger(day) || day < 1 || day > maxDayForMonth(month)) throw new Error("Selecciona un día válido.");
        if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 60) throw new Error("La anticipación debe ser un número entero entre 0 y 60 días.");

        return {
            label,
            occasion_type: occasionType,
            month,
            day,
            lead_days: leadDays,
            enabled: Boolean(el("occasionReminderEnabled")?.checked)
        };
    }

    function formatOccurrence(value) {
        if (!value) return "Fecha no disponible";
        const date = new Date(`${value}T12:00:00Z`);
        if (Number.isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat("es-PE", {
            dateStyle: "medium",
            timeZone: "America/Lima"
        }).format(date);
    }

    function dueText(row) {
        const days = Number(row.days_until);
        if (days === 0) return "Es hoy";
        if (days === 1) return "Falta 1 día";
        return `Faltan ${Math.max(0, days)} días`;
    }

    function renderSummary() {
        const summary = el("occasionReminderSummary");
        if (!summary) return;
        const active = reminders.filter(row => row.enabled);
        const due = active.filter(row => row.is_due);
        summary.hidden = reminders.length === 0;
        summary.innerHTML = reminders.length
            ? `<div><strong>${active.length}</strong><span>recordatorios activos</span></div>
               <div class="${due.length ? "due" : ""}"><strong>${due.length}</strong><span>dentro de su anticipación</span></div>`
            : "";
    }

    function renderList() {
        const list = el("occasionReminderList");
        if (!list) return;
        renderSummary();

        if (!reminders.length) {
            list.innerHTML = `<div class="occasion-reminder-empty">
                <span aria-hidden="true">💐</span>
                <strong>Aún no guardaste fechas</strong>
                <p>Agrega solo las que quieras recordar. No creamos ninguna automáticamente.</p>
            </div>`;
            return;
        }

        list.innerHTML = reminders.map(row => `
            <article class="occasion-reminder-card${row.is_due ? " due" : ""}${row.enabled ? "" : " disabled"}">
                <div class="occasion-reminder-main">
                    <div>
                        <span>${core.escapeHtml(typeLabels[row.occasion_type] || "Fecha especial")}</span>
                        <strong>${core.escapeHtml(row.label)}</strong>
                    </div>
                    <span class="occasion-reminder-state">${row.enabled ? (row.is_due ? core.escapeHtml(dueText(row)) : "Activo") : "Pausado"}</span>
                </div>
                <div class="occasion-reminder-meta">
                    <span>Próxima: <strong>${core.escapeHtml(formatOccurrence(row.next_occurrence))}</strong></span>
                    <span>Aviso: <strong>${Number(row.lead_days) === 0 ? "el mismo día" : `${Number(row.lead_days)} días antes`}</strong></span>
                </div>
                <div class="occasion-reminder-actions">
                    <button type="button" data-occasion-edit="${row.id}">Editar</button>
                    <button type="button" data-occasion-toggle="${row.id}">${row.enabled ? "Pausar" : "Activar"}</button>
                    <button type="button" class="danger" data-occasion-delete="${row.id}">Eliminar</button>
                </div>
            </article>
        `).join("");
    }

    async function loadReminders() {
        if (loading || !ensureAccountSection()) return;
        loading = true;
        const loadingElement = el("occasionReminderLoading");
        if (loadingElement) loadingElement.hidden = false;

        const { data, error } = await supabaseClient.rpc("get_my_occasion_reminders");
        loading = false;
        if (loadingElement) loadingElement.hidden = true;

        if (error) {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) setStatus("No pudimos cargar tus fechas. Inténtalo nuevamente.", "error");
            reminders = [];
            renderList();
            return;
        }

        reminders = data || [];
        renderList();
    }

    async function saveReminder(event) {
        event.preventDefault();
        let payload;
        try {
            payload = readPayload();
        } catch (error) {
            setStatus(error.message, "error");
            return;
        }

        const save = el("occasionReminderSave");
        if (save) {
            save.disabled = true;
            save.textContent = "Guardando...";
        }

        let error;
        if (editingId) {
            ({ error } = await supabaseClient
                .from("occasion_reminders")
                .update(payload)
                .eq("id", editingId));
        } else {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                if (save) { save.disabled = false; save.textContent = "Guardar fecha"; }
                setStatus("Inicia sesión para guardar una fecha.", "error");
                return;
            }
            ({ error } = await supabaseClient
                .from("occasion_reminders")
                .insert({ ...payload, user_id: user.id }));
        }

        if (save) {
            save.disabled = false;
            save.textContent = editingId ? "Guardar cambios" : "Guardar fecha";
        }

        if (error) {
            console.error("Error guardando fecha importante:", error);
            setStatus(error.code === "23505"
                ? "Ya guardaste una fecha igual con esa etiqueta."
                : "No pudimos guardar esta fecha.", "error");
            return;
        }

        resetForm();
        await loadReminders();
        setStatus("Fecha guardada correctamente.", "success");
    }

    function editReminder(id) {
        const row = reminders.find(item => String(item.id) === String(id));
        if (!row) return;
        editingId = row.id;
        el("occasionReminderId").value = String(row.id);
        el("occasionReminderLabel").value = row.label || "";
        el("occasionReminderType").value = row.occasion_type || "special";
        populateDateSelectors(row.month, row.day);
        el("occasionReminderLeadDays").value = String(row.lead_days ?? 7);
        el("occasionReminderEnabled").checked = Boolean(row.enabled);
        el("occasionReminderCancel").hidden = false;
        el("occasionReminderSave").textContent = "Guardar cambios";
        setStatus("Editando fecha guardada.");
        el("occasionReminderLabel")?.focus();
    }

    async function toggleReminder(id) {
        const row = reminders.find(item => String(item.id) === String(id));
        if (!row) return;
        const { error } = await supabaseClient
            .from("occasion_reminders")
            .update({ enabled: !row.enabled })
            .eq("id", row.id);
        if (error) {
            setStatus("No pudimos cambiar el estado del recordatorio.", "error");
            return;
        }
        await loadReminders();
    }

    async function deleteReminder(id) {
        const row = reminders.find(item => String(item.id) === String(id));
        if (!row) return;
        if (!window.confirm(`¿Eliminar “${row.label}”?`)) return;
        const { error } = await supabaseClient
            .from("occasion_reminders")
            .delete()
            .eq("id", row.id);
        if (error) {
            setStatus("No pudimos eliminar el recordatorio.", "error");
            return;
        }
        if (String(editingId) === String(id)) resetForm();
        await loadReminders();
        setStatus("Recordatorio eliminado.", "success");
    }

    function bindSection() {
        el("occasionReminderMonth")?.addEventListener("change", event => {
            const currentDay = Number(el("occasionReminderDay")?.value) || 1;
            populateDateSelectors(Number(event.target.value), currentDay);
        });
        el("occasionReminderForm")?.addEventListener("submit", saveReminder);
        el("occasionReminderCancel")?.addEventListener("click", resetForm);
        el("occasionReminderList")?.addEventListener("click", event => {
            const edit = event.target.closest("[data-occasion-edit]");
            const toggle = event.target.closest("[data-occasion-toggle]");
            const remove = event.target.closest("[data-occasion-delete]");
            if (edit) editReminder(edit.dataset.occasionEdit);
            else if (toggle) toggleReminder(toggle.dataset.occasionToggle);
            else if (remove) deleteReminder(remove.dataset.occasionDelete);
        });
    }

    function initialize() {
        ensureStyles();
        ensureAccountSection();
        const modal = el("accountModal");
        if (modal) {
            new MutationObserver(() => {
                if (modal.classList.contains("show")) ensureAccountSection();
            }).observe(modal, { attributes: true, attributeFilter: ["class"] });
        }
    }

    window.KantuOccasionReminders = Object.freeze({
        refresh: loadReminders,
        open: () => switchAccountTab("occasions")
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
