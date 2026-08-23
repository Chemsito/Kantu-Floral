/* =====================================================
   KANTU FLORAL
   products.js
   Catálogo conectado a Supabase
===================================================== */

const KANTU_PRODUCTS = window.KantuCore;
const productEscape = KANTU_PRODUCTS.escapeHtml;
const productSafeUrl = KANTU_PRODUCTS.safeUrl;

const PRODUCT_CATEGORIES = Object.freeze([
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
const PRODUCT_CATEGORY_VALUES = Object.freeze(PRODUCT_CATEGORIES.map(([value]) => value));
const PRODUCT_SIZES = Object.freeze(["S", "M", "L", "XL", "XXL"]);

window.KantuProductConfig = Object.freeze({
    categories: PRODUCT_CATEGORIES,
    categoryValues: PRODUCT_CATEGORY_VALUES,
    sizes: PRODUCT_SIZES
});

let products = [];
let currentCategory = "todos";

function ensureProductMetadataStyles() {
    if (document.querySelector('link[data-kantu-product-metadata="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/product-options.css";
    link.dataset.kantuProductMetadata = "true";
    document.head.appendChild(link);
}

ensureProductMetadataStyles();

function getCategoryName(category) {
    return PRODUCT_CATEGORIES.find(([value]) => value === category)?.[1] || category;
}

function rebuildCategoryButtons() {
    const container = document.querySelector(".categories");
    if (!container) return [];

    const options = [["todos", "Todos"], ...PRODUCT_CATEGORIES];
    container.innerHTML = options.map(([value, label], index) => `
        <button
            class="category-btn${index === 0 ? " active" : ""}"
            data-category="${productEscape(value)}"
            type="button"
            aria-pressed="${index === 0 ? "true" : "false"}"
        >${productEscape(label)}</button>
    `).join("");

    currentCategory = "todos";
    return [...container.querySelectorAll(".category-btn")];
}

function normalizeProductSize(value) {
    const size = String(value || "M").trim().toUpperCase();
    return PRODUCT_SIZES.includes(size) ? size : "M";
}

function createProductSizeScale(size) {
    const normalized = normalizeProductSize(size);
    const wrapper = document.createElement("div");
    wrapper.className = "product-size-row";

    const title = document.createElement("span");
    title.className = "product-size-title";
    title.textContent = "Talla";

    const scale = document.createElement("div");
    scale.className = "product-size-scale";
    scale.setAttribute("aria-label", `Talla ${normalized}`);

    PRODUCT_SIZES.forEach(option => {
        const pill = document.createElement("span");
        pill.className = `product-size-pill${option === normalized ? " active" : ""}`;
        pill.textContent = option;
        pill.setAttribute("aria-hidden", option === normalized ? "false" : "true");
        scale.appendChild(pill);
    });

    wrapper.append(title, scale);
    return wrapper;
}

function enhanceRenderedProductCards(productList) {
    const cards = [...document.querySelectorAll("#productsGrid .product-card")];

    cards.forEach((card, index) => {
        const product = productList[index];
        if (!product) return;
        const info = card.querySelector(".product-info");
        if (!info) return;

        card.querySelector(".product-size-row")?.remove();
        card.querySelector(".product-note")?.remove();

        const description = info.querySelector("p");
        const sizeRow = createProductSizeScale(product.size);
        if (description) description.insertAdjacentElement("afterend", sizeRow);
        else info.prepend(sizeRow);

        const noteText = String(product.note || "").trim();
        if (noteText) {
            const note = document.createElement("p");
            note.className = "product-note";
            const prefix = document.createElement("strong");
            prefix.textContent = "Nota: ";
            note.append(prefix, document.createTextNode(noteText));
            sizeRow.insertAdjacentElement("afterend", note);
        }
    });
}

function syncAdminProductCategoryOptions(preferredValue = null) {
    const select = document.getElementById("adminProductCategory");
    if (!select) return null;

    const selectedBeforeSync = preferredValue ?? select.value;
    const currentValues = [...select.options].map(option => option.value);
    const categoriesAreCurrent = currentValues.length === PRODUCT_CATEGORY_VALUES.length
        && currentValues.every((value, index) => value === PRODUCT_CATEGORY_VALUES[index]);

    if (!categoriesAreCurrent) {
        select.innerHTML = PRODUCT_CATEGORIES.map(([value, label]) =>
            `<option value="${productEscape(value)}">${productEscape(label)}</option>`
        ).join("");
    }

    const nextValue = PRODUCT_CATEGORY_VALUES.includes(selectedBeforeSync)
        ? selectedBeforeSync
        : "ramos";
    select.value = nextValue;
    return select;
}

function ensureAdminProductMetadataFields() {
    const form = document.getElementById("adminProductForm");
    if (!form) return;

    syncAdminProductCategoryOptions();

    if (!document.getElementById("adminProductSizeGroup")) {
        const tagGroup = document.getElementById("adminProductTag")?.closest(".form-group");
        const sizeGroup = document.createElement("div");
        sizeGroup.id = "adminProductSizeGroup";
        sizeGroup.className = "form-group admin-field-wide";
        sizeGroup.innerHTML = `
            <span class="admin-product-field-label">Talla *</span>
            <div class="admin-size-options" role="radiogroup" aria-label="Talla del producto">
                ${PRODUCT_SIZES.map(size => `
                    <label class="admin-size-option">
                        <input type="radio" name="adminProductSize" value="${size}" ${size === "M" ? "checked" : ""}>
                        <span>${size}</span>
                    </label>
                `).join("")}
            </div>
            <small>Esta talla se mostrará en la tarjeta del producto.</small>
        `;

        if (tagGroup) tagGroup.insertAdjacentElement("afterend", sizeGroup);
        else form.appendChild(sizeGroup);
    }

    if (!document.getElementById("adminProductNoteGroup")) {
        const sizeGroup = document.getElementById("adminProductSizeGroup");
        const noteGroup = document.createElement("div");
        noteGroup.id = "adminProductNoteGroup";
        noteGroup.className = "form-group admin-field-wide";
        noteGroup.innerHTML = `
            <label for="adminProductNote">Nota</label>
            <textarea id="adminProductNote" rows="2" maxlength="300" placeholder="Ej.: incluye envoltura premium, disponibilidad según temporada..."></textarea>
            <small>Opcional. Se mostrará como información adicional en el catálogo.</small>
        `;
        sizeGroup?.insertAdjacentElement("afterend", noteGroup);
    }
}

function populateAdminProductMetadata(product = null) {
    ensureAdminProductMetadataFields();
    syncAdminProductCategoryOptions(product?.category || "ramos");

    const size = normalizeProductSize(product?.size);
    document.querySelectorAll('input[name="adminProductSize"]').forEach(input => {
        input.checked = input.value === size;
    });

    const note = document.getElementById("adminProductNote");
    if (note) note.value = product?.note || "";
}

function readEnhancedAdminProductPayload() {
    ensureAdminProductMetadataFields();

    const name = document.getElementById("adminProductName")?.value.trim() || "";
    const description = document.getElementById("adminProductDescription")?.value.trim() || "";
    const price = Number(document.getElementById("adminProductPrice")?.value);
    const stock = Number(document.getElementById("adminProductStock")?.value);
    const category = document.getElementById("adminProductCategory")?.value || "";
    const image = document.getElementById("adminProductImage")?.value.trim() || "";
    const tag = document.getElementById("adminProductTag")?.value.trim() || "";
    const note = document.getElementById("adminProductNote")?.value.trim() || "";
    const size = normalizeProductSize(
        document.querySelector('input[name="adminProductSize"]:checked')?.value
    );

    if (!name) throw new Error("El nombre es obligatorio.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("El precio debe ser mayor que cero.");
    if (!Number.isInteger(stock) || stock < 0) throw new Error("El stock debe ser un número entero mayor o igual que cero.");
    if (!PRODUCT_CATEGORY_VALUES.includes(category)) throw new Error("Selecciona una categoría válida.");
    if (!PRODUCT_SIZES.includes(size)) throw new Error("Selecciona una talla válida.");
    if (note.length > 300) throw new Error("La nota no puede superar los 300 caracteres.");
    if (image && !productSafeUrl(image)) throw new Error("La URL de imagen no es válida o no es segura.");

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
        active: Boolean(document.getElementById("adminProductActive")?.checked)
    };
}

async function saveEnhancedAdminProduct(event) {
    if (event.target?.id !== "adminProductForm") return;

    event.preventDefault();
    event.stopImmediatePropagation();

    let payload;
    try {
        payload = readEnhancedAdminProductPayload();
    } catch (error) {
        if (typeof showAdminMessage === "function") showAdminMessage(error.message);
        return;
    }

    const id = document.getElementById("adminProductId")?.value || "";
    const button = document.getElementById("adminProductSaveButton");
    if (button) {
        button.disabled = true;
        button.textContent = "Guardando...";
    }

    try {
        const query = id
            ? supabaseClient.from("products").update(payload).eq("id", id)
            : supabaseClient.from("products").insert(payload);
        const { error } = await query;
        if (error) throw error;

        if (typeof loadProducts === "function") await loadProducts();
        if (typeof switchAdminView === "function") switchAdminView("products");
        if (typeof showAdminMessage === "function") {
            showAdminMessage(
                id ? "Producto actualizado correctamente." : "Producto creado correctamente.",
                "success"
            );
        }
    } catch (error) {
        console.error("Error guardando producto:", error);
        if (typeof showAdminMessage === "function") {
            showAdminMessage("No pudimos guardar el producto. Revisa los datos.");
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Guardar producto";
        }
    }
}

function enhanceAdminProductCards() {
    const cards = [...document.querySelectorAll("#adminProductsList .admin-product-card")];
    cards.forEach((card, index) => {
        const product = typeof adminProducts !== "undefined" ? adminProducts[index] : null;
        if (!product) return;

        const categoryLabel = card.querySelector(".admin-product-info > div > span");
        if (categoryLabel) categoryLabel.textContent = getCategoryName(product.category);

        const badges = card.querySelector(".admin-product-badges");
        if (badges && !badges.querySelector(".admin-product-size-badge")) {
            const badge = document.createElement("span");
            badge.className = "admin-product-size-badge";
            badge.textContent = `Talla ${normalizeProductSize(product.size)}`;
            badges.appendChild(badge);
        }

        const noteText = String(product.note || "").trim();
        const info = card.querySelector(".admin-product-info");
        if (noteText && info && !info.querySelector(".admin-product-note")) {
            const note = document.createElement("p");
            note.className = "admin-product-note";
            note.textContent = `Nota: ${noteText}`;
            info.appendChild(note);
        }
    });
}

function installAdminProductEnhancements() {
    ensureAdminProductMetadataFields();

    const form = document.getElementById("adminProductForm");
    if (form && !form.dataset.kantuEnhancedSave) {
        form.addEventListener("submit", saveEnhancedAdminProduct, true);
        form.dataset.kantuEnhancedSave = "true";
    }

    if (typeof openAdminProductForm === "function" && !openAdminProductForm.__kantuEnhancedProductForm) {
        const originalOpenAdminProductForm = openAdminProductForm;
        const enhancedOpenAdminProductForm = function enhancedOpenAdminProductForm(product = null) {
            ensureAdminProductMetadataFields();
            originalOpenAdminProductForm(product);
            populateAdminProductMetadata(product);
        };
        enhancedOpenAdminProductForm.__kantuEnhancedProductForm = true;
        openAdminProductForm = enhancedOpenAdminProductForm;
    }

    if (typeof renderAdminProducts === "function" && !renderAdminProducts.__kantuEnhancedProductCards) {
        const originalRenderAdminProducts = renderAdminProducts;
        const enhancedRenderAdminProducts = function enhancedRenderAdminProducts() {
            originalRenderAdminProducts();
            enhanceAdminProductCards();
        };
        enhancedRenderAdminProducts.__kantuEnhancedProductCards = true;
        renderAdminProducts = enhancedRenderAdminProducts;
    }

    if (typeof showFavoriteProducts === "function" && !showFavoriteProducts.__kantuProductMetadata) {
        const originalShowFavoriteProducts = showFavoriteProducts;
        const enhancedShowFavoriteProducts = function enhancedShowFavoriteProducts() {
            originalShowFavoriteProducts();
            const favoriteProducts = typeof favorites === "undefined"
                ? []
                : products.filter(product => favorites.includes(Number(product.id)));
            if (favoriteProducts.length) enhanceRenderedProductCards(favoriteProducts);
        };
        enhancedShowFavoriteProducts.__kantuProductMetadata = true;
        showFavoriteProducts = enhancedShowFavoriteProducts;
    }
}

async function loadProducts() {
    try {
        const { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .eq("active", true)
            .order("id", { ascending: true });

        if (error) {
            console.error("Error cargando productos:", error);
            showToast("No se pudieron cargar los productos.");
            return;
        }

        products = data || [];
        renderProducts();

        if (typeof updateCart === "function") updateCart();
    } catch (error) {
        console.error("Error inesperado cargando catálogo:", error);
        showToast("Ocurrió un error al cargar el catálogo.");
    }
}

function renderProducts() {
    const productsGrid = document.getElementById("productsGrid");
    if (!productsGrid) return;

    const filteredProducts = currentCategory === "todos"
        ? products
        : products.filter(product => product.category === currentCategory);

    if (filteredProducts.length === 0) {
        productsGrid.innerHTML = `
            <div style="grid-column:1 / -1;text-align:center;padding:50px;">
                <h3>No encontramos productos.</h3>
                <p>Prueba otra categoría.</p>
            </div>
        `;
        return;
    }

    productsGrid.innerHTML = filteredProducts.map(product => {
        const productId = Number(product.id);
        if (!Number.isSafeInteger(productId) || productId <= 0) return "";

        const isFavorite = typeof favorites !== "undefined" && favorites.includes(Number(product.id));
        const safeImage = productSafeUrl(product.image);
        const imageMarkup = safeImage
            ? `<img src="${productEscape(safeImage)}" alt="${productEscape(product.name || "Producto")}" loading="lazy">`
            : '<div class="product-image-placeholder" aria-hidden="true">✿</div>';
        const stock = Math.max(0, Number(product.stock) || 0);
        const price = Number(product.price);
        const favoriteAction = isFavorite ? "Eliminar de" : "Agregar a";

        return `
            <article class="product-card">
                <div class="product-image">
                    ${imageMarkup}
                    <span class="product-tag">${productEscape(product.tag || "")}</span>
                    <button
                        type="button"
                        class="favorite ${isFavorite ? "active" : ""}"
                        onclick="toggleFavorite(${productId})"
                        aria-pressed="${String(isFavorite)}"
                        aria-label="${favoriteAction} favoritos: ${productEscape(product.name || "Producto")}"
                    >${isFavorite ? "♥" : "♡"}</button>
                </div>

                <div class="product-info">
                    <span class="product-category">${productEscape(getCategoryName(product.category))}</span>
                    <h3>${productEscape(product.name || "Producto")}</h3>
                    <p>${productEscape(product.description || "")}</p>

                    <div class="product-bottom">
                        <span class="price">S/ ${Number.isFinite(price) ? price.toFixed(2) : "0.00"}</span>
                        <button
                            type="button"
                            class="add-cart"
                            onclick="addToCart(${productId})"
                            ${stock <= 0 ? "disabled" : ""}
                        >${stock > 0 ? "+ Agregar" : "Agotado"}</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    enhanceRenderedProductCards(filteredProducts);
}

function initializeCategories() {
    const categoryButtons = rebuildCategoryButtons();
    installAdminProductEnhancements();

    categoryButtons.forEach(button => {
        button.addEventListener("click", () => {
            categoryButtons.forEach(btn => {
                btn.classList.remove("active");
                btn.setAttribute("aria-pressed", "false");
            });
            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");
            currentCategory = button.dataset.category;
            renderProducts();
        });
    });
}
