/* Kantu Floral - gestión administrativa de cupones */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let couponRows = [];
    let couponProducts = [];

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-coupons-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/coupons.css";
        link.dataset.kantuCouponsStyle = "true";
        document.head.appendChild(link);
    }

    function ensureAdminCouponView() {
        const nav = document.querySelector("#adminModal .admin-nav");
        const content = el("adminContent");
        if (!nav || !content) return null;

        let button = nav.querySelector('[data-admin-view="coupons"]');
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = "coupons";
            button.textContent = "Cupones";
            nav.appendChild(button);
            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView("coupons");
                window.setTimeout(loadCoupons, 0);
            });
        }

        let view = el("adminCouponsView");
        if (view) return view;

        view = document.createElement("section");
        view.id = "adminCouponsView";
        view.className = "admin-view";
        view.hidden = true;
        view.innerHTML = `
            <div class="admin-section-heading">
                <div><h3>Cupones y promociones</h3><p>Crea descuentos reales con límites, fechas y productos aplicables. No se publicará ningún código automáticamente.</p></div>
                <button id="adminNewCouponButton" type="button" class="btn btn-primary">Nuevo cupón</button>
            </div>
            <div id="adminCouponsLoading" class="admin-loader" hidden>Cargando cupones...</div>
            <div id="adminCouponsEmpty" class="admin-empty" hidden>No hay cupones creados.</div>
            <div id="adminCouponsList" class="admin-list"></div>

            <section id="adminCouponEditor" class="admin-coupon-editor" hidden>
                <div class="admin-section-heading compact">
                    <div><h4 id="adminCouponEditorTitle">Nuevo cupón</h4><p>Los descuentos se calculan y validan en Supabase.</p></div>
                    <button id="adminCouponCloseEditor" type="button" class="btn btn-light">Cerrar</button>
                </div>
                <form id="adminCouponForm" class="admin-coupon-form">
                    <input id="adminCouponId" type="hidden">
                    <div class="form-group"><label for="adminCouponCode">Código *</label><input id="adminCouponCode" type="text" maxlength="32" placeholder="EJEMPLO10" required></div>
                    <div class="form-group"><label for="adminCouponType">Tipo *</label><select id="adminCouponType"><option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option></select></div>
                    <div class="form-group"><label for="adminCouponValue">Valor *</label><input id="adminCouponValue" type="number" min="0.01" step="0.01" required></div>
                    <div class="form-group"><label for="adminCouponMinSubtotal">Compra mínima</label><input id="adminCouponMinSubtotal" type="number" min="0" step="0.01" value="0"></div>
                    <div class="form-group"><label for="adminCouponMaxRedemptions">Máximo de usos</label><input id="adminCouponMaxRedemptions" type="number" min="1" step="1" placeholder="Sin límite"></div>
                    <div class="form-group"><label for="adminCouponPerUser">Máximo por cliente</label><input id="adminCouponPerUser" type="number" min="1" step="1" placeholder="Sin límite"></div>
                    <div class="form-group"><label for="adminCouponStartsAt">Disponible desde</label><input id="adminCouponStartsAt" type="datetime-local"></div>
                    <div class="form-group"><label for="adminCouponEndsAt">Disponible hasta</label><input id="adminCouponEndsAt" type="datetime-local"></div>
                    <div class="form-group admin-field-wide"><label for="adminCouponProducts">Solo productos específicos <span>(opcional)</span></label><select id="adminCouponProducts" multiple size="6"></select><small>Si no seleccionas productos ni categorías, aplica a todo el catálogo.</small></div>
                    <div class="form-group admin-field-wide"><label for="adminCouponCategories">Solo categorías específicas <span>(opcional)</span></label><select id="adminCouponCategories" multiple size="6"></select></div>
                    <label class="admin-checkbox admin-field-wide"><input id="adminCouponActive" type="checkbox" checked><span>Cupón activo</span></label>
                    <div class="admin-form-actions admin-field-wide"><button id="adminCouponCancel" type="button" class="btn btn-light">Cancelar</button><button id="adminCouponSave" type="submit" class="btn btn-primary">Guardar cupón</button></div>
                </form>
            </section>
        `;
        content.appendChild(view);

        el("adminNewCouponButton")?.addEventListener("click", () => openCouponEditor());
        el("adminCouponCloseEditor")?.addEventListener("click", closeCouponEditor);
        el("adminCouponCancel")?.addEventListener("click", closeCouponEditor);
        el("adminCouponForm")?.addEventListener("submit", saveCoupon);
        el("adminCouponsList")?.addEventListener("click", event => {
            const edit = event.target.closest("[data-admin-edit-coupon]");
            const toggle = event.target.closest("[data-admin-toggle-coupon]");
            if (edit) openCouponEditor(couponRows.find(row => String(row.id) === String(edit.dataset.adminEditCoupon)));
            if (toggle) toggleCoupon(toggle.dataset.adminToggleCoupon);
        });
        return view;
    }

    function categoryOptions() {
        const categories = window.KantuProductConfig?.categories || [];
        return categories.map(([value, label]) => ({ value, label }));
    }

    function syncTargetOptions(coupon = null) {
        const productSelect = el("adminCouponProducts");
        const categorySelect = el("adminCouponCategories");
        if (productSelect) {
            const selected = new Set((coupon?.target_product_ids || []).map(Number));
            productSelect.innerHTML = couponProducts.map(product => `<option value="${Number(product.id)}" ${selected.has(Number(product.id)) ? "selected" : ""}>${core.escapeHtml(product.name || `Producto #${product.id}`)}</option>`).join("");
        }
        if (categorySelect) {
            const selected = new Set(coupon?.target_categories || []);
            categorySelect.innerHTML = categoryOptions().map(option => `<option value="${core.escapeHtml(option.value)}" ${selected.has(option.value) ? "selected" : ""}>${core.escapeHtml(option.label)}</option>`).join("");
        }
    }

    function localDateTime(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    }

    function openCouponEditor(coupon = null) {
        ensureAdminCouponView();
        const editor = el("adminCouponEditor");
        const form = el("adminCouponForm");
        if (!editor || !form) return;
        form.reset();
        editor.hidden = false;
        el("adminCouponEditorTitle").textContent = coupon ? `Editar ${coupon.code}` : "Nuevo cupón";
        el("adminCouponId").value = coupon?.id ?? "";
        el("adminCouponCode").value = coupon?.code || "";
        el("adminCouponType").value = coupon?.discount_type || "percent";
        el("adminCouponValue").value = coupon?.discount_value ?? "";
        el("adminCouponMinSubtotal").value = coupon?.min_subtotal ?? 0;
        el("adminCouponMaxRedemptions").value = coupon?.max_redemptions ?? "";
        el("adminCouponPerUser").value = coupon?.per_user_limit ?? "";
        el("adminCouponStartsAt").value = localDateTime(coupon?.starts_at);
        el("adminCouponEndsAt").value = localDateTime(coupon?.ends_at);
        el("adminCouponActive").checked = coupon ? Boolean(coupon.active) : true;
        syncTargetOptions(coupon);
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeCouponEditor() {
        const editor = el("adminCouponEditor");
        if (editor) editor.hidden = true;
    }

    function selectedValues(id, mapper = value => value) {
        const select = el(id);
        if (!select) return null;
        const values = [...select.selectedOptions].map(option => mapper(option.value)).filter(value => value !== null);
        return values.length ? values : null;
    }

    function nullablePositiveInteger(value) {
        if (String(value || "").trim() === "") return null;
        const number = Number(value);
        if (!Number.isInteger(number) || number <= 0) throw new Error("Los límites deben ser enteros mayores que cero.");
        return number;
    }

    function readCouponForm() {
        const code = String(el("adminCouponCode")?.value || "").trim().toUpperCase();
        const type = el("adminCouponType")?.value;
        const value = Number(el("adminCouponValue")?.value);
        const minSubtotal = Number(el("adminCouponMinSubtotal")?.value || 0);
        const maxRedemptions = nullablePositiveInteger(el("adminCouponMaxRedemptions")?.value);
        const perUser = nullablePositiveInteger(el("adminCouponPerUser")?.value);
        const starts = el("adminCouponStartsAt")?.value || "";
        const ends = el("adminCouponEndsAt")?.value || "";

        if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) throw new Error("El código debe tener entre 3 y 32 caracteres: letras, números, guion o guion bajo.");
        if (!["percent", "fixed"].includes(type)) throw new Error("Selecciona un tipo de descuento válido.");
        if (!Number.isFinite(value) || value <= 0) throw new Error("El valor del descuento debe ser mayor que cero.");
        if (type === "percent" && value > 100) throw new Error("El porcentaje no puede superar 100%.");
        if (!Number.isFinite(minSubtotal) || minSubtotal < 0) throw new Error("La compra mínima no puede ser negativa.");
        if (starts && ends && new Date(starts) > new Date(ends)) throw new Error("La fecha final debe ser posterior a la fecha inicial.");

        return {
            code,
            discount_type: type,
            discount_value: value,
            min_subtotal: minSubtotal,
            max_redemptions: maxRedemptions,
            per_user_limit: perUser,
            starts_at: starts ? new Date(starts).toISOString() : null,
            ends_at: ends ? new Date(ends).toISOString() : null,
            target_product_ids: selectedValues("adminCouponProducts", raw => Number(raw)),
            target_categories: selectedValues("adminCouponCategories"),
            active: Boolean(el("adminCouponActive")?.checked)
        };
    }

    async function saveCoupon(event) {
        event.preventDefault();
        let payload;
        try {
            payload = readCouponForm();
        } catch (error) {
            if (typeof showAdminMessage === "function") showAdminMessage(error.message);
            return;
        }

        const id = el("adminCouponId")?.value;
        const button = el("adminCouponSave");
        if (button) { button.disabled = true; button.textContent = "Guardando..."; }
        const query = id
            ? supabaseClient.from("coupons").update(payload).eq("id", id)
            : supabaseClient.from("coupons").insert(payload);
        const { error } = await query;
        if (button) { button.disabled = false; button.textContent = "Guardar cupón"; }

        if (error) {
            console.error("Error guardando cupón:", error);
            if (typeof showAdminMessage === "function") showAdminMessage(error.code === "23505" ? "Ya existe un cupón con ese código." : "No pudimos guardar el cupón.");
            return;
        }
        closeCouponEditor();
        await loadCoupons();
        if (typeof showAdminMessage === "function") showAdminMessage(id ? "Cupón actualizado correctamente." : "Cupón creado correctamente.", "success");
    }

    async function toggleCoupon(id) {
        const coupon = couponRows.find(row => String(row.id) === String(id));
        if (!coupon) return;
        const { error } = await supabaseClient.from("coupons").update({ active: !coupon.active }).eq("id", coupon.id);
        if (error) {
            if (typeof showAdminMessage === "function") showAdminMessage("No pudimos cambiar el estado del cupón.");
            return;
        }
        await loadCoupons();
    }

    function couponTargetLabel(coupon) {
        const products = (coupon.target_product_ids || []).length;
        const categories = (coupon.target_categories || []).length;
        if (!products && !categories) return "Todo el catálogo";
        const parts = [];
        if (products) parts.push(`${products} producto${products === 1 ? "" : "s"}`);
        if (categories) parts.push(`${categories} categoría${categories === 1 ? "" : "s"}`);
        return parts.join(" + ");
    }

    function renderCoupons(usageMap) {
        const list = el("adminCouponsList");
        const empty = el("adminCouponsEmpty");
        if (!list || !empty) return;
        empty.hidden = couponRows.length > 0;
        list.innerHTML = couponRows.map(coupon => {
            const uses = usageMap.get(Number(coupon.id)) || 0;
            const discount = coupon.discount_type === "percent"
                ? `${Number(coupon.discount_value)}%`
                : core.formatMoney(coupon.discount_value);
            return `<article class="admin-coupon-card">
                <div class="admin-coupon-top"><div><small>Código</small><strong>${core.escapeHtml(coupon.code)}</strong></div><span class="${coupon.active ? "active" : "inactive"}">${coupon.active ? "Activo" : "Inactivo"}</span></div>
                <div class="admin-coupon-grid">
                    <p><span>Descuento</span><strong>${core.escapeHtml(discount)}</strong></p>
                    <p><span>Compra mínima</span>${core.escapeHtml(core.formatMoney(coupon.min_subtotal || 0))}</p>
                    <p><span>Usos</span>${uses}${coupon.max_redemptions ? ` / ${Number(coupon.max_redemptions)}` : " / ∞"}</p>
                    <p><span>Por cliente</span>${coupon.per_user_limit ? Number(coupon.per_user_limit) : "Sin límite"}</p>
                    <p><span>Aplica a</span>${core.escapeHtml(couponTargetLabel(coupon))}</p>
                    <p><span>Vigencia</span>${coupon.ends_at ? core.escapeHtml(core.formatDate(coupon.ends_at)) : "Sin vencimiento"}</p>
                </div>
                <div class="admin-product-actions"><button type="button" data-admin-edit-coupon="${Number(coupon.id)}">Editar</button><button type="button" data-admin-toggle-coupon="${Number(coupon.id)}">${coupon.active ? "Desactivar" : "Activar"}</button></div>
            </article>`;
        }).join("");
    }

    async function loadCoupons() {
        ensureAdminCouponView();
        const loading = el("adminCouponsLoading");
        if (loading) loading.hidden = false;

        const [couponsResult, productsResult, ordersResult] = await Promise.all([
            supabaseClient.from("coupons").select("*").order("created_at", { ascending: false }),
            supabaseClient.from("products").select("id, name, category, active").order("name", { ascending: true }),
            supabaseClient.from("orders").select("coupon_id, status").not("coupon_id", "is", null)
        ]);
        if (loading) loading.hidden = true;

        if (couponsResult.error || productsResult.error || ordersResult.error) {
            console.error("Error cargando cupones:", couponsResult.error || productsResult.error || ordersResult.error);
            if (typeof showAdminMessage === "function") showAdminMessage("No pudimos cargar la configuración de cupones.");
            return;
        }

        couponRows = couponsResult.data || [];
        couponProducts = (productsResult.data || []).filter(product => product.active !== false);
        const usageMap = new Map();
        (ordersResult.data || []).filter(order => order.status !== "cancelado").forEach(order => {
            const id = Number(order.coupon_id);
            usageMap.set(id, (usageMap.get(id) || 0) + 1);
        });
        renderCoupons(usageMap);
        syncTargetOptions();
    }

    function initialize() {
        ensureStyles();
        ensureAdminCouponView();
        const modal = el("adminModal");
        if (modal) {
            new MutationObserver(() => {
                if (modal.classList.contains("show")) ensureAdminCouponView();
            }).observe(modal, { attributes: true, attributeFilter: ["class"] });
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
