/* =====================================================
   KANTU FLORAL
   admin-product-manager.js

   Gestión robusta de categorías, talla y nota en el panel administrador.
   Este módulo intercepta el submit del formulario antes del manejador legado
   para evitar que la categoría elegida se restablezca accidentalmente.
===================================================== */

(() => {
    const CATEGORIES = Object.freeze([
        ["tulipanes", "Tulipanes"],
        ["girasoles", "Girasoles"],
        ["ramos", "Ramos"],
        ["rosas", "Rosas"],
        ["box", "Box"],
        ["canasta", "Canasta"],
        ["flores", "Flores"],
        ["complementos", "Complementos"],
        ["cajas", "Cajas"],
        ["ramos_buchones", "Ramos buchones"]
    ]);
    const CATEGORY_VALUES = Object.freeze(CATEGORIES.map(([value]) => value));
    const SIZES = Object.freeze(["S", "M", "L", "XL", "XXL"]);

    function element(id) {
        return document.getElementById(id);
    }

    function categoryLabel(value) {
        return CATEGORIES.find(([category]) => category === value)?.[1] || value;
    }

    function syncCategoryOptions() {
        const select = element("adminProductCategory");
        if (!select) return;

        const selected = select.value;
        const currentValues = [...select.options].map(option => option.value);
        const isCurrent = currentValues.length === CATEGORY_VALUES.length
            && currentValues.every((value, index) => value === CATEGORY_VALUES[index]);

        if (!isCurrent) {
            const fragment = document.createDocumentFragment();
            CATEGORIES.forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                fragment.appendChild(option);
            });
            select.replaceChildren(fragment);
        }

        select.value = CATEGORY_VALUES.includes(selected) ? selected : "ramos";
    }

    function ensureExtendedFields() {
        const form = element("adminProductForm");
        if (!form) return;

        if (!element("adminProductSizeGroup")) {
            const tagGroup = element("adminProductTag")?.closest(".form-group");
            const group = document.createElement("div");
            group.id = "adminProductSizeGroup";
            group.className = "form-group admin-field-wide";

            const label = document.createElement("span");
            label.className = "admin-product-field-label";
            label.textContent = "Talla *";

            const options = document.createElement("div");
            options.className = "admin-size-options";
            options.setAttribute("role", "radiogroup");
            options.setAttribute("aria-label", "Talla del producto");

            SIZES.forEach(size => {
                const option = document.createElement("label");
                option.className = "admin-size-option";

                const input = document.createElement("input");
                input.type = "radio";
                input.name = "adminProductSize";
                input.value = size;
                input.checked = size === "M";

                const text = document.createElement("span");
                text.textContent = size;
                option.append(input, text);
                options.appendChild(option);
            });

            const help = document.createElement("small");
            help.textContent = "Esta talla se mostrará en la tarjeta del producto.";
            group.append(label, options, help);

            if (tagGroup) tagGroup.insertAdjacentElement("afterend", group);
            else form.appendChild(group);
        }

        if (!element("adminProductNoteGroup")) {
            const sizeGroup = element("adminProductSizeGroup");
            const group = document.createElement("div");
            group.id = "adminProductNoteGroup";
            group.className = "form-group admin-field-wide";

            const label = document.createElement("label");
            label.htmlFor = "adminProductNote";
            label.textContent = "Nota";

            const textarea = document.createElement("textarea");
            textarea.id = "adminProductNote";
            textarea.rows = 2;
            textarea.maxLength = 300;
            textarea.placeholder = "Ej.: incluye envoltura premium, disponibilidad según temporada...";

            const help = document.createElement("small");
            help.textContent = "Opcional. Se mostrará como información adicional en el catálogo.";
            group.append(label, textarea, help);

            if (sizeGroup) sizeGroup.insertAdjacentElement("afterend", group);
            else form.appendChild(group);
        }
    }

    function setExtendedProductFields(product = null) {
        syncCategoryOptions();
        ensureExtendedFields();

        const category = CATEGORY_VALUES.includes(product?.category) ? product.category : "ramos";
        const categorySelect = element("adminProductCategory");
        if (categorySelect) categorySelect.value = category;

        const size = SIZES.includes(String(product?.size || "M").toUpperCase())
            ? String(product?.size || "M").toUpperCase()
            : "M";
        document.querySelectorAll('input[name="adminProductSize"]').forEach(input => {
            input.checked = input.value === size;
        });

        const note = element("adminProductNote");
        if (note) note.value = product?.note || "";
    }

    function readPayload() {
        syncCategoryOptions();
        ensureExtendedFields();

        const name = element("adminProductName")?.value.trim() || "";
        const description = element("adminProductDescription")?.value.trim() || "";
        const price = Number(element("adminProductPrice")?.value);
        const stock = Number(element("adminProductStock")?.value);
        const category = element("adminProductCategory")?.value || "";
        const image = element("adminProductImage")?.value.trim() || "";
        const tag = element("adminProductTag")?.value.trim() || "";
        const note = element("adminProductNote")?.value.trim() || "";
        const size = document.querySelector('input[name="adminProductSize"]:checked')?.value || "M";

        if (!name) throw new Error("El nombre es obligatorio.");
        if (!Number.isFinite(price) || price <= 0) throw new Error("El precio debe ser mayor que cero.");
        if (!Number.isInteger(stock) || stock < 0) throw new Error("El stock debe ser un número entero mayor o igual que cero.");
        if (!CATEGORY_VALUES.includes(category)) throw new Error("Selecciona una categoría válida.");
        if (!SIZES.includes(size)) throw new Error("Selecciona una talla válida.");
        if (note.length > 300) throw new Error("La nota no puede superar los 300 caracteres.");

        return {
            name,
            description: description || null,
            price,
            category,
            image: image || null,
            tag: tag || null,
            size,
            note: note || null,
            stock,
            active: Boolean(element("adminProductActive")?.checked)
        };
    }

    async function saveProduct(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        let payload;
        try {
            payload = readPayload();
        } catch (error) {
            if (typeof showAdminMessage === "function") showAdminMessage(error.message);
            return;
        }

        const id = element("adminProductId")?.value || "";
        const button = element("adminProductSaveButton");
        if (button) {
            button.disabled = true;
            button.textContent = "Guardando...";
        }

        try {
            const query = id
                ? supabaseClient.from("products").update(payload).eq("id", id)
                : supabaseClient.from("products").insert(payload);
            const { error } = await query;

            if (error) {
                console.error("Error guardando producto:", error);
                if (typeof showAdminMessage === "function") {
                    showAdminMessage("No pudimos guardar el producto. Revisa los datos.");
                }
                return;
            }

            if (typeof loadProducts === "function") await loadProducts();
            if (typeof switchAdminView === "function") switchAdminView("products");
            if (typeof showAdminMessage === "function") {
                showAdminMessage(
                    id ? "Producto actualizado correctamente." : "Producto creado correctamente.",
                    "success"
                );
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Guardar producto";
            }
        }
    }

    function decorateAdminCards() {
        if (!Array.isArray(window.adminProducts) && typeof adminProducts === "undefined") return;
        const rows = typeof adminProducts !== "undefined" ? adminProducts : window.adminProducts;
        if (!Array.isArray(rows)) return;

        const cards = [...document.querySelectorAll("#adminProductsList .admin-product-card")];
        cards.forEach((card, index) => {
            const product = rows[index];
            if (!product) return;

            const category = card.querySelector(".admin-product-info > div > span");
            if (category) category.textContent = categoryLabel(product.category);
        });
    }

    function install() {
        syncCategoryOptions();
        ensureExtendedFields();

        const form = element("adminProductForm");
        if (form && !form.dataset.kantuProductManager) {
            form.dataset.kantuProductManager = "true";
            form.addEventListener("submit", saveProduct, true);
        }

        const newButton = element("adminNewProductButton");
        if (newButton && !newButton.dataset.kantuProductManager) {
            newButton.dataset.kantuProductManager = "true";
            newButton.addEventListener("click", () => {
                queueMicrotask(() => setExtendedProductFields(null));
            });
        }

        const list = element("adminProductsList");
        if (list && !list.dataset.kantuProductManager) {
            list.dataset.kantuProductManager = "true";
            list.addEventListener("click", event => {
                const edit = event.target.closest("[data-admin-edit-product]");
                if (!edit) return;
                const productId = edit.dataset.adminEditProduct;
                queueMicrotask(() => {
                    const product = typeof adminProducts !== "undefined"
                        ? adminProducts.find(row => String(row.id) === String(productId))
                        : null;
                    setExtendedProductFields(product || null);
                });
            });

            const observer = new MutationObserver(decorateAdminCards);
            observer.observe(list, { childList: true, subtree: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
        install();
    }
})();
