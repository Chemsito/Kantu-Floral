/* Kantu Floral - centro de alertas Admin, reclamos y control comercial de Kantu Match */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const alertState = {
        rows: [],
        initialized: false,
        knownKeys: new Set(),
        audioReady: false,
        audioContext: null,
        pollTimer: null,
        repeatTimer: null
    };

    const RECOMMENDATION_OPTIONS = Object.freeze({
        audiences: [["pareja","Pareja"],["mama","Mamá"],["amiga","Amiga"],["familiar","Familiar"],["otro","Otra persona"]],
        occasions: [["cumpleanos","Cumpleaños"],["aniversario","Aniversario"],["amor","Te amo"],["perdon","Perdón"],["gracias","Gracias"],["primera_cita","Primera cita"],["sorpresa","Sorpresa"]],
        styles: [["romantico","Romántico"],["tierno","Tierno"],["elegante","Elegante"],["impactante","Impactante"],["alegre","Alegre"]]
    });

    function el(id) { return document.getElementById(id); }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-growth-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/kantu-growth.css";
        link.dataset.kantuGrowthStyle = "true";
        document.head.appendChild(link);
    }

    function ensureAdminGrowthViews() {
        const content = el("adminContent");
        const nav = document.querySelector(".admin-nav");
        if (!content || !nav) return false;

        if (!nav.querySelector('[data-admin-view="alerts"]')) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = "alerts";
            button.textContent = "Alertas";
            nav.querySelector('[data-admin-view="orders"]')?.insertAdjacentElement("beforebegin", button);
            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView("alerts");
                loadAdminAlerts();
            });
        }

        if (!nav.querySelector('[data-admin-view="claims"]')) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = "claims";
            button.textContent = "Reclamos";
            nav.appendChild(button);
            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView("claims");
                loadAdminClaims();
            });
        }

        if (!el("adminAlertsView")) {
            const section = document.createElement("section");
            section.id = "adminAlertsView";
            section.className = "admin-view";
            section.hidden = true;
            section.innerHTML = `
                <div class="admin-section-heading">
                    <div><h3>Centro de alertas</h3><p>Lo que necesita intervención ahora: pagos, pedidos demorados, stock, entregas y reclamos.</p></div>
                    <button type="button" class="admin-refresh" id="adminAlertsRefresh">Actualizar</button>
                </div>
                <p class="admin-alert-sound-note" id="adminAlertSoundNote">🔔 El sonido urgente se activará después de tu primera interacción con esta pestaña.</p>
                <div id="adminAlertSummary" class="admin-alert-summary"></div>
                <div id="adminAlertsList" class="admin-alert-list"><div class="admin-loader">Cargando alertas…</div></div>`;
            content.prepend(section);
            section.querySelector("#adminAlertsRefresh")?.addEventListener("click", () => loadAdminAlerts({ forceSound: false }));
        }

        if (!el("adminClaimsView")) {
            const section = document.createElement("section");
            section.id = "adminClaimsView";
            section.className = "admin-view";
            section.hidden = true;
            section.innerHTML = `
                <div class="admin-section-heading">
                    <div><h3>Libro de Reclamaciones</h3><p>Revisa los casos ingresados desde la tienda y documenta su atención.</p></div>
                    <button type="button" class="admin-refresh" id="adminClaimsRefresh">Actualizar</button>
                </div>
                <div id="adminClaimsLoading" class="admin-loader" hidden>Cargando reclamos…</div>
                <div id="adminClaimsEmpty" class="admin-empty" hidden>No hay reclamos registrados.</div>
                <div id="adminClaimsList" class="admin-claims-list"></div>`;
            content.appendChild(section);
            section.querySelector("#adminClaimsRefresh")?.addEventListener("click", loadAdminClaims);
            section.querySelector("#adminClaimsList")?.addEventListener("click", event => {
                const save = event.target.closest?.("[data-save-claim]");
                if (save) saveAdminClaim(save.dataset.saveClaim, save);
            });
        }

        ensureAdminAlertBell();
        return true;
    }

    function ensureAdminAlertBell() {
        const header = document.querySelector(".admin-header");
        const close = el("adminCloseButton");
        if (!header || !close || el("adminAlertBell")) return;
        const wrap = document.createElement("div");
        wrap.className = "admin-alert-button-wrap";
        wrap.innerHTML = `<button type="button" id="adminAlertBell" class="admin-alert-bell" aria-label="Abrir alertas urgentes" title="Alertas urgentes">🔔<span id="adminAlertCount" class="admin-alert-count" hidden>0</span></button>`;
        close.insertAdjacentElement("beforebegin", wrap);
        wrap.querySelector("#adminAlertBell")?.addEventListener("click", () => {
            if (typeof switchAdminView === "function") switchAdminView("alerts");
            loadAdminAlerts();
        });
    }

    function armAdminAudio() {
        if (alertState.audioReady) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            alertState.audioContext = alertState.audioContext || new AudioContextClass();
            if (alertState.audioContext.state === "suspended") alertState.audioContext.resume().catch(() => {});
            alertState.audioReady = true;
            const note = el("adminAlertSoundNote");
            if (note) note.textContent = "🔊 Sonido urgente activado. Se repetirá mientras existan alertas urgentes sin resolver.";
            if (alertState.rows.some(row => row.severity === "urgent")) playAdminAlarm();
        } catch {
            // Las alertas visuales siguen activas aunque el navegador no tenga Web Audio.
        }
    }

    function playAdminAlarm() {
        const ctx = alertState.audioContext;
        if (!alertState.audioReady || !ctx || document.hidden) return;
        const start = ctx.currentTime + .03;
        [880, 660, 880, 660].forEach((frequency, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = index % 2 ? "square" : "sawtooth";
            osc.frequency.value = frequency;
            const at = start + index * .19;
            gain.gain.setValueAtTime(.0001, at);
            gain.gain.exponentialRampToValueAtTime(.13, at + .02);
            gain.gain.exponentialRampToValueAtTime(.0001, at + .15);
            osc.connect(gain).connect(ctx.destination);
            osc.start(at);
            osc.stop(at + .17);
        });
    }

    function severityLabel(value) {
        return value === "urgent" ? "Urgente" : value === "warning" ? "Atención" : "Informativo";
    }

    function syncAdminAlertBadge() {
        const badge = el("adminAlertCount");
        if (!badge) return;
        const count = alertState.rows.filter(row => row.severity !== "info").length;
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = count === 0;
    }

    function renderAdminAlerts() {
        const list = el("adminAlertsList");
        const summary = el("adminAlertSummary");
        if (!list || !summary) return;
        const urgent = alertState.rows.filter(row => row.severity === "urgent").length;
        const warning = alertState.rows.filter(row => row.severity === "warning").length;
        const info = alertState.rows.filter(row => row.severity === "info").length;
        summary.innerHTML = `<div><span>Urgentes</span><strong>${urgent}</strong></div><div><span>Necesitan atención</span><strong>${warning}</strong></div><div><span>Informativas</span><strong>${info}</strong></div>`;
        if (!alertState.rows.length) {
            list.innerHTML = '<div class="commerce-empty">No hay incidencias operativas activas. Todo está bajo control.</div>';
            return;
        }
        list.innerHTML = alertState.rows.map(row => `<article class="admin-alert-card ${core.escapeHtml(row.severity || "info")}">
            <div><h4>${core.escapeHtml(row.title || "Alerta")}</h4><p>${core.escapeHtml(row.body || "")}</p><small>${severityLabel(row.severity)}${Number(row.minutes_waiting) > 0 ? ` · ${Number(row.minutes_waiting)} min` : ""}</small></div>
            <button type="button" data-admin-alert-action="${core.escapeHtml(row.action_view || "dashboard")}" data-alert-entity="${core.escapeHtml(row.entity_id || "")}">Revisar</button>
        </article>`).join("");
        list.querySelectorAll("[data-admin-alert-action]").forEach(button => button.addEventListener("click", () => openAdminAlertTarget(button)));
    }

    async function loadAdminAlerts({ forceSound = false } = {}) {
        if (!ensureAdminGrowthViews()) return;
        const result = await supabaseClient.rpc("admin_operational_alerts");
        if (result.error) {
            const list = el("adminAlertsList");
            if (list) list.innerHTML = '<div class="admin-empty">No pudimos cargar las alertas operativas.</div>';
            return;
        }
        const rows = Array.isArray(result.data) ? result.data : [];
        const nextKeys = new Set(rows.map(row => String(row.alert_key)));
        const newUrgent = rows.some(row => row.severity === "urgent" && !alertState.knownKeys.has(String(row.alert_key)));
        alertState.rows = rows;
        renderAdminAlerts();
        syncAdminAlertBadge();
        if (alertState.initialized && (newUrgent || forceSound)) playAdminAlarm();
        alertState.knownKeys = nextKeys;
        alertState.initialized = true;
    }

    async function openAdminAlertTarget(button) {
        const view = button.dataset.adminAlertAction || "dashboard";
        const entity = button.dataset.alertEntity || "";
        if (typeof switchAdminView === "function") switchAdminView(view);
        if (view === "claims") {
            await loadAdminClaims();
            const target = document.querySelector(`[data-claim-card="${CSS.escape(entity)}"]`);
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (view === "payments" && typeof loadAdminPaymentProofs === "function") {
            await loadAdminPaymentProofs();
        } else if (view === "orders" && typeof loadAdminOrders === "function") {
            await loadAdminOrders();
        } else if (view === "products" && typeof loadAdminProducts === "function") {
            await loadAdminProducts();
            const edit = document.querySelector(`[data-admin-edit-product="${CSS.escape(entity)}"]`);
            edit?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    async function loadAdminClaims() {
        if (!ensureAdminGrowthViews()) return;
        const loading = el("adminClaimsLoading");
        const list = el("adminClaimsList");
        const empty = el("adminClaimsEmpty");
        if (loading) loading.hidden = false;
        if (list) list.innerHTML = "";
        const result = await supabaseClient.from("customer_claims").select("*").order("created_at", { ascending: false }).limit(200);
        if (loading) loading.hidden = true;
        if (result.error) {
            if (list) list.innerHTML = '<div class="admin-empty">No pudimos cargar el Libro de Reclamaciones.</div>';
            return;
        }
        const rows = result.data || [];
        if (empty) empty.hidden = rows.length > 0;
        if (!list) return;
        list.innerHTML = rows.map(row => `<article class="admin-claim-card" data-claim-card="${core.escapeHtml(row.id)}">
            <div class="admin-claim-card-head"><div><span>${core.escapeHtml(String(row.complaint_type || "").toUpperCase())}</span><h4>${core.escapeHtml(row.claim_number)}</h4></div><span>${core.escapeHtml(core.formatDate(row.created_at))}</span></div>
            <div class="admin-claim-meta">
                <div>Cliente<strong>${core.escapeHtml(row.full_name)}</strong></div><div>Documento<strong>${core.escapeHtml(`${row.document_type?.toUpperCase() || ""} ${row.document_number || ""}`)}</strong></div>
                <div>Correo<strong>${core.escapeHtml(row.email)}</strong></div><div>Teléfono<strong>${core.escapeHtml(row.phone || "—")}</strong></div>
                <div>Pedido<strong>${core.escapeHtml(row.order_reference || "—")}</strong></div><div>Producto / servicio<strong>${core.escapeHtml(row.product_service || "—")}</strong></div>
                <div>Monto<strong>${row.amount_claimed == null ? "—" : core.escapeHtml(core.formatMoney(row.amount_claimed))}</strong></div><div>Dirección<strong>${core.escapeHtml(row.address)}</strong></div>
            </div>
            <div class="admin-claim-body"><strong>Detalle</strong><p>${core.escapeHtml(row.detail)}</p><strong>Solución solicitada</strong><p>${core.escapeHtml(row.requested_action)}</p></div>
            <div class="admin-claim-controls">
                <label>Estado<select data-claim-status><option value="recibido"${row.status === "recibido" ? " selected" : ""}>Recibido</option><option value="en_revision"${row.status === "en_revision" ? " selected" : ""}>En revisión</option><option value="resuelto"${row.status === "resuelto" ? " selected" : ""}>Resuelto</option></select></label>
                <label>Prioridad<select data-claim-priority><option value="normal"${row.priority === "normal" ? " selected" : ""}>Normal</option><option value="alta"${row.priority === "alta" ? " selected" : ""}>Alta</option><option value="urgente"${row.priority === "urgente" ? " selected" : ""}>Urgente</option></select></label>
                <label>Notas internas<textarea data-claim-notes maxlength="4000" placeholder="Qué se revisó, contacto con cliente, solución…">${core.escapeHtml(row.admin_notes || "")}</textarea></label>
                <button type="button" data-save-claim="${core.escapeHtml(row.id)}">Guardar</button>
            </div>
        </article>`).join("");
    }

    async function saveAdminClaim(id, button) {
        const card = button.closest(".admin-claim-card");
        if (!card) return;
        button.disabled = true;
        button.textContent = "Guardando…";
        const payload = {
            status: card.querySelector("[data-claim-status]")?.value || "recibido",
            priority: card.querySelector("[data-claim-priority]")?.value || "normal",
            admin_notes: card.querySelector("[data-claim-notes]")?.value.trim() || null
        };
        const result = await supabaseClient.from("customer_claims").update(payload).eq("id", id).select("id").maybeSingle();
        button.disabled = false;
        button.textContent = "Guardar";
        if (result.error) {
            if (typeof showAdminMessage === "function") showAdminMessage("No pudimos guardar el reclamo.");
            return;
        }
        if (typeof showAdminMessage === "function") showAdminMessage("Caso actualizado correctamente.", "success");
        await Promise.all([loadAdminClaims(), loadAdminAlerts()]);
    }

    function checksMarkup(group, options) {
        return options.map(([value,label]) => `<label><input type="checkbox" data-recommendation-${group} value="${value}"><span>${label}</span></label>`).join("");
    }

    function ensureRecommendationFields() {
        const form = el("adminProductForm");
        if (!form || el("adminRecommendationFields")) return;
        const actions = form.querySelector(".admin-form-actions");
        const section = document.createElement("section");
        section.id = "adminRecommendationFields";
        section.className = "admin-recommendation-fields";
        section.innerHTML = `<h4>Kantu Match · prioridad comercial</h4><p>Usa estos controles para dirigir recomendaciones hacia productos fáciles de preparar, estratégicos o de mejor rentabilidad. No cambia el precio del producto.</p>
            <div class="admin-recommendation-priority"><label>Prioridad comercial (0–10)<input id="adminRecommendationPriority" type="range" min="0" max="10" step="1" value="0"></label><label>Valor<input id="adminRecommendationPriorityValue" type="number" min="0" max="10" step="1" value="0"></label></div>
            <div class="admin-recommendation-groups">
                <div class="admin-recommendation-group"><strong>Ideal para</strong><div class="admin-recommendation-checks">${checksMarkup("audience", RECOMMENDATION_OPTIONS.audiences)}</div></div>
                <div class="admin-recommendation-group"><strong>Ocasiones</strong><div class="admin-recommendation-checks">${checksMarkup("occasion", RECOMMENDATION_OPTIONS.occasions)}</div></div>
                <div class="admin-recommendation-group"><strong>Estilo</strong><div class="admin-recommendation-checks">${checksMarkup("style", RECOMMENDATION_OPTIONS.styles)}</div></div>
            </div>`;
        if (actions) actions.insertAdjacentElement("beforebegin", section); else form.appendChild(section);
        const range = el("adminRecommendationPriority");
        const number = el("adminRecommendationPriorityValue");
        range?.addEventListener("input", () => { if (number) number.value = range.value; });
        number?.addEventListener("input", () => { if (range) range.value = String(Math.max(0, Math.min(10, Number(number.value) || 0))); });
    }

    function populateRecommendationFields(product = null) {
        ensureRecommendationFields();
        const priority = Math.max(0, Math.min(10, Number(product?.recommendation_priority) || 0));
        if (el("adminRecommendationPriority")) el("adminRecommendationPriority").value = String(priority);
        if (el("adminRecommendationPriorityValue")) el("adminRecommendationPriorityValue").value = String(priority);
        const mappings = [
            ["audience", product?.recommendation_audiences],
            ["occasion", product?.recommendation_occasions],
            ["style", product?.recommendation_styles]
        ];
        mappings.forEach(([group, values]) => {
            const selected = new Set(Array.isArray(values) ? values.map(String) : []);
            document.querySelectorAll(`[data-recommendation-${group}]`).forEach(input => { input.checked = selected.has(input.value); });
        });
    }

    function recommendationPayload() {
        const priority = Math.max(0, Math.min(10, Number(el("adminRecommendationPriorityValue")?.value) || 0));
        const checked = group => [...document.querySelectorAll(`[data-recommendation-${group}]:checked`)].map(input => input.value);
        return {
            recommendation_priority: priority,
            recommendation_audiences: checked("audience"),
            recommendation_occasions: checked("occasion"),
            recommendation_styles: checked("style")
        };
    }

    function installRecommendationHooks() {
        ensureRecommendationFields();
        if (typeof populateAdminProductMetadata === "function" && !populateAdminProductMetadata.__kantuGrowth) {
            const base = populateAdminProductMetadata;
            const wrapped = function(product = null, ...args) {
                const result = base(product, ...args);
                populateRecommendationFields(product);
                return result;
            };
            wrapped.__kantuGrowth = true;
            populateAdminProductMetadata = wrapped;
        }
        if (typeof readEnhancedAdminProductPayload === "function" && !readEnhancedAdminProductPayload.__kantuGrowth) {
            const base = readEnhancedAdminProductPayload;
            const wrapped = function(...args) {
                return { ...base(...args), ...recommendationPayload() };
            };
            wrapped.__kantuGrowth = true;
            readEnhancedAdminProductPayload = wrapped;
        }
        if (typeof ensureAdminProductMetadataFields === "function" && !ensureAdminProductMetadataFields.__kantuGrowth) {
            const base = ensureAdminProductMetadataFields;
            const wrapped = function(...args) {
                const result = base(...args);
                ensureRecommendationFields();
                return result;
            };
            wrapped.__kantuGrowth = true;
            ensureAdminProductMetadataFields = wrapped;
        }
    }

    function startAdminAlertPolling() {
        window.clearInterval(alertState.pollTimer);
        window.clearInterval(alertState.repeatTimer);
        alertState.pollTimer = window.setInterval(() => {
            const modal = el("adminModal");
            if (modal?.classList.contains("show")) loadAdminAlerts();
        }, 30_000);
        alertState.repeatTimer = window.setInterval(() => {
            if (alertState.rows.some(row => row.severity === "urgent")) playAdminAlarm();
        }, 5 * 60_000);
    }

    function initialize() {
        ensureStyles();
        ensureAdminGrowthViews();
        installRecommendationHooks();
        startAdminAlertPolling();

        const arm = () => armAdminAudio();
        document.addEventListener("pointerdown", arm, { once: true, capture: true });
        document.addEventListener("keydown", arm, { once: true, capture: true });

        const modal = el("adminModal");
        if (modal) {
            new MutationObserver(() => {
                if (modal.classList.contains("show")) {
                    ensureAdminGrowthViews();
                    installRecommendationHooks();
                    loadAdminAlerts();
                }
            }).observe(modal, { attributes: true, attributeFilter: ["class"] });
        }
        if (modal?.classList.contains("show")) loadAdminAlerts();
    }

    window.KantuAdminGrowth = Object.freeze({
        refreshAlerts: loadAdminAlerts,
        loadClaims: loadAdminClaims,
        ensureRecommendationFields
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
