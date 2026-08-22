/* =====================================================
   KANTU FLORAL - CHECKOUT Y PEDIDOS
===================================================== */

const KANTU_ORDERS = window.KantuCore;
const getCheckoutElement = KANTU_ORDERS.element;

const orderErrorMessages = {
    AUTHENTICATION_REQUIRED: "Tu sesión expiró. Inicia sesión para continuar.",
    CUSTOMER_NAME_REQUIRED: "Ingresa tu nombre completo.",
    CUSTOMER_PHONE_REQUIRED: "Ingresa un número de teléfono.",
    DELIVERY_ADDRESS_REQUIRED: "Selecciona la ubicación de entrega en el mapa.",
    DELIVERY_COORDINATES_REQUIRED: "Selecciona nuevamente la ubicación de entrega.",
    INVALID_DELIVERY_COORDINATES: "La ubicación seleccionada no es válida.",
    DELIVERY_OUT_OF_RANGE: "La ubicación está fuera de nuestra zona de reparto actual.",
    DELIVERY_PRICING_NOT_CONFIGURED: "No pudimos calcular el delivery. Inténtalo nuevamente.",
    CART_EMPTY: "Tu carrito está vacío.",
    INVALID_CART: "No se pudo validar tu carrito. Revísalo e inténtalo nuevamente.",
    PRODUCT_NOT_AVAILABLE: "Uno de los productos ya no está disponible.",
    INSUFFICIENT_STOCK: "No hay stock suficiente para uno de los productos."
};

const paymentReturnMessages = {
    success: "Mercado Pago informó que regresaste desde un pago aprobado. Estamos validando el pago.",
    pending: "Tu pago quedó pendiente. Estamos esperando confirmación de Mercado Pago.",
    failure: "El pago no se completó. Puedes intentarlo nuevamente."
};

const CHECKOUT_DEFAULT_LOCATION = [-16.4098229, -71.5223031];

let currentPaymentOrderId = null;
let checkoutDeliveryMap = null;
let checkoutDeliveryMarker = null;
let selectedDeliveryLat = null;
let selectedDeliveryLng = null;
let selectedDeliveryMapsUrl = null;
let currentDeliveryQuote = null;
let deliveryQuoteRequest = 0;
let checkoutInitialGeolocationRequested = false;

function ensureCustomerExperienceStyles() {
    if (document.querySelector('link[data-kantu-customer-experience]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/customer-experience.css";
    link.dataset.kantuCustomerExperience = "true";
    document.head.appendChild(link);
}

function ensureCheckoutDeliveryQuoteBox() {
    let box = getCheckoutElement("checkoutDeliveryQuote");
    if (box) return box;

    const status = getCheckoutElement("checkoutLocationStatus");
    if (!status?.parentElement) return null;

    box = document.createElement("div");
    box.id = "checkoutDeliveryQuote";
    box.className = "checkout-delivery-quote";
    box.hidden = true;
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    status.insertAdjacentElement("afterend", box);
    return box;
}

function openCheckout(user) {
    const checkoutModal = getCheckoutElement("checkoutModal");
    if (!checkoutModal) return;

    ensureCustomerExperienceStyles();
    ensureCheckoutDeliveryQuoteBox();
    resetCheckoutView();
    renderCheckoutSummary();
    fillCheckoutName(user);
    checkoutModal.classList.add("show");
    window.setTimeout(initializeCheckoutDeliveryMap, 0);
}

function closeCheckout() {
    getCheckoutElement("checkoutModal")?.classList.remove("show");
    if (typeof stopManualPaymentPolling === "function") stopManualPaymentPolling();
}

function resetCheckoutView() {
    const formView = getCheckoutElement("checkoutFormView");
    const successView = getCheckoutElement("checkoutSuccess");
    const form = getCheckoutElement("checkoutForm");
    const error = getCheckoutElement("checkoutError");
    const loading = getCheckoutElement("checkoutLoading");
    const paymentButton = getCheckoutElement("mercadoPagoButton");
    const paymentError = getCheckoutElement("mercadoPagoError");

    if (formView) formView.hidden = false;
    if (successView) successView.hidden = true;
    if (error) { error.hidden = true; error.textContent = ""; }
    if (loading) loading.hidden = true;
    if (paymentButton) {
        paymentButton.hidden = true;
        paymentButton.disabled = false;
        paymentButton.textContent = "Pagar con Mercado Pago";
    }
    if (paymentError) { paymentError.hidden = true; paymentError.textContent = ""; }
    if (form) form.reset();

    resetCheckoutDeliveryLocation();
    currentPaymentOrderId = null;
    if (typeof resetManualPayment === "function") resetManualPayment();
    setOrderButtonState(false);
}

function initializeCheckoutDeliveryMap() {
    const container = getCheckoutElement("checkoutDeliveryMap");
    if (!container) return;

    if (typeof L === "undefined") {
        const status = getCheckoutElement("checkoutLocationStatus");
        if (status) status.textContent = "No pudimos cargar el mapa. Revisa tu conexión e inténtalo nuevamente.";
        return;
    }

    if (!checkoutDeliveryMap) {
        checkoutDeliveryMap = L.map(container, { zoomControl: true })
            .setView(CHECKOUT_DEFAULT_LOCATION, 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(checkoutDeliveryMap);

        checkoutDeliveryMap.on("click", event => {
            setCheckoutDeliveryLocation(event.latlng.lat, event.latlng.lng, true);
        });
    }

    checkoutDeliveryMap.invalidateSize();

    if (!checkoutInitialGeolocationRequested && navigator.geolocation) {
        checkoutInitialGeolocationRequested = true;
        navigator.geolocation.getCurrentPosition(
            position => checkoutDeliveryMap?.setView([position.coords.latitude, position.coords.longitude], 15),
            () => {},
            { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
        );
    }
}

function setCheckoutDeliveryLocation(lat, lng, centerMap = false) {
    selectedDeliveryLat = Number(lat);
    selectedDeliveryLng = Number(lng);
    selectedDeliveryMapsUrl = `https://www.google.com/maps?q=${selectedDeliveryLat.toFixed(6)},${selectedDeliveryLng.toFixed(6)}`;
    currentDeliveryQuote = null;

    const point = [selectedDeliveryLat, selectedDeliveryLng];
    if (checkoutDeliveryMarker) checkoutDeliveryMarker.setLatLng(point);
    else if (checkoutDeliveryMap) checkoutDeliveryMarker = L.marker(point).addTo(checkoutDeliveryMap);

    if (centerMap && checkoutDeliveryMap) {
        checkoutDeliveryMap.setView(point, Math.max(checkoutDeliveryMap.getZoom(), 16));
    }

    const status = getCheckoutElement("checkoutLocationStatus");
    if (status) {
        status.textContent = "Ubicación seleccionada. Calculando costo de delivery...";
        status.className = "checkout-location-status selected";
    }

    const error = getCheckoutElement("checkoutError");
    if (error?.textContent === orderErrorMessages.DELIVERY_ADDRESS_REQUIRED) error.hidden = true;

    renderCheckoutSummary();
    requestDeliveryQuote(selectedDeliveryLat, selectedDeliveryLng);
}

function resetCheckoutDeliveryLocation() {
    selectedDeliveryLat = null;
    selectedDeliveryLng = null;
    selectedDeliveryMapsUrl = null;
    currentDeliveryQuote = null;
    deliveryQuoteRequest += 1;

    if (checkoutDeliveryMarker && checkoutDeliveryMap) checkoutDeliveryMap.removeLayer(checkoutDeliveryMarker);
    checkoutDeliveryMarker = null;

    const status = getCheckoutElement("checkoutLocationStatus");
    if (status) {
        status.textContent = "Aún no seleccionaste una ubicación.";
        status.className = "checkout-location-status";
    }
    renderDeliveryQuote();
    renderCheckoutSummary();
}

async function requestDeliveryQuote(lat, lng) {
    const requestId = ++deliveryQuoteRequest;
    renderDeliveryQuote({ loading: true });

    const { data, error } = await supabaseClient.rpc("quote_delivery_fee", {
        p_delivery_lat: Number(lat),
        p_delivery_lng: Number(lng)
    });

    if (requestId !== deliveryQuoteRequest) return;

    const quote = Array.isArray(data) ? data[0] : data;
    if (error || !quote) {
        console.error("Error cotizando delivery:", error);
        currentDeliveryQuote = null;
        renderDeliveryQuote({ error: true });
        renderCheckoutSummary();
        return;
    }

    currentDeliveryQuote = {
        distance_km: Number(quote.distance_km),
        delivery_fee: Number(quote.delivery_fee),
        estimated_minutes: Number(quote.estimated_minutes),
        service_available: Boolean(quote.service_available)
    };

    const status = getCheckoutElement("checkoutLocationStatus");
    if (status) {
        status.textContent = currentDeliveryQuote.service_available
            ? "Ubicación lista para entrega. El delivery ya está incluido en el total."
            : "Esta ubicación está fuera de nuestra zona de reparto actual.";
        status.className = `checkout-location-status ${currentDeliveryQuote.service_available ? "selected" : "error"}`;
    }

    renderDeliveryQuote();
    renderCheckoutSummary();
}

function renderDeliveryQuote(state = {}) {
    const box = ensureCheckoutDeliveryQuoteBox();
    if (!box) return;

    if (state.loading) {
        box.hidden = false;
        box.innerHTML = `<div class="checkout-delivery-quote-heading">
            <span class="checkout-delivery-icon">🛵</span>
            <div><strong>Calculando tu delivery</strong><span>Estamos estimando distancia, costo y tiempo de reparto.</span></div>
        </div>`;
        return;
    }

    if (state.error) {
        box.hidden = false;
        box.innerHTML = `<div class="checkout-delivery-quote-heading error">
            <span class="checkout-delivery-icon">!</span>
            <div><strong>No pudimos calcular el delivery</strong><span>Selecciona nuevamente tu ubicación en el mapa.</span></div>
        </div>`;
        return;
    }

    if (!currentDeliveryQuote) {
        box.hidden = true;
        box.innerHTML = "";
        return;
    }

    if (!currentDeliveryQuote.service_available) {
        box.hidden = false;
        box.innerHTML = `<div class="checkout-delivery-quote-heading error">
            <span class="checkout-delivery-icon">!</span>
            <div><strong>Fuera de cobertura</strong><span>Selecciona otra ubicación o contáctanos por WhatsApp.</span></div>
        </div>`;
        return;
    }

    box.hidden = false;
    box.innerHTML = `<div class="checkout-delivery-quote-heading">
            <span class="checkout-delivery-icon">🛵</span>
            <div><strong>Delivery calculado según tu ubicación</strong><span>Este importe se suma de forma transparente antes de pagar.</span></div>
        </div>
        <div class="checkout-delivery-quote-grid">
            <div><span>Distancia estimada</span><strong>${KANTU_ORDERS.escapeHtml(currentDeliveryQuote.distance_km.toFixed(1))} km</strong></div>
            <div><span>Costo de delivery</span><strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(currentDeliveryQuote.delivery_fee))}</strong></div>
            <div><span>Tiempo estimado</span><strong>${KANTU_ORDERS.escapeHtml(currentDeliveryQuote.estimated_minutes)} min aprox.</strong></div>
        </div>`;
}

function useCurrentCheckoutLocation() {
    const loading = getCheckoutElement("checkoutLocationLoading");
    const button = getCheckoutElement("checkoutUseLocationButton");
    if (!checkoutDeliveryMap) initializeCheckoutDeliveryMap();

    if (!checkoutDeliveryMap) return showCheckoutError("No pudimos cargar el mapa. Revisa tu conexión e inténtalo nuevamente.");
    if (!navigator.geolocation) return showCheckoutError("Tu navegador no permite obtener la ubicación. Selecciona un punto en el mapa.");

    if (button) button.disabled = true;
    if (loading) loading.hidden = false;

    navigator.geolocation.getCurrentPosition(
        position => {
            setCheckoutDeliveryLocation(position.coords.latitude, position.coords.longitude, true);
            if (button) button.disabled = false;
            if (loading) loading.hidden = true;
        },
        error => {
            console.warn("No se pudo obtener geolocalización:", error);
            showCheckoutError("No pudimos obtener tu ubicación. Puedes seleccionarla haciendo clic en el mapa.");
            if (button) button.disabled = false;
            if (loading) loading.hidden = true;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

function buildCheckoutDeliveryAddress() {
    if (!selectedDeliveryMapsUrl) return "";
    const reference = getCheckoutElement("checkoutDeliveryReference")?.value
        .trim()
        .replace(/\s*\|\s*/g, " - ");
    return reference ? `${selectedDeliveryMapsUrl} | Referencia: ${reference}` : selectedDeliveryMapsUrl;
}

async function fillCheckoutName(user) {
    const nameInput = getCheckoutElement("checkoutName");
    if (!nameInput || !user) return;

    const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
    if (metadataName) {
        nameInput.value = metadataName;
        return;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (!error && profile) nameInput.value = profile.full_name || "";
}

function renderCheckoutSummary() {
    const summary = getCheckoutElement("checkoutSummary");
    const totalElement = getCheckoutElement("checkoutTotal");
    if (!summary || !totalElement) return;

    let subtotal = 0;
    const rows = cart.map(item => {
        const product = products.find(currentProduct => currentProduct.id === item.id);
        if (!product) return "";
        const itemSubtotal = Number(product.price) * item.quantity;
        subtotal += itemSubtotal;
        return `<div class="checkout-summary-item">
            <span>${KANTU_ORDERS.escapeHtml(product.name)} x${Number(item.quantity) || 0}</span>
            <strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(itemSubtotal))}</strong>
        </div>`;
    });

    rows.push(`<div class="checkout-summary-separator"></div>`);
    rows.push(`<div class="checkout-summary-item checkout-summary-subtotal">
        <span>Subtotal de productos</span>
        <strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(subtotal))}</strong>
    </div>`);

    const quoteAvailable = Boolean(currentDeliveryQuote?.service_available);
    const deliveryFee = quoteAvailable ? Number(currentDeliveryQuote.delivery_fee) || 0 : 0;
    const deliveryLabel = quoteAvailable
        ? KANTU_ORDERS.formatMoney(deliveryFee)
        : selectedDeliveryLat != null
            ? "Calculando..."
            : "Selecciona ubicación";

    rows.push(`<div class="checkout-summary-item checkout-delivery-line">
        <span><strong>Delivery</strong>${quoteAvailable ? `<small>${KANTU_ORDERS.escapeHtml(currentDeliveryQuote.distance_km.toFixed(1))} km · ${KANTU_ORDERS.escapeHtml(currentDeliveryQuote.estimated_minutes)} min aprox.</small>` : ""}</span>
        <strong>${KANTU_ORDERS.escapeHtml(deliveryLabel)}</strong>
    </div>`);

    if (!quoteAvailable) {
        rows.push(`<p class="checkout-price-note">El total final aparecerá cuando selecciones la ubicación de entrega.</p>`);
    } else {
        rows.push(`<p class="checkout-price-note success">✓ El total de abajo ya incluye el delivery.</p>`);
    }

    summary.innerHTML = rows.join("");
    totalElement.textContent = KANTU_ORDERS.formatMoney(subtotal + deliveryFee);
}

function getOrderErrorMessage(error) {
    const fallback = "No se pudo crear el pedido. Inténtalo nuevamente.";
    const resolved = KANTU_ORDERS.resolveErrorMessage(error, orderErrorMessages, fallback);
    if (resolved !== fallback) return resolved;
    if (KANTU_ORDERS.errorText(error).includes("INVALID_CART_OR_INSUFFICIENT_STOCK")) {
        return "Uno de los productos no está disponible o no tiene stock suficiente.";
    }
    return fallback;
}

function setOrderButtonState(isLoading) {
    const button = getCheckoutElement("confirmOrderButton");
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? "Procesando pedido..." : "Confirmar pedido";
}

function showCheckoutError(message) {
    const error = getCheckoutElement("checkoutError");
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
}

async function submitOrder(event) {
    event.preventDefault();

    const name = getCheckoutElement("checkoutName")?.value.trim();
    const phone = getCheckoutElement("checkoutPhone")?.value.trim();
    const address = buildCheckoutDeliveryAddress();

    if (!name || !phone || !address || selectedDeliveryLat == null || selectedDeliveryLng == null) {
        showCheckoutError(!name
            ? orderErrorMessages.CUSTOMER_NAME_REQUIRED
            : !phone
                ? orderErrorMessages.CUSTOMER_PHONE_REQUIRED
                : orderErrorMessages.DELIVERY_ADDRESS_REQUIRED);
        return;
    }
    if (!currentDeliveryQuote) return showCheckoutError("Espera un momento mientras calculamos el delivery.");
    if (!currentDeliveryQuote.service_available) return showCheckoutError(orderErrorMessages.DELIVERY_OUT_OF_RANGE);

    const loading = getCheckoutElement("checkoutLoading");
    setOrderButtonState(true);
    if (loading) loading.hidden = false;

    const { data, error } = await supabaseClient.rpc("create_order", {
        p_customer_name: name,
        p_customer_phone: phone,
        p_delivery_address: address,
        p_delivery_lat: selectedDeliveryLat,
        p_delivery_lng: selectedDeliveryLng
    });

    setOrderButtonState(false);
    if (loading) loading.hidden = true;
    if (error) return showCheckoutError(getOrderErrorMessage(error));

    const order = Array.isArray(data) ? data[0] : data;
    if (!order?.order_id) return showCheckoutError("El pedido no devolvió un identificador válido.");

    cart = [];
    saveCart();
    updateCart();
    closeCart();

    openPaymentOptionsForOrder({
        id: order.order_id,
        total: order.total,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        delivery_distance_km: order.delivery_distance_km,
        estimated_delivery_minutes: order.estimated_delivery_minutes,
        status: "pendiente",
        payment_status: "pending"
    });

    if (typeof loadActiveCustomerOrder === "function") loadActiveCustomerOrder();
}

function openPaymentOptionsForOrder(order) {
    const orderId = order?.id ?? order?.order_id;
    const total = Number(order?.total);
    if (!orderId || !Number.isFinite(total)) return false;
    if (order?.status && order.status !== "pendiente") return false;
    if (order?.payment_status && order.payment_status !== "pending") return false;

    resetCheckoutView();
    const checkoutModal = getCheckoutElement("checkoutModal");
    if (!checkoutModal) return false;
    checkoutModal.classList.add("show");
    showOrderSuccess({ ...order, id: orderId, total });
    return true;
}

function showOrderSuccess(order) {
    const orderId = order?.id ?? order?.order_id;
    const total = Number(order?.total) || 0;
    const subtotal = Number(order?.subtotal);
    const deliveryFee = Number(order?.delivery_fee);
    const formView = getCheckoutElement("checkoutFormView");
    const successView = getCheckoutElement("checkoutSuccess");
    const message = getCheckoutElement("checkoutSuccessMessage");
    const paymentButton = getCheckoutElement("mercadoPagoButton");
    const paymentError = getCheckoutElement("mercadoPagoError");

    if (formView) formView.hidden = true;
    if (successView) successView.hidden = false;
    if (message) {
        const hasBreakdown = Number.isFinite(subtotal) && Number.isFinite(deliveryFee);
        message.innerHTML = `<span class="checkout-ready-label">Pedido <strong>#${KANTU_ORDERS.escapeHtml(orderId)}</strong> listo para pagar.</span>
            ${hasBreakdown ? `<div class="checkout-payment-breakdown">
                <div><span>Productos</span><strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(subtotal))}</strong></div>
                <div><span>Delivery</span><strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(deliveryFee))}</strong></div>
                <div class="total"><span>Total a pagar</span><strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(total))}</strong></div>
            </div>` : `Total definitivo con delivery: <strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(total))}</strong>`}`;
    }

    currentPaymentOrderId = String(orderId);
    if (typeof setManualPaymentOrder === "function") setManualPaymentOrder(orderId, total);
    if (paymentButton) {
        paymentButton.hidden = false;
        paymentButton.disabled = false;
        paymentButton.textContent = "Pagar con Mercado Pago";
    }
    if (paymentError) { paymentError.hidden = true; paymentError.textContent = ""; }
}

async function getPaymentFunctionErrorMessage(error) {
    const fallback = "No pudimos preparar el pago. Inténtalo nuevamente.";
    const response = error?.context;
    if (!(response instanceof Response)) return fallback;
    try {
        const body = await response.clone().json();
        return body?.message || fallback;
    } catch {
        return fallback;
    }
}

async function startMercadoPagoPayment() {
    const button = getCheckoutElement("mercadoPagoButton");
    const paymentError = getCheckoutElement("mercadoPagoError");
    if (!button || !currentPaymentOrderId) return;

    button.disabled = true;
    button.textContent = "Preparando pago...";
    if (paymentError) { paymentError.hidden = true; paymentError.textContent = ""; }

    try {
        const { data, error } = await supabaseClient.functions.invoke("create-mp-preference", {
            body: { order_id: String(currentPaymentOrderId) }
        });
        if (error) {
            if (paymentError) {
                paymentError.textContent = await getPaymentFunctionErrorMessage(error);
                paymentError.hidden = false;
            }
            return;
        }

        const paymentUrl = data?.sandbox_init_point || data?.init_point;
        if (!paymentUrl) {
            if (paymentError) {
                paymentError.textContent = "Mercado Pago no devolvió una dirección de pago válida.";
                paymentError.hidden = false;
            }
            return;
        }
        window.location.href = paymentUrl;
    } catch (error) {
        console.error("Error inesperado preparando pago:", error);
        if (paymentError) {
            paymentError.textContent = "No pudimos conectar con Mercado Pago. Inténtalo nuevamente.";
            paymentError.hidden = false;
        }
    } finally {
        button.disabled = false;
        button.textContent = "Pagar con Mercado Pago";
    }
}

function showPaymentReturnMessage() {
    const paymentStatus = new URLSearchParams(window.location.search).get("payment");
    const message = Object.prototype.hasOwnProperty.call(paymentReturnMessages, paymentStatus)
        ? paymentReturnMessages[paymentStatus]
        : null;
    if (message && typeof showToast === "function") showToast(message);
}

document.addEventListener("DOMContentLoaded", () => {
    ensureCustomerExperienceStyles();
    ensureCheckoutDeliveryQuoteBox();
    const checkoutModal = getCheckoutElement("checkoutModal");
    checkoutModal?.addEventListener("click", event => {
        if (event.target === checkoutModal) closeCheckout();
    });
    getCheckoutElement("mercadoPagoButton")?.addEventListener("click", startMercadoPagoPayment);
    getCheckoutElement("checkoutUseLocationButton")?.addEventListener("click", useCurrentCheckoutLocation);
    showPaymentReturnMessage();
});
