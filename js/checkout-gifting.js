/* Kantu Floral - destinatario, tarjeta y entrega programable */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const giftOrderErrors = Object.freeze({
        RECIPIENT_NAME_REQUIRED: "Ingresa el nombre de la persona que recibirá el pedido.",
        RECIPIENT_PHONE_REQUIRED: "Ingresa el teléfono de la persona que recibirá el pedido.",
        RECIPIENT_NAME_TOO_LONG: "El nombre del destinatario es demasiado largo.",
        RECIPIENT_PHONE_TOO_LONG: "El teléfono del destinatario es demasiado largo.",
        GIFT_MESSAGE_TOO_LONG: "El mensaje para la tarjeta no puede superar 500 caracteres.",
        DELIVERY_SCHEDULING_DISABLED: "Las entregas programadas no están disponibles en este momento.",
        INVALID_DELIVERY_DATE: "Selecciona una fecha de entrega válida.",
        DELIVERY_DATE_TOO_FAR: "La fecha elegida supera el rango de programación disponible.",
        DELIVERY_DATE_REQUIRED_FOR_SLOT: "Selecciona una fecha para la franja horaria elegida.",
        DELIVERY_SLOT_REQUIRED: "Selecciona una franja horaria de entrega.",
        INVALID_DELIVERY_SLOT: "La franja horaria seleccionada ya no está disponible.",
        DELIVERY_SLOT_TOO_SOON: "Esa franja ya no cumple el tiempo mínimo de anticipación. Elige otra.",
        PROMOTION_NOT_AVAILABLE: "El código promocional ya no está disponible. Quítalo o valida otro código.",
        PROMOTION_MINIMUM_NOT_MET: "El carrito ya no cumple la compra mínima requerida por la promoción."
    });

    let scheduleSettings = {
        scheduling_enabled: false,
        min_lead_hours: 0,
        max_days_ahead: 30,
        slots: []
    };
    let scheduleLoaded = false;
    let scheduleLoading = null;
    let modalWasOpen = false;

    function element(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-gifting-styles="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/gifting.css";
        link.dataset.kantuGiftingStyles = "true";
        document.head.appendChild(link);
    }

    function ensureFields() {
        const form = element("checkoutForm");
        const location = form?.querySelector(".checkout-location-field");
        if (!form || !location) return false;

        let giftSection = element("checkoutGiftSection");
        if (!giftSection) {
            giftSection = document.createElement("section");
            giftSection.id = "checkoutGiftSection";
            giftSection.className = "checkout-gift-section";
            giftSection.innerHTML = `
                <div class="checkout-section-heading">
                    <span aria-hidden="true">2</span>
                    <div>
                        <strong>¿Quién recibirá las flores?</strong>
                        <small>Estos datos pueden ser distintos a los de la persona que está comprando.</small>
                    </div>
                </div>

                <div class="checkout-gift-grid">
                    <div class="form-group">
                        <label for="checkoutRecipientName">Nombre del destinatario</label>
                        <input id="checkoutRecipientName" type="text" maxlength="120" autocomplete="name" required>
                    </div>
                    <div class="form-group">
                        <label for="checkoutRecipientPhone">Teléfono del destinatario</label>
                        <input id="checkoutRecipientPhone" type="tel" maxlength="40" autocomplete="tel" required>
                    </div>
                </div>

                <label class="checkout-surprise-option">
                    <input id="checkoutSurprise" type="checkbox">
                    <span>
                        <strong>Es una sorpresa</strong>
                        <small>El equipo verá esta indicación para tratar la entrega con discreción.</small>
                    </span>
                </label>

                <div class="form-group">
                    <label for="checkoutGiftMessage">
                        Mensaje para tarjeta <span>(opcional)</span>
                        <small id="checkoutGiftMessageCount" class="checkout-character-count">0/500</small>
                    </label>
                    <textarea id="checkoutGiftMessage" rows="3" maxlength="500" placeholder="Ej.: Feliz aniversario. Gracias por hacer florecer mis días."></textarea>
                </div>
            `;

            const addressGroup = element("checkoutDeliveryAddressGroup");
            (addressGroup || location).insertAdjacentElement("beforebegin", giftSection);
        }

        let scheduleSection = element("checkoutScheduleSection");
        if (!scheduleSection) {
            scheduleSection = document.createElement("section");
            scheduleSection.id = "checkoutScheduleSection";
            scheduleSection.className = "checkout-schedule-section";
            scheduleSection.innerHTML = `
                <div class="checkout-section-heading">
                    <span aria-hidden="true">3</span>
                    <div>
                        <strong>¿Cuándo quieres la entrega?</strong>
                        <small>Elige entrega normal o una fecha futura cuando Kantu tenga horarios habilitados.</small>
                    </div>
                </div>

                <div class="form-group">
                    <label for="checkoutDeliveryTiming">Tipo de entrega</label>
                    <select id="checkoutDeliveryTiming">
                        <option value="asap">Lo antes posible</option>
                        <option id="checkoutScheduledOption" value="scheduled" disabled>Programar fecha y horario</option>
                    </select>
                </div>

                <div id="checkoutSchedulePanel" class="checkout-schedule-panel" hidden>
                    <div class="checkout-schedule-grid">
                        <div class="form-group">
                            <label for="checkoutRequestedDate">Fecha</label>
                            <input id="checkoutRequestedDate" type="date">
                        </div>
                        <div class="form-group">
                            <label for="checkoutRequestedSlot">Franja horaria</label>
                            <select id="checkoutRequestedSlot">
                                <option value="">Selecciona una franja...</option>
                            </select>
                        </div>
                    </div>
                </div>
                <p id="checkoutScheduleHint" class="checkout-schedule-hint" role="status" aria-live="polite">Entrega normal disponible.</p>
            `;

            const addressGroup = element("checkoutDeliveryAddressGroup");
            if (addressGroup) addressGroup.insertAdjacentElement("beforebegin", scheduleSection);
            else location.insertAdjacentElement("beforebegin", scheduleSection);
        }

        bindFields();
        return true;
    }

    function bindFields() {
        const message = element("checkoutGiftMessage");
        if (message && !message.dataset.giftingBound) {
            message.dataset.giftingBound = "true";
            message.addEventListener("input", syncMessageCount);
        }

        const timing = element("checkoutDeliveryTiming");
        if (timing && !timing.dataset.giftingBound) {
            timing.dataset.giftingBound = "true";
            timing.addEventListener("change", syncSchedulePanel);
        }

        const recipientName = element("checkoutRecipientName");
        const recipientPhone = element("checkoutRecipientPhone");
        [recipientName, recipientPhone].forEach(input => {
            if (!input || input.dataset.giftingDirtyBound) return;
            input.dataset.giftingDirtyBound = "true";
            input.addEventListener("input", () => {
                input.dataset.userEdited = "true";
            });
        });

        const buyerName = element("checkoutName");
        const buyerPhone = element("checkoutPhone");
        if (buyerName && !buyerName.dataset.giftingMirrorBound) {
            buyerName.dataset.giftingMirrorBound = "true";
            buyerName.addEventListener("input", () => mirrorBuyerToRecipient());
        }
        if (buyerPhone && !buyerPhone.dataset.giftingMirrorBound) {
            buyerPhone.dataset.giftingMirrorBound = "true";
            buyerPhone.addEventListener("input", () => mirrorBuyerToRecipient());
        }
    }

    function syncMessageCount() {
        const message = element("checkoutGiftMessage");
        const counter = element("checkoutGiftMessageCount");
        if (counter) counter.textContent = `${String(message?.value || "").length}/500`;
    }

    function mirrorBuyerToRecipient({ force = false } = {}) {
        const recipientName = element("checkoutRecipientName");
        const recipientPhone = element("checkoutRecipientPhone");
        const buyerName = element("checkoutName")?.value?.trim() || "";
        const buyerPhone = element("checkoutPhone")?.value?.trim() || "";

        if (recipientName && (force || recipientName.dataset.userEdited !== "true" || !recipientName.value.trim())) {
            recipientName.value = buyerName;
        }
        if (recipientPhone && (force || recipientPhone.dataset.userEdited !== "true" || !recipientPhone.value.trim())) {
            recipientPhone.value = buyerPhone;
        }
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

    function addDaysToIsoDate(isoDate, days) {
        const [year, month, day] = isoDate.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + Number(days || 0));
        return date.toISOString().slice(0, 10);
    }

    function slotLabel(slot) {
        const [start, end] = String(slot || "").split("-");
        return start && end ? `${start} – ${end}` : String(slot || "");
    }

    function applyScheduleSettings() {
        ensureFields();
        const timing = element("checkoutDeliveryTiming");
        const scheduledOption = element("checkoutScheduledOption");
        const dateInput = element("checkoutRequestedDate");
        const slotSelect = element("checkoutRequestedSlot");
        const hint = element("checkoutScheduleHint");
        const slots = Array.isArray(scheduleSettings.slots) ? scheduleSettings.slots : [];
        const enabled = Boolean(scheduleSettings.scheduling_enabled && slots.length);

        if (scheduledOption) scheduledOption.disabled = !enabled;
        if (slotSelect) {
            slotSelect.innerHTML = '<option value="">Selecciona una franja...</option>'
                + slots.map(slot => `<option value="${core.escapeHtml(slot)}">${core.escapeHtml(slotLabel(slot))}</option>`).join("");
        }

        if (dateInput) {
            const today = peruDateParts();
            dateInput.min = today;
            dateInput.max = addDaysToIsoDate(today, Math.max(1, Number(scheduleSettings.max_days_ahead) || 30));
        }

        if (!enabled && timing?.value === "scheduled") timing.value = "asap";
        if (hint) {
            hint.textContent = enabled
                ? `Puedes programar hasta ${Number(scheduleSettings.max_days_ahead) || 30} días adelante. Anticipación mínima: ${Number(scheduleSettings.min_lead_hours) || 0} h.`
                : "Entrega normal disponible. Kantu aún no habilitó franjas horarias programadas.";
            hint.className = `checkout-schedule-hint${enabled ? " available" : ""}`;
        }
        syncSchedulePanel();
    }

    function syncSchedulePanel() {
        const timing = element("checkoutDeliveryTiming");
        const panel = element("checkoutSchedulePanel");
        const date = element("checkoutRequestedDate");
        const slot = element("checkoutRequestedSlot");
        const scheduled = timing?.value === "scheduled" && Boolean(scheduleSettings.scheduling_enabled);

        if (panel) panel.hidden = !scheduled;
        if (date) date.required = scheduled;
        if (slot) slot.required = scheduled;
        if (!scheduled) {
            if (date) date.value = "";
            if (slot) slot.value = "";
        }
    }

    async function loadScheduleSettings({ force = false } = {}) {
        if (scheduleLoaded && !force) {
            applyScheduleSettings();
            return scheduleSettings;
        }
        if (scheduleLoading) return scheduleLoading;

        scheduleLoading = (async () => {
            const { data, error } = await supabaseClient
                .from("delivery_schedule_settings")
                .select("scheduling_enabled, min_lead_hours, max_days_ahead, slots")
                .eq("id", 1)
                .maybeSingle();

            if (!error && data) {
                scheduleSettings = {
                    scheduling_enabled: Boolean(data.scheduling_enabled),
                    min_lead_hours: Number(data.min_lead_hours) || 0,
                    max_days_ahead: Number(data.max_days_ahead) || 30,
                    slots: Array.isArray(data.slots) ? data.slots : []
                };
                scheduleLoaded = true;
            }
            applyScheduleSettings();
            return scheduleSettings;
        })().finally(() => {
            scheduleLoading = null;
        });

        return scheduleLoading;
    }

    function resetGiftFieldsForCheckout() {
        ensureFields();
        const recipientName = element("checkoutRecipientName");
        const recipientPhone = element("checkoutRecipientPhone");
        if (recipientName) delete recipientName.dataset.userEdited;
        if (recipientPhone) delete recipientPhone.dataset.userEdited;
        const timing = element("checkoutDeliveryTiming");
        if (timing) timing.value = "asap";
        syncMessageCount();
        syncSchedulePanel();

        window.setTimeout(() => mirrorBuyerToRecipient({ force: true }), 0);
        window.setTimeout(() => mirrorBuyerToRecipient({ force: true }), 450);
        loadScheduleSettings({ force: true });
    }

    function resolveOrderError(error) {
        const giftMessage = core.resolveErrorMessage(error, giftOrderErrors, "");
        if (giftMessage) return giftMessage;
        if (typeof getOrderErrorMessage === "function") return getOrderErrorMessage(error);
        return "No se pudo crear el pedido. Inténtalo nuevamente.";
    }

    async function submitGiftOrder(event) {
        event.preventDefault();

        const name = element("checkoutName")?.value.trim();
        const phone = element("checkoutPhone")?.value.trim();
        const recipientName = element("checkoutRecipientName")?.value.trim();
        const recipientPhone = element("checkoutRecipientPhone")?.value.trim();
        const giftMessage = element("checkoutGiftMessage")?.value.trim() || "";
        const isSurprise = Boolean(element("checkoutSurprise")?.checked);
        const addressLine = element("checkoutDeliveryAddressText")?.value.trim();
        const address = typeof buildCheckoutDeliveryAddress === "function" ? buildCheckoutDeliveryAddress() : "";
        const timing = element("checkoutDeliveryTiming")?.value || "asap";
        const requestedDate = timing === "scheduled" ? element("checkoutRequestedDate")?.value || null : null;
        const requestedSlot = timing === "scheduled" ? element("checkoutRequestedSlot")?.value || null : null;
        const promotionCode = window.KantuPromotions?.getAppliedCode?.() || null;

        if (!name) return showCheckoutError("Ingresa tu nombre completo.");
        if (!phone) return showCheckoutError("Ingresa un número de teléfono.");
        if (!recipientName) return showCheckoutError(giftOrderErrors.RECIPIENT_NAME_REQUIRED);
        if (!recipientPhone) return showCheckoutError(giftOrderErrors.RECIPIENT_PHONE_REQUIRED);
        if (giftMessage.length > 500) return showCheckoutError(giftOrderErrors.GIFT_MESSAGE_TOO_LONG);
        if (!addressLine) return showCheckoutError("Ingresa la dirección de entrega.");
        if (!address || selectedDeliveryLat == null || selectedDeliveryLng == null) {
            return showCheckoutError("Marca la ubicación exacta de entrega en el mapa.");
        }
        if (!currentDeliveryQuote) return showCheckoutError("Espera un momento mientras calculamos el delivery.");
        if (!currentDeliveryQuote.service_available) return showCheckoutError("La ubicación está fuera de nuestra zona de reparto actual.");

        if (timing === "scheduled") {
            if (!scheduleSettings.scheduling_enabled) return showCheckoutError(giftOrderErrors.DELIVERY_SCHEDULING_DISABLED);
            if (!requestedDate) return showCheckoutError("Selecciona la fecha de entrega.");
            if (!requestedSlot) return showCheckoutError(giftOrderErrors.DELIVERY_SLOT_REQUIRED);
            if (!scheduleSettings.slots.includes(requestedSlot)) return showCheckoutError(giftOrderErrors.INVALID_DELIVERY_SLOT);
        }

        const loading = element("checkoutLoading");
        setOrderButtonState(true);
        if (loading) loading.hidden = false;

        const { data, error } = await supabaseClient.rpc("create_order", {
            p_customer_name: name,
            p_customer_phone: phone,
            p_delivery_address: address,
            p_delivery_lat: selectedDeliveryLat,
            p_delivery_lng: selectedDeliveryLng,
            p_recipient_name: recipientName,
            p_recipient_phone: recipientPhone,
            p_gift_message: giftMessage || null,
            p_is_surprise: isSurprise,
            p_requested_delivery_date: requestedDate,
            p_requested_delivery_slot: requestedSlot,
            p_promotion_code: promotionCode
        });

        setOrderButtonState(false);
        if (loading) loading.hidden = true;
        if (error) return showCheckoutError(resolveOrderError(error));

        const order = Array.isArray(data) ? data[0] : data;
        if (!order?.order_id) return showCheckoutError("El pedido no devolvió un identificador válido.");

        cart = [];
        saveCart();
        updateCart();
        closeCart();

        openPaymentOptionsForOrder({
            id: order.order_id,
            total: order.total,
            subtotal: order.subtotal,
            delivery_fee: order.delivery_fee,
            delivery_distance_km: order.delivery_distance_km,
            estimated_delivery_minutes: order.estimated_delivery_minutes,
            discount_amount: order.discount_amount,
            promotion_code: promotionCode,
            status: "pendiente",
            payment_status: "pending"
        });

        if (typeof loadActiveCustomerOrder === "function") loadActiveCustomerOrder();
    }

    function installSubmitHandler() {
        const form = element("checkoutForm");
        if (!form) return;
        // Reemplaza únicamente el handler inline del checkout; pagos y demás flujos no se interceptan.
        form.onsubmit = submitGiftOrder;
    }

    function watchCheckoutModal() {
        const modal = element("checkoutModal");
        if (!modal) return;

        const syncOpenState = () => {
            const open = modal.classList.contains("show");
            if (open && !modalWasOpen) resetGiftFieldsForCheckout();
            modalWasOpen = open;
        };

        new MutationObserver(syncOpenState).observe(modal, {
            attributes: true,
            attributeFilter: ["class", "aria-hidden"]
        });
        syncOpenState();
    }

    function initialize() {
        ensureStyles();
        ensureFields();
        installSubmitHandler();
        watchCheckoutModal();
        syncMessageCount();
        applyScheduleSettings();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
