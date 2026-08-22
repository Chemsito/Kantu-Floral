/* =====================================================
   KANTU FLORAL
   products.js
   Catálogo conectado a Supabase
===================================================== */

const KANTU_PRODUCTS = window.KantuCore;
const productEscape = KANTU_PRODUCTS.escapeHtml;
const productSafeUrl = KANTU_PRODUCTS.safeUrl;

let products = [];
let currentCategory = "todos";

/* =====================================================
   CATEGORÍAS
===================================================== */

function getCategoryName(category) {
    const categories = {
        ramos: "Ramos",
        arreglos: "Arreglos",
        rosas: "Rosas",
        especiales: "Especiales"
    };

    return categories[category] || category;
}

/* =====================================================
   CARGAR PRODUCTOS DESDE SUPABASE
===================================================== */

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

        if (typeof updateCart === "function") {
            updateCart();
        }
    } catch (error) {
        console.error("Error inesperado cargando catálogo:", error);
        showToast("Ocurrió un error al cargar el catálogo.");
    }
}

/* =====================================================
   RENDERIZAR PRODUCTOS
===================================================== */

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

        const isFavorite = typeof favorites !== "undefined" && favorites.includes(product.id);
        const safeImage = productSafeUrl(product.image);
        const imageMarkup = safeImage
            ? `<img src="${productEscape(safeImage)}" alt="${productEscape(product.name || "Producto")}" loading="lazy">`
            : '<div class="product-image-placeholder" aria-hidden="true">✿</div>';
        const stock = Math.max(0, Number(product.stock) || 0);
        const price = Number(product.price);

        return `
            <article class="product-card">
                <div class="product-image">
                    ${imageMarkup}
                    <span class="product-tag">${productEscape(product.tag || "")}</span>
                    <button
                        class="favorite ${isFavorite ? "active" : ""}"
                        onclick="toggleFavorite(${productId})"
                        aria-label="Agregar a favoritos"
                    >${isFavorite ? "♥" : "♡"}</button>
                </div>

                <div class="product-info">
                    <span class="product-category">${productEscape(getCategoryName(product.category))}</span>
                    <h3>${productEscape(product.name || "Producto")}</h3>
                    <p>${productEscape(product.description || "")}</p>

                    <div class="product-bottom">
                        <span class="price">S/ ${Number.isFinite(price) ? price.toFixed(2) : "0.00"}</span>
                        <button
                            class="add-cart"
                            onclick="addToCart(${productId})"
                            ${stock <= 0 ? "disabled" : ""}
                        >${stock > 0 ? "+ Agregar" : "Agotado"}</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

/* =====================================================
   FILTROS
===================================================== */

function initializeCategories() {
    const categoryButtons = document.querySelectorAll(".category-btn");

    categoryButtons.forEach(button => {
        button.addEventListener("click", () => {
            categoryButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");
            currentCategory = button.dataset.category;
            renderProducts();
        });
    });
}
