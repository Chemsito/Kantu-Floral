/* =====================================================
   KANTU FLORAL
   app.js
===================================================== */

const KANTU_APP = window.KantuCore;

function readFavoriteIds() {
    try {
        const value = JSON.parse(localStorage.getItem("kantuFavorites") || "[]");
        if (!Array.isArray(value)) return [];
        return [...new Set(value.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    } catch {
        localStorage.removeItem("kantuFavorites");
        return [];
    }
}

let favorites = readFavoriteIds();

function toggleFavorite(productId) {
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || id <= 0) return;

    if (favorites.includes(id)) {
        favorites = favorites.filter(currentId => currentId !== id);
        showToast("Eliminado de favoritos.");
    } else {
        favorites.push(id);
        showToast("Agregado a favoritos ❤️");
    }

    localStorage.setItem("kantuFavorites", JSON.stringify(favorites));
    renderProducts();
}

function initializeFavorites() {
    const favoritesButton = document.getElementById("favoritesButton");
    if (!favoritesButton) return;

    favoritesButton.addEventListener("click", () => {
        if (favorites.length === 0) {
            showToast("Todavía no tienes favoritos.");
            return;
        }

        currentCategory = "todos";
        document.querySelectorAll(".category-btn").forEach(button => button.classList.remove("active"));
        document.querySelector('[data-category="todos"]')?.classList.add("active");
        document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
        showFavoriteProducts();
    });
}

function showFavoriteProducts() {
    const productsGrid = document.getElementById("productsGrid");
    if (!productsGrid) return;

    const favoriteProducts = products.filter(product => favorites.includes(Number(product.id)));
    if (favoriteProducts.length === 0) {
        renderProducts();
        return;
    }

    productsGrid.innerHTML = favoriteProducts.map(product => {
        const id = Number(product.id);
        if (!Number.isSafeInteger(id) || id <= 0) return "";

        const safeImage = KANTU_APP.safeUrl(product.image);
        const imageMarkup = safeImage
            ? `<img src="${KANTU_APP.escapeHtml(safeImage)}" alt="${KANTU_APP.escapeHtml(product.name || "Producto")}" loading="lazy">`
            : '<div class="product-image-placeholder" aria-hidden="true">✿</div>';
        const stock = Math.max(0, Number(product.stock) || 0);
        const price = Number(product.price) || 0;

        return `
            <article class="product-card">
                <div class="product-image">
                    ${imageMarkup}
                    <span class="product-tag">Favorito</span>
                    <button class="favorite active" onclick="toggleFavorite(${id})" aria-label="Eliminar de favoritos">♥</button>
                </div>
                <div class="product-info">
                    <span class="product-category">${KANTU_APP.escapeHtml(getCategoryName(product.category))}</span>
                    <h3>${KANTU_APP.escapeHtml(product.name || "Producto")}</h3>
                    <p>${KANTU_APP.escapeHtml(product.description || "")}</p>
                    <div class="product-bottom">
                        <span class="price">S/ ${price.toFixed(2)}</span>
                        <button class="add-cart" onclick="addToCart(${id})" ${stock <= 0 ? "disabled" : ""}>
                            ${stock > 0 ? "+ Agregar" : "Agotado"}
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

let toastTimer;

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function initializeMobileMenu() {
    const mobileMenu = document.querySelector(".mobile-menu");
    const nav = document.querySelector("nav");
    if (!mobileMenu || !nav) return;
    mobileMenu.addEventListener("click", () => nav.classList.toggle("mobile-open"));
}

function initializeMobileLinks() {
    const navLinks = document.querySelectorAll("nav a");
    const nav = document.querySelector("nav");
    navLinks.forEach(link => link.addEventListener("click", () => nav?.classList.remove("mobile-open")));
}

/* =====================================================
   HARDENING DEL PANEL ADMIN
   - Un pedido pendiente no puede confirmarse manualmente.
   - Un pedido pagado no ofrece cancelación sin flujo de reembolso.
   - Ventas suma únicamente pagos aprobados.
===================================================== */

function applyAdminHardening() {
    if (typeof ADMIN_ALLOWED_TRANSITIONS !== "undefined") {
        ADMIN_ALLOWED_TRANSITIONS.pendiente = ["cancelado"];
        ADMIN_ALLOWED_TRANSITIONS.confirmado = ["preparando"];
        ADMIN_ALLOWED_TRANSITIONS.preparando = ["en_camino"];
        ADMIN_ALLOWED_TRANSITIONS.en_camino = ["entregado"];
    }

    if (typeof ADMIN_STATUS_ERROR_MESSAGES !== "undefined") {
        ADMIN_STATUS_ERROR_MESSAGES.PAYMENT_FLOW_REQUIRED = "La confirmación del pedido debe realizarla un pago aprobado.";
        ADMIN_STATUS_ERROR_MESSAGES.PAID_ORDER_CANNOT_BE_CANCELLED = "Un pedido pagado no puede cancelarse sin gestionar primero su reembolso.";
        ADMIN_STATUS_ERROR_MESSAGES.PAYMENT_NOT_APPROVED = "El pedido no puede avanzar porque el pago no está aprobado.";
    }

    if (typeof loadAdminDashboard === "function") {
        loadAdminDashboard = async function hardenedLoadAdminDashboard() {
            const loading = adminElement("adminDashboardLoading");
            const grid = adminElement("adminStatsGrid");
            loading.hidden = false;
            grid.innerHTML = "";

            const [ordersResult, productsResult] = await Promise.all([
                supabaseClient.from("orders").select("status, total, payment_status"),
                supabaseClient.from("products").select("active, stock")
            ]);

            loading.hidden = true;

            if (ordersResult.error || productsResult.error) {
                console.error("Error cargando dashboard:", ordersResult.error || productsResult.error);
                showAdminMessage("No pudimos cargar las estadísticas del panel.");
                return;
            }

            const orders = ordersResult.data || [];
            const productRows = productsResult.data || [];
            const paidSales = orders
                .filter(order => order.payment_status === "approved" && order.status !== "cancelado")
                .reduce((sum, order) => sum + (Number(order.total) || 0), 0);

            const stats = [
                ["Total de pedidos", orders.length, "all"],
                ...ADMIN_STATUSES.map(status => [
                    ADMIN_STATUS_LABELS[status],
                    orders.filter(order => order.status === status).length,
                    status
                ]),
                ["Ventas pagadas", adminMoney(paidSales), "sales"],
                ["Productos activos", productRows.filter(product => product.active).length, "products"],
                ["Stock bajo", productRows.filter(product => Number(product.stock) <= 5).length, "stock"]
            ];

            grid.innerHTML = stats.map(([label, value, kind]) =>
                `<article class="admin-stat-card stat-${kind}">
                    <span>${adminEscape(label)}</span>
                    <strong>${adminEscape(value)}</strong>
                </article>`
            ).join("");
        };
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    applyAdminHardening();
    initializeCategories();
    initializeCart();
    initializeAuth();
    initializeFavorites();
    initializeMobileMenu();
    initializeMobileLinks();
    await loadProducts();
});
