/* Kantu Floral - checkout invitado seguro con token opaco */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const GUEST_STORAGE_KEY = "kantuGuestOrders:v1";
    const GUEST_PROOF_MAX_SIZE = 5 * 1024 * 1024;
    const GUEST_PROOF_TYPES = new Set(["image/jpeg", "image/png"]);
    const GUEST_PROOF_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
    const GUEST_POLL_INTERVAL = 20000;
    const GUEST_RETURN_POLL_INTERVAL = 5000;
    const proofLabels = Object.freeze({
        uploaded: "Comprobante recibido",
        verifying: "Comprobante en verificación",
        needs_review: "Requiere revisión manual",
        approved: "Pago aprobado",
        rejected: "Comprobante rechazado"
    });

    let guestCheckoutMode = false;
    let guestContext = null;
    let guestPollId = null;
    let guestReturnPolls = 0;
    let baseCheckout = typeof checkout === "function" ? checkout : null;
    let baseRequestDeliveryQuote = typeof requestDeliveryQuote === "function" ? requestDeliveryQuote : null;
    let baseCloseCheckout = typeof closeCheckout === "function" ? closeCheckout : null;
    let baseSubmitHandler = null;
    let guestSchedule = null;

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-guest-checkout-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/guest-checkout.css";
        link.dataset.kantuGuestCheckoutStyle = "true";
        document.head.appendChild(link);
    }

    function normalizeStoredContext(value) {
        if (!value || typeof value !== "object") return null;
        const orderId = String(value.order_id || "").trim();
        const token = String(value.guest_token || "").trim();
        const expiresAt = String(value.access_expires_at || "").trim();
        if (!/^[1-9]\d*$/.test(orderId)) return null;
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
        const expiry = Date.parse(expiresAt);
        if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;
        return {
            order_id: orderId,
            guest_token: token,
            access_expires_at: new Date(expiry).toISOString(),
            total: Number(value.total) || 0,
            created_at: String(value.created_at || new Date().toISOString())
        };
    }

    function readStoredContexts() {
        try {
            const parsed = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || "[]");
            const values = Array.isArray(parsed) ? parsed : [];
            const normalized = values.map(normalizeStoredContext).filter(Boolean).slice(0, 8);
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(normalized));
            return normalized;
        } catch {
            localStorage.removeItem(GUEST_STORAGE_KEY);
            return [];
        }
    }

    function writeStoredContexts(contexts) {
        const normalized = contexts.map(normalizeStoredContext).filter(Boolean).slice(0, 8);
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(normalized));
        updateGuestResumeAction();
        return normalized;
    }

    function storeGuestContext(context) {
        const normalized = normalizeStoredContext(context);
        if (!normalized) return null;
        const contexts = readStoredContexts().filter(row => row.order_id !== normalized.order_id);
        contexts.unshift(normalized);
        writeStoredContexts(contexts);
        return normalized;
    }

    function removeStoredContext(orderId) {
        const id = String(orderId || "");
        writeStoredContexts(readStoredContexts().filter(row => row.order_id !== id));
        if (guestContext?.order_id === id) guestContext = null;
    }

    function findStoredContext(orderId = null) {
        const contexts = readStoredContexts();
        if (orderId == null) return contexts[0] || null;
        return contexts.find(row => row.order_id === String(orderId)) || null;
    }

    async function edgeErrorMessage(error, fallback) {
        const response = error?.context;
        if (!(response instanceof Response)) return fallback;
        try {
            const body = await response.clone().json();
            return body?.message || fallback;
        } catch {
            return fallback;
        }
    }

    async function invokeGuest(body) {
        const { data, error } = await supabaseClient.functions.invoke("guest-checkout", { body });
        if (!error) return data;
        throw new Error(await edgeErrorMessage(error, "No pudimos completar la operación de invitado."));
    }

    async function invokeGuestMercadoPago() {
        if (!guestContext) throw new Error("No encontramos el acceso al pedido invitado.");
        const { data, error } = await supabaseClient.functions.invoke("create-guest-mp-preference", {
            body: {
                order_id: guestContext.order_id,
                guest_token: guestContext.guest_token
            }
        });
        if (!error) return data;
        throw new Error(await edgeErrorMessage(error, "No pudimos preparar el pago con Mercado Pago."));
    }

    function ensureGuestBanner() {
        let banner = el("guestCheckoutBanner");
        if (banner) return banner;

        const formView = el("checkoutFormView");
        if (!formView) return null;
        banner = document.createElement("div");
        banner.id = "guestCheckoutBanner";
        banner.className = "guest-checkout-banner";
        banner.hidden = true;
        banner.innerHTML = `
            <div>
                <strong>Compra como invitado</strong>
                <span>No necesitas crear una cuenta para completar el pedido.</span>
            </div>
            <button type="button" data-guest-login="true">Iniciar sesión</button>
        `;
        const progress = el("checkoutFlowProgress");
        const subtitle = formView.querySelector(".modal-subtitle");
        if (progress) progress.insertAdjacentElement("afterend", banner);
        else if (subtitle) subtitle.insertAdjacentElement("afterend", banner);
        else formView.prepend(banner);
        return banner;
    }

    function setGuestPresentation(active) {
        const banner = ensureGuestBanner();
        if (banner) banner.hidden = !active;

        const promotion = el("checkoutPromotionSection");
        if (promotion) promotion.hidden = active;

        const title = el("checkoutTitle");
        if (title && active) title.textContent = "Finaliza tu pedido como invitado";
        else if (title && !active) title.textContent = "Finaliza tu pedido";
    }

    function ensureGuestResumeAction() {
        let box = el("guestOrderResume");
        if (box) return box;
        const footer = document.querySelector("#cartPanel .cart-footer");
        const checkoutButton = el("cartCheckoutButton");
        if (!footer || !checkoutButton) return null;

        box = document.createElement("div");
        box.id = "guestOrderResume";
        box.className = "guest-order-resume";
        box.hidden = true;
        box.innerHTML = `
            <div><strong>Pedido invitado pendiente</strong><span id="guestOrderResumeLabel"></span></div>
            <button type="button" data-guest-resume="true">Continuar pago</button>
        `;
        checkoutButton.insertAdjacentElement("beforebegin", box);
        return box;
    }

    function updateGuestResumeAction() {
        const box = ensureGuestResumeAction();
        if (!box) return;
        const context = findStoredContext();
        box.hidden = !context;
        const label = el("guestOrderResumeLabel");
        if (label) label.textContent = context ? `Pedido #${context.order_id}` : "";
    }

    function setGuestOrderStatusNote(message, state = "") {
        const success = el("checkoutSuccess");
        if (!success) return null;
        let note = el("guestOrderStatusNote");
        if (!note) {
            note = document.createElement("div");
            note.id = "guestOrderStatusNote";
            note.className = "guest-order-status-note";
            const error = el("mercadoPagoError");
            if (error) error.insertAdjacentElement("beforebegin", note);
            else success.appendChild(note);
        }
        note.className = `guest-order-status-note${state ? ` ${state}` : ""}`;
        note.textContent = message || "";
        note.hidden = !message;
        return note;
    }

    function hideGuestCancellation() {
        const cancel = el("cancelPendingOrderButton");
        if (cancel) cancel.hidden = true;
    }

    function peruDateParts(date = new Date()) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Lima",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(date);
        const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${map.year}-${map.month}-${map.day}`;
    }

    function addDays(isoDate, days) {
        const [year, month, day] = isoDate.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + Number(days || 0));
        return date.toISOString().slice(0, 10);
    }

    function slotLabel(slot) {
        const [start, end] = String(slot || "").split("-");
        return start && end ? `${start} – ${end}` : String(slot || "");
    }

    function syncGuestSchedulePanel() {
        if (!guestCheckoutMode) return;
        const timing = el("checkoutDeliveryTiming");
        const panel = el("checkoutSchedulePanel");
        const date = el("checkoutRequestedDate");
        const slot = el("checkoutRequestedSlot");
        const scheduled = timing?.value === "scheduled" && Boolean(guestSchedule?.scheduling_enabled);

        if (panel) panel.hidden = !scheduled;
        if (date) date.required = scheduled;
        if (slot) slot.required = scheduled;
        if (!scheduled) {
            if (date) date.value = "";
            if (slot) slot.value = "";
        }
        window.KantuCheckoutFlow?.refresh?.();
    }

    function applyGuestSchedule(settings) {
        if (!guestCheckoutMode || !settings) return;
        guestSchedule = settings;
        const option = el("checkoutScheduledOption");
        const timing = el("checkoutDeliveryTiming");
        const date = el("checkoutRequestedDate");
        const slot = el("checkoutRequestedSlot");
        const hint = el("checkoutScheduleHint");
        const slots = Array.isArray(settings.slots) ? settings.slots : [];
        const enabled = Boolean(settings.scheduling_enabled && slots.length);

        if (option) option.disabled = !enabled;
        if (date) {
            const today = peruDateParts();
            date.min = today;
            date.max = addDays(today, Math.max(1, Number(settings.max_days_ahead) || 30));
        }
        if (slot) {
            slot.innerHTML = '<option value="">Selecciona una franja...</option>'
                + slots.map(value => `<option value="${core.escapeHtml(value)}">${core.escapeHtml(slotLabel(value))}</option>`).join("");
            slot.disabled = false;
        }
        if (!enabled && timing?.value === "scheduled") timing.value = "asap";
        if (hint) {
            hint.textContent = enabled
                ? `Puedes programar hasta ${Number(settings.max_days_ahead) || 30} días adelante. Anticipación mínima: ${Number(settings.min_lead_hours) || 0} h.`
                : "Entrega normal disponible. Kantu aún no habilitó franjas horarias programadas.";
            hint.className = `checkout-schedule-hint${enabled ? " available" : ""}`;
        }
        syncGuestSchedulePanel();
    }

    async function loadGuestSchedule() {
        if (!guestCheckoutMode) return null;
        try {
            const data = await invokeGuest({ action: "schedule" });
            applyGuestSchedule(data?.schedule || null);
            window.setTimeout(() => applyGuestSchedule(data?.schedule || null), 700);
            return data?.schedule || null;
        } catch (error) {
            console.error("Guest schedule unavailable:", error);
            const option = el("checkoutScheduledOption");
            if (option) option.disabled = true;
            return null;
        }
    }

    function availabilityReason(row) {
        const labels = {
            SCHEDULING_DISABLED: "Programación no disponible",
            DATE_OUT_OF_RANGE: "Fecha fuera del rango permitido",
            DATE_BLOCKED: "Fecha no disponible",
            TOO_SOON: "Ya no cumple la anticipación mínima",
            SLOT_FULL: "Sin cupo",
            INVALID_DELIVERY_SLOT: "Franja no disponible"
        };
        if (labels[row?.reason]) return labels[row.reason];
        if (row?.capacity != null) {
            const remaining = Math.max(0, Number(row.capacity) - Number(row.reserved_count || 0));
            return remaining === 1 ? "1 cupo disponible" : `${remaining} cupos disponibles`;
        }
        return "Disponible";
    }

    function renderGuestAvailability(rows) {
        const select = el("checkoutRequestedSlot");
        const hint = el("checkoutScheduleHint");
        if (!select) return;
        const previous = select.value;
        select.innerHTML = '<option value="">Selecciona una franja...</option>';

        let availableCount = 0;
        for (const row of Array.isArray(rows) ? rows : []) {
            const option = document.createElement("option");
            option.value = String(row.slot || "");
            option.disabled = !row.available;
            option.textContent = `${slotLabel(row.slot)} · ${availabilityReason(row)}`;
            if (row.available) availableCount += 1;
            select.appendChild(option);
        }
        const reusable = [...select.options].find(option => option.value === previous && !option.disabled);
        select.value = reusable ? previous : "";
        select.disabled = false;

        if (hint) {
            hint.textContent = availableCount
                ? `${availableCount} ${availableCount === 1 ? "franja disponible" : "franjas disponibles"} para la fecha elegida.`
                : "No quedan franjas disponibles para esa fecha. Prueba otro día.";
            hint.className = `checkout-schedule-hint ${availableCount ? "available" : "unavailable"}`;
        }
        window.KantuCheckoutFlow?.refresh?.();
    }

    async function refreshGuestAvailability() {
        if (!guestCheckoutMode) return null;
        const date = el("checkoutRequestedDate")?.value;
        const select = el("checkoutRequestedSlot");
        const hint = el("checkoutScheduleHint");
        if (!date || !select) return null;

        select.disabled = true;
        if (hint) hint.textContent = "Verificando disponibilidad de entrega...";
        try {
            const data = await invokeGuest({
                action: "availability",
                requested_delivery_date: date
            });
            renderGuestAvailability(data?.availability || []);
            return data?.availability || [];
        } catch (error) {
            console.error("Guest delivery availability failed:", error);
            select.disabled = false;
            if (hint) {
                hint.textContent = "No pudimos verificar los cupos. Inténtalo nuevamente antes de crear el pedido.";
                hint.className = "checkout-schedule-hint unavailable";
            }
            return null;
        }
    }

    async function guestDeliveryQuote(lat, lng) {
        const requestId = ++deliveryQuoteRequest;
        if (typeof renderDeliveryQuote === "function") renderDeliveryQuote({ loading: true });
        try {
            const data = await invokeGuest({
                action: "quote",
                delivery_lat: Number(lat),
                delivery_lng: Number(lng)
            });
            if (requestId !== deliveryQuoteRequest) return;
            const quote = data?.quote;
            if (!quote) throw new Error("No se recibió una cotización válida.");

            currentDeliveryQuote = {
                distance_km: Number(quote.distance_km),
                delivery_fee: Number(quote.delivery_fee),
                estimated_minutes: Number(quote.estimated_minutes),
                service_available: Boolean(quote.service_available)
            };

            const status = el("checkoutLocationStatus");
            if (status) {
                status.textContent = currentDeliveryQuote.service_available
                    ? "Ubicación lista para entrega. El delivery ya está incluido en el total."
                    : "Esta ubicación está fuera de nuestra zona de reparto actual.";
                status.className = `checkout-location-status ${currentDeliveryQuote.service_available ? "selected" : "error"}`;
            }
            if (typeof renderDeliveryQuote === "function") renderDeliveryQuote();
            if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
            window.KantuCheckoutFlow?.refresh?.();
        } catch (error) {
            if (requestId !== deliveryQuoteRequest) return;
            console.error("Guest delivery quote failed:", error);
            currentDeliveryQuote = null;
            if (typeof renderDeliveryQuote === "function") renderDeliveryQuote({ error: true });
            if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
        }
    }

    async function guestAwareRequestDeliveryQuote(lat, lng) {
        if (!guestCheckoutMode && baseRequestDeliveryQuote) {
            return baseRequestDeliveryQuote(lat, lng);
        }
        if (!guestCheckoutMode) return;
        return guestDeliveryQuote(lat, lng);
    }

    function checkoutItemsPayload() {
        if (typeof cart === "undefined" || !Array.isArray(cart)) return [];
        return cart.map(item => ({
            product_id: Number(item.id),
            quantity: Number(item.quantity)
        })).filter(item => Number.isSafeInteger(item.product_id) && item.product_id > 0
            && Number.isSafeInteger(item.quantity) && item.quantity > 0);
    }

    function guestOrderError(error) {
        return String(error?.message || "No pudimos crear el pedido. Inténtalo nuevamente.");
    }

    async function submitGuestOrder(event) {
        event.preventDefault();
        const name = el("checkoutName")?.value.trim();
        const phone = el("checkoutPhone")?.value.trim();
        const recipientName = el("checkoutRecipientName")?.value.trim() || name;
        const recipientPhone = el("checkoutRecipientPhone")?.value.trim() || phone;
        const giftMessage = el("checkoutGiftMessage")?.value.trim() || "";
        const isSurprise = Boolean(el("checkoutSurprise")?.checked);
        const addressLine = el("checkoutDeliveryAddressText")?.value.trim();
        const address = typeof buildCheckoutDeliveryAddress === "function" ? buildCheckoutDeliveryAddress() : "";
        const timing = el("checkoutDeliveryTiming")?.value || "asap";
        const requestedDate = timing === "scheduled" ? el("checkoutRequestedDate")?.value || null : null;
        const requestedSlot = timing === "scheduled" ? el("checkoutRequestedSlot")?.value || null : null;
        const items = checkoutItemsPayload();

        if (!name) return showCheckoutError("Ingresa tu nombre completo.");
        if (!phone) return showCheckoutError("Ingresa un número de teléfono.");
        if (!addressLine) return showCheckoutError("Ingresa la dirección de entrega.");
        if (!address || selectedDeliveryLat == null || selectedDeliveryLng == null) {
            return showCheckoutError("Marca la ubicación exacta de entrega en el mapa.");
        }
        if (!currentDeliveryQuote) return showCheckoutError("Espera un momento mientras calculamos el delivery.");
        if (!currentDeliveryQuote.service_available) return showCheckoutError("La ubicación está fuera de nuestra zona de reparto actual.");
        if (!items.length) return showCheckoutError("Tu carrito está vacío.");
        if (giftMessage.length > 500) return showCheckoutError("El mensaje para la tarjeta no puede superar 500 caracteres.");
        if (timing === "scheduled" && (!requestedDate || !requestedSlot)) {
            return showCheckoutError("Selecciona una fecha y franja horaria disponibles.");
        }

        const loading = el("checkoutLoading");
        if (typeof setOrderButtonState === "function") setOrderButtonState(true);
        if (loading) loading.hidden = false;
        const error = el("checkoutError");
        if (error) error.hidden = true;

        try {
            const data = await invokeGuest({
                action: "create",
                items,
                customer_name: name,
                customer_phone: phone,
                delivery_address: address,
                delivery_lat: selectedDeliveryLat,
                delivery_lng: selectedDeliveryLng,
                recipient_name: recipientName,
                recipient_phone: recipientPhone,
                gift_message: giftMessage || null,
                is_surprise: isSurprise,
                requested_delivery_date: requestedDate,
                requested_delivery_slot: requestedSlot
            });
            const order = data?.order;
            const token = data?.guest_token;
            const expiresAt = data?.access_expires_at || order?.access_expires_at;
            if (!order?.order_id || !token || !expiresAt) throw new Error("El pedido invitado no devolvió un acceso válido.");

            guestContext = storeGuestContext({
                order_id: String(order.order_id),
                guest_token: token,
                access_expires_at: expiresAt,
                total: Number(order.total),
                created_at: new Date().toISOString()
            });
            if (!guestContext) throw new Error("No pudimos guardar el acceso local al pedido.");

            cart = [];
            saveCart();
            updateCart();
            closeCart();
            guestCheckoutMode = true;

            const opened = openPaymentOptionsForOrder({
                id: order.order_id,
                total: order.total,
                subtotal: order.subtotal,
                delivery_fee: order.delivery_fee,
                delivery_distance_km: order.delivery_distance_km,
                estimated_delivery_minutes: order.estimated_delivery_minutes,
                discount_amount: 0,
                status: "pendiente",
                payment_status: "pending"
            });
            if (!opened) throw new Error("No pudimos abrir las opciones de pago.");
            decorateGuestPaymentView({
                id: order.order_id,
                payment_status: "pending",
                payment_provider: null,
                payment_preference_id: null
            });
        } catch (requestError) {
            console.error("Guest order creation failed:", requestError);
            showCheckoutError(guestOrderError(requestError));
        } finally {
            if (typeof setOrderButtonState === "function") setOrderButtonState(false);
            if (loading) loading.hidden = true;
        }
    }

    async function guestAwareSubmit(event) {
        event.preventDefault();
        if (guestCheckoutMode) return submitGuestOrder(event);
        if (typeof baseSubmitHandler === "function") return baseSubmitHandler.call(event.currentTarget, event);
        if (typeof submitOrder === "function") return submitOrder(event);
    }

    function installSubmitAdapter() {
        const form = el("checkoutForm");
        if (!form) return;
        if (form.onsubmit === guestAwareSubmit) return;
        if (typeof form.onsubmit === "function") baseSubmitHandler = form.onsubmit;
        form.onsubmit = guestAwareSubmit;
        form.dataset.guestCheckoutBound = "true";
    }

    async function openCheckoutAsGuest() {
        if (typeof cart === "undefined" || !Array.isArray(cart) || cart.length === 0) {
            showToast("Tu carrito está vacío.");
            return;
        }
        guestCheckoutMode = true;
        guestContext = null;
        guestSchedule = null;
        closeCart();
        setGuestPresentation(true);
        openCheckout(null);
        setGuestPresentation(true);
        loadGuestSchedule();
    }

    async function guestAwareCheckout() {
        const user = typeof ensureCartSessionReady === "function"
            ? await ensureCartSessionReady()
            : null;
        if (user) {
            guestCheckoutMode = false;
            setGuestPresentation(false);
            if (baseCheckout) return baseCheckout();
            return;
        }
        return openCheckoutAsGuest();
    }

    function decorateGuestPaymentView(order, proof = null) {
        guestCheckoutMode = true;
        setGuestPresentation(false);
        hideGuestCancellation();
        const heading = document.querySelector("#checkoutSuccess h2");
        if (heading) heading.textContent = order?.status === "confirmado" || order?.payment_status === "approved"
            ? "Pedido confirmado"
            : "Pedido creado";

        const manualButton = el("manualPaymentButton");
        const paymentButton = el("mercadoPagoButton");
        const onlineStarted = order?.payment_provider === "mercadopago" || Boolean(order?.payment_preference_id);
        const activeProof = proof && ["uploaded", "verifying", "needs_review", "approved"].includes(proof.verification_status);
        if (manualButton) manualButton.hidden = onlineStarted || activeProof;
        if (paymentButton) paymentButton.hidden = activeProof;

        if (activeProof) {
            showGuestProofState(proof, order);
            setGuestOrderStatusNote("Tu comprobante está registrado. Conserva este navegador abierto para ver la actualización automática.", "pending");
            startGuestPolling(false);
        } else if (onlineStarted) {
            setGuestOrderStatusNote("El pago online ya fue iniciado. Estamos esperando la actualización de Mercado Pago.", "pending");
        } else {
            setGuestOrderStatusNote("Puedes pagar ahora con Mercado Pago o enviar un comprobante de Yape / Plin o transferencia.");
        }
    }

    function showCompletedGuestOrder(status) {
        stopGuestPolling();
        guestCheckoutMode = true;
        resetCheckoutView();
        const modal = el("checkoutModal");
        const formView = el("checkoutFormView");
        const success = el("checkoutSuccess");
        const message = el("checkoutSuccessMessage");
        const heading = success?.querySelector("h2");
        const order = status?.order || {};
        const total = Number(order.total) || 0;
        if (modal) modal.classList.add("show");
        if (formView) formView.hidden = true;
        if (success) success.hidden = false;
        if (heading) heading.textContent = order.status === "confirmado" || order.payment_status === "approved"
            ? "Pedido confirmado"
            : "Pedido actualizado";
        if (message) {
            message.innerHTML = `<span class="checkout-ready-label">Pedido <strong>#${core.escapeHtml(order.id)}</strong></span>
                <div class="checkout-payment-breakdown">
                    <div class="total"><span>Total</span><strong>${core.escapeHtml(core.formatMoney(total))}</strong></div>
                </div>`;
        }
        if (el("mercadoPagoButton")) el("mercadoPagoButton").hidden = true;
        if (el("manualPaymentButton")) el("manualPaymentButton").hidden = true;
        if (el("manualPaymentPanel")) el("manualPaymentPanel").hidden = true;
        hideGuestCancellation();

        if (order.status === "confirmado" || order.payment_status === "approved") {
            setGuestOrderStatusNote("Pago confirmado. Kantu ya puede preparar tu pedido.", "success");
            removeStoredContext(order.id);
        } else if (order.status === "cancelado") {
            setGuestOrderStatusNote("Este pedido fue cancelado.", "error");
            removeStoredContext(order.id);
        } else {
            setGuestOrderStatusNote(`Estado actual: ${String(order.status || order.payment_status || "pendiente")}.`);
        }
    }

    async function fetchGuestStatus(context = guestContext) {
        if (!context) throw new Error("No encontramos el acceso local al pedido.");
        return invokeGuest({
            action: "status",
            order_id: context.order_id,
            guest_token: context.guest_token
        });
    }

    async function renderStoredGuestOrder(context, fromReturn = false) {
        guestContext = normalizeStoredContext(context);
        if (!guestContext) throw new Error("El acceso local al pedido venció o no es válido.");
        const status = await fetchGuestStatus(guestContext);
        const order = status?.order;
        if (!order) throw new Error("No pudimos consultar el pedido invitado.");

        guestContext = storeGuestContext({
            ...guestContext,
            total: Number(order.total) || guestContext.total
        });
        if (order.status === "confirmado" || order.status === "cancelado" || order.payment_status === "approved") {
            showCompletedGuestOrder(status);
            return status;
        }

        guestCheckoutMode = true;
        const opened = openPaymentOptionsForOrder(order);
        if (!opened) throw new Error("El pedido no está disponible para continuar el pago.");
        decorateGuestPaymentView(order, status.proof || null);

        if (fromReturn && ["pending", "rejected", "cancelled"].includes(String(order.payment_status || "pending"))) {
            startGuestPolling(true);
        }
        return status;
    }

    async function resumeLatestGuestOrder() {
        const context = findStoredContext();
        if (!context) {
            showToast("No encontramos un pedido invitado pendiente en este navegador.");
            updateGuestResumeAction();
            return;
        }
        try {
            closeCart();
            await renderStoredGuestOrder(context);
        } catch (error) {
            console.error("Could not resume guest order:", error);
            showToast(error.message || "No pudimos recuperar el pedido invitado.");
        }
    }

    function validateGuestProof(file) {
        if (!file) return "Selecciona una imagen del comprobante.";
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        if (!GUEST_PROOF_TYPES.has(file.type)) return "El archivo debe ser JPG, JPEG o PNG.";
        if (!GUEST_PROOF_EXTENSIONS.has(extension)) return "La extensión debe ser JPG, JPEG o PNG.";
        if (file.size <= 0) return "El archivo seleccionado está vacío.";
        if (file.size > GUEST_PROOF_MAX_SIZE) return "El comprobante no puede superar los 5 MB.";
        return null;
    }

    function showGuestManualMessage(message, type = "error") {
        const target = el("manualPaymentMessage");
        if (!target) return;
        target.textContent = message || "";
        target.className = `checkout-message manual-payment-message ${type}`;
        target.hidden = !message;
    }

    function openGuestManualPanel() {
        if (!guestContext || !guestCheckoutMode) return;
        const panel = el("manualPaymentPanel");
        const form = el("manualPaymentForm");
        const status = el("manualPaymentStatus");
        if (!panel || !form) return;

        panel.hidden = false;
        form.hidden = false;
        if (status) status.hidden = true;
        if (el("manualPaymentButton")) el("manualPaymentButton").hidden = true;
        if (el("manualPaymentOrder")) el("manualPaymentOrder").textContent = `Pedido #${guestContext.order_id}`;
        if (el("manualPaymentTotal")) el("manualPaymentTotal").textContent = core.formatMoney(guestContext.total);
        if (el("manualPaymentMethod")) el("manualPaymentMethod").value = "yape";
        if (el("manualPaymentFile")) el("manualPaymentFile").value = "";
        showGuestManualMessage("");
        if (typeof updateManualPaymentInstructions === "function") updateManualPaymentInstructions();
        setGuestOrderStatusNote("Realiza el pago y sube una imagen clara del comprobante.");
    }

    function showGuestProofState(proof, order = null) {
        const panel = el("manualPaymentPanel");
        const form = el("manualPaymentForm");
        const status = el("manualPaymentStatus");
        if (!panel || !status || !proof) return;

        panel.hidden = false;
        const rejected = proof.verification_status === "rejected";
        if (form) form.hidden = !rejected;
        if (el("manualPaymentButton")) el("manualPaymentButton").hidden = true;
        if (el("mercadoPagoButton")) el("mercadoPagoButton").hidden = !rejected;
        if (el("manualPaymentOrder")) el("manualPaymentOrder").textContent = `Pedido #${guestContext?.order_id || order?.id || ""}`;
        if (el("manualPaymentTotal")) el("manualPaymentTotal").textContent = core.formatMoney(Number(order?.total ?? guestContext?.total) || 0);

        const note = rejected && proof.verification_notes
            ? `<p><strong>Motivo:</strong> ${core.escapeHtml(proof.verification_notes)}</p>`
            : "";
        const confirmed = proof.verification_status === "approved"
            ? "<p>Pago aprobado. El pedido está confirmado.</p>"
            : "";
        status.className = `manual-payment-status proof-${core.escapeHtml(proof.verification_status || "uploaded")}`;
        status.innerHTML = `<strong>${core.escapeHtml(proofLabels[proof.verification_status] || proof.verification_status || "Comprobante recibido")}</strong>${confirmed}${note}`;
        status.hidden = false;
        if (rejected) showGuestManualMessage("Puedes enviar un nuevo comprobante.", "info");
    }

    async function cleanupGuestUpload(path) {
        if (!path || !guestContext) return;
        try {
            await invokeGuest({
                action: "manual_cleanup",
                order_id: guestContext.order_id,
                guest_token: guestContext.guest_token,
                storage_path: path
            });
        } catch (error) {
            console.warn("Guest proof cleanup failed:", error);
        }
    }

    async function submitGuestProof(event) {
        event.preventDefault();
        if (!guestContext) return showGuestManualMessage("No encontramos el pedido invitado.");
        const file = el("manualPaymentFile")?.files?.[0];
        const fileError = validateGuestProof(file);
        if (fileError) return showGuestManualMessage(fileError);

        const method = el("manualPaymentMethod")?.value === "transferencia" ? "transferencia" : "yape";
        const operationNumber = el("manualOperationNumber")?.value.trim() || null;
        const button = el("manualPaymentSubmit");
        let uploadedPath = null;
        if (button) {
            button.disabled = true;
            button.textContent = "Enviando comprobante...";
        }
        showGuestManualMessage("Preparando subida...", "info");

        try {
            const prepared = await invokeGuest({
                action: "manual_upload_url",
                order_id: guestContext.order_id,
                guest_token: guestContext.guest_token,
                mime_type: file.type
            });
            uploadedPath = prepared?.path;
            if (!uploadedPath || !prepared?.token) throw new Error("No pudimos preparar la subida del comprobante.");

            const upload = await supabaseClient.storage
                .from("payment-proofs")
                .uploadToSignedUrl(uploadedPath, prepared.token, file, {
                    contentType: file.type,
                    cacheControl: "3600"
                });
            if (upload.error) throw upload.error;

            const submitted = await invokeGuest({
                action: "manual_submit",
                order_id: guestContext.order_id,
                guest_token: guestContext.guest_token,
                payment_method: method,
                storage_path: uploadedPath,
                operation_number: operationNumber
            });
            uploadedPath = null;
            const proof = submitted?.proof;
            showGuestManualMessage("Comprobante recibido. Estamos verificando tu pago.", "success");
            if (el("manualPaymentForm")) el("manualPaymentForm").hidden = true;
            if (el("mercadoPagoButton")) el("mercadoPagoButton").hidden = true;
            showGuestProofState(proof, { total: guestContext.total });
            setGuestOrderStatusNote("Comprobante recibido. La verificación se actualizará automáticamente.", "pending");
            startGuestPolling(false);
        } catch (error) {
            console.error("Guest proof submission failed:", error);
            if (uploadedPath) await cleanupGuestUpload(uploadedPath);
            showGuestManualMessage(error.message || "No pudimos registrar el comprobante.");
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Enviar comprobante";
            }
        }
    }

    async function startGuestMercadoPago() {
        if (!guestContext) return;
        const button = el("mercadoPagoButton");
        const error = el("mercadoPagoError");
        if (button) {
            button.disabled = true;
            button.textContent = "Preparando pago...";
        }
        if (error) {
            error.hidden = true;
            error.textContent = "";
        }

        try {
            const data = await invokeGuestMercadoPago();
            const paymentUrl = data?.sandbox_init_point || data?.init_point;
            if (!paymentUrl) throw new Error("Mercado Pago no devolvió una dirección de pago válida.");
            window.location.href = paymentUrl;
        } catch (paymentError) {
            console.error("Guest Mercado Pago failed:", paymentError);
            if (error) {
                error.textContent = paymentError.message || "No pudimos iniciar el pago con Mercado Pago.";
                error.hidden = false;
            }
        } finally {
            if (button && document.contains(button)) {
                button.disabled = false;
                button.textContent = "Pagar con Mercado Pago";
            }
        }
    }

    async function pollGuestStatus() {
        if (!guestContext || !guestCheckoutMode || document.hidden) return;
        try {
            const status = await fetchGuestStatus();
            const order = status?.order;
            if (!order) return;
            guestContext = storeGuestContext({ ...guestContext, total: Number(order.total) || guestContext.total });

            if (order.status === "confirmado" || order.status === "cancelado" || order.payment_status === "approved") {
                showCompletedGuestOrder(status);
                return;
            }

            if (status.proof) showGuestProofState(status.proof, order);
            decorateGuestPaymentView(order, status.proof || null);

            if (guestReturnPolls > 0) {
                guestReturnPolls -= 1;
                if (guestReturnPolls === 0) startGuestPolling(false);
            }
        } catch (error) {
            console.warn("Guest status polling failed:", error);
        }
    }

    function stopGuestPolling() {
        if (guestPollId) window.clearInterval(guestPollId);
        guestPollId = null;
        guestReturnPolls = 0;
    }

    function startGuestPolling(fast = false) {
        stopGuestPolling();
        guestReturnPolls = fast ? 12 : 0;
        pollGuestStatus();
        guestPollId = window.setInterval(pollGuestStatus, fast ? GUEST_RETURN_POLL_INTERVAL : GUEST_POLL_INTERVAL);
    }

    async function restoreFromPaymentReturn() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("guest") !== "1") return;
        const orderId = params.get("order_id");
        const context = findStoredContext(orderId);
        if (!context) {
            showToast("El pago volvió a Kantu, pero este navegador ya no conserva la clave del pedido invitado.");
            return;
        }
        try {
            await renderStoredGuestOrder(context, true);
        } catch (error) {
            console.error("Guest payment return recovery failed:", error);
            showToast(error.message || "No pudimos recuperar el estado del pedido invitado.");
        }
    }

    function handleCaptureClick(event) {
        if (event.target.closest("[data-guest-login]")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            guestCheckoutMode = false;
            if (baseCloseCheckout) baseCloseCheckout();
            openAuth("login");
            return;
        }

        if (event.target.closest("[data-guest-resume]")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            resumeLatestGuestOrder();
            return;
        }

        if (!guestCheckoutMode || !guestContext) return;
        if (event.target.closest("#mercadoPagoButton")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            startGuestMercadoPago();
            return;
        }
        if (event.target.closest("#manualPaymentButton")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openGuestManualPanel();
        }
    }

    function handleCaptureSubmit(event) {
        if (!guestCheckoutMode || !guestContext) return;
        if (event.target?.id !== "manualPaymentForm") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        submitGuestProof(event);
    }

    function handleGuestScheduleChange(event) {
        if (!guestCheckoutMode) return;
        if (event.target?.id === "checkoutDeliveryTiming") {
            event.stopImmediatePropagation();
            syncGuestSchedulePanel();
            if (event.target.value === "scheduled" && el("checkoutRequestedDate")?.value) {
                refreshGuestAvailability();
            }
            return;
        }
        if (event.target?.id === "checkoutRequestedDate") {
            event.stopImmediatePropagation();
            refreshGuestAvailability();
        }
    }

    function installGlobalAdapters() {
        if (baseCheckout && checkout !== guestAwareCheckout) checkout = guestAwareCheckout;
        if (baseRequestDeliveryQuote && requestDeliveryQuote !== guestAwareRequestDeliveryQuote) {
            requestDeliveryQuote = guestAwareRequestDeliveryQuote;
        }
        if (baseCloseCheckout && closeCheckout !== guestAwareCloseCheckout) closeCheckout = guestAwareCloseCheckout;
        installSubmitAdapter();
    }

    function guestAwareCloseCheckout(...args) {
        stopGuestPolling();
        guestCheckoutMode = false;
        setGuestPresentation(false);
        return baseCloseCheckout?.(...args);
    }

    function initialize() {
        ensureStyles();
        ensureGuestBanner();
        ensureGuestResumeAction();
        updateGuestResumeAction();
        installGlobalAdapters();
        document.addEventListener("click", handleCaptureClick, true);
        document.addEventListener("submit", handleCaptureSubmit, true);
        document.addEventListener("change", handleGuestScheduleChange, true);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && guestPollId) pollGuestStatus();
        });
        window.setTimeout(installGlobalAdapters, 250);
        window.setTimeout(installGlobalAdapters, 900);
        window.setTimeout(restoreFromPaymentReturn, 0);
    }

    window.KantuGuestCheckout = Object.freeze({
        isActive: () => guestCheckoutMode,
        storedOrders: () => readStoredContexts().map(row => ({
            order_id: row.order_id,
            access_expires_at: row.access_expires_at,
            total: row.total
        })),
        resumeLatest: resumeLatestGuestOrder,
        refresh: () => guestContext ? pollGuestStatus() : Promise.resolve()
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
