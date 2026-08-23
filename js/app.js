/* =====================================================
   KANTU FLORAL
   app.js
===================================================== */

const KANTU_APP = window.KantuCore;

function loadAdminProductManager() {
    if (document.querySelector('script[data-kantu-admin-products="true"]')) return;

    const script = document.createElement("script");
    script.src = "js/admin-product-manager.js";
    script.async = false;
    script.dataset.kantuAdminProducts = "true";
    document.head.appendChild(script);
}

loadAdminProductManager();

function loadKantuBrandIdentity() {
    if (!document.querySelector('link[data-kantu-brand="true"]')) {
        const brandStyles = document.createElement("link");
        brandStyles.rel = "stylesheet";
        brandStyles.href = "css/brand.css";
        brandStyles.dataset.kantuBrand = "true";
        document.head.appendChild(brandStyles);
    }

    if (!document.querySelector('link[data-kantu-mobile="true"]')) {
        const mobileStyles = document.createElement("link");
        mobileStyles.rel = "stylesheet";
        mobileStyles.href = "css/mobile.css";
        mobileStyles.dataset.kantuMobile = "true";
        document.head.appendChild(mobileStyles);
    }

    document.title = "Kantu Floral | Flores que cuentan historias";

    const description = document.querySelector('meta[name="description"]');
    if (description) {
        description.content = "Kantu Floral - Arreglos exclusivos y flores que cuentan historias, con delivery en Arequipa.";
    }

    let themeColor = document.querySelector('meta[name="theme-color"]');
    if (!themeColor) {
        themeColor = document.createElement("meta");
        themeColor.name = "theme-color";
        document.head.appendChild(themeColor);
    }
    themeColor.content = "#fffaf6";
}

loadKantuBrandIdentity();

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
   CORRECCIONES DE LAYOUT
   El selector global `header` del sitio también alcanzaba al header interno
   de Mi cuenta y terminaba superponiéndose al botón X.
===================================================== */

function initializeModalLayoutFixes() {
    const accountHeader = document.querySelector(".account-header");
    if (accountHeader) {
        accountHeader.style.position = "static";
        accountHeader.style.top = "auto";
        accountHeader.style.zIndex = "auto";
        accountHeader.style.background = "transparent";
        accountHeader.style.backdropFilter = "none";
        accountHeader.style.borderBottom = "0";
    }

    document.querySelectorAll(".modal > .close-modal").forEach(button => {
        button.style.zIndex = "20";
        button.style.display = "grid";
        button.style.placeItems = "center";
        button.style.padding = "0";
        button.style.lineHeight = "1";
    });
}

/* =====================================================
   POLÍTICA DE CIERRE DE MODALES
   Un clic accidental sobre el fondo difuminado o Escape no debe destruir
   información escrita por el cliente. Las ventanas se cierran únicamente
   mediante su X o por una acción explícita del flujo.
===================================================== */

function initializeModalDismissalPolicy() {
    document.addEventListener("click", event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.classList.contains("modal-overlay") || !target.classList.contains("show")) return;

        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (!document.querySelector(".modal-overlay.show")) return;

        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

initializeModalDismissalPolicy();

/* =====================================================
   HARDENING DEL PANEL ADMIN
   - Admin solo puede cancelar pedidos pendientes/no pagados.
   - Preparación, reparto y entrega se gestionan desde staff.html para conservar
     sus timestamps operativos.
   - Ventas suma únicamente pagos aprobados.
===================================================== */

function applyAdminHardening() {
    if (typeof ADMIN_ALLOWED_TRANSITIONS !== "undefined") {
        ADMIN_ALLOWED_TRANSITIONS.pendiente = ["cancelado"];
        ADMIN_ALLOWED_TRANSITIONS.confirmado = [];
        ADMIN_ALLOWED_TRANSITIONS.preparando = [];
        ADMIN_ALLOWED_TRANSITIONS.en_camino = [];
    }

    if (typeof ADMIN_STATUS_ERROR_MESSAGES !== "undefined") {
        ADMIN_STATUS_ERROR_MESSAGES.PAYMENT_FLOW_REQUIRED = "La confirmación del pedido debe realizarla un pago aprobado.";
        ADMIN_STATUS_ERROR_MESSAGES.PAID_ORDER_CANNOT_BE_CANCELLED = "Un pedido pagado no puede cancelarse sin gestionar primero su reembolso.";
        ADMIN_STATUS_ERROR_MESSAGES.PAYMENT_NOT_APPROVED = "El pedido no puede avanzar porque el pago no está aprobado.";
        ADMIN_STATUS_ERROR_MESSAGES.OPERATIONAL_FLOW_REQUIRED = "Preparación, reparto y entrega se actualizan desde el portal operativo.";
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

/* =====================================================
   REINTENTOS SEGUROS DE MERCADO PAGO
   Un intento rechazado/cancelado puede volver a abrir Checkout Pro, pero las
   opciones manuales se mantienen ocultas hasta que el pedido esté nuevamente
   en estado de pago pendiente. Los webhooks siguen siendo la fuente de verdad.
===================================================== */

function applyMercadoPagoRetrySupport() {
    const retryableStatuses = new Set(["pending", "rejected", "cancelled"]);

    if (typeof showOrderSuccess === "function") {
        const originalShowOrderSuccess = showOrderSuccess;

        openPaymentOptionsForOrder = function retryableOpenPaymentOptionsForOrder(order) {
            const orderId = order?.id ?? order?.order_id;
            const total = Number(order?.total);
            const paymentStatus = order?.payment_status || "pending";
            if (!orderId || !Number.isFinite(total)) return false;
            if (order?.status && order.status !== "pendiente") return false;
            if (!retryableStatuses.has(paymentStatus)) return false;

            resetCheckoutView();
            const checkoutModal = getCheckoutElement("checkoutModal");
            if (!checkoutModal) return false;
            checkoutModal.classList.add("show");
            originalShowOrderSuccess({ ...order, id: orderId, total });

            if (paymentStatus !== "pending") {
                if (typeof resetManualPayment === "function") resetManualPayment();
                const paymentButton = getCheckoutElement("mercadoPagoButton");
                if (paymentButton) {
                    paymentButton.hidden = false;
                    paymentButton.disabled = false;
                    paymentButton.textContent = "Reintentar con Mercado Pago";
                }
            }

            return true;
        };
    }

    if (typeof continueAccountOrderPayment === "function") {
        continueAccountOrderPayment = function retryableContinueAccountOrderPayment(orderId, retryManual = false) {
            const order = accountOrders.find(row => String(row.id) === String(orderId));
            const paymentStatus = order?.payment_status || "pending";

            if (!order || order.status !== "pendiente" || !retryableStatuses.has(paymentStatus)) {
                showAccountMessage("Este pedido ya no está disponible para continuar el pago.");
                return;
            }

            if (retryManual && paymentStatus !== "pending") {
                showAccountMessage("Este intento solo puede reintentarse con Mercado Pago.");
                return;
            }

            closeAccount();

            if (!openPaymentOptionsForOrder(order)) {
                showAccountMessage("No pudimos abrir las opciones de pago.");
                return;
            }

            if (retryManual) {
                window.setTimeout(() => accountElement("manualPaymentButton")?.click(), 0);
            }
        };
    }

    if (typeof openOrderDetail === "function") {
        const originalOpenOrderDetail = openOrderDetail;
        openOrderDetail = async function retryableOpenOrderDetail(orderId) {
            await originalOpenOrderDetail(orderId);

            const order = accountOrders.find(row => String(row.id) === String(orderId));
            if (!order || order.status !== "pendiente" || !["rejected", "cancelled"].includes(order.payment_status)) return;

            const detail = accountElement("accountOrderDetail");
            if (!detail || detail.querySelector("[data-continue-payment]")) return;

            const state = detail.querySelector(".account-order-main-state");
            if (!state) return;

            const action = document.createElement("div");
            action.className = "account-payment-action";
            const text = order.payment_status === "cancelled"
                ? "El intento de pago fue cancelado. Puedes iniciar uno nuevo con Mercado Pago."
                : "El intento de pago fue rechazado. Puedes volver a intentarlo con Mercado Pago.";
            action.innerHTML = `<p>${KANTU_APP.escapeHtml(text)}</p>
                <button type="button" class="btn btn-primary" data-continue-payment="${KANTU_APP.escapeHtml(orderId)}">Reintentar con Mercado Pago</button>`;
            state.insertAdjacentElement("afterend", action);
        };
    }
}

applyMercadoPagoRetrySupport();

/* =====================================================
   MEJORAS DE EXPERIENCIA DEL CLIENTE
===================================================== */

const CUSTOMER_CANCEL_ERROR_MESSAGES = {
    AUTHENTICATION_REQUIRED: "Tu sesión expiró. Inicia sesión nuevamente.",
    ORDER_ID_REQUIRED: "El pedido no tiene un identificador válido.",
    ORDER_NOT_FOUND: "No encontramos este pedido o ya no te pertenece.",
    ORDER_NOT_CANCELLABLE: "Este pedido ya no puede cancelarse desde la web.",
    PAYMENT_ALREADY_STARTED: "El pago ya fue iniciado. Para evitar cobros inconsistentes, este pedido ya no puede cancelarse automáticamente.",
    ORDER_CHANGED_DURING_CANCELLATION: "El pedido cambió mientras intentábamos cancelarlo. Actualiza la página e inténtalo nuevamente."
};

function canCustomerCancelOrder(order, proof = order?.proof) {
    if (!order) return false;
    return order.status === "pendiente"
        && order.payment_status === "pending"
        && !order.payment_preference_id
        && !order.payment_id
        && !proof;
}

async function cancelCustomerOrder(orderId, button = null) {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) return false;

    const confirmed = window.confirm(
        "¿Cancelar este pedido?\n\nSolo puedes hacerlo antes de iniciar el pago. Esta acción no se puede deshacer."
    );
    if (!confirmed) return false;

    const originalText = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = "Cancelando...";
    }

    try {
        const { error } = await supabaseClient.rpc("customer_cancel_order", {
            p_order_id: normalizedOrderId
        });

        if (error) {
            console.error("Error cancelando pedido del cliente:", error);
            showToast(KANTU_APP.resolveErrorMessage(
                error,
                CUSTOMER_CANCEL_ERROR_MESSAGES,
                "No pudimos cancelar el pedido. Inténtalo nuevamente."
            ));
            return false;
        }

        if (typeof currentPaymentOrderId !== "undefined"
            && String(currentPaymentOrderId || "") === normalizedOrderId) {
            currentPaymentOrderId = null;
        }

        showToast("Pedido cancelado correctamente.");
        if (typeof loadActiveCustomerOrder === "function") await loadActiveCustomerOrder();
        return true;
    } finally {
        if (button && button.isConnected) {
            button.disabled = false;
            button.textContent = originalText || "Cancelar pedido";
        }
    }
}

function ensureCheckoutCancellationAction(order) {
    const successView = document.getElementById("checkoutSuccess");
    if (!successView) return;

    let button = document.getElementById("cancelPendingOrderButton");
    if (!button) {
        button = document.createElement("button");
        button.id = "cancelPendingOrderButton";
        button.type = "button";
        button.className = "btn btn-light form-submit customer-cancel-order checkout-cancel-order";
        button.textContent = "Cancelar pedido";

        const manualButton = document.getElementById("manualPaymentButton");
        if (manualButton) manualButton.insertAdjacentElement("afterend", button);
        else successView.appendChild(button);
    }

    const orderId = order?.id ?? order?.order_id;
    button.hidden = !orderId || !canCustomerCancelOrder(order);
    button.onclick = async () => {
        const cancelled = await cancelCustomerOrder(orderId, button);
        if (!cancelled) return;
        if (typeof closeCheckout === "function") closeCheckout();
    };
}

function applyCustomerExperienceImprovements() {
    if (typeof checkout === "function") {
        checkout = async function improvedCheckout() {
            const user = await ensureCartSessionReady();

            if (cart.length === 0) {
                showToast("Tu carrito está vacío.");
                return;
            }

            if (!user) {
                closeCart();
                openAuth("login");
                showToast("Inicia sesión para continuar con tu compra.");
                return;
            }

            // En móvil el carrito ocupa toda la pantalla; debe cerrarse antes
            // de mostrar el checkout para no tapar "Completa tu pedido".
            closeCart();
            openCheckout(user);
        };
    }

    if (typeof openPaymentOptionsForOrder === "function") {
        const originalOpenPaymentOptionsForOrder = openPaymentOptionsForOrder;
        openPaymentOptionsForOrder = function customerOpenPaymentOptionsForOrder(order) {
            const opened = originalOpenPaymentOptionsForOrder(order);
            if (opened) ensureCheckoutCancellationAction(order);
            return opened;
        };
    }

    if (typeof getActiveOrderAction === "function") {
        const originalGetActiveOrderAction = getActiveOrderAction;
        getActiveOrderAction = function customerGetActiveOrderAction(order) {
            const primaryAction = originalGetActiveOrderAction(order);
            if (!canCustomerCancelOrder(order)) return primaryAction;

            return `<div class="customer-order-action-group">
                ${primaryAction}
                <button type="button" class="btn btn-light customer-cancel-order" data-active-order-action="cancel">Cancelar pedido</button>
            </div>`;
        };
    }

    if (typeof handleActiveOrderAction === "function") {
        const originalHandleActiveOrderAction = handleActiveOrderAction;
        handleActiveOrderAction = async function customerHandleActiveOrderAction(action) {
            if (action !== "cancel") return originalHandleActiveOrderAction(action);
            if (!activeCustomerOrder || !canCustomerCancelOrder(activeCustomerOrder)) {
                showToast("Este pedido ya no puede cancelarse desde la web.");
                return;
            }

            const buttons = [...document.querySelectorAll('[data-active-order-action="cancel"]')];
            buttons.forEach(button => { button.disabled = true; });
            const cancelled = await cancelCustomerOrder(activeCustomerOrder.id);
            buttons.forEach(button => { if (button.isConnected) button.disabled = false; });
            if (cancelled && typeof closeCart === "function") closeCart();
        };
    }

    if (typeof openOrderDetail === "function") {
        const originalOpenOrderDetail = openOrderDetail;
        openOrderDetail = async function customerOpenOrderDetail(orderId) {
            await originalOpenOrderDetail(orderId);

            const order = accountOrders.find(row => String(row.id) === String(orderId));
            if (!order || order.status !== "pendiente" || order.payment_status !== "pending") return;

            let proof = null;
            try {
                proof = await KANTU_APP.fetchLatestPaymentProof(orderId);
            } catch (error) {
                console.error("No se pudo comprobar el pago antes de mostrar cancelar:", error);
                return;
            }

            if (!canCustomerCancelOrder(order, proof)) return;

            const detail = accountElement("accountOrderDetail");
            const actions = detail?.querySelector(".account-order-actions-row");
            if (!actions || actions.querySelector("[data-account-cancel-order]")) return;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-light customer-cancel-order";
            button.dataset.accountCancelOrder = String(orderId);
            button.textContent = "Cancelar pedido";
            actions.appendChild(button);
        };
    }
}

applyCustomerExperienceImprovements();

async function syncHeroRegistrationCta() {
    const button = [...document.querySelectorAll(".hero-buttons button")]
        .find(candidate => candidate.textContent.trim() === "Crear cuenta");
    if (!button || typeof getCurrentUser !== "function") return;

    const user = await getCurrentUser();
    button.hidden = Boolean(user);
}

function initializeCustomerExperienceListeners() {
    syncHeroRegistrationCta();

    supabaseClient.auth.onAuthStateChange(() => {
        window.setTimeout(syncHeroRegistrationCta, 0);
    });

    document.addEventListener("click", async event => {
        const button = event.target.closest?.("[data-account-cancel-order]");
        if (!button) return;

        const orderId = button.dataset.accountCancelOrder;
        const cancelled = await cancelCustomerOrder(orderId, button);
        if (!cancelled) return;

        if (typeof loadAccountOrders === "function") {
            accountOrdersLoaded = false;
            await loadAccountOrders();
            switchAccountTab("orders");
            showAccountMessage("Pedido cancelado correctamente.", "success");
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    initializeModalLayoutFixes();
    applyAdminHardening();
    initializeCategories();
    initializeCart();
    initializeAuth();
    initializeFavorites();
    initializeMobileMenu();
    initializeMobileLinks();
    initializeCustomerExperienceListeners();
    await loadProducts();
});
