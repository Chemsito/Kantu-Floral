/* KANTU FLORAL - SEGUIMIENTO CENTRAL DEL PEDIDO ACTIVO */

const CUSTOMER_ORDER_POLL_INTERVAL = 10000;
const CUSTOMER_ACTIVE_STATUSES = ["pendiente", "confirmado", "preparando", "en_camino"];
const CUSTOMER_ACTIVE_PROOF_STATUSES = ["uploaded", "verifying", "needs_review"];

const KANTU_TRACKING = window.KantuCore;
const CUSTOMER_PAYMENT_METHODS = KANTU_TRACKING.paymentMethodLabels;
const trackingElement = KANTU_TRACKING.element;
const trackingEscape = KANTU_TRACKING.escapeHtml;
const trackingMoney = KANTU_TRACKING.formatMoney;
const trackingDate = KANTU_TRACKING.formatDate;
const trackingShortId = KANTU_TRACKING.shortId;

let activeCustomerOrder = null;
let activeCustomerOrderPollId = null;
let activeCustomerOrderLoading = null;

function getCustomerOrderState(order, proof = order?.proof) {
    if (!order) return { key: "none", label: "Sin pedido activo" };
    if (order.status === "cancelado") return { key: "cancelado", label: "Pedido cancelado" };
    if (order.status === "entregado") return { key: "entregado", label: "Pedido entregado" };
    if (order.status === "en_camino") return { key: "en_camino", label: "Tu pedido está en camino" };
    if (order.status === "preparando") return { key: "preparando", label: "Estamos preparando tus flores" };
    if (order.payment_status === "approved" && order.status === "confirmado") {
        return { key: "confirmado", label: "Pago aprobado · Pedido confirmado" };
    }
    if (proof?.verification_status === "uploaded") return { key: "uploaded", label: "Comprobante recibido" };
    if (proof?.verification_status === "verifying") return { key: "verifying", label: "Verificando tu pago" };
    if (proof?.verification_status === "needs_review") return { key: "needs_review", label: "Tu pago está en revisión" };
    if (proof?.verification_status === "rejected") return { key: "rejected", label: "Comprobante rechazado" };
    return { key: "pending", label: "Pendiente de pago" };
}

function renderCustomerOrderTracker(order) {
    const steps = ["Pago", "Confirmado", "Preparando", "En camino", "Entregado"];
    const statusIndexes = { pendiente: 0, confirmado: 1, preparando: 2, en_camino: 3, entregado: 4 };
    let currentIndex = order.payment_status === "approved" ? (statusIndexes[order.status] ?? 1) : 0;
    if (order.status === "cancelado") currentIndex = -1;

    return `<ol class="customer-order-tracker">${steps.map((label, index) => {
        const className = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        const symbol = className === "complete" ? "✓" : className === "current" ? "●" : "○";
        const stepLabel = index === 0 && order.payment_status !== "approved" ? "Pago pendiente" : label;
        return `<li class="${className}"><span>${symbol}</span><strong>${trackingEscape(stepLabel)}</strong></li>`;
    }).join("")}</ol>`;
}

function chooseActiveCustomerOrder(orders) {
    const usable = orders.filter(order => !["cancelado", "entregado"].includes(order.status));
    return usable.find(order => order.payment_status === "pending")
        || usable.find(order => CUSTOMER_ACTIVE_STATUSES.includes(order.status))
        || null;
}

async function fetchActiveCustomerOrder() {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return { user: null, order: null };

    const ordersResult = await supabaseClient
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

    if (ordersResult.error) throw ordersResult.error;

    const orders = ordersResult.data || [];
    let order = chooseActiveCustomerOrder(orders);

    if (!order && activeCustomerOrder?.id) {
        const completed = orders.find(row =>
            String(row.id) === String(activeCustomerOrder.id)
            && ["entregado", "cancelado"].includes(row.status)
        );
        if (completed) order = { ...completed, _terminal_preview: true };
    }

    if (!order) return { user, order: null };

    const [itemsResult, proofResult] = await Promise.allSettled([
        KANTU_TRACKING.fetchOrderItemsWithProducts(order.id),
        KANTU_TRACKING.fetchLatestPaymentProof(order.id)
    ]);

    if (itemsResult.status === "rejected") throw itemsResult.reason;
    if (proofResult.status === "rejected") {
        console.error("Error cargando comprobante del pedido activo:", proofResult.reason);
    }

    const items = itemsResult.value || [];
    const proof = proofResult.status === "fulfilled" ? proofResult.value : null;

    return {
        user,
        order: {
            ...order,
            proof,
            items,
            item_count: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        }
    };
}

async function loadActiveCustomerOrder() {
    if (activeCustomerOrderLoading) return activeCustomerOrderLoading;

    activeCustomerOrderLoading = (async () => {
        try {
            const result = await fetchActiveCustomerOrder();
            activeCustomerOrder = result.order;
            renderActiveCustomerOrder(result.user);
            manageActiveCustomerOrderPolling(Boolean(result.user && result.order && !result.order._terminal_preview));

            if (result.order?._terminal_preview) {
                window.setTimeout(() => {
                    if (!activeCustomerOrder?._terminal_preview) return;
                    activeCustomerOrder = null;
                    renderActiveCustomerOrder(result.user);
                    manageActiveCustomerOrderPolling(false);
                }, 8000);
            }

            return activeCustomerOrder;
        } catch (error) {
            console.error("Error cargando pedido activo:", error);
            return activeCustomerOrder;
        } finally {
            activeCustomerOrderLoading = null;
        }
    })();

    return activeCustomerOrderLoading;
}

async function getActiveCustomerOrder() {
    return loadActiveCustomerOrder();
}

function getActiveOrderAction(order) {
    const proofStatus = order.proof?.verification_status;
    if (order.payment_status !== "pending" || order.status !== "pendiente") return "";

    if (CUSTOMER_ACTIVE_PROOF_STATUSES.includes(proofStatus)) {
        return '<p class="active-order-review-note">Tu comprobante está siendo revisado.</p>';
    }

    if (proofStatus === "rejected") {
        return `<div class="active-order-action">
            <p>${order.proof.verification_notes
                ? `Motivo: ${trackingEscape(order.proof.verification_notes)}`
                : "Puedes enviar un comprobante nuevo."}</p>
            <button type="button" class="btn btn-primary" data-active-order-action="retry-manual">Subir nuevo comprobante</button>
        </div>`;
    }

    return '<button type="button" class="btn btn-primary" data-active-order-action="pay">Continuar pago</button>';
}

function renderActiveCustomerOrder(user) {
    const section = trackingElement("activeOrderSection");
    const headerButton = trackingElement("headerOrdersButton");

    if (headerButton) {
        headerButton.hidden = !user;
        headerButton.textContent = activeCustomerOrder ? "Mi pedido" : "Mis pedidos";
        headerButton.classList.toggle("active", Boolean(activeCustomerOrder));
    }

    if (!section) return;

    if (!user || !activeCustomerOrder) {
        section.hidden = true;
        section.querySelector("#activeOrderCard").innerHTML = "";
        updateActiveOrderCartPresentation();
        return;
    }

    const order = activeCustomerOrder;
    const state = getCustomerOrderState(order);
    const method = CUSTOMER_PAYMENT_METHODS[order.proof?.payment_method || order.payment_provider]
        || order.proof?.payment_method
        || order.payment_provider
        || "No seleccionado";

    const itemSummary = order.items.slice(0, 3).map(item =>
        `<li>${trackingEscape(item.product.name || "Producto")} <strong>×${Number(item.quantity) || 0}</strong></li>`
    ).join("");

    trackingElement("activeOrderCard").innerHTML = `<article class="active-order-card">
        <div class="active-order-card-heading">
            <div>
                <span>Tu pedido actual</span>
                <h2>Pedido #${trackingEscape(trackingShortId(order.id))}</h2>
                <p>${trackingEscape(trackingDate(order.created_at))}</p>
            </div>
            <strong class="customer-order-state state-${trackingEscape(state.key)}">${trackingEscape(state.label)}</strong>
        </div>
        <div class="active-order-card-body">
            <div>
                <ul class="active-order-products">${itemSummary}</ul>
                ${order.items.length > 3 ? `<small>y ${order.items.length - 3} producto(s) más</small>` : ""}
                <p class="active-order-total">${order.item_count} producto(s) · <strong>${trackingEscape(trackingMoney(order.total))}</strong></p>
                <p class="active-order-payment">Pago: <strong>${trackingEscape(method)}</strong></p>
            </div>
            ${renderCustomerOrderTracker(order)}
        </div>
        <div class="active-order-card-actions">
            ${getActiveOrderAction(order)}
            <button type="button" class="btn btn-light" data-active-order-action="detail">Ver pedido</button>
        </div>
    </article>`;

    section.hidden = false;
    updateActiveOrderCartPresentation();
}

function updateActiveOrderCartPresentation() {
    const cartQuantity = typeof cart !== "undefined" && Array.isArray(cart)
        ? cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        : 0;
    const pendingOrder = activeCustomerOrder?.status === "pendiente"
        && activeCustomerOrder?.payment_status === "pending";
    const count = cartQuantity || (pendingOrder ? activeCustomerOrder.item_count : 0);
    const countElement = trackingElement("cartCount");
    const label = trackingElement("cartButtonLabel");
    const button = trackingElement("cartButton");

    if (countElement) countElement.textContent = count;
    if (label) label.textContent = !cartQuantity && pendingOrder ? "Compra pendiente" : "Carrito";
    if (button) button.title = !cartQuantity && pendingOrder ? "Abrir compra pendiente" : "Carrito";
    if (button) button.classList.toggle("pending-order", Boolean(!cartQuantity && pendingOrder));

    if (!cartQuantity && pendingOrder && trackingElement("cartPanel")?.classList.contains("show")) {
        renderActiveOrderInCart();
    }
}

function renderActiveOrderInCart() {
    if (!activeCustomerOrder || activeCustomerOrder.payment_status !== "pending") return false;

    const cartItems = trackingElement("cartItems");
    const total = trackingElement("cartTotal");
    const checkoutButton = trackingElement("cartCheckoutButton");
    if (!cartItems) return false;

    const state = getCustomerOrderState(activeCustomerOrder);
    cartItems.innerHTML = `<div class="active-order-cart">
        <span>Tu compra ya fue convertida en pedido</span>
        <h3>Pedido #${trackingEscape(trackingShortId(activeCustomerOrder.id))}</h3>
        <strong>${trackingEscape(state.label)}</strong>
        <ul>${activeCustomerOrder.items.map(item =>
            `<li>${trackingEscape(item.product.name || "Producto")} ×${Number(item.quantity) || 0}</li>`
        ).join("")}</ul>
        ${getActiveOrderAction(activeCustomerOrder)}
        <button type="button" class="btn btn-light" data-active-order-action="detail">Ver pedido</button>
    </div>`;

    if (total) total.textContent = trackingMoney(activeCustomerOrder.total);
    if (checkoutButton) checkoutButton.hidden = true;
    return true;
}

function manageActiveCustomerOrderPolling(shouldPoll) {
    if (!shouldPoll) {
        if (activeCustomerOrderPollId) window.clearInterval(activeCustomerOrderPollId);
        activeCustomerOrderPollId = null;
        return;
    }

    if (!activeCustomerOrderPollId) {
        activeCustomerOrderPollId = window.setInterval(loadActiveCustomerOrder, CUSTOMER_ORDER_POLL_INTERVAL);
    }
}

function openTrackedOrderDetail() {
    document.querySelector("header nav")?.classList.remove("mobile-open");
    if (typeof openAccountOrder === "function") openAccountOrder(activeCustomerOrder?.id);
    else if (typeof openAccount === "function") openAccount();
}

function handleActiveOrderAction(action) {
    if (!activeCustomerOrder) return;
    if (action === "detail") return openTrackedOrderDetail();
    if (!["pay", "retry-manual"].includes(action)) return;
    if (activeCustomerOrder.status !== "pendiente" || activeCustomerOrder.payment_status !== "pending") return;

    if (typeof closeCart === "function") closeCart();
    if (!openPaymentOptionsForOrder(activeCustomerOrder)) return;

    if (action === "retry-manual") {
        window.setTimeout(() => manualElement("manualPaymentButton")?.click(), 0);
    }
}

function initializeOrderTracking() {
    trackingElement("headerOrdersButton")?.addEventListener("click", openTrackedOrderDetail);

    document.addEventListener("click", event => {
        const button = event.target.closest("[data-active-order-action]");
        if (button) handleActiveOrderAction(button.dataset.activeOrderAction);
    });

    supabaseClient.auth.onAuthStateChange(() => window.setTimeout(loadActiveCustomerOrder, 0));
    loadActiveCustomerOrder();
}

document.addEventListener("DOMContentLoaded", initializeOrderTracking);