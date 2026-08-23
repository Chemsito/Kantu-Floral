/* Kantu Floral - configuración de entregas programadas */

(() => {
    const SLOT_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/;
    let loading = false;

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-gifting-styles="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/gifting.css";
        link.dataset.kantuGiftingStyles = "true";
        document.head.appendChild(link);
    }

    function ensureCard() {
        const dashboard = document.getElementById("adminDashboardView");
        if (!dashboard) return null;
        let card = document.getElementById("adminScheduleCard");
        if (card) return card;

        card = document.createElement("section");
        card.id = "adminScheduleCard";
        card.className = "admin-schedule-card";
        card.innerHTML = `
            <h4>Entregas programadas</h4>
            <p>Activa fechas futuras y define las franjas horarias que el cliente puede solicitar. “Lo antes posible” seguirá disponible.</p>

            <label class="admin-schedule-toggle">
                <input id="adminScheduleEnabled" type="checkbox">
                <span>Permitir que el cliente programe la entrega</span>
            </label>

            <div class="admin-schedule-grid">
                <div class="form-group">
                    <label for="adminScheduleLeadHours">Anticipación mínima (horas)</label>
                    <input id="adminScheduleLeadHours" type="number" min="0" max="168" step="1" value="0">
                </div>
                <div class="form-group">
                    <label for="adminScheduleMaxDays">Máximo de días hacia adelante</label>
                    <input id="adminScheduleMaxDays" type="number" min="1" max="365" step="1" value="30">
                </div>
            </div>

            <div class="form-group">
                <label for="adminScheduleSlots">Franjas horarias</label>
                <textarea id="adminScheduleSlots" spellcheck="false" placeholder="09:00-12:00\n12:00-15:00\n15:00-18:00"></textarea>
                <small>Una franja por línea en formato HH:MM-HH:MM. No se inventan horarios: aquí defines los reales de Kantu.</small>
            </div>

            <div class="admin-schedule-actions">
                <button id="adminScheduleSave" type="button" class="btn btn-primary">Guardar horarios</button>
                <span id="adminScheduleStatus" class="admin-schedule-status" role="status" aria-live="polite"></span>
            </div>
        `;

        const stats = document.getElementById("adminStatsGrid");
        if (stats) stats.insertAdjacentElement("afterend", card);
        else dashboard.appendChild(card);

        document.getElementById("adminScheduleSave")?.addEventListener("click", saveSettings);
        return card;
    }

    function setStatus(message, type = "") {
        const status = document.getElementById("adminScheduleStatus");
        if (!status) return;
        status.textContent = message;
        status.className = `admin-schedule-status${type ? ` ${type}` : ""}`;
    }

    function parseSlots() {
        const raw = document.getElementById("adminScheduleSlots")?.value || "";
        const slots = [...new Set(
            raw.split(/[\n,]+/)
                .map(value => value.trim())
                .filter(Boolean)
        )];

        for (const slot of slots) {
            if (!SLOT_PATTERN.test(slot)) {
                throw new Error(`La franja “${slot}” debe usar el formato HH:MM-HH:MM.`);
            }
            const [start, end] = slot.split("-");
            if (start >= end) {
                throw new Error(`La franja “${slot}” debe terminar después de la hora de inicio.`);
            }
        }

        return slots;
    }

    async function loadSettings() {
        if (loading || !ensureCard()) return;
        loading = true;
        setStatus("Cargando configuración...");

        const { data, error } = await supabaseClient
            .from("delivery_schedule_settings")
            .select("scheduling_enabled, min_lead_hours, max_days_ahead, slots")
            .eq("id", 1)
            .maybeSingle();

        loading = false;
        if (error) {
            // Si el usuario aún no es Admin, RLS puede responder sin datos. No ensuciamos la interfaz pública.
            setStatus("");
            return;
        }

        document.getElementById("adminScheduleEnabled").checked = Boolean(data?.scheduling_enabled);
        document.getElementById("adminScheduleLeadHours").value = Number(data?.min_lead_hours ?? 0);
        document.getElementById("adminScheduleMaxDays").value = Number(data?.max_days_ahead ?? 30);
        document.getElementById("adminScheduleSlots").value = Array.isArray(data?.slots)
            ? data.slots.join("\n")
            : "";
        setStatus("Configuración cargada.", "success");
    }

    async function saveSettings() {
        let slots;
        try {
            slots = parseSlots();
        } catch (error) {
            setStatus(error.message, "error");
            return;
        }

        const enabled = Boolean(document.getElementById("adminScheduleEnabled")?.checked);
        const leadHours = Number(document.getElementById("adminScheduleLeadHours")?.value);
        const maxDays = Number(document.getElementById("adminScheduleMaxDays")?.value);

        if (!Number.isInteger(leadHours) || leadHours < 0 || leadHours > 168) {
            setStatus("La anticipación debe estar entre 0 y 168 horas.", "error");
            return;
        }
        if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 365) {
            setStatus("El máximo debe estar entre 1 y 365 días.", "error");
            return;
        }
        if (enabled && slots.length === 0) {
            setStatus("Agrega al menos una franja antes de activar la programación.", "error");
            return;
        }

        const button = document.getElementById("adminScheduleSave");
        if (button) {
            button.disabled = true;
            button.textContent = "Guardando...";
        }
        setStatus("Guardando configuración...");

        const { error } = await supabaseClient
            .from("delivery_schedule_settings")
            .update({
                scheduling_enabled: enabled,
                min_lead_hours: leadHours,
                max_days_ahead: maxDays,
                slots,
                updated_at: new Date().toISOString()
            })
            .eq("id", 1);

        if (button) {
            button.disabled = false;
            button.textContent = "Guardar horarios";
        }

        if (error) {
            console.error("Error guardando agenda de delivery:", error);
            setStatus("No pudimos guardar los horarios. Verifica tu sesión de Administrador.", "error");
            return;
        }

        setStatus("Horarios actualizados correctamente.", "success");
    }

    function initialize() {
        ensureStyles();
        ensureCard();

        document.querySelector('[data-admin-view="dashboard"]')?.addEventListener("click", () => {
            window.setTimeout(loadSettings, 0);
        });
        document.getElementById("accountAdminButton")?.addEventListener("click", () => {
            window.setTimeout(loadSettings, 350);
        });

        const content = document.getElementById("adminContent");
        if (content) {
            new MutationObserver(() => {
                if (!content.hidden && !document.getElementById("adminDashboardView")?.hidden) {
                    loadSettings();
                }
            }).observe(content, { attributes: true, attributeFilter: ["hidden"] });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
