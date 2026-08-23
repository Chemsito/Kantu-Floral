/* Kantu Floral - favoritos persistentes y fechas especiales */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const LEGACY_FAVORITES_KEY = "kantuFavorites";
    const GUEST_FAVORITES_KEY = "kantuFavorites:guest";
    const favoriteLocks = new Set();
    let favoriteIds = [];
    let favoriteUserId = null;
    let favoritesReadyResolve;
    const favoritesReady = new Promise(resolve => { favoritesReadyResolve = resolve; });
    let reminders = [];
    let reminderUser = null;
    let editingReminderId = null;

    const OCCASIONS = Object.freeze({
        birthday: "Cumpleaños",
        anniversary: "Aniversario",
        celebration: "Celebración",
        other: "Fecha especial"
    });

    const MONTHS = Object.freeze([
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]);

    function el(id) { return document.getElementById(id); }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-relationship-tools-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/relationship-tools.css";
        link.dataset.kantuRelationshipToolsStyle = "true";
        document.head.appendChild(link);
    }

    function normalizeFavoriteIds(value) {
        if (!Array.isArray(value)) return [];
        return [...new Set(value.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    }

    function readFavoriteStorage(key) {
        try {
            return normalizeFavoriteIds(JSON.parse(localStorage.getItem(key) || "[]"));
        } catch {
            localStorage.removeItem(key);
            return [];
        }
    }

    function writeFavoriteStorage(key, ids) {
        localStorage.setItem(key, JSON.stringify(normalizeFavoriteIds(ids)));
    }

    function userFavoritesKey(userId) {
        return `kantuFavorites:user:${String(userId)}`;
    }

    function migrateLegacyFavorites() {
        if (!localStorage.getItem(GUEST_FAVORITES_KEY) && localStorage.getItem(LEGACY_FAVORITES_KEY)) {
            writeFavoriteStorage(GUEST_FAVORITES_KEY, readFavoriteStorage(LEGACY_FAVORITES_KEY));
        }
        localStorage.removeItem(LEGACY_FAVORITES_KEY);
    }

    function setFavoriteState(ids, userId = null) {
        favoriteIds = normalizeFavoriteIds(ids);
        favoriteUserId = userId || null;
        writeFavoriteStorage(userId ? userFavoritesKey(userId) : GUEST_FAVORITES_KEY, favoriteIds);
        try {
            if (typeof favorites !== "undefined") favorites = [...favoriteIds];
        } catch {}
        updateFavoritesBadge();
        window.dispatchEvent(new CustomEvent("kantu:favorites-changed", {
            detail: { ids: [...favoriteIds], userId: favoriteUserId }
        }));
    }

    function updateFavoritesBadge() {
        const button = el("favoritesButton");
        if (!button) return;
        let badge = el("favoritesCountBadge");
        if (!badge) {
            badge = document.createElement("span");
            badge.id = "favoritesCountBadge";
            badge.className = "favorites-count-badge";
            badge.setAttribute("aria-hidden", "true");
            button.appendChild(badge);
        }
        badge.textContent = String(favoriteIds.length);
        badge.hidden = favoriteIds.length === 0;
        button.setAttribute("aria-label", favoriteIds.length
            ? `Ver ${favoriteIds.length} producto${favoriteIds.length === 1 ? "" : "s"} favorito${favoriteIds.length === 1 ? "" : "s"}`
            : "Ver productos favoritos");
    }

    async function currentUser() {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        return error ? null : user;
    }

    async function syncFavoritesForSession() {
        const user = await currentUser();
        if (!user) {
            setFavoriteState(readFavoriteStorage(GUEST_FAVORITES_KEY), null);
            return favoriteIds;
        }

        const remoteResult = await supabaseClient
            .from("favorites")
            .select("product_id")
            .eq("user_id", user.id);

        if (remoteResult.error) {
            console.error("No se pudieron sincronizar favoritos:", remoteResult.error);
            setFavoriteState(readFavoriteStorage(userFavoritesKey(user.id)), user.id);
            return favoriteIds;
        }

        const remote = normalizeFavoriteIds((remoteResult.data || []).map(row => row.product_id));
        const userLocal = readFavoriteStorage(userFavoritesKey(user.id));
        const guest = readFavoriteStorage(GUEST_FAVORITES_KEY);
        const merged = normalizeFavoriteIds([...remote, ...userLocal, ...guest]);
        const remoteSet = new Set(remote);
        const missing = merged.filter(id => !remoteSet.has(id));

        if (missing.length) {
            const persist = await supabaseClient.from("favorites").upsert(
                missing.map(productId => ({ user_id: user.id, product_id: productId })),
                { onConflict: "user_id,product_id" }
            );
            if (persist.error) {
                console.error("No se pudieron migrar favoritos locales:", persist.error);
                setFavoriteState(remote, user.id);
                return favoriteIds;
            }
        }

        setFavoriteState(merged, user.id);
        if (guest.length) localStorage.removeItem(GUEST_FAVORITES_KEY);
        return favoriteIds;
    }

    async function toggleFavoritePersistent(productId, { quiet = false } = {}) {
        const id = Number(productId);
        if (!Number.isSafeInteger(id) || id <= 0 || favoriteLocks.has(id)) return false;
        favoriteLocks.add(id);

        const before = [...favoriteIds];
        const removing = favoriteIds.includes(id);
        const next = removing ? favoriteIds.filter(value => value !== id) : [...favoriteIds, id];
        const user = await currentUser();
        setFavoriteState(next, user?.id || null);
        if (typeof renderProducts === "function") renderProducts();
        if (!quiet && typeof showToast === "function") {
            showToast(removing ? "Eliminado de favoritos." : "Agregado a favoritos ❤️");
        }

        if (user) {
            const result = removing
                ? await supabaseClient.from("favorites").delete().eq("user_id", user.id).eq("product_id", id)
                : await supabaseClient.from("favorites").upsert(
                    { user_id: user.id, product_id: id },
                    { onConflict: "user_id,product_id" }
                );

            if (result.error) {
                console.error("No se pudo guardar favorito:", result.error);
                setFavoriteState(before, user.id);
                if (typeof renderProducts === "function") renderProducts();
                if (!quiet && typeof showToast === "function") showToast("No pudimos guardar el favorito. Inténtalo nuevamente.");
                favoriteLocks.delete(id);
                return false;
            }
        }

        favoriteLocks.delete(id);
        return !removing;
    }

    function installFavoriteAdapter() {
        try {
            if (typeof toggleFavorite === "function" && !toggleFavorite.__kantuPersistent) {
                const persistent = async function persistentFavorite(productId) {
                    return toggleFavoritePersistent(productId);
                };
                persistent.__kantuPersistent = true;
                toggleFavorite = persistent;
            }
        } catch {}

        try {
            if (typeof showFavoriteProducts === "function" && !showFavoriteProducts.__kantuDetails) {
                const base = showFavoriteProducts;
                showFavoriteProducts = function favoriteProductsWithDetails(...args) {
                    const result = base(...args);
                    const visible = typeof products !== "undefined"
                        ? products.filter(product => favoriteIds.includes(Number(product.id)))
                        : [];
                    document.querySelectorAll("#productsGrid .product-card").forEach((card, index) => {
                        const info = card.querySelector(".product-info");
                        const product = visible[index];
                        if (!info || !product || info.querySelector(".product-detail-link")) return;
                        const link = document.createElement("a");
                        link.className = "product-detail-link";
                        link.href = `producto.html?id=${Number(product.id)}`;
                        link.textContent = "Ver detalle";
                        const bottom = info.querySelector(".product-bottom");
                        if (bottom) bottom.insertAdjacentElement("beforebegin", link);
                        else info.appendChild(link);
                    });
                    return result;
                };
                showFavoriteProducts.__kantuDetails = true;
            }
        } catch {}
    }

    function installProductDetailFavorite() {
        const root = el("productDetailRoot");
        if (!root) return;
        const productId = Number(new URLSearchParams(window.location.search).get("id"));
        if (!Number.isSafeInteger(productId) || productId <= 0) return;

        const decorate = async () => {
            const actions = root.querySelector(".product-detail-actions");
            if (!actions || el("productDetailFavorite")) return;
            await favoritesReady;
            const button = document.createElement("button");
            button.id = "productDetailFavorite";
            button.type = "button";
            button.className = "product-detail-favorite";
            const sync = () => {
                const active = favoriteIds.includes(productId);
                button.classList.toggle("active", active);
                button.setAttribute("aria-pressed", String(active));
                button.textContent = active ? "♥ En favoritos" : "♡ Guardar favorito";
            };
            sync();
            button.addEventListener("click", async () => {
                button.disabled = true;
                await toggleFavoritePersistent(productId, { quiet: true });
                sync();
                button.disabled = false;
                const status = el("productDetailStatus");
                if (status) status.textContent = favoriteIds.includes(productId)
                    ? "✓ Producto guardado en favoritos."
                    : "Producto retirado de favoritos.";
            });
            actions.appendChild(button);
            window.addEventListener("kantu:favorites-changed", sync);
        };

        new MutationObserver(decorate).observe(root, { childList: true, subtree: true });
        decorate();
    }

    function daysInMonth(month) {
        if (month === 2) return 29;
        return [4, 6, 9, 11].includes(month) ? 30 : 31;
    }

    function peruTodayParts() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit"
        }).formatToParts(new Date());
        const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
    }

    function nextOccurrence(row) {
        const today = peruTodayParts();
        const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
        for (let year = today.year; year <= today.year + 8; year += 1) {
            const candidate = new Date(Date.UTC(year, Number(row.event_month) - 1, Number(row.event_day)));
            if (candidate.getUTCMonth() !== Number(row.event_month) - 1 || candidate.getUTCDate() !== Number(row.event_day)) continue;
            if (candidate.getTime() >= todayUtc) {
                return { date: candidate, days: Math.round((candidate.getTime() - todayUtc) / 86400000) };
            }
        }
        return null;
    }

    function formatSpecialDate(row) {
        return `${Number(row.event_day)} de ${MONTHS[Number(row.event_month) - 1] || ""}`;
    }

    function ensureReminderAccountUi() {
        const tabs = document.querySelector(".account-tabs");
        const ordersSection = el("accountOrdersSection");
        if (!tabs || !ordersSection) return null;

        let button = el("accountDatesTab");
        if (!button) {
            button = document.createElement("button");
            button.id = "accountDatesTab";
            button.type = "button";
            button.className = "account-tab";
            button.textContent = "Fechas especiales";
            button.addEventListener("click", showDatesSection);
            tabs.appendChild(button);
        }

        let section = el("accountSpecialDatesSection");
        if (!section) {
            section = document.createElement("section");
            section.id = "accountSpecialDatesSection";
            section.className = "account-section relationship-dates-section";
            section.hidden = true;
            section.innerHTML = `
                <div class="relationship-heading">
                    <div><h3>Fechas especiales</h3><p>Guarda cumpleaños, aniversarios u otras fechas para ver un recordatorio cuando visites Kantu.</p></div>
                </div>
                <form id="specialDateForm" class="special-date-form">
                    <div class="form-group relationship-wide"><label for="specialDateLabel">Nombre de la fecha *</label><input id="specialDateLabel" type="text" maxlength="120" placeholder="Ej.: Aniversario" required></div>
                    <div class="form-group"><label for="specialDateRecipient">Persona</label><input id="specialDateRecipient" type="text" maxlength="120" placeholder="Ej.: Valeria"></div>
                    <div class="form-group"><label for="specialDateOccasion">Tipo</label><select id="specialDateOccasion"><option value="birthday">Cumpleaños</option><option value="anniversary">Aniversario</option><option value="celebration">Celebración</option><option value="other">Otra fecha</option></select></div>
                    <div class="form-group"><label for="specialDateMonth">Mes *</label><select id="specialDateMonth">${MONTHS.map((month, index) => `<option value="${index + 1}">${month}</option>`).join("")}</select></div>
                    <div class="form-group"><label for="specialDateDay">Día *</label><input id="specialDateDay" type="number" min="1" max="31" value="1" required></div>
                    <div class="form-group"><label for="specialDateLead">Avisarme al visitar Kantu</label><select id="specialDateLead"><option value="0">El mismo día</option><option value="1">1 día antes</option><option value="3">3 días antes</option><option value="7" selected>7 días antes</option><option value="14">14 días antes</option><option value="30">30 días antes</option><option value="60">60 días antes</option></select></div>
                    <div class="form-group relationship-wide"><label for="specialDateNotes">Nota</label><textarea id="specialDateNotes" rows="2" maxlength="300" placeholder="Idea de flores, colores o detalle que le gusta..."></textarea></div>
                    <div class="account-order-actions-row relationship-wide"><button id="specialDateCancel" type="button" class="btn btn-light" hidden>Cancelar edición</button><button id="specialDateSave" type="submit" class="btn btn-primary">Guardar fecha</button></div>
                </form>
                <p id="specialDateMessage" class="account-message" role="status" aria-live="polite" hidden></p>
                <div id="specialDatesLoading" class="account-loading" hidden>Cargando fechas...</div>
                <div id="specialDatesList" class="special-dates-list"></div>
            `;
            ordersSection.insertAdjacentElement("afterend", section);
            bindReminderUi();
        }
        return section;
    }

    function showDatesSection() {
        ensureReminderAccountUi();
        el("accountProfileSection")?.setAttribute("hidden", "");
        el("accountOrdersSection")?.setAttribute("hidden", "");
        el("accountOrderDetailSection")?.setAttribute("hidden", "");
        const section = el("accountSpecialDatesSection");
        if (section) section.hidden = false;
        document.querySelectorAll(".account-tab").forEach(tab => {
            const active = tab.id === "accountDatesTab";
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        loadReminders();
    }

    function hideDatesSectionWhenOtherTabSelected() {
        document.querySelectorAll("[data-account-tab]").forEach(tab => {
            tab.addEventListener("click", () => {
                const section = el("accountSpecialDatesSection");
                if (section) section.hidden = true;
                el("accountDatesTab")?.classList.remove("active");
            });
        });
    }

    function updateDayMaximum() {
        const month = Number(el("specialDateMonth")?.value) || 1;
        const day = el("specialDateDay");
        if (!day) return;
        day.max = String(daysInMonth(month));
        if (Number(day.value) > Number(day.max)) day.value = day.max;
    }

    function showReminderMessage(message, type = "error") {
        const target = el("specialDateMessage");
        if (!target) return;
        target.textContent = message;
        target.className = `account-message ${type}`;
        target.hidden = !message;
    }

    function resetReminderForm() {
        editingReminderId = null;
        el("specialDateForm")?.reset();
        if (el("specialDateDay")) el("specialDateDay").value = "1";
        if (el("specialDateLead")) el("specialDateLead").value = "7";
        el("specialDateCancel")?.setAttribute("hidden", "");
        if (el("specialDateSave")) el("specialDateSave").textContent = "Guardar fecha";
        updateDayMaximum();
        showReminderMessage("");
    }

    async function saveReminder(event) {
        event.preventDefault();
        const user = reminderUser || await currentUser();
        if (!user) return;

        const label = String(el("specialDateLabel")?.value || "").trim();
        const recipient = String(el("specialDateRecipient")?.value || "").trim();
        const occasion = el("specialDateOccasion")?.value || "other";
        const month = Number(el("specialDateMonth")?.value);
        const day = Number(el("specialDateDay")?.value);
        const lead = Number(el("specialDateLead")?.value);
        const notes = String(el("specialDateNotes")?.value || "").trim();
        if (!label) return showReminderMessage("Escribe un nombre para la fecha.");
        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > daysInMonth(month)) {
            return showReminderMessage("Selecciona un día y mes válidos.");
        }

        const payload = {
            user_id: user.id,
            label,
            recipient_name: recipient || null,
            occasion,
            event_month: month,
            event_day: day,
            reminder_days_before: lead,
            notes: notes || null,
            updated_at: new Date().toISOString()
        };

        const save = el("specialDateSave");
        if (save) { save.disabled = true; save.textContent = "Guardando..."; }
        const result = editingReminderId
            ? await supabaseClient.from("special_date_reminders").update(payload).eq("id", editingReminderId).eq("user_id", user.id)
            : await supabaseClient.from("special_date_reminders").insert(payload);
        if (save) { save.disabled = false; save.textContent = editingReminderId ? "Guardar cambios" : "Guardar fecha"; }
        if (result.error) {
            console.error("Error guardando fecha especial:", result.error);
            showReminderMessage("No pudimos guardar la fecha.");
            return;
        }
        resetReminderForm();
        await loadReminders();
        showReminderMessage("Fecha guardada correctamente.", "success");
    }

    function editReminder(id) {
        const row = reminders.find(item => Number(item.id) === Number(id));
        if (!row) return;
        editingReminderId = Number(row.id);
        el("specialDateLabel").value = row.label || "";
        el("specialDateRecipient").value = row.recipient_name || "";
        el("specialDateOccasion").value = row.occasion || "other";
        el("specialDateMonth").value = String(row.event_month);
        el("specialDateDay").value = String(row.event_day);
        el("specialDateLead").value = String(row.reminder_days_before ?? 7);
        el("specialDateNotes").value = row.notes || "";
        updateDayMaximum();
        el("specialDateCancel").hidden = false;
        el("specialDateSave").textContent = "Guardar cambios";
        el("specialDateLabel")?.focus();
    }

    async function deleteReminder(id) {
        const user = reminderUser || await currentUser();
        if (!user) return;
        const result = await supabaseClient.from("special_date_reminders").delete().eq("id", id).eq("user_id", user.id);
        if (result.error) return showReminderMessage("No pudimos eliminar la fecha.");
        await loadReminders();
        showReminderMessage("Fecha eliminada.", "success");
    }

    async function toggleReminder(id) {
        const user = reminderUser || await currentUser();
        const row = reminders.find(item => Number(item.id) === Number(id));
        if (!user || !row) return;
        const result = await supabaseClient.from("special_date_reminders")
            .update({ active: !row.active, updated_at: new Date().toISOString() })
            .eq("id", id).eq("user_id", user.id);
        if (result.error) return showReminderMessage("No pudimos cambiar el recordatorio.");
        await loadReminders();
    }

    function renderReminders() {
        const list = el("specialDatesList");
        if (!list) return;
        const ordered = reminders.slice().sort((a, b) => (nextOccurrence(a)?.days ?? 9999) - (nextOccurrence(b)?.days ?? 9999));
        list.innerHTML = ordered.length ? ordered.map(row => {
            const next = nextOccurrence(row);
            const recipient = row.recipient_name ? ` · ${core.escapeHtml(row.recipient_name)}` : "";
            return `<article class="special-date-card${row.active ? "" : " inactive"}">
                <div class="special-date-main"><div><span>${core.escapeHtml(OCCASIONS[row.occasion] || OCCASIONS.other)}${recipient}</span><strong>${core.escapeHtml(row.label)}</strong><small>${core.escapeHtml(formatSpecialDate(row))}${next ? ` · en ${next.days} día${next.days === 1 ? "" : "s"}` : ""}</small></div><span class="special-date-state">${row.active ? `Aviso ${Number(row.reminder_days_before)}d antes` : "Pausado"}</span></div>
                ${row.notes ? `<p>${core.escapeHtml(row.notes)}</p>` : ""}
                <div class="special-date-actions"><button type="button" data-reminder-edit="${row.id}">Editar</button><button type="button" data-reminder-toggle="${row.id}">${row.active ? "Pausar" : "Activar"}</button><button type="button" class="danger" data-reminder-delete="${row.id}">Eliminar</button></div>
            </article>`;
        }).join("") : '<div class="account-empty compact"><h3>Aún no guardaste fechas especiales</h3><p>Agrega una fecha y Kantu te la recordará cuando vuelvas a visitar la tienda.</p></div>';
    }

    async function loadReminders() {
        const user = await currentUser();
        reminderUser = user;
        if (!user) { reminders = []; renderReminders(); renderUpcomingReminderBanner(); return; }
        const loading = el("specialDatesLoading");
        if (loading) loading.hidden = false;
        const result = await supabaseClient.from("special_date_reminders").select("*").eq("user_id", user.id).order("event_month").order("event_day");
        if (loading) loading.hidden = true;
        if (result.error) {
            console.error("Error cargando fechas especiales:", result.error);
            showReminderMessage("No pudimos cargar tus fechas.");
            return;
        }
        reminders = result.data || [];
        renderReminders();
        renderUpcomingReminderBanner();
    }

    function bindReminderUi() {
        el("specialDateForm")?.addEventListener("submit", saveReminder);
        el("specialDateCancel")?.addEventListener("click", resetReminderForm);
        el("specialDateMonth")?.addEventListener("change", updateDayMaximum);
        el("specialDatesList")?.addEventListener("click", event => {
            const edit = event.target.closest("[data-reminder-edit]");
            const toggle = event.target.closest("[data-reminder-toggle]");
            const remove = event.target.closest("[data-reminder-delete]");
            if (edit) editReminder(edit.dataset.reminderEdit);
            if (toggle) toggleReminder(toggle.dataset.reminderToggle);
            if (remove) deleteReminder(remove.dataset.reminderDelete);
        });
        updateDayMaximum();
    }

    function renderUpcomingReminderBanner() {
        const catalog = el("catalogo");
        if (!catalog) return;
        let banner = el("specialDateUpcomingBanner");
        if (!banner) {
            banner = document.createElement("aside");
            banner.id = "specialDateUpcomingBanner";
            banner.className = "special-date-upcoming-banner";
            banner.hidden = true;
            const tools = el("catalogTools");
            (tools || catalog.firstElementChild)?.insertAdjacentElement("beforebegin", banner);
        }

        const upcoming = reminders
            .filter(row => row.active)
            .map(row => ({ row, next: nextOccurrence(row) }))
            .filter(item => item.next && item.next.days <= Number(item.row.reminder_days_before || 0))
            .sort((a, b) => a.next.days - b.next.days)[0];

        banner.hidden = !upcoming;
        if (!upcoming) { banner.innerHTML = ""; return; }
        const who = upcoming.row.recipient_name ? ` para ${core.escapeHtml(upcoming.row.recipient_name)}` : "";
        banner.innerHTML = `<div><span>Fecha especial</span><strong>${core.escapeHtml(upcoming.row.label)}${who}</strong><small>${upcoming.next.days === 0 ? "Es hoy" : `Faltan ${upcoming.next.days} día${upcoming.next.days === 1 ? "" : "s"}`} · ${core.escapeHtml(formatSpecialDate(upcoming.row))}</small></div><button type="button" id="specialDateShopButton">Ver flores</button>`;
        el("specialDateShopButton")?.addEventListener("click", () => {
            document.querySelector(".categories")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    async function initializeSessionData() {
        migrateLegacyFavorites();
        await syncFavoritesForSession();
        favoritesReadyResolve?.();
        favoritesReadyResolve = null;
        installFavoriteAdapter();
        installProductDetailFavorite();
        if (el("accountModal")) {
            ensureReminderAccountUi();
            hideDatesSectionWhenOtherTabSelected();
            await loadReminders();
        }
    }

    function initialize() {
        ensureStyles();
        initializeSessionData();
        supabaseClient.auth.onAuthStateChange(() => {
            window.setTimeout(async () => {
                await syncFavoritesForSession();
                if (el("accountModal")) await loadReminders();
            }, 0);
        });
    }

    window.KantuFavoritesStore = Object.freeze({
        ready: favoritesReady,
        ids: () => [...favoriteIds],
        isFavorite: id => favoriteIds.includes(Number(id)),
        toggle: id => toggleFavoritePersistent(id),
        sync: syncFavoritesForSession
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
