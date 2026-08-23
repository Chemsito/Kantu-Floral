/* Kantu Floral - cupos y fechas bloqueadas para entregas programadas */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let checkoutRequestId = 0;
    let adminLoading = false;
    let adminSettings = null;

    const deliveryErrors = Object.freeze({
        DELIVERY_DATE_UNAVAILABLE: "La fecha seleccionada no está disponible para entregas programadas.",
        DELIVERY_SLOT_FULL: "La franja seleccionada ya no tiene cupo. Elige otro horario o fecha.",
        DELIVERY_SLOT_TOO_SOON: "Esa franja ya no cumple la anticipación mínima. Elige otra.",
        DELIVERY_SCHEDULING_DISABLED: "Las entregas programadas no están disponibles en este momento."
    });

    const availabilityLabels = Object.freeze({
        SCHEDULING_DISABLED: "Programación no disponible",
        DATE_OUT_OF_RANGE: "Fecha fuera del rango permitido",
        DATE_BLOCKED: "Fecha no disponible",
        TOO_SOON: "Ya no cumple la anticipación mínima",
        SLOT_FULL: "Sin cupo",
        INVALID_DELIVERY_SLOT: "Franja no disponible"
    });

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-delivery-availability-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/delivery-availability.css";
        link.dataset.kantuDeliveryAvailabilityStyle = "true";
        document.head.appendChild(link);
    }

    function slotLabel(slot) {
        const [start, end] = String(slot || "").split("-");
        return start && end ? `${start} – ${end}` : String(slot || "");
    }

    function installOrderErrorAdapter() {
        if (typeof getOrderErrorMessage !== "function" || getOrderErrorMessage.__kantuDeliveryAvailability) return;
        const base = getOrderErrorMessage;
        getOrderErrorMessage = function deliveryAwareOrderError(error, ...args) {
            const deliveryMessage = core.resolveErrorMessage(error, deliveryErrors, "");
            return deliveryMessage || base(error, ...args);
        };
        getOrderErrorMessage.__kantuDeliveryAvailability = true;
    }

    function setCheckoutHint(message, state = "") {
        const hint = el("checkoutScheduleHint");
        if (!hint || !message) return;
        hint.textContent = message;
        hint.className = `checkout-schedule-hint${state ? ` ${state}` : ""}`;
    }

    function reasonSuffix(row) {
        const reason = availabilityLabels[row?.reason];
        if (reason) return reason;
        if (row?.capacity != null) {
            const remaining = Math.max(0, Number(row.capacity) - Number(row.reserved_count || 0));
            return remaining === 1 ? "1 cupo disponible" : `${remaining} cupos disponibles`;
        }
        return "Disponible";
    }

    function renderCheckoutAvailability(rows) {
        const select = el("checkoutRequestedSlot");
        if (!select) return;

        const previous = select.value;
        select.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Selecciona una franja...";
        select.appendChild(placeholder);

        let availableCount = 0;
        for (const row of Array.isArray(rows) ? rows : []) {
            const option = document.createElement("option");
            option.value = String(row.slot || "");
            option.disabled = !row.available;
            option.textContent = `${slotLabel(row.slot)} · ${reasonSuffix(row)}`;
            if (row.available) availableCount += 1;
            select.appendChild(option);
        }

        const previousOption = [...select.options].find(option => option.value === previous && !option.disabled);
        select.value = previousOption ? previous : "";
        select.disabled = false;

        if (!rows?.length) {
            setCheckoutHint("No hay franjas configuradas para entregas programadas.");
        } else if (!availableCount) {
            const reasons = new Set(rows.map(row => row.reason).filter(Boolean));
            if (reasons.size === 1 && reasons.has("DATE_BLOCKED")) {
                setCheckoutHint("Kantu no recibe entregas programadas en esa fecha.", "unavailable");
            } else {
                setCheckoutHint("No quedan franjas disponibles para esa fecha. Prueba otro día.", "unavailable");
            }
        } else {
            setCheckoutHint(`${availableCount} ${availableCount === 1 ? "franja disponible" : "franjas disponibles"} para la fecha elegida.`, "available");
        }
    }

    async function refreshCheckoutAvailability() {
        const timing = el("checkoutDeliveryTiming");
        const date = el("checkoutRequestedDate");
        const select = el("checkoutRequestedSlot");
        if (!timing || !date || !select || timing.value !== "scheduled" || !date.value) return null;

        const requestId = ++checkoutRequestId;
        select.disabled = true;
        setCheckoutHint("Verificando disponibilidad de entrega...");

        const { data, error } = await supabaseClient.rpc("get_delivery_schedule_availability", {
            p_date: date.value
        });

        if (requestId !== checkoutRequestId) return null;
        if (error) {
            console.error("Error consultando disponibilidad de delivery:", error);
            select.disabled = false;
            setCheckoutHint("No pudimos verificar los cupos. Puedes intentar nuevamente; Kantu volverá a validar al crear el pedido.", "unavailable");
            return null;
        }

        renderCheckoutAvailability(data || []);
        return data || [];
    }

    function bindCheckout() {
        const timing = el("checkoutDeliveryTiming");
        const date = el("checkoutRequestedDate");
        if (!timing || !date) return;

        if (!date.dataset.deliveryAvailabilityBound) {
            date.dataset.deliveryAvailabilityBound = "true";
            date.addEventListener("change", refreshCheckoutAvailability);
        }
        if (!timing.dataset.deliveryAvailabilityBound) {
            timing.dataset.deliveryAvailabilityBound = "true";
            timing.addEventListener("change", () => {
                checkoutRequestId += 1;
                if (timing.value === "scheduled" && date.value) refreshCheckoutAvailability();
            });
        }
    }

    function parseIsoDates(raw) {
        const values = [...new Set(String(raw || "")
            .split(/[\n,]+/)
            .map(value => value.trim())
            .filter(Boolean))];

        for (const value of values) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                throw new Error(`La fecha “${value}” debe usar el formato AAAA-MM-DD.`);
            }
            const date = new Date(`${value}T00:00:00Z`);
            if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
                throw new Error(`La fecha “${value}” no es válida.`);
            }
        }
        return values.sort();
    }

    function ensureAdminControls() {
        const card = el("adminScheduleCard");
        if (!card) return null;
        let section = el("adminDeliveryAvailability");
        if (section) return section;

        section = document.createElement("section");
        section.id = "adminDeliveryAvailability";
        section.className = "admin-delivery-availability";
        section.innerHTML = `
            <div class="admin-delivery-availability-heading">
                <div>
                    <h5>Disponibilidad y capacidad</h5>
                    <p>Opcional. Si dejas una franja sin límite, seguirá aceptando pedidos sin tope. Los pedidos no cancelados ocupan cupo.</p>
                </div>
                <button id="adminDeliveryAvailabilityRefresh" type="button" class="admin-refresh">Actualizar</button>
            </div>

            <div class="form-group">
                <label>Capacidad por franja</label>
                <div id="adminDeliveryCapacityGrid" class="admin-delivery-capacity-grid"></div>
                <small>Vacío = sin límite. Guarda primero las franjas horarias de arriba si acabas de cambiarlas.</small>
            </div>

            <div class="form-group">
                <label for="adminDeliveryBlackoutDates">Fechas sin entrega programada</label>
                <textarea id="adminDeliveryBlackoutDates" spellcheck="false" placeholder="2026-12-25\n2027-01-01"></textarea>
                <small>Una fecha por línea en formato AAAA-MM-DD. No se agrega ninguna automáticamente.</small>
            </div>

            <div class="admin-delivery-availability-actions">
                <button id="adminDeliveryAvailabilitySave" type="button" class="btn btn-primary">Guardar disponibilidad</button>
                <span id="adminDeliveryAvailabilityStatus" class="admin-schedule-status" role="status" aria-live="polite"></span>
            </div>
        `;

        const actions = card.querySelector(".admin-schedule-actions");
        if (actions) actions.insertAdjacentElement("beforebegin", section);
        else card.appendChild(section);

        el("adminDeliveryAvailabilitySave")?.addEventListener("click", saveAdminAvailability);
        el("adminDeliveryAvailabilityRefresh")?.addEventListener("click", loadAdminAvailability);
        el("adminScheduleSave")?.addEventListener("click", () => window.setTimeout(loadAdminAvailability, 900));
        return section;
    }

    function setAdminStatus(message, type = "") {
        const status = el("adminDeliveryAvailabilityStatus");
        if (!status) return;
        status.textContent = message || "";
        status.className = `admin-schedule-status${type ? ` ${type}` : ""}`;
    }

    function renderCapacityGrid(slots, capacities) {
        const grid = el("adminDeliveryCapacityGrid");
        if (!grid) return;
        const values = Array.isArray(slots) ? slots : [];
        if (!values.length) {
            grid.innerHTML = '<p class="delivery-availability-empty">No hay franjas guardadas todavía.</p>';
            return;
        }

        grid.innerHTML = values.map(slot => {
            const value = capacities && Object.prototype.hasOwnProperty.call(capacities, slot)
                ? Number(capacities[slot]) || ""
                : "";
            return `<label class="admin-delivery-capacity-row">
                <span>${core.escapeHtml(slotLabel(slot))}</span>
                <input type="number" min="1" max="1000" step="1" inputmode="numeric" data-delivery-capacity-slot="${core.escapeHtml(slot)}" value="${core.escapeHtml(String(value))}" placeholder="Sin límite">
            </label>`;
        }).join("");
    }

    async function loadAdminAvailability() {
        if (adminLoading || !ensureAdminControls()) return null;
        adminLoading = true;
        setAdminStatus("Cargando disponibilidad...");

        const { data, error } = await supabaseClient
            .from("delivery_schedule_settings")
            .select("slots, blackout_dates, slot_capacities")
            .eq("id", 1)
            .maybeSingle();

        adminLoading = false;
        if (error || !data) {
            setAdminStatus("");
            return null;
        }

        adminSettings = data;
        renderCapacityGrid(data.slots || [], data.slot_capacities || {});
        const blackout = el("adminDeliveryBlackoutDates");
        if (blackout) blackout.value = Array.isArray(data.blackout_dates) ? data.blackout_dates.join("\n") : "";
        setAdminStatus("Disponibilidad cargada.", "success");
        return data;
    }

    function readCapacities() {
        const result = {};
        document.querySelectorAll("[data-delivery-capacity-slot]").forEach(input => {
            const raw = String(input.value || "").trim();
            if (!raw) return;
            const value = Number(raw);
            if (!Number.isInteger(value) || value < 1 || value > 1000) {
                throw new Error(`El cupo de ${slotLabel(input.dataset.deliveryCapacitySlot)} debe ser un entero entre 1 y 1000.`);
            }
            result[input.dataset.deliveryCapacitySlot] = value;
        });
        return result;
    }

    async function saveAdminAvailability() {
        let blackoutDates;
        let slotCapacities;
        try {
            blackoutDates = parseIsoDates(el("adminDeliveryBlackoutDates")?.value || "");
            slotCapacities = readCapacities();
        } catch (error) {
            setAdminStatus(error.message, "error");
            return;
        }

        const button = el("adminDeliveryAvailabilitySave");
        if (button) {
            button.disabled = true;
            button.textContent = "Guardando...";
        }
        setAdminStatus("Guardando disponibilidad...");

        const { error } = await supabaseClient
            .from("delivery_schedule_settings")
            .update({
                blackout_dates: blackoutDates,
                slot_capacities: slotCapacities,
                updated_at: new Date().toISOString()
            })
            .eq("id", 1);

        if (button) {
            button.disabled = false;
            button.textContent = "Guardar disponibilidad";
        }

        if (error) {
            console.error("Error guardando disponibilidad de delivery:", error);
            setAdminStatus("No pudimos guardar la disponibilidad. Verifica tu sesión de Administrador.", "error");
            return;
        }

        setAdminStatus("Disponibilidad actualizada correctamente.", "success");
        await loadAdminAvailability();
    }

    function bindAdminNavigation() {
        document.querySelector('[data-admin-view="dashboard"]')?.addEventListener("click", () => {
            window.setTimeout(loadAdminAvailability, 0);
        });
        el("accountAdminButton")?.addEventListener("click", () => {
            window.setTimeout(loadAdminAvailability, 450);
        });
    }

    function initialize() {
        ensureStyles();
        installOrderErrorAdapter();
        bindCheckout();
        ensureAdminControls();
        bindAdminNavigation();
        window.setTimeout(loadAdminAvailability, 300);

        const observer = new MutationObserver(() => {
            bindCheckout();
            if (ensureAdminControls() && !adminSettings) loadAdminAvailability();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.KantuDeliveryAvailability = Object.freeze({
        refreshCheckout: refreshCheckoutAvailability,
        refreshAdmin: loadAdminAvailability
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
