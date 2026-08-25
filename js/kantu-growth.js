/* Kantu Floral - Kantu Match, notificaciones de cliente y Libro de Reclamaciones */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const LOCAL_READS_KEY = "kantuCustomerNotificationReads:guest";
    const KNOWN_KEY = "kantuCustomerNotificationKnown";
    const notificationState = {
        items: [],
        reads: new Set(),
        userId: null,
        initialized: false,
        audioReady: false,
        audioContext: null,
        pollTimer: null
    };

    const MATCH_OPTIONS = Object.freeze({
        audiences: [
            ["pareja", "❤️ Pareja"], ["mama", "🌷 Mamá"], ["papa", "🎁 Papá"], ["amiga", "✨ Amiga"], ["familiar", "🎁 Familiar"], ["otro", "💐 Otra persona"]
        ],
        occasions: [
            ["cumpleanos", "🎂 Cumpleaños"], ["aniversario", "🥂 Aniversario"], ["amor", "❤️ Te amo"], ["perdon", "🤍 Perdón"],
            ["gracias", "🌼 Gracias"], ["primera_cita", "🌹 Primera cita"], ["sorpresa", "✨ Solo quiero sorprender"]
        ],
        styles: [
            ["romantico", "❤️ Romántico"], ["tierno", "🌷 Tierno"], ["elegante", "✨ Elegante"], ["impactante", "🔥 Impactante"], ["alegre", "🌻 Alegre"]
        ],
        budgets: [[60, "Hasta S/ 60"], [100, "S/ 60 – S/ 100"], [180, "S/ 100 – S/ 180"], [999999, "Más de S/ 180"]]
    });

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-growth-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/kantu-growth.css";
        link.dataset.kantuGrowthStyle = "true";
        document.head.appendChild(link);
    }

    function getStoreProducts() {
        try {
            return typeof products !== "undefined" && Array.isArray(products) ? products : [];
        } catch {
            return [];
        }
    }

    function readGuestReads() {
        try {
            const parsed = JSON.parse(localStorage.getItem(LOCAL_READS_KEY) || "[]");
            return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch {
            return new Set();
        }
    }

    function writeGuestReads() {
        localStorage.setItem(LOCAL_READS_KEY, JSON.stringify([...notificationState.reads].slice(-200)));
    }

    async function resolveNotificationIdentity() {
        const { data } = await supabaseClient.auth.getSession();
        notificationState.userId = data?.session?.user?.id || null;
        if (!notificationState.userId) {
            notificationState.reads = readGuestReads();
            return;
        }
        const result = await supabaseClient
            .from("customer_notification_reads")
            .select("notification_key")
            .eq("user_id", notificationState.userId);
        if (result.error) {
            console.error("No se pudo cargar el estado de lectura de notificaciones:", result.error);
            notificationState.reads = new Set();
            return;
        }
        notificationState.reads = new Set((result.data || []).map(row => String(row.notification_key)));
    }

    function ensureNotificationUi() {
        const cartButton = document.getElementById("cartButton");
        if (!cartButton || document.getElementById("notificationButton")) return;

        const button = document.createElement("button");
        button.id = "notificationButton";
        button.type = "button";
        button.className = "icon-button kantu-notification-button";
        button.title = "Notificaciones";
        button.setAttribute("aria-label", "Abrir notificaciones");
        button.setAttribute("aria-expanded", "false");
        button.innerHTML = '<span class="kantu-bell" aria-hidden="true">🔔</span><span id="notificationCount" class="cart-count kantu-notification-count" hidden>0</span>';
        cartButton.insertAdjacentElement("afterend", button);

        const panel = document.createElement("aside");
        panel.id = "notificationPanel";
        panel.className = "kantu-notification-panel";
        panel.hidden = true;
        panel.setAttribute("aria-label", "Notificaciones Kantu Floral");
        panel.innerHTML = `
            <div class="kantu-notification-head">
                <div><span>PARA TI</span><h3>Notificaciones</h3></div>
                <button type="button" id="notificationClose" aria-label="Cerrar notificaciones">×</button>
            </div>
            <div class="kantu-notification-actions">
                <small id="notificationSoundStatus">El sonido se activa al interactuar con Kantu.</small>
                <button type="button" id="notificationMarkAll">Marcar todas como leídas</button>
            </div>
            <div id="notificationList" class="kantu-notification-list"><p class="kantu-notification-empty">Cargando…</p></div>`;
        document.body.appendChild(panel);

        const setOpen = open => {
            panel.hidden = !open;
            button.setAttribute("aria-expanded", String(open));
            if (open) renderNotifications();
        };
        button.addEventListener("click", () => setOpen(panel.hidden));
        panel.querySelector("#notificationClose")?.addEventListener("click", () => setOpen(false));
        panel.querySelector("#notificationMarkAll")?.addEventListener("click", markAllNotificationsRead);
        panel.addEventListener("click", event => {
            const action = event.target.closest?.("[data-notification-key]");
            if (!action) return;
            markNotificationRead(action.dataset.notificationKey);
        });
    }

    function armCustomerAudio() {
        if (notificationState.audioReady) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            notificationState.audioContext = notificationState.audioContext || new AudioContextClass();
            if (notificationState.audioContext.state === "suspended") notificationState.audioContext.resume().catch(() => {});
            notificationState.audioReady = true;
            const label = document.getElementById("notificationSoundStatus");
            if (label) label.textContent = "Sonido de nuevas notificaciones activado.";
        } catch {
            // La interfaz sigue funcionando sin audio.
        }
    }

    function playCustomerChime() {
        const ctx = notificationState.audioContext;
        if (!notificationState.audioReady || !ctx || document.hidden) return;
        const start = ctx.currentTime + 0.02;
        [659.25, 783.99].forEach((frequency, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, start + index * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.08, start + index * 0.12 + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.12 + 0.16);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start + index * 0.12);
            osc.stop(start + index * 0.12 + 0.18);
        });
    }

    function showNotificationPersistenceError() {
        const label = document.getElementById("notificationSoundStatus");
        if (label) label.textContent = "No pudimos guardar el cambio. Inténtalo nuevamente.";
    }

    async function markNotificationRead(key) {
        const normalized = String(key || "");
        if (!normalized || notificationState.reads.has(normalized)) return;

        if (notificationState.userId) {
            const result = await supabaseClient.from("customer_notification_reads").upsert({
                user_id: notificationState.userId,
                notification_key: normalized,
                read_at: new Date().toISOString()
            });
            if (result.error) {
                console.error("No se pudo guardar la lectura de la notificación:", result.error);
                showNotificationPersistenceError();
                return;
            }
        }

        notificationState.reads.add(normalized);
        if (!notificationState.userId) writeGuestReads();
        syncNotificationBadge();
        renderNotifications();
    }

    async function markAllNotificationsRead() {
        const unread = notificationState.items.filter(item => !notificationState.reads.has(String(item.notification_key)));
        if (!unread.length) return;
        const keys = unread.map(item => String(item.notification_key));
        const button = document.getElementById("notificationMarkAll");
        if (button) button.disabled = true;

        try {
            if (notificationState.userId) {
                const result = await supabaseClient.from("customer_notification_reads").upsert(keys.map(notificationKey => ({
                    user_id: notificationState.userId,
                    notification_key: notificationKey,
                    read_at: new Date().toISOString()
                })));
                if (result.error) {
                    console.error("No se pudieron guardar las lecturas de notificaciones:", result.error);
                    showNotificationPersistenceError();
                    return;
                }
            }

            keys.forEach(key => notificationState.reads.add(key));
            if (!notificationState.userId) writeGuestReads();
            syncNotificationBadge();
            renderNotifications();
        } finally {
            if (button) button.disabled = false;
        }
    }

    function syncNotificationBadge() {
        const count = notificationState.items.filter(item => !notificationState.reads.has(String(item.notification_key))).length;
        const badge = document.getElementById("notificationCount");
        if (!badge) return;
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = count === 0;
    }

    function notificationIcon(kind) {
        if (kind === "promotion") return "🏷️";
        if (kind === "trend") return "🌸";
        return "🔔";
    }

    function notificationActionUrl(value) {
        const action = String(value || "");
        if (action.startsWith("producto.html")) return action;
        if (action.startsWith("#")) {
            return document.body.classList.contains("product-detail-page") ? `index.html${action}` : action;
        }
        return document.body.classList.contains("product-detail-page") ? "index.html#catalogo" : "#catalogo";
    }

    function renderNotifications() {
        const list = document.getElementById("notificationList");
        if (!list) return;
        if (!notificationState.items.length) {
            list.innerHTML = '<div class="kantu-notification-empty"><span>🌷</span><strong>Todo al día</strong><p>Cuando Kantu tenga algo útil para ti, aparecerá aquí.</p></div>';
            return;
        }
        list.innerHTML = notificationState.items.map(item => {
            const key = String(item.notification_key);
            const read = notificationState.reads.has(key);
            const safeUrl = notificationActionUrl(item.action_url);
            return `<a class="kantu-notification-item${read ? " read" : " unread"}" href="${core.escapeHtml(safeUrl)}" data-notification-key="${core.escapeHtml(key)}">
                <span class="kantu-notification-icon" aria-hidden="true">${notificationIcon(item.kind)}</span>
                <span class="kantu-notification-copy"><strong>${core.escapeHtml(item.title || "Notificación")}</strong><small>${core.escapeHtml(item.body || "")}</small></span>
                ${read ? "" : '<span class="kantu-notification-dot" aria-label="No leída"></span>'}
            </a>`;
        }).join("");
    }

    async function loadCustomerNotifications({ silentInitial = false } = {}) {
        const result = await supabaseClient.rpc("get_customer_notification_feed");
        if (result.error) {
            console.error("No se pudo cargar el feed de notificaciones:", result.error);
            return;
        }
        const next = Array.isArray(result.data) ? result.data : [];
        const previousKeys = new Set(notificationState.items.map(item => String(item.notification_key)));
        notificationState.items = next;

        if (notificationState.initialized && !silentInitial) {
            const genuinelyNew = next.filter(item => !previousKeys.has(String(item.notification_key)));
            if (genuinelyNew.length) playCustomerChime();
        }
        notificationState.initialized = true;
        sessionStorage.setItem(KNOWN_KEY, JSON.stringify(next.map(item => String(item.notification_key))));
        syncNotificationBadge();
        renderNotifications();
    }

    function startCustomerNotificationFeed() {
        window.clearInterval(notificationState.pollTimer);
        notificationState.pollTimer = window.setInterval(() => loadCustomerNotifications(), 45_000);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) loadCustomerNotifications({ silentInitial: true });
        });
    }

    function optionButtons(items, name) {
        return items.map(([value, label], index) => `
            <label class="kantu-match-choice">
                <input type="radio" name="${name}" value="${value}" ${index === 0 ? "required" : ""}>
                <span>${label}</span>
            </label>`).join("");
    }

    function ensureMatchUi() {
        const heading = document.querySelector("#catalogo .section-heading");
        if (!heading || document.getElementById("kantuMatchButton")) return;

        const prompt = document.createElement("div");
        prompt.className = "kantu-match-prompt";
        prompt.innerHTML = `<p>¿No sabes cuál elegir? Te ayudamos en menos de 1 minuto.</p><button type="button" id="kantuMatchButton">✨ Encontrar mi regalo perfecto</button>`;
        heading.appendChild(prompt);

        const overlay = document.createElement("div");
        overlay.id = "kantuMatchModal";
        overlay.className = "modal-overlay kantu-match-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "kantuMatchTitle");
        overlay.innerHTML = `<div class="kantu-match-modal">
            <button type="button" class="kantu-growth-close" id="kantuMatchClose" aria-label="Cerrar Kantu Match">×</button>
            <span class="kantu-match-eyebrow">KANTU MATCH ✦</span>
            <h2 id="kantuMatchTitle">Encuentra el regalo perfecto</h2>
            <p class="kantu-match-intro">Cuéntanos la intención del regalo y Kantu filtrará el catálogo real, el stock y tu presupuesto.</p>
            <form id="kantuMatchForm">
                <fieldset><legend>1 · ¿Para quién es?</legend><div class="kantu-match-choices">${optionButtons(MATCH_OPTIONS.audiences, "matchAudience")}</div></fieldset>
                <fieldset><legend>2 · ¿Cuál es la ocasión?</legend><div class="kantu-match-choices">${optionButtons(MATCH_OPTIONS.occasions, "matchOccasion")}</div></fieldset>
                <fieldset><legend>3 · ¿Qué quieres transmitir?</legend><div class="kantu-match-choices">${optionButtons(MATCH_OPTIONS.styles, "matchStyle")}</div></fieldset>
                <fieldset><legend>4 · ¿Cuánto quieres gastar?</legend><div class="kantu-match-choices budgets">${optionButtons(MATCH_OPTIONS.budgets.map(([value,label]) => [String(value),label]), "matchBudget")}</div></fieldset>
                <button type="submit" class="btn btn-primary kantu-match-submit">Ver mis recomendaciones</button>
            </form>
            <section id="kantuMatchResults" class="kantu-match-results" hidden></section>
        </div>`;
        document.body.appendChild(overlay);

        const open = () => {
            overlay.classList.add("show");
            overlay.querySelector("input")?.focus();
        };
        const close = () => overlay.classList.remove("show");
        prompt.querySelector("#kantuMatchButton")?.addEventListener("click", open);
        overlay.querySelector("#kantuMatchClose")?.addEventListener("click", close);
        overlay.querySelector("#kantuMatchForm")?.addEventListener("submit", handleMatchSubmit);
        overlay.querySelector("#kantuMatchResults")?.addEventListener("click", event => {
            const add = event.target.closest?.("[data-match-add]");
            if (!add || typeof addToCart !== "function") return;
            const id = Number(add.dataset.matchAdd);
            add.disabled = true;
            Promise.resolve(addToCart(id)).finally(() => { if (add.isConnected) add.disabled = false; });
        });
    }

    function normalizedArray(value) {
        return Array.isArray(value) ? value.map(String) : [];
    }

    function categoryHeuristic(product, audience, occasion, style) {
        const category = String(product.category || "");
        let score = 0;
        if (audience === "pareja" && ["rosas","tulipanes","ramos_buchones","box"].includes(category)) score += 7;
        if (audience === "mama" && ["ramos","flores","canasta","girasoles"].includes(category)) score += 6;
        if (audience === "amiga" && ["girasoles","ramos","flores"].includes(category)) score += 5;
        if (["aniversario","amor","primera_cita"].includes(occasion) && ["rosas","tulipanes","ramos_buchones"].includes(category)) score += 9;
        if (occasion === "cumpleanos" && ["girasoles","ramos","box","cajas"].includes(category)) score += 7;
        if (occasion === "perdon" && ["rosas","tulipanes","ramos"].includes(category)) score += 6;
        if (style === "romantico" && ["rosas","tulipanes"].includes(category)) score += 10;
        if (style === "elegante" && ["box","tulipanes","cajas"].includes(category)) score += 8;
        if (style === "impactante" && ["ramos_buchones","box"].includes(category)) score += 9;
        if (style === "alegre" && category === "girasoles") score += 11;
        if (style === "tierno" && ["ramos","flores","tulipanes"].includes(category)) score += 6;
        return score;
    }

    function scoreMatchProduct(product, answers) {
        let score = 0;
        const audiences = normalizedArray(product.recommendation_audiences);
        const occasions = normalizedArray(product.recommendation_occasions);
        const styles = normalizedArray(product.recommendation_styles);
        if (audiences.includes(answers.audience)) score += 28;
        if (occasions.includes(answers.occasion)) score += 32;
        if (styles.includes(answers.style)) score += 26;
        score += Math.max(0, Math.min(10, Number(product.recommendation_priority) || 0)) * 2.5;
        if (product.featured) score += 5;
        score += Math.min(5, Math.log2((Number(product.paid_order_count) || 0) + 1));
        if (!audiences.length && !occasions.length && !styles.length) score += categoryHeuristic(product, answers.audience, answers.occasion, answers.style);
        const price = Number(product.price) || 0;
        if (price <= answers.budget) score += 8;
        return score;
    }

    function matchReason(product, answers) {
        const reasons = [];
        if (normalizedArray(product.recommendation_occasions).includes(answers.occasion)) reasons.push("ideal para la ocasión");
        if (normalizedArray(product.recommendation_styles).includes(answers.style)) reasons.push(`estilo ${answers.style}`);
        if (product.featured) reasons.push("destacado por Kantu");
        if (!reasons.length) reasons.push("buena combinación para tu elección");
        return reasons.slice(0, 2).join(" · ");
    }

    function findMatches(answers) {
        const available = getStoreProducts().filter(product => product?.active !== false && Number(product.stock) > 0 && Number(product.price) > 0);
        let candidates = available.filter(product => Number(product.price) <= answers.budget);
        if (candidates.length < 3) candidates = available.filter(product => Number(product.price) <= answers.budget * 1.2);
        return candidates
            .map(product => ({ product, score: scoreMatchProduct(product, answers) }))
            .sort((a, b) => b.score - a.score || Number(a.product.price) - Number(b.product.price) || Number(a.product.id) - Number(b.product.id))
            .slice(0, 3)
            .map(row => row.product);
    }

    function handleMatchSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const answers = {
            audience: String(formData.get("matchAudience") || ""),
            occasion: String(formData.get("matchOccasion") || ""),
            style: String(formData.get("matchStyle") || ""),
            budget: Number(formData.get("matchBudget")) || 100
        };
        const matches = findMatches(answers);
        const results = document.getElementById("kantuMatchResults");
        if (!results) return;
        results.hidden = false;
        if (!matches.length) {
            results.innerHTML = '<div class="kantu-match-empty"><strong>No encontramos una coincidencia exacta.</strong><p>Prueba ampliar tu presupuesto o revisa el catálogo completo.</p></div>';
            return;
        }
        results.innerHTML = `<div class="kantu-match-result-head"><span>TUS MEJORES OPCIONES</span><h3>Encontramos ${matches.length} regalos para ti</h3></div>
            <div class="kantu-match-result-grid">${matches.map((product, index) => {
                const image = core.safeUrl(product.image);
                return `<article class="kantu-match-card">
                    <span class="kantu-match-rank">${index === 0 ? "🥇 Recomendación Kantu" : `Opción ${index + 1}`}</span>
                    ${image ? `<img src="${core.escapeHtml(image)}" alt="${core.escapeHtml(product.name)}">` : '<div class="kantu-match-placeholder">✿</div>'}
                    <div><h4>${core.escapeHtml(product.name)}</h4><strong>${core.escapeHtml(core.formatMoney(product.price))}</strong><p>${core.escapeHtml(matchReason(product, answers))}</p></div>
                    <div class="kantu-match-card-actions"><button type="button" data-match-add="${Number(product.id)}">Agregar</button><a href="producto.html?id=${Number(product.id)}">Ver detalle</a></div>
                </article>`;
            }).join("")}</div>`;
        results.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function ensureClaimsUi() {
        if (document.getElementById("claimsModal")) return;
        const overlay = document.createElement("div");
        overlay.id = "claimsModal";
        overlay.className = "modal-overlay kantu-claims-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "claimsTitle");
        overlay.innerHTML = `<div class="kantu-claims-modal">
            <button type="button" class="kantu-growth-close" id="claimsClose" aria-label="Cerrar Libro de Reclamaciones">×</button>
            <span class="kantu-claims-eyebrow">KANTU FLORAL</span>
            <h2 id="claimsTitle">Libro de Reclamaciones</h2>
            <p>Registra aquí un reclamo sobre un producto/servicio o una queja sobre la atención. Conserva el número que recibirás al finalizar.</p>
            <form id="claimsForm">
                <div class="kantu-claims-grid">
                    <label><span>Tipo *</span><select name="complaint_type" required><option value="reclamo">Reclamo</option><option value="queja">Queja</option></select></label>
                    <label><span>Nombre completo *</span><input name="full_name" maxlength="160" autocomplete="name" required></label>
                    <label><span>Documento *</span><select name="document_type" required><option value="dni">DNI</option><option value="ce">Carné de extranjería</option><option value="pasaporte">Pasaporte</option><option value="ruc">RUC</option><option value="otro">Otro</option></select></label>
                    <label><span>Número de documento *</span><input name="document_number" maxlength="30" required></label>
                    <label><span>Correo electrónico *</span><input name="email" type="email" maxlength="254" autocomplete="email" required></label>
                    <label><span>Teléfono</span><input name="phone" maxlength="40" autocomplete="tel"></label>
                    <label class="wide"><span>Dirección *</span><input name="address" maxlength="300" autocomplete="street-address" required></label>
                    <label><span>Pedido relacionado</span><input name="order_reference" maxlength="80" placeholder="Ej.: #30"></label>
                    <label><span>Producto / servicio</span><input name="product_service" maxlength="200"></label>
                    <label><span>Monto reclamado (S/)</span><input name="amount_claimed" type="number" min="0" step="0.01"></label>
                    <label class="wide"><span>Detalle de lo ocurrido *</span><textarea name="detail" rows="5" minlength="10" maxlength="4000" required></textarea></label>
                    <label class="wide"><span>¿Qué solución solicitas? *</span><textarea name="requested_action" rows="3" minlength="5" maxlength="2000" required></textarea></label>
                    <label class="kantu-claim-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabindex="-1" autocomplete="off"></label>
                </div>
                <label class="kantu-claims-consent"><input type="checkbox" required><span>Confirmo que la información registrada es correcta y autorizo su uso para atender este caso.</span></label>
                <button type="submit" class="btn btn-primary" id="claimsSubmit">Registrar en el Libro de Reclamaciones</button>
                <p id="claimsMessage" class="kantu-claims-message" role="status" aria-live="polite"></p>
            </form>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector("#claimsClose")?.addEventListener("click", () => overlay.classList.remove("show"));
        overlay.querySelector("#claimsForm")?.addEventListener("submit", submitClaim);
    }

    function ensureClaimsFooterLink() {
        const footer = document.querySelector("#contacto .footer-content");
        if (!footer || footer.querySelector("[data-open-claims]")) return;
        const contact = [...footer.querySelectorAll(".footer-column")].find(column => column.querySelector("h4")?.textContent?.trim() === "Contacto") || footer.lastElementChild;
        if (!contact) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "footer-link-button kantu-claims-link";
        button.dataset.openClaims = "true";
        button.textContent = "Libro de Reclamaciones";
        button.addEventListener("click", () => {
            ensureClaimsUi();
            document.getElementById("claimsModal")?.classList.add("show");
        });
        contact.appendChild(button);
    }

    async function submitClaim(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = document.getElementById("claimsSubmit");
        const message = document.getElementById("claimsMessage");
        const values = Object.fromEntries(new FormData(form).entries());
        if (values.website) {
            form.reset();
            if (message) message.textContent = "Tu registro fue recibido.";
            return;
        }
        delete values.website;
        if (button) { button.disabled = true; button.textContent = "Registrando…"; }
        if (message) { message.textContent = ""; message.className = "kantu-claims-message"; }
        try {
            const { data } = await supabaseClient.auth.getSession();
            const accessToken = data?.session?.access_token;
            const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-customer-claim`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    ...(accessToken ? { "Authorization": `Bearer ${accessToken}` } : {})
                },
                body: JSON.stringify(values)
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.message || "No pudimos registrar tu solicitud.");
            form.reset();
            if (message) {
                message.className = "kantu-claims-message success";
                message.innerHTML = `Registro recibido. Tu número es <strong>${core.escapeHtml(payload.claim_number || "")}</strong>. Guárdalo para cualquier seguimiento.`;
            }
        } catch (error) {
            if (message) {
                message.className = "kantu-claims-message error";
                message.textContent = error?.message || "No pudimos registrar tu solicitud.";
            }
        } finally {
            if (button) { button.disabled = false; button.textContent = "Registrar en el Libro de Reclamaciones"; }
        }
    }

    function observeFooter() {
        const footer = document.querySelector("#contacto .footer-content");
        if (!footer) return;
        new MutationObserver(() => ensureClaimsFooterLink()).observe(footer, { childList: true, subtree: true });
        ensureClaimsFooterLink();
    }

    async function initialize() {
        ensureStyles();
        ensureNotificationUi();
        ensureMatchUi();
        ensureClaimsUi();
        observeFooter();
        await resolveNotificationIdentity();
        await loadCustomerNotifications({ silentInitial: true });
        startCustomerNotificationFeed();

        const arm = () => armCustomerAudio();
        document.addEventListener("pointerdown", arm, { once: true, capture: true });
        document.addEventListener("keydown", arm, { once: true, capture: true });

        supabaseClient.auth.onAuthStateChange(() => {
            window.setTimeout(async () => {
                notificationState.initialized = false;
                await resolveNotificationIdentity();
                await loadCustomerNotifications({ silentInitial: true });
            }, 0);
        });
    }

    window.KantuGrowth = Object.freeze({
        refreshNotifications: loadCustomerNotifications,
        openMatch: () => document.getElementById("kantuMatchButton")?.click(),
        openClaims: () => {
            ensureClaimsUi();
            document.getElementById("claimsModal")?.classList.add("show");
        }
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
