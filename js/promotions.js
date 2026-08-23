/* Kantu Floral - promociones administrables y cotización server-side */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let appliedQuote = null;
    let quoteRequest = 0;
    let quoteBusy = false;
    let adminPromotions = [];
    let adminEditingId = null;
    let modalWasOpen = false;

    const quoteErrors = Object.freeze({
        CART_EMPTY: "Tu carrito está vacío.",
        INVALID_CART: "No pudimos validar el carrito para aplicar la promoción.",
        PRODUCT_NOT_AVAILABLE: "Uno de los productos ya no está disponible.",
        INSUFFICIENT_STOCK: "Uno de los productos ya no tiene stock suficiente."
    });

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-promotions-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/promotions.css";
        link.dataset.kantuPromotionsStyle = "true";
        document.head.appendChild(link);
    }

    function normalizeCode(value) {
        return String(value || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, "")
            .slice(0, 40);
    }

    function currentLocalSubtotal() {
        if (typeof cart === "undefined" || !Array.isArray(cart)
            || typeof products === "undefined" || !Array.isArray(products)) return 0;
        return cart.reduce((sum, item) => {
            const product = products.find(row => Number(row.id) === Number(item.id));
            return sum + ((Number(product?.price) || 0) * (Number(item.quantity) || 0));
        }, 0);
    }

    function setCheckoutStatus(message, type = "") {
        const status = el("checkoutPromotionStatus");
        if (!status) return;
        status.textContent = message || "";
        status.className = `checkout-promotion-status${type ? ` ${type}` : ""}`;
        status.hidden = !message;
    }

    function syncPromotionButtons() {
        const input = el("checkoutPromotionCode");
        const apply = el("checkoutPromotionApply");
        const remove = el("checkoutPromotionRemove");
        const hasApplied = Boolean(appliedQuote?.valid);
        if (input) input.disabled = quoteBusy || hasApplied;
        if (apply) {
            apply.disabled = quoteBusy || hasApplied;
            apply.textContent = quoteBusy ? "Validando..." : "Aplicar";
            apply.hidden = hasApplied;
        }
        if (remove) remove.hidden = !hasApplied;
    }

    function ensureCheckoutFields() {
        const form = el("checkoutForm");
        const summary = form?.querySelector(".checkout-summary");
        if (!form || !summary) return null;

        let section = el("checkoutPromotionSection");
        if (section) return section;

        section = document.createElement("section");
        section.id = "checkoutPromotionSection";
        section.className = "checkout-promotion-section";
        section.innerHTML = `
            <div class="checkout-promotion-heading">
                <div>
                    <strong>¿Tienes un código promocional?</strong>
                    <small>El descuento se valida en Kantu antes de crear el pedido.</small>
                </div>
            </div>
            <div class="checkout-promotion-control">
                <input id="checkoutPromotionCode" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="CÓDIGO">
                <button id="checkoutPromotionApply" type="button">Aplicar</button>
                <button id="checkoutPromotionRemove" type="button" class="secondary" hidden>Quitar</button>
            </div>
            <p id="checkoutPromotionStatus" class="checkout-promotion-status" role="status" aria-live="polite" hidden></p>
        `;
        summary.insertAdjacentElement("beforebegin", section);

        const input = el("checkoutPromotionCode");
        input?.addEventListener("input", () => {
            const normalized = normalizeCode(input.value);
            if (input.value !== normalized) input.value = normalized;
            if (appliedQuote && normalized !== appliedQuote.code) {
                appliedQuote = null;
                setCheckoutStatus("");
                syncPromotionButtons();
                if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
            }
        });
        input?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyPromotion();
            }
        });
        el("checkoutPromotionApply")?.addEventListener("click", applyPromotion);
        el("checkoutPromotionRemove")?.addEventListener("click", removePromotion);
        syncPromotionButtons();
        return section;
    }

    function promotionReasonMessage(row) {
        if (row?.reason === "PROMOTION_MINIMUM_NOT_MET") {
            return "El carrito todavía no alcanza el mínimo requerido para este código.";
        }
        return "Este código no está disponible o ya no se encuentra vigente.";
    }

    async function quotePromotion(code, { silent = false } = {}) {
        const normalized = normalizeCode(code);
        if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalized)) {
            appliedQuote = null;
            if (!silent) setCheckoutStatus("Ingresa un código promocional válido.", "error");
            syncPromotionButtons();
            return null;
        }

        const requestId = ++quoteRequest;
        quoteBusy = true;
        syncPromotionButtons();
        if (!silent) setCheckoutStatus("Validando código...");

        const { data, error } = await supabaseClient.rpc("quote_promotion_code", {
            p_code: normalized
        });

        if (requestId !== quoteRequest) return null;
        quoteBusy = false;

        if (error) {
            console.error("Error validando promoción:", error);
            appliedQuote = null;
            const message = core.resolveErrorMessage(
                error,
                quoteErrors,
                "No pudimos validar el código. Inténtalo nuevamente."
            );
            if (!silent) setCheckoutStatus(message, "error");
            syncPromotionButtons();
            return null;
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.valid) {
            appliedQuote = null;
            if (!silent) setCheckoutStatus(promotionReasonMessage(row), "error");
            syncPromotionButtons();
            return row || null;
        }

        appliedQuote = {
            code: normalizeCode(row.code || normalized),
            valid: true,
            discount_amount: Number(row.discount_amount) || 0,
            subtotal: Number(row.subtotal) || 0,
            discounted_subtotal: Number(row.discounted_subtotal) || 0,
            description: String(row.description || "").trim()
        };
        const input = el("checkoutPromotionCode");
        if (input) input.value = appliedQuote.code;
        if (!silent) {
            const description = appliedQuote.description ? ` · ${appliedQuote.description}` : "";
            setCheckoutStatus(`Código aplicado: -${core.formatMoney(appliedQuote.discount_amount)}${description}`, "success");
        }
        syncPromotionButtons();
        return appliedQuote;
    }

    async function applyPromotion() {
        if (quoteBusy) return;
        const code = el("checkoutPromotionCode")?.value || "";
        await quotePromotion(code);
        if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
    }

    function removePromotion({ quiet = false } = {}) {
        quoteRequest += 1;
        quoteBusy = false;
        appliedQuote = null;
        const input = el("checkoutPromotionCode");
        if (input) {
            input.disabled = false;
            input.value = "";
        }
        setCheckoutStatus(quiet ? "" : "Código promocional retirado.");
        syncPromotionButtons();
        if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
    }

    async function refreshAppliedQuoteIfNeeded() {
        if (!appliedQuote?.valid || quoteBusy) return;
        const subtotal = currentLocalSubtotal();
        if (Math.abs(subtotal - Number(appliedQuote.subtotal || 0)) < 0.005) return;

        const code = appliedQuote.code;
        const result = await quotePromotion(code, { silent: true });
        if (!result?.valid) {
            setCheckoutStatus("El carrito cambió y el código ya no cumple las condiciones.", "error");
        } else {
            setCheckoutStatus(`Código actualizado: -${core.formatMoney(appliedQuote.discount_amount)}`, "success");
        }
        if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
    }

    function decorateCheckoutSummary() {
        const summary = el("checkoutSummary");
        const totalElement = el("checkoutTotal");
        if (!summary || !totalElement) return;
        summary.querySelector(".checkout-promotion-line")?.remove();

        if (!appliedQuote?.valid) return;
        const subtotal = currentLocalSubtotal();
        if (Math.abs(subtotal - Number(appliedQuote.subtotal || 0)) >= 0.005) {
            window.setTimeout(refreshAppliedQuoteIfNeeded, 0);
            return;
        }

        const discount = Math.max(0, Number(appliedQuote.discount_amount) || 0);
        if (!discount) return;

        const row = document.createElement("div");
        row.className = "checkout-summary-item checkout-promotion-line";
        row.innerHTML = `<span><strong>Promoción ${core.escapeHtml(appliedQuote.code)}</strong></span><strong>-${core.escapeHtml(core.formatMoney(discount))}</strong>`;
        const delivery = summary.querySelector(".checkout-delivery-line");
        if (delivery) delivery.insertAdjacentElement("afterend", row);
        else summary.appendChild(row);

        const deliveryFee = typeof currentDeliveryQuote !== "undefined" && currentDeliveryQuote?.service_available
            ? Number(currentDeliveryQuote.delivery_fee) || 0
            : 0;
        totalElement.textContent = core.formatMoney(Math.max(0, subtotal + deliveryFee - discount));
    }

    function installCheckoutSummaryAdapter() {
        if (typeof renderCheckoutSummary !== "function" || renderCheckoutSummary.__kantuPromotions) return;
        const base = renderCheckoutSummary;
        renderCheckoutSummary = function promotionAwareCheckoutSummary(...args) {
            const result = base(...args);
            decorateCheckoutSummary();
            return result;
        };
        renderCheckoutSummary.__kantuPromotions = true;
        decorateCheckoutSummary();
    }

    function decoratePaymentSuccess(order) {
        const discount = Number(order?.discount_amount) || 0;
        if (discount <= 0) return;
        const breakdown = el("checkoutSuccessMessage")?.querySelector(".checkout-payment-breakdown");
        const total = breakdown?.querySelector(".total");
        if (!breakdown || !total || breakdown.querySelector(".promotion-discount")) return;
        const row = document.createElement("div");
        row.className = "promotion-discount";
        row.innerHTML = `<span>Promoción${order?.promotion_code ? ` · ${core.escapeHtml(order.promotion_code)}` : ""}</span><strong>-${core.escapeHtml(core.formatMoney(discount))}</strong>`;
        total.insertAdjacentElement("beforebegin", row);
    }

    function installPaymentSuccessAdapter() {
        if (typeof showOrderSuccess !== "function" || showOrderSuccess.__kantuPromotions) return;
        const base = showOrderSuccess;
        showOrderSuccess = function promotionAwareOrderSuccess(order, ...args) {
            const result = base(order, ...args);
            decoratePaymentSuccess(order);
            return result;
        };
        showOrderSuccess.__kantuPromotions = true;
    }

    function installAccountAdapters() {
        if (typeof renderAccountPriceBreakdown === "function" && !renderAccountPriceBreakdown.__kantuPromotions) {
            const baseBreakdown = renderAccountPriceBreakdown;
            renderAccountPriceBreakdown = function promotionAwareAccountBreakdown(order, rows, ...args) {
                const html = baseBreakdown(order, rows, ...args);
                const discount = Number(order?.discount_amount) || 0;
                if (discount <= 0) return html;
                const label = order?.promotion_code ? `Promoción · ${core.escapeHtml(order.promotion_code)}` : "Promoción";
                return html.replace(
                    '<div class="total">',
                    `<div class="promotion-discount"><span>${label}</span><strong>-${core.escapeHtml(core.formatMoney(discount))}</strong></div><div class="total">`
                );
            };
            renderAccountPriceBreakdown.__kantuPromotions = true;
        }

        if (typeof buildReceiptHtml === "function" && !buildReceiptHtml.__kantuPromotions) {
            const baseReceipt = buildReceiptHtml;
            buildReceiptHtml = function promotionAwareReceipt(order, rows, ...args) {
                const html = baseReceipt(order, rows, ...args);
                const discount = Number(order?.discount_amount) || 0;
                if (discount <= 0) return html;
                const label = order?.promotion_code ? `Promoción · ${core.escapeHtml(order.promotion_code)}` : "Promoción";
                return html.replace(
                    '<div class="total"><span>Total</span>',
                    `<div><span>${label}</span><strong>-${core.escapeHtml(core.formatMoney(discount))}</strong></div><div class="total"><span>Total</span>`
                );
            };
            buildReceiptHtml.__kantuPromotions = true;
        }
    }

    function decorateAdminOrderCards() {
        const list = el("adminOrdersList");
        if (!list || typeof adminOrders === "undefined" || !Array.isArray(adminOrders)) return;
        list.querySelectorAll("[data-admin-order-detail]").forEach(button => {
            const order = adminOrders.find(row => String(row.id) === String(button.dataset.adminOrderDetail));
            const card = button.closest(".admin-order-card");
            const grid = card?.querySelector(".admin-order-grid");
            if (!order || !grid || grid.querySelector("[data-promotion-meta]")) return;
            const discount = Number(order.discount_amount) || 0;
            if (discount <= 0) return;
            grid.insertAdjacentHTML(
                "beforeend",
                `<p class="admin-wide" data-promotion-meta="true"><span>Promoción</span>${core.escapeHtml(order.promotion_code || "Aplicada")} · <strong>-${core.escapeHtml(core.formatMoney(discount))}</strong></p>`
            );
        });
    }

    function installAdminOrderAdapters() {
        if (typeof renderAdminOrders === "function" && !renderAdminOrders.__kantuPromotions) {
            const baseRender = renderAdminOrders;
            renderAdminOrders = function promotionAwareAdminOrders(...args) {
                const result = baseRender(...args);
                decorateAdminOrderCards();
                return result;
            };
            renderAdminOrders.__kantuPromotions = true;
        }

        if (typeof openAdminOrderDetail === "function" && !openAdminOrderDetail.__kantuPromotions) {
            const baseDetail = openAdminOrderDetail;
            openAdminOrderDetail = async function promotionAwareAdminDetail(orderId, ...args) {
                const result = await baseDetail(orderId, ...args);
                const order = typeof adminOrders !== "undefined"
                    ? adminOrders.find(row => String(row.id) === String(orderId))
                    : null;
                const detail = el("adminOrderDetail");
                const discount = Number(order?.discount_amount) || 0;
                if (detail && discount > 0 && !detail.querySelector("[data-promotion-detail]")) {
                    const payment = detail.querySelector(".admin-detail-location");
                    const block = document.createElement("div");
                    block.className = "admin-detail-location";
                    block.dataset.promotionDetail = "true";
                    block.innerHTML = `<span>Promoción</span><div>${core.escapeHtml(order.promotion_code || "Aplicada")} · <strong>-${core.escapeHtml(core.formatMoney(discount))}</strong></div>`;
                    if (payment) payment.insertAdjacentElement("afterend", block);
                    else detail.prepend(block);
                }
                return result;
            };
            openAdminOrderDetail.__kantuPromotions = true;
        }
    }

    function ensureAdminView() {
        const nav = document.querySelector(".admin-nav");
        const content = el("adminContent");
        if (!nav || !content) return null;

        let button = nav.querySelector('[data-admin-view="promotions"]');
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = "promotions";
            button.textContent = "Promociones";
            nav.appendChild(button);
            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView("promotions");
                window.setTimeout(loadAdminPromotions, 0);
            });
        }

        let view = el("adminPromotionsView");
        if (!view) {
            view = document.createElement("section");
            view.id = "adminPromotionsView";
            view.className = "admin-view";
            view.hidden = true;
            view.innerHTML = `
                <div class="admin-section-heading">
                    <div><h3>Promociones y cupones</h3><p>Crea códigos reales. Ningún descuento se calcula en el navegador.</p></div>
                    <button id="adminPromotionRefresh" type="button" class="admin-refresh">Actualizar</button>
                </div>
                <form id="adminPromotionForm" class="promotion-admin-form">
                    <input id="adminPromotionId" type="hidden">
                    <div class="form-group"><label for="adminPromotionCode">Código *</label><input id="adminPromotionCode" type="text" maxlength="40" placeholder="KANTU20" required></div>
                    <div class="form-group"><label for="adminPromotionType">Tipo *</label><select id="adminPromotionType"><option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option></select></div>
                    <div class="form-group"><label for="adminPromotionValue">Valor *</label><input id="adminPromotionValue" type="number" min="0.01" step="0.01" required></div>
                    <div class="form-group"><label for="adminPromotionMinimum">Compra mínima</label><input id="adminPromotionMinimum" type="number" min="0" step="0.01" value="0"></div>
                    <div class="form-group"><label for="adminPromotionMaximum">Tope de descuento <span>(opcional)</span></label><input id="adminPromotionMaximum" type="number" min="0.01" step="0.01"></div>
                    <div class="form-group"><label for="adminPromotionStart">Inicio <span>(opcional)</span></label><input id="adminPromotionStart" type="datetime-local"></div>
                    <div class="form-group"><label for="adminPromotionEnd">Fin <span>(opcional)</span></label><input id="adminPromotionEnd" type="datetime-local"></div>
                    <div class="form-group promotion-field-wide"><label for="adminPromotionDescription">Descripción</label><textarea id="adminPromotionDescription" rows="2" maxlength="240" placeholder="Ej.: campaña de aniversario"></textarea></div>
                    <label class="admin-checkbox promotion-field-wide"><input id="adminPromotionActive" type="checkbox"><span>Promoción activa</span></label>
                    <div class="admin-form-actions promotion-field-wide">
                        <button id="adminPromotionCancel" type="button" class="btn btn-light">Limpiar</button>
                        <button id="adminPromotionSave" type="submit" class="btn btn-primary">Guardar promoción</button>
                    </div>
                </form>
                <p id="adminPromotionMessage" class="admin-message" role="status" aria-live="polite" hidden></p>
                <div id="adminPromotionsLoading" class="admin-loader" hidden>Cargando promociones...</div>
                <div id="adminPromotionsList" class="promotion-admin-list"></div>
            `;
            content.appendChild(view);
            bindAdminView();
        }
        return view;
    }

    function showPromotionAdminMessage(message, type = "error") {
        const target = el("adminPromotionMessage");
        if (!target) return;
        target.textContent = message;
        target.className = `admin-message ${type}`;
        target.hidden = !message;
    }

    function toDateTimeLocal(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    }

    function fromDateTimeLocal(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function resetAdminForm() {
        adminEditingId = null;
        el("adminPromotionForm")?.reset();
        if (el("adminPromotionMinimum")) el("adminPromotionMinimum").value = "0";
        if (el("adminPromotionType")) el("adminPromotionType").value = "percent";
        if (el("adminPromotionId")) el("adminPromotionId").value = "";
        showPromotionAdminMessage("");
    }

    function readAdminPayload() {
        const code = normalizeCode(el("adminPromotionCode")?.value);
        const discountType = el("adminPromotionType")?.value;
        const discountValue = Number(el("adminPromotionValue")?.value);
        const minimumSubtotal = Number(el("adminPromotionMinimum")?.value || 0);
        const maximumRaw = el("adminPromotionMaximum")?.value;
        const maximumDiscount = maximumRaw === "" ? null : Number(maximumRaw);
        const description = String(el("adminPromotionDescription")?.value || "").trim();
        const startsAt = fromDateTimeLocal(el("adminPromotionStart")?.value);
        const endsAt = fromDateTimeLocal(el("adminPromotionEnd")?.value);

        if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("El código debe tener 3 a 40 caracteres: letras, números, guion o guion bajo.");
        if (!["percent", "fixed"].includes(discountType)) throw new Error("Selecciona un tipo de descuento válido.");
        if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error("El valor del descuento debe ser mayor que cero.");
        if (discountType === "percent" && discountValue > 100) throw new Error("El porcentaje no puede superar 100%.");
        if (!Number.isFinite(minimumSubtotal) || minimumSubtotal < 0) throw new Error("La compra mínima no puede ser negativa.");
        if (maximumDiscount != null && (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0)) throw new Error("El tope debe ser mayor que cero.");
        if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("La fecha final debe ser posterior al inicio.");

        return {
            code,
            description: description || null,
            discount_type: discountType,
            discount_value: discountValue,
            minimum_subtotal: minimumSubtotal,
            maximum_discount: maximumDiscount,
            starts_at: startsAt,
            ends_at: endsAt,
            active: Boolean(el("adminPromotionActive")?.checked),
            updated_at: new Date().toISOString()
        };
    }

    async function saveAdminPromotion(event) {
        event.preventDefault();
        let payload;
        try {
            payload = readAdminPayload();
        } catch (error) {
            showPromotionAdminMessage(error.message);
            return;
        }

        const save = el("adminPromotionSave");
        if (save) { save.disabled = true; save.textContent = "Guardando..."; }

        if (!adminEditingId) {
            const { data: { user } } = await supabaseClient.auth.getUser();
            payload.created_by = user?.id || null;
        }

        const query = adminEditingId
            ? supabaseClient.from("promotion_codes").update(payload).eq("id", adminEditingId)
            : supabaseClient.from("promotion_codes").insert(payload);
        const { error } = await query;

        if (save) { save.disabled = false; save.textContent = "Guardar promoción"; }
        if (error) {
            console.error("Error guardando promoción:", error);
            showPromotionAdminMessage(error.code === "23505" ? "Ese código ya existe." : "No pudimos guardar la promoción. Revisa los datos.");
            return;
        }

        resetAdminForm();
        await loadAdminPromotions();
        showPromotionAdminMessage("Promoción guardada correctamente.", "success");
    }

    function editAdminPromotion(id) {
        const promotion = adminPromotions.find(row => Number(row.id) === Number(id));
        if (!promotion) return;
        adminEditingId = Number(promotion.id);
        el("adminPromotionId").value = String(promotion.id);
        el("adminPromotionCode").value = promotion.code || "";
        el("adminPromotionType").value = promotion.discount_type || "percent";
        el("adminPromotionValue").value = promotion.discount_value ?? "";
        el("adminPromotionMinimum").value = promotion.minimum_subtotal ?? 0;
        el("adminPromotionMaximum").value = promotion.maximum_discount ?? "";
        el("adminPromotionStart").value = toDateTimeLocal(promotion.starts_at);
        el("adminPromotionEnd").value = toDateTimeLocal(promotion.ends_at);
        el("adminPromotionDescription").value = promotion.description || "";
        el("adminPromotionActive").checked = Boolean(promotion.active);
        showPromotionAdminMessage("Editando promoción. Los pedidos históricos conservarán el descuento que ya recibieron.");
        el("adminPromotionCode")?.focus();
    }

    async function toggleAdminPromotion(id) {
        const promotion = adminPromotions.find(row => Number(row.id) === Number(id));
        if (!promotion) return;
        const { error } = await supabaseClient
            .from("promotion_codes")
            .update({ active: !promotion.active, updated_at: new Date().toISOString() })
            .eq("id", promotion.id);
        if (error) {
            showPromotionAdminMessage("No pudimos cambiar el estado de la promoción.");
            return;
        }
        await loadAdminPromotions();
        showPromotionAdminMessage(promotion.active ? "Promoción desactivada." : "Promoción activada.", "success");
    }

    function promotionValueLabel(row) {
        if (row.discount_type === "percent") {
            const cap = row.maximum_discount ? ` · tope ${core.formatMoney(row.maximum_discount)}` : "";
            return `${Number(row.discount_value)}%${cap}`;
        }
        return core.formatMoney(row.discount_value);
    }

    function renderAdminPromotions() {
        const list = el("adminPromotionsList");
        if (!list) return;
        list.innerHTML = adminPromotions.length
            ? adminPromotions.map(row => {
                const windowText = row.starts_at || row.ends_at
                    ? `${row.starts_at ? core.formatDate(row.starts_at) : "Ahora"} → ${row.ends_at ? core.formatDate(row.ends_at) : "Sin fin"}`
                    : "Sin ventana de fechas";
                return `<article class="promotion-admin-card">
                    <div class="promotion-admin-main">
                        <div><strong>${core.escapeHtml(row.code)}</strong><span>${core.escapeHtml(row.description || "Sin descripción")}</span></div>
                        <span class="promotion-status ${row.active ? "active" : "inactive"}">${row.active ? "Activa" : "Inactiva"}</span>
                    </div>
                    <div class="promotion-admin-meta">
                        <span>Descuento: <strong>${core.escapeHtml(promotionValueLabel(row))}</strong></span>
                        <span>Mínimo: <strong>${core.escapeHtml(core.formatMoney(row.minimum_subtotal || 0))}</strong></span>
                        <span>${core.escapeHtml(windowText)}</span>
                    </div>
                    <div class="promotion-admin-actions">
                        <button type="button" data-promotion-edit="${row.id}">Editar</button>
                        <button type="button" data-promotion-toggle="${row.id}" class="${row.active ? "danger" : ""}">${row.active ? "Desactivar" : "Activar"}</button>
                    </div>
                </article>`;
            }).join("")
            : '<div class="admin-empty">Todavía no hay códigos promocionales. No se creó ninguno automáticamente.</div>';
    }

    async function loadAdminPromotions() {
        ensureAdminView();
        const loading = el("adminPromotionsLoading");
        if (loading) loading.hidden = false;
        const { data, error } = await supabaseClient
            .from("promotion_codes")
            .select("*")
            .order("created_at", { ascending: false });
        if (loading) loading.hidden = true;
        if (error) {
            console.error("Error cargando promociones:", error);
            showPromotionAdminMessage("No pudimos cargar las promociones.");
            return;
        }
        adminPromotions = data || [];
        renderAdminPromotions();
    }

    function bindAdminView() {
        el("adminPromotionForm")?.addEventListener("submit", saveAdminPromotion);
        el("adminPromotionCancel")?.addEventListener("click", resetAdminForm);
        el("adminPromotionRefresh")?.addEventListener("click", loadAdminPromotions);
        el("adminPromotionCode")?.addEventListener("input", event => {
            event.target.value = normalizeCode(event.target.value);
        });
        el("adminPromotionsList")?.addEventListener("click", event => {
            const edit = event.target.closest("[data-promotion-edit]");
            const toggle = event.target.closest("[data-promotion-toggle]");
            if (edit) editAdminPromotion(edit.dataset.promotionEdit);
            if (toggle) toggleAdminPromotion(toggle.dataset.promotionToggle);
        });
    }

    function watchCheckoutModal() {
        const modal = el("checkoutModal");
        if (!modal) return;
        const sync = () => {
            const open = modal.classList.contains("show");
            if (open && !modalWasOpen) {
                removePromotion({ quiet: true });
            }
            modalWasOpen = open;
        };
        new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ["class"] });
        sync();
    }

    function initialize() {
        ensureStyles();
        ensureCheckoutFields();
        installCheckoutSummaryAdapter();
        installPaymentSuccessAdapter();
        installAccountAdapters();
        installAdminOrderAdapters();
        ensureAdminView();
        watchCheckoutModal();
    }

    window.KantuPromotions = Object.freeze({
        getAppliedCode: () => appliedQuote?.valid ? appliedQuote.code : null,
        getAppliedQuote: () => appliedQuote ? { ...appliedQuote } : null,
        refresh: refreshAppliedQuoteIfNeeded,
        remove: () => removePromotion()
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
