/* Kantu Floral - personalizaciones de producto (ej. toppers temáticos) */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const STORAGE_PREFIX = "kantuProductCustomizations:";
    const pendingSelections = new Map();
    let selections = new Map();
    let activeUserId = null;
    let baseAddToCart = null;
    let baseUpdateCart = null;
    let baseRemoveFromCart = null;
    let invokePatched = false;

    function normalizeSelection(value) {
        return String(value || "").trim().slice(0, 120);
    }

    function productOptions(product) {
        return Array.isArray(product?.customization_options)
            ? product.customization_options.map(normalizeSelection).filter(Boolean)
            : [];
    }

    function isCustomizable(product) {
        return productOptions(product).length > 0;
    }

    function selectionIsValid(product, value) {
        const normalized = normalizeSelection(value);
        return normalized && productOptions(product).includes(normalized);
    }

    function storageKey(userId = activeUserId) {
        return `${STORAGE_PREFIX}${userId || "guest"}`;
    }

    function readLocalSelections(userId = activeUserId) {
        try {
            const raw = JSON.parse(localStorage.getItem(storageKey(userId)) || "{}");
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
            return new Map(Object.entries(raw)
                .map(([id, value]) => [Number(id), normalizeSelection(value)])
                .filter(([id, value]) => Number.isSafeInteger(id) && id > 0 && value));
        } catch {
            localStorage.removeItem(storageKey(userId));
            return new Map();
        }
    }

    function writeLocalSelections(userId = activeUserId) {
        const data = Object.fromEntries([...selections.entries()].map(([id, value]) => [String(id), value]));
        localStorage.setItem(storageKey(userId), JSON.stringify(data));
    }

    function cartHasProduct(productId) {
        try {
            return typeof cart !== "undefined" && Array.isArray(cart)
                && cart.some(item => Number(item.id) === Number(productId) && Number(item.quantity) > 0);
        } catch {
            return false;
        }
    }

    function cleanupStaleSelections() {
        if (typeof cart === "undefined" || !Array.isArray(cart)) return;
        let changed = false;
        for (const id of [...selections.keys()]) {
            if (!cartHasProduct(id)) {
                selections.delete(id);
                changed = true;
            }
        }
        if (changed) writeLocalSelections();
    }

    async function loadSelections() {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        activeUserId = error ? null : user?.id || null;
        selections = readLocalSelections(activeUserId);

        if (activeUserId) {
            const remote = await supabaseClient
                .from("cart_items")
                .select("product_id, customization")
                .eq("user_id", activeUserId)
                .not("customization", "is", null);

            if (!remote.error) {
                for (const row of remote.data || []) {
                    const id = Number(row.product_id);
                    const value = normalizeSelection(row.customization);
                    if (Number.isSafeInteger(id) && id > 0 && value) selections.set(id, value);
                }
                writeLocalSelections(activeUserId);
            }
        }

        cleanupStaleSelections();
        decorateCart();
        decorateUpsells();
    }

    async function persistSelection(productId, value) {
        const id = Number(productId);
        const normalized = normalizeSelection(value);
        if (!Number.isSafeInteger(id) || id <= 0 || !normalized) return false;

        const previous = selections.get(id) || null;
        selections.set(id, normalized);
        writeLocalSelections();

        if (!activeUserId) return true;

        const { error } = await supabaseClient
            .from("cart_items")
            .update({ customization: normalized })
            .eq("user_id", activeUserId)
            .eq("product_id", id);

        if (error) {
            console.error("No se pudo guardar la personalización del producto:", error);
            if (previous) selections.set(id, previous);
            else selections.delete(id);
            writeLocalSelections();
            return false;
        }
        return true;
    }

    function showChoiceModal(product, current = "") {
        const options = productOptions(product);
        if (!options.length) return Promise.resolve(null);

        return new Promise(resolve => {
            document.getElementById("kantuCustomizationModal")?.remove();
            const overlay = document.createElement("div");
            overlay.id = "kantuCustomizationModal";
            overlay.className = "kantu-customization-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("aria-labelledby", "kantuCustomizationTitle");
            overlay.innerHTML = `
                <div class="kantu-customization-modal">
                    <div class="kantu-customization-modal-head">
                        <div>
                            <span>Personaliza tu complemento</span>
                            <h3 id="kantuCustomizationTitle">${core.escapeHtml(product.customization_label || "Elige una opción")}</h3>
                            <p>${core.escapeHtml(product.name || "Producto")}</p>
                        </div>
                        <button type="button" class="kantu-customization-close" aria-label="Cerrar">×</button>
                    </div>
                    <div class="kantu-customization-options">
                        ${options.map(option => `
                            <button type="button" class="kantu-customization-option${option === current ? " selected" : ""}" data-customization-value="${core.escapeHtml(option)}">
                                ${core.escapeHtml(option)}
                            </button>
                        `).join("")}
                    </div>
                    <small>Esta elección aparecerá en el pedido para que el equipo prepare el topper correcto.</small>
                </div>
            `;

            const finish = value => {
                overlay.remove();
                resolve(value || null);
            };
            overlay.querySelector(".kantu-customization-close")?.addEventListener("click", () => finish(null));
            overlay.addEventListener("click", event => {
                if (event.target === overlay) finish(null);
                const button = event.target.closest?.("[data-customization-value]");
                if (button) finish(button.dataset.customizationValue);
            });
            overlay.addEventListener("keydown", event => {
                if (event.key === "Escape") finish(null);
            });
            document.body.appendChild(overlay);
            window.setTimeout(() => overlay.querySelector("[data-customization-value]")?.focus(), 0);
        });
    }

    async function resolveSelection(product, requested = "") {
        const options = productOptions(product);
        if (!options.length) return "";
        const requestedNormalized = normalizeSelection(requested);
        if (selectionIsValid(product, requestedNormalized)) return requestedNormalized;

        const pending = pendingSelections.get(Number(product.id));
        if (selectionIsValid(product, pending)) return pending;

        const existing = selections.get(Number(product.id));
        return showChoiceModal(product, selectionIsValid(product, existing) ? existing : "");
    }

    function productById(productId) {
        try {
            return typeof products !== "undefined" && Array.isArray(products)
                ? products.find(row => Number(row.id) === Number(productId)) || null
                : null;
        } catch {
            return null;
        }
    }

    function patchCartFunctions() {
        if (typeof addToCart === "function" && !baseAddToCart) {
            baseAddToCart = addToCart;
            addToCart = async function customizedAddToCart(productId, requestedCustomization = "") {
                const product = productById(productId);
                if (!product || !isCustomizable(product)) return baseAddToCart(productId);

                const selection = await resolveSelection(product, requestedCustomization);
                if (!selection) {
                    if (typeof showToast === "function") showToast("Elige el mensaje del topper antes de agregarlo.");
                    return false;
                }

                const before = typeof cart !== "undefined" && Array.isArray(cart)
                    ? Number(cart.find(item => Number(item.id) === Number(productId))?.quantity) || 0
                    : 0;
                await baseAddToCart(productId);
                const after = typeof cart !== "undefined" && Array.isArray(cart)
                    ? Number(cart.find(item => Number(item.id) === Number(productId))?.quantity) || 0
                    : 0;
                if (after <= before) return false;

                const saved = await persistSelection(productId, selection);
                if (!saved) {
                    if (before === 0 && typeof removeFromCart === "function") await removeFromCart(productId);
                    else if (typeof showToast === "function") showToast("No pudimos guardar el mensaje del topper. Inténtalo nuevamente.");
                    return false;
                }

                pendingSelections.set(Number(productId), selection);
                decorateCart();
                decorateUpsells();
                if (typeof showToast === "function") showToast(`${product.name}: ${selection}`);
                return true;
            };
        }

        if (typeof updateCart === "function" && !baseUpdateCart) {
            baseUpdateCart = updateCart;
            updateCart = function customizedUpdateCart(...args) {
                const result = baseUpdateCart(...args);
                window.setTimeout(() => {
                    cleanupStaleSelections();
                    decorateCart();
                    decorateUpsells();
                }, 0);
                return result;
            };
        }

        if (typeof removeFromCart === "function" && !baseRemoveFromCart) {
            baseRemoveFromCart = removeFromCart;
            removeFromCart = async function customizedRemoveFromCart(productId, ...args) {
                const result = await baseRemoveFromCart(productId, ...args);
                if (!cartHasProduct(productId)) {
                    selections.delete(Number(productId));
                    pendingSelections.delete(Number(productId));
                    writeLocalSelections();
                }
                decorateCart();
                return result;
            };
        }
    }

    function decorateCart() {
        const items = document.querySelectorAll("#cartItems .cart-item");
        if (!items.length || typeof cart === "undefined" || !Array.isArray(cart)) return;

        items.forEach((node, index) => {
            const item = cart[index];
            const product = productById(item?.id);
            if (!item || !product || !isCustomizable(product)) return;
            const info = node.querySelector(".cart-item-info");
            if (!info) return;

            let control = node.querySelector(".cart-customization-control");
            if (!control) {
                control = document.createElement("label");
                control.className = "cart-customization-control";
                const price = info.querySelector(".cart-item-price");
                if (price) price.insertAdjacentElement("afterend", control);
                else info.appendChild(control);
            }
            const current = selections.get(Number(item.id)) || "";
            control.innerHTML = `
                <span>${core.escapeHtml(product.customization_label || "Opción")}</span>
                <select data-cart-customization="${Number(item.id)}" aria-label="${core.escapeHtml(product.customization_label || "Personalización")}">
                    <option value="">Elige una opción…</option>
                    ${productOptions(product).map(option => `<option value="${core.escapeHtml(option)}"${option === current ? " selected" : ""}>${core.escapeHtml(option)}</option>`).join("")}
                </select>
            `;
        });
    }

    function decorateUpsells() {
        document.querySelectorAll("#checkoutUpsellList .checkout-upsell-item").forEach(card => {
            const add = card.querySelector("[data-upsell-product]");
            const id = Number(add?.dataset?.upsellProduct);
            const product = productById(id);
            const info = card.querySelector(".checkout-upsell-info");
            if (!product || !info || !isCustomizable(product)) return;

            let select = card.querySelector("[data-upsell-customization]");
            if (!select) {
                select = document.createElement("select");
                select.dataset.upsellCustomization = String(id);
                select.className = "checkout-upsell-customization";
                add.insertAdjacentElement("beforebegin", select);
            }
            const current = pendingSelections.get(id) || selections.get(id) || "";
            select.innerHTML = `<option value="">Elige diseño…</option>${productOptions(product)
                .map(option => `<option value="${core.escapeHtml(option)}"${option === current ? " selected" : ""}>${core.escapeHtml(option)}</option>`).join("")}`;
        });
    }

    function bindDocumentEvents() {
        document.addEventListener("change", async event => {
            const cartSelect = event.target.closest?.("[data-cart-customization]");
            if (cartSelect) {
                const id = Number(cartSelect.dataset.cartCustomization);
                const product = productById(id);
                const value = normalizeSelection(cartSelect.value);
                if (!product || !selectionIsValid(product, value)) return;
                cartSelect.disabled = true;
                const saved = await persistSelection(id, value);
                cartSelect.disabled = false;
                if (!saved) {
                    if (typeof showToast === "function") showToast("No pudimos cambiar el mensaje del topper.");
                    decorateCart();
                } else if (typeof showToast === "function") {
                    showToast("Mensaje del topper actualizado.");
                }
                return;
            }

            const upsellSelect = event.target.closest?.("[data-upsell-customization]");
            if (upsellSelect) {
                const id = Number(upsellSelect.dataset.upsellCustomization);
                const value = normalizeSelection(upsellSelect.value);
                if (value) pendingSelections.set(id, value);
                else pendingSelections.delete(id);
            }
        });
    }

    function customizationPayload() {
        const payload = {};
        for (const [id, value] of selections.entries()) {
            if (cartHasProduct(id) && value) payload[String(id)] = value;
        }
        return payload;
    }

    function patchGuestInvoke() {
        if (invokePatched || !supabaseClient?.functions?.invoke) return;
        invokePatched = true;
        const baseInvoke = supabaseClient.functions.invoke.bind(supabaseClient.functions);

        supabaseClient.functions.invoke = async function customizedFunctionInvoke(functionName, options = {}) {
            const result = await baseInvoke(functionName, options);
            if (functionName !== "guest-checkout" || options?.body?.action !== "create" || result?.error || !result?.data) {
                return result;
            }

            const customizations = customizationPayload();
            if (!Object.keys(customizations).length) return result;

            const orderId = result.data?.order?.order_id ?? result.data?.order?.id;
            const guestToken = result.data?.guest_token;
            if (!orderId || !guestToken) return result;

            const customResult = await baseInvoke("guest-order-customizations", {
                body: { order_id: orderId, guest_token: guestToken, customizations }
            });
            if (customResult.error) {
                console.error("No se pudo guardar la personalización del pedido invitado:", customResult.error);
                return {
                    data: null,
                    error: customResult.error
                };
            }
            return result;
        };
    }

    async function loadDetailProduct() {
        if (!document.body.classList.contains("product-detail-page")) return;
        const id = Number(new URLSearchParams(window.location.search).get("id"));
        if (!Number.isSafeInteger(id) || id <= 0) return;

        const { data, error } = await supabaseClient
            .from("products")
            .select("id, name, stock, customization_label, customization_options, customization_required")
            .eq("id", id)
            .maybeSingle();
        if (error || !data || !isCustomizable(data)) return;

        const install = () => {
            const actions = document.querySelector(".product-detail-actions");
            const add = document.getElementById("productDetailAdd");
            if (!actions || !add) return false;
            if (!document.getElementById("productDetailCustomization")) {
                const box = document.createElement("div");
                box.id = "productDetailCustomization";
                box.className = "product-detail-customization";
                box.innerHTML = `
                    <label for="productDetailCustomizationSelect">${core.escapeHtml(data.customization_label || "Elige una opción")}</label>
                    <select id="productDetailCustomizationSelect">
                        <option value="">Selecciona…</option>
                        ${productOptions(data).map(option => `<option value="${core.escapeHtml(option)}">${core.escapeHtml(option)}</option>`).join("")}
                    </select>
                    <small>Tu selección quedará registrada en el pedido.</small>
                `;
                actions.insertAdjacentElement("beforebegin", box);
            }
            return true;
        };

        if (!install()) {
            const observer = new MutationObserver(() => {
                if (install()) observer.disconnect();
            });
            observer.observe(document.getElementById("productDetailRoot") || document.body, { childList: true, subtree: true });
        }

        document.addEventListener("click", event => {
            if (!event.target.closest?.("#productDetailAdd")) return;
            const select = document.getElementById("productDetailCustomizationSelect");
            const value = normalizeSelection(select?.value);
            if (!selectionIsValid(data, value)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const status = document.getElementById("productDetailStatus");
                if (status) {
                    status.textContent = "Elige el mensaje del topper antes de agregarlo.";
                    status.className = "product-detail-status error";
                }
                select?.focus();
                return;
            }

            pendingSelections.set(id, value);
            selections.set(id, value);
            writeLocalSelections();
            window.setTimeout(async () => {
                const { data: { user } } = await supabaseClient.auth.getUser();
                activeUserId = user?.id || null;
                if (user) {
                    for (let attempt = 0; attempt < 4; attempt += 1) {
                        const result = await supabaseClient
                            .from("cart_items")
                            .update({ customization: value })
                            .eq("user_id", user.id)
                            .eq("product_id", id)
                            .select("product_id")
                            .maybeSingle();
                        if (!result.error && result.data) break;
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }
                }
            }, 250);
        }, true);
    }

    function loadStyles() {
        if (!document.querySelector('link[data-kantu-product-customizations-style="true"]')) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "css/product-customizations.css";
            link.dataset.kantuProductCustomizationsStyle = "true";
            document.head.appendChild(link);
        }
    }

    function initialize() {
        loadStyles();
        patchCartFunctions();
        patchGuestInvoke();
        bindDocumentEvents();
        loadSelections();
        loadDetailProduct();

        const observer = new MutationObserver(() => {
            patchCartFunctions();
            decorateCart();
            decorateUpsells();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        supabaseClient.auth.onAuthStateChange(() => window.setTimeout(loadSelections, 0));
    }

    window.KantuProductCustomizations = Object.freeze({
        get: productId => selections.get(Number(productId)) || null,
        payload: customizationPayload,
        choose: async productId => {
            const product = productById(productId);
            return product ? resolveSelection(product) : null;
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
