/* Kantu Floral - reglas avanzadas de promociones */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let productOptions = [];
    let decorateScheduled = false;

    const el = id => document.getElementById(id);

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-promotion-rules-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/promotion-rules.css";
        link.dataset.kantuPromotionRulesStyle = "true";
        document.head.appendChild(link);
    }

    function ensureFields() {
        const form = el("adminPromotionForm");
        if (!form || el("adminPromotionRulesGroup")) return form;

        const active = el("adminPromotionActive")?.closest("label");
        const group = document.createElement("fieldset");
        group.id = "adminPromotionRulesGroup";
        group.className = "promotion-rules-group promotion-field-wide";
        group.innerHTML = `
            <legend>Reglas de uso y alcance</legend>
            <div class="promotion-rules-grid">
                <div class="form-group">
                    <label for="adminPromotionMaxRedemptions">Máximo de usos <span>(opcional)</span></label>
                    <input id="adminPromotionMaxRedemptions" type="number" min="1" step="1" placeholder="Sin límite">
                </div>
                <div class="form-group">
                    <label for="adminPromotionPerUserLimit">Máximo por cliente <span>(opcional)</span></label>
                    <input id="adminPromotionPerUserLimit" type="number" min="1" step="1" placeholder="Sin límite">
                </div>
                <div class="form-group promotion-rule-wide">
                    <label for="adminPromotionTargetProducts">Productos específicos <span>(opcional)</span></label>
                    <select id="adminPromotionTargetProducts" multiple size="6"></select>
                    <small>Déjalo vacío para no limitar por producto.</small>
                </div>
                <div class="form-group promotion-rule-wide">
                    <label for="adminPromotionTargetCategories">Categorías específicas <span>(opcional)</span></label>
                    <select id="adminPromotionTargetCategories" multiple size="6"></select>
                    <small>Si productos y categorías están vacíos, la promoción aplica a todo el catálogo.</small>
                </div>
            </div>
        `;
        if (active) active.insertAdjacentElement("beforebegin", group);
        else form.appendChild(group);
        syncOptionMarkup();
        return form;
    }

    function categoryOptions() {
        return (window.KantuProductConfig?.categories || []).map(([value, label]) => ({ value, label }));
    }

    function syncOptionMarkup(selectedProducts = [], selectedCategories = []) {
        const productSelect = el("adminPromotionTargetProducts");
        const categorySelect = el("adminPromotionTargetCategories");
        const productIds = new Set((selectedProducts || []).map(Number));
        const categories = new Set(selectedCategories || []);

        if (productSelect) {
            productSelect.innerHTML = productOptions.map(product =>
                `<option value="${Number(product.id)}" ${productIds.has(Number(product.id)) ? "selected" : ""}>${core.escapeHtml(product.name || `Producto #${product.id}`)}</option>`
            ).join("");
        }
        if (categorySelect) {
            categorySelect.innerHTML = categoryOptions().map(option =>
                `<option value="${core.escapeHtml(option.value)}" ${categories.has(option.value) ? "selected" : ""}>${core.escapeHtml(option.label)}</option>`
            ).join("");
        }
    }

    async function loadProductOptions() {
        const { data, error } = await supabaseClient
            .from("products")
            .select("id, name, active")
            .order("name", { ascending: true });
        if (error) return;
        productOptions = (data || []).filter(product => product.active !== false);
        syncOptionMarkup(
            [...(el("adminPromotionTargetProducts")?.selectedOptions || [])].map(option => Number(option.value)),
            [...(el("adminPromotionTargetCategories")?.selectedOptions || [])].map(option => option.value)
        );
    }

    function selectedValues(id, mapper = value => value) {
        const select = el(id);
        if (!select) return null;
        const values = [...select.selectedOptions].map(option => mapper(option.value)).filter(value => value != null);
        return values.length ? values : null;
    }

    function nullablePositiveInteger(value, label) {
        if (String(value || "").trim() === "") return null;
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} debe ser un entero mayor que cero.`);
        return parsed;
    }

    function normalizeCode(value) {
        return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
    }

    function toIsoOrNull(value) {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new Error("Revisa las fechas de vigencia.");
        return date.toISOString();
    }

    function readPayload() {
        const code = normalizeCode(el("adminPromotionCode")?.value);
        const discountType = el("adminPromotionType")?.value;
        const discountValue = Number(el("adminPromotionValue")?.value);
        const minimumSubtotal = Number(el("adminPromotionMinimum")?.value || 0);
        const maximumRaw = el("adminPromotionMaximum")?.value;
        const maximumDiscount = maximumRaw === "" ? null : Number(maximumRaw);
        const startsAt = toIsoOrNull(el("adminPromotionStart")?.value);
        const endsAt = toIsoOrNull(el("adminPromotionEnd")?.value);
        const description = String(el("adminPromotionDescription")?.value || "").trim();
        const maxRedemptions = nullablePositiveInteger(el("adminPromotionMaxRedemptions")?.value, "El máximo de usos");
        const perUserLimit = nullablePositiveInteger(el("adminPromotionPerUserLimit")?.value, "El máximo por cliente");

        if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("El código debe tener 3 a 40 caracteres: letras, números, guion o guion bajo.");
        if (!["percent", "fixed"].includes(discountType)) throw new Error("Selecciona un tipo de descuento válido.");
        if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error("El valor del descuento debe ser mayor que cero.");
        if (discountType === "percent" && discountValue > 100) throw new Error("El porcentaje no puede superar 100%.");
        if (!Number.isFinite(minimumSubtotal) || minimumSubtotal < 0) throw new Error("La compra mínima no puede ser negativa.");
        if (maximumDiscount != null && (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0)) throw new Error("El tope de descuento debe ser mayor que cero.");
        if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("La fecha final debe ser posterior al inicio.");
        if (description.length > 240) throw new Error("La descripción no puede superar 240 caracteres.");

        return {
            code,
            description: description || null,
            discount_type: discountType,
            discount_value: discountValue,
            minimum_subtotal: minimumSubtotal,
            maximum_discount: maximumDiscount,
            max_redemptions: maxRedemptions,
            per_user_limit: perUserLimit,
            target_product_ids: selectedValues("adminPromotionTargetProducts", value => Number(value)),
            target_categories: selectedValues("adminPromotionTargetCategories"),
            starts_at: startsAt,
            ends_at: endsAt,
            active: Boolean(el("adminPromotionActive")?.checked),
            updated_at: new Date().toISOString()
        };
    }

    function showMessage(message, type = "error") {
        const target = el("adminPromotionMessage");
        if (!target) return;
        target.textContent = message;
        target.className = `admin-message ${type}`;
        target.hidden = !message;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        let payload;
        try {
            payload = readPayload();
        } catch (error) {
            showMessage(error.message);
            return;
        }

        const id = String(el("adminPromotionId")?.value || "").trim();
        const save = el("adminPromotionSave");
        if (save) { save.disabled = true; save.textContent = "Guardando..."; }

        if (!id) {
            const { data: { user } } = await supabaseClient.auth.getUser();
            payload.created_by = user?.id || null;
        }

        const query = id
            ? supabaseClient.from("promotion_codes").update(payload).eq("id", id)
            : supabaseClient.from("promotion_codes").insert(payload);
        const { error } = await query;

        if (save) { save.disabled = false; save.textContent = "Guardar promoción"; }
        if (error) {
            console.error("Error guardando promoción avanzada:", error);
            showMessage(error.code === "23505" ? "Ese código ya existe." : "No pudimos guardar la promoción.");
            return;
        }

        el("adminPromotionCancel")?.click();
        el("adminPromotionRefresh")?.click();
        showMessage(id ? "Promoción actualizada con sus reglas." : "Promoción creada con sus reglas.", "success");
    }

    async function loadAdvancedForEdit(id) {
        if (!id) return;
        const { data, error } = await supabaseClient
            .from("promotion_codes")
            .select("max_redemptions, per_user_limit, target_product_ids, target_categories")
            .eq("id", id)
            .maybeSingle();
        if (error || !data) return;
        if (el("adminPromotionMaxRedemptions")) el("adminPromotionMaxRedemptions").value = data.max_redemptions ?? "";
        if (el("adminPromotionPerUserLimit")) el("adminPromotionPerUserLimit").value = data.per_user_limit ?? "";
        syncOptionMarkup(data.target_product_ids || [], data.target_categories || []);
    }

    function resetAdvancedFields() {
        if (el("adminPromotionMaxRedemptions")) el("adminPromotionMaxRedemptions").value = "";
        if (el("adminPromotionPerUserLimit")) el("adminPromotionPerUserLimit").value = "";
        syncOptionMarkup([], []);
    }

    async function decorateCards() {
        if (decorateScheduled) return;
        decorateScheduled = true;
        window.setTimeout(async () => {
            decorateScheduled = false;
            const list = el("adminPromotionsList");
            if (!list?.children.length) return;
            const { data, error } = await supabaseClient
                .from("promotion_codes")
                .select("id, code, max_redemptions, per_user_limit, target_product_ids, target_categories");
            if (error) return;
            const byCode = new Map((data || []).map(row => [String(row.code), row]));
            list.querySelectorAll(".promotion-admin-card").forEach(card => {
                const code = card.querySelector(".promotion-admin-main strong")?.textContent?.trim();
                const row = byCode.get(code || "");
                const meta = card.querySelector(".promotion-admin-meta");
                if (!row || !meta || meta.querySelector("[data-promotion-rules-meta]")) return;
                const products = (row.target_product_ids || []).length;
                const categories = (row.target_categories || []).length;
                const scope = products || categories
                    ? `${products ? `${products} producto${products === 1 ? "" : "s"}` : ""}${products && categories ? " + " : ""}${categories ? `${categories} categoría${categories === 1 ? "" : "s"}` : ""}`
                    : "Todo el catálogo";
                const uses = row.max_redemptions ? `Máx. ${Number(row.max_redemptions)} usos` : "Usos sin límite";
                const userLimit = row.per_user_limit ? `Máx. ${Number(row.per_user_limit)} por cliente` : "Sin límite por cliente";
                meta.insertAdjacentHTML("beforeend", `<span data-promotion-rules-meta="true">${core.escapeHtml(uses)} · ${core.escapeHtml(userLimit)} · ${core.escapeHtml(scope)}</span>`);
            });
        }, 30);
    }

    function bindWhenReady() {
        ensureStyles();
        const form = ensureFields();
        if (!form) {
            window.setTimeout(bindWhenReady, 120);
            return;
        }
        if (form.dataset.promotionRulesBound === "true") return;
        form.dataset.promotionRulesBound = "true";
        form.addEventListener("submit", handleSubmit, true);

        el("adminPromotionCancel")?.addEventListener("click", () => window.setTimeout(resetAdvancedFields, 0));
        el("adminPromotionsList")?.addEventListener("click", event => {
            const edit = event.target.closest("[data-promotion-edit]");
            if (edit) window.setTimeout(() => loadAdvancedForEdit(edit.dataset.promotionEdit), 0);
        }, true);

        const list = el("adminPromotionsList");
        if (list) new MutationObserver(decorateCards).observe(list, { childList: true, subtree: true });
        loadProductOptions();
        decorateCards();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindWhenReady, { once: true });
    else bindWhenReady();
})();
