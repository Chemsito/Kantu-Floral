/* Kantu Floral - organización progresiva del checkout sin alterar lógica comercial */

(() => {
    const core = window.KantuCore;
    if (!core) return;

    let modalWasOpen = false;

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[href="css/checkout-flow.css"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/checkout-flow.css";
        link.dataset.kantuCheckoutFlowStyle = "true";
        document.head.appendChild(link);
    }

    function heading(number, title, help) {
        const wrapper = document.createElement("div");
        wrapper.className = "checkout-flow-section-heading";
        wrapper.innerHTML = `
            <span aria-hidden="true">${number}</span>
            <div><strong>${core.escapeHtml(title)}</strong><small>${core.escapeHtml(help)}</small></div>
        `;
        return wrapper;
    }

    function ensureProgress() {
        const formView = el("checkoutFormView");
        const subtitle = formView?.querySelector(".modal-subtitle");
        if (!formView || !subtitle) return;

        const title = el("checkoutTitle");
        if (title) title.textContent = "Finaliza tu pedido";
        subtitle.textContent = "Revisa los datos, confirma la entrega y después elige cómo pagar.";

        if (el("checkoutFlowProgress")) return;
        const progress = document.createElement("ol");
        progress.id = "checkoutFlowProgress";
        progress.className = "checkout-flow-progress";
        progress.setAttribute("aria-label", "Progreso del checkout");
        progress.innerHTML = `
            <li data-checkout-progress="buyer"><span>1</span><small>Tus datos</small></li>
            <li data-checkout-progress="gift"><span>2</span><small>Destinatario</small></li>
            <li data-checkout-progress="delivery"><span>3</span><small>Entrega</small></li>
            <li data-checkout-progress="review"><span>4</span><small>Revisar</small></li>
        `;
        subtitle.insertAdjacentElement("afterend", progress);
    }

    function ensureBuyerSection(form) {
        let section = el("checkoutBuyerFlowSection");
        if (section) return section;

        const name = el("checkoutName")?.closest(".form-group");
        const phone = el("checkoutPhone")?.closest(".form-group");
        if (!name || !phone) return null;

        section = document.createElement("section");
        section.id = "checkoutBuyerFlowSection";
        section.className = "checkout-flow-section checkout-buyer-flow-section";
        section.appendChild(heading(1, "Tus datos", "Los usamos para identificar el pedido y contactarte si hace falta."));

        const grid = document.createElement("div");
        grid.className = "checkout-flow-two-column";
        grid.append(name, phone);
        section.appendChild(grid);
        form.prepend(section);
        return section;
    }

    function syncRecipientMode() {
        const toggle = el("checkoutDifferentRecipientToggle");
        const grid = el("checkoutGiftSection")?.querySelector(".checkout-gift-grid");
        const note = el("checkoutSameRecipientNote");
        const different = Boolean(toggle?.checked);
        if (grid) grid.hidden = !different;
        if (note) note.hidden = different;

        if (!different) {
            const buyerName = el("checkoutName")?.value?.trim() || "";
            const buyerPhone = el("checkoutPhone")?.value?.trim() || "";
            const recipientName = el("checkoutRecipientName");
            const recipientPhone = el("checkoutRecipientPhone");
            if (recipientName) {
                recipientName.value = buyerName;
                delete recipientName.dataset.userEdited;
            }
            if (recipientPhone) {
                recipientPhone.value = buyerPhone;
                delete recipientPhone.dataset.userEdited;
            }
        }
        updateProgress();
    }

    function simplifyGiftSection() {
        const section = el("checkoutGiftSection");
        if (!section || section.dataset.checkoutFlowReady === "true") return Boolean(section);
        section.dataset.checkoutFlowReady = "true";
        section.classList.add("checkout-flow-section");

        const existingHeading = section.querySelector(".checkout-section-heading");
        if (existingHeading) {
            existingHeading.innerHTML = `
                <span aria-hidden="true">2</span>
                <div><strong>Destinatario y tarjeta</strong><small>Por defecto asumimos que tú recibirás las flores.</small></div>
            `;
        }

        const grid = section.querySelector(".checkout-gift-grid");
        if (grid) {
            const toggle = document.createElement("label");
            toggle.className = "checkout-recipient-toggle";
            toggle.innerHTML = `
                <input id="checkoutDifferentRecipientToggle" type="checkbox">
                <span><strong>Las flores las recibe otra persona</strong><small>Actívalo para ingresar sus datos.</small></span>
            `;
            grid.insertAdjacentElement("beforebegin", toggle);

            const note = document.createElement("p");
            note.id = "checkoutSameRecipientNote";
            note.className = "checkout-same-recipient-note";
            note.textContent = "Usaremos tu nombre y teléfono como datos del destinatario.";
            toggle.insertAdjacentElement("afterend", note);
            grid.hidden = true;
            el("checkoutDifferentRecipientToggle")?.addEventListener("change", syncRecipientMode);
        }

        return true;
    }

    function ensureReferenceDetails(referenceGroup) {
        if (!referenceGroup || referenceGroup.closest("#checkoutReferenceDetails")) return;
        const details = document.createElement("details");
        details.id = "checkoutReferenceDetails";
        details.className = "checkout-reference-details";
        const summary = document.createElement("summary");
        summary.textContent = "Agregar referencia para el delivery (opcional)";
        referenceGroup.insertAdjacentElement("beforebegin", details);
        details.append(summary, referenceGroup);
    }

    function normalizeSchedulePlacement(wrapper) {
        const schedule = el("checkoutScheduleSection");
        const address = el("checkoutDeliveryAddressGroup");
        if (!wrapper || !schedule) return;
        schedule.querySelector(".checkout-section-heading")?.setAttribute("hidden", "");
        if (schedule.parentElement !== wrapper) {
            if (address?.parentElement === wrapper) wrapper.insertBefore(schedule, address);
            else wrapper.appendChild(schedule);
        }
    }

    function ensureDeliverySection(form) {
        let wrapper = el("checkoutDeliveryFlowSection");
        if (wrapper) {
            normalizeSchedulePlacement(wrapper);
            return wrapper;
        }

        const schedule = el("checkoutScheduleSection");
        const address = el("checkoutDeliveryAddressGroup");
        const location = form.querySelector(".checkout-location-field");
        const reference = el("checkoutDeliveryReference")?.closest(".form-group");
        if (!address || !location) return null;

        wrapper = document.createElement("section");
        wrapper.id = "checkoutDeliveryFlowSection";
        wrapper.className = "checkout-flow-section checkout-delivery-flow-section";
        wrapper.appendChild(heading(3, "Entrega", "Elige cuándo entregar, escribe la dirección y confirma el punto exacto."));

        const anchor = schedule || address;
        anchor.insertAdjacentElement("beforebegin", wrapper);

        if (schedule) {
            schedule.querySelector(".checkout-section-heading")?.setAttribute("hidden", "");
            wrapper.appendChild(schedule);
        }
        wrapper.append(address, location);
        if (reference) {
            wrapper.appendChild(reference);
            ensureReferenceDetails(reference);
        }
        return wrapper;
    }

    function ensureReviewSection(form) {
        let section = el("checkoutReviewFlowSection");
        if (section) return section;

        const summary = form.querySelector(".checkout-summary");
        const error = el("checkoutError");
        const button = el("confirmOrderButton");
        const loading = el("checkoutLoading");
        if (!summary || !button) return null;

        section = document.createElement("section");
        section.id = "checkoutReviewFlowSection";
        section.className = "checkout-flow-section checkout-review-flow-section";
        section.appendChild(heading(4, "Revisa y crea el pedido", "El pago se elige recién en el siguiente paso."));
        summary.insertAdjacentElement("beforebegin", section);
        const promotion = el("checkoutPromotionSection");
        if (promotion) section.appendChild(promotion);
        section.appendChild(summary);
        if (error) section.appendChild(error);
        section.appendChild(button);
        if (loading) section.appendChild(loading);

        const trust = document.createElement("p");
        trust.id = "checkoutPaymentTrustNote";
        trust.className = "checkout-payment-trust-note";
        trust.textContent = "No se cobrará nada al pulsar este botón. Después podrás elegir Mercado Pago, Yape / Plin o transferencia.";
        button.insertAdjacentElement("afterend", trust);
        return section;
    }

    function patchOrderButtonState() {
        if (typeof window.setOrderButtonState !== "function") return;
        if (window.setOrderButtonState.kantuCheckoutFlow === true) return;

        const patched = function simplifiedOrderButtonState(isLoading) {
            const button = el("confirmOrderButton");
            if (!button) return;
            button.disabled = Boolean(isLoading);
            button.textContent = isLoading ? "Creando pedido..." : "Crear pedido y elegir pago";
        };
        patched.kantuCheckoutFlow = true;
        window.setOrderButtonState = patched;
    }

    function deliveryReady() {
        const addressReady = Boolean(el("checkoutDeliveryAddressText")?.value?.trim());
        let pointReady = false;
        let quoteReady = false;
        try {
            pointReady = typeof selectedDeliveryLat !== "undefined" && selectedDeliveryLat != null
                && typeof selectedDeliveryLng !== "undefined" && selectedDeliveryLng != null;
            quoteReady = typeof currentDeliveryQuote !== "undefined" && Boolean(currentDeliveryQuote?.service_available);
        } catch {
            pointReady = false;
            quoteReady = false;
        }

        const timing = el("checkoutDeliveryTiming")?.value || "asap";
        const scheduleReady = timing !== "scheduled"
            || (Boolean(el("checkoutRequestedDate")?.value) && Boolean(el("checkoutRequestedSlot")?.value));
        return addressReady && pointReady && quoteReady && scheduleReady;
    }

    function setProgressState(key, complete, active) {
        const item = document.querySelector(`[data-checkout-progress="${key}"]`);
        if (!item) return;
        item.classList.toggle("complete", complete);
        item.classList.toggle("active", active);
        if (active) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
    }

    function updateProgress() {
        const buyerReady = Boolean(el("checkoutName")?.value?.trim() && el("checkoutPhone")?.value?.trim());
        const recipientReady = Boolean(el("checkoutRecipientName")?.value?.trim() && el("checkoutRecipientPhone")?.value?.trim());
        const deliveryIsReady = deliveryReady();

        setProgressState("buyer", buyerReady, !buyerReady);
        setProgressState("gift", recipientReady, buyerReady && !recipientReady);
        setProgressState("delivery", deliveryIsReady, buyerReady && recipientReady && !deliveryIsReady);
        setProgressState("review", buyerReady && recipientReady && deliveryIsReady, buyerReady && recipientReady && deliveryIsReady);
    }

    function bindProgressEvents(form) {
        if (form.dataset.checkoutFlowEvents === "true") return;
        form.dataset.checkoutFlowEvents = "true";
        form.addEventListener("input", updateProgress);
        form.addEventListener("change", updateProgress);
        form.addEventListener("click", event => {
            if (event.target.closest("#checkoutDeliveryMap, #checkoutUseLocationButton")) {
                window.setTimeout(updateProgress, 200);
                window.setTimeout(updateProgress, 900);
            }
        });
    }

    function observeLateFields(form) {
        if (form.dataset.checkoutFlowObserver === "true") return;
        form.dataset.checkoutFlowObserver = "true";
        new MutationObserver(() => {
            simplifyGiftSection();
            normalizeSchedulePlacement(el("checkoutDeliveryFlowSection"));
            updateProgress();
        }).observe(form, { childList: true, subtree: true });
    }

    function simplify() {
        const form = el("checkoutForm");
        if (!form) return false;
        ensureProgress();
        ensureBuyerSection(form);
        simplifyGiftSection();
        ensureDeliverySection(form);
        ensureReviewSection(form);
        patchOrderButtonState();
        bindProgressEvents(form);
        observeLateFields(form);
        form.classList.add("checkout-simplified");
        const button = el("confirmOrderButton");
        if (button && !button.disabled) button.textContent = "Crear pedido y elegir pago";
        syncRecipientMode();
        updateProgress();
        return true;
    }

    function resetForOpen() {
        const toggle = el("checkoutDifferentRecipientToggle");
        if (toggle) toggle.checked = false;
        const details = el("checkoutReferenceDetails");
        if (details) details.open = false;
        syncRecipientMode();
        window.setTimeout(updateProgress, 500);
    }

    function observeModal() {
        const modal = el("checkoutModal");
        if (!modal) return;
        const sync = () => {
            const open = modal.classList.contains("show");
            if (open && !modalWasOpen) {
                simplify();
                resetForOpen();
            }
            modalWasOpen = open;
        };
        new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ["class"] });
        sync();
    }

    function initialize() {
        ensureStyles();
        if (!simplify()) window.setTimeout(simplify, 150);
        observeModal();
    }

    window.KantuCheckoutFlow = Object.freeze({
        refresh: () => {
            simplify();
            updateProgress();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
