/* =====================================================
   KANTU FLORAL
   orders.js
   CHECKOUT MEDIANTE RPC DE SUPABASE
===================================================== */

const KANTU_ORDERS = window.KantuCore;
const getCheckoutElement = KANTU_ORDERS.element;

const orderErrorMessages = {
    AUTHENTICATION_REQUIRED: "Tu sesión expiró. Inicia sesión para continuar.",
    CUSTOMER_NAME_REQUIRED: "Ingresa tu nombre completo.",
    CUSTOMER_PHONE_REQUIRED: "Ingresa un número de teléfono.",
    DELIVERY_ADDRESS_REQUIRED: "Selecciona la ubicación de entrega en el mapa.",
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

let currentPaymentOrderId = null;
let checkoutDeliveryMap = null;
let checkoutDeliveryMarker = null;
let selectedDeliveryLat = null;
let selectedDeliveryLng = null;
let selectedDeliveryMapsUrl = null;
let checkoutInitialGeolocationRequested = false;

const CHECKOUT_DEFAULT_LOCATION = [-12.0464, -77.0428];

function openCheckout(user) {
    const checkoutModal = getCheckoutElement("checkoutModal");
    if (!checkoutModal) return;

    resetCheckoutView();
    renderCheckoutSummary();
    fillCheckoutName(user);
    checkoutModal.classList.add("show");
    window.setTimeout(initializeCheckoutDeliveryMap, 0);
}

function closeCheckout() {
    const checkoutModal = getCheckoutElement("checkoutModal");
    if (checkoutModal) checkoutModal.classList.remove("show");

    if (typeof stopManualPaymentPolling === "function") {
        stopManualPaymentPolling();
    }
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

    if (error) {
        error.hidden = true;
        error.textContent = "";
    }

    if (loading) loading.hidden = true;

    if (paymentButton) {
        paymentButton.hidden = true;
        paymentButton.disabled = false;
        paymentButton.textContent = "Pagar con Mercado Pago";
    }

    if (paymentError) {
        paymentError.hidden = true;
        paymentError.textContent = "";
    }

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
        if (status) {
            status.textContent = "No pudimos cargar el mapa. Revisa tu conexión e inténtalo nuevamente.";
        }
        return;
    }

    if (!checkoutDeliveryMap) {
        checkoutDeliveryMap = L.map(container, { zoomControl: true })
            .setView(CHECKOUT_DEFAULT_LOCATION, 12);

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
            position => {
                checkoutDeliveryMap?.setView(
                    [position.coords.latitude, position.coords.longitude],
                    15
                );
            },
            () => {},
            { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
        );
    }
}

function setCheckoutDeliveryLocation(lat, lng, centerMap = false) {
    selectedDeliveryLat = Number(lat);
    selectedDeliveryLng = Number(lng);
    selectedDeliveryMapsUrl = `https://www.google.com/maps?q=${selectedDeliveryLat.toFixed(6)},${selectedDeliveryLng.toFixed(6)}`;

    const point = [selectedDeliveryLat, selectedDeliveryLng];

    if (checkoutDeliveryMarker) checkoutDeliveryMarker.setLatLng(point);
    else checkoutDeliveryMarker = L.marker(point).addTo(checkoutDeliveryMap);

    if (centerMap) {
        checkoutDeliveryMap.setView(point, Math.max(checkoutDeliveryMap.getZoom(), 16));
    }

    const status = getCheckoutElement("checkoutLocationStatus");
    if (status) {
        status.textContent = `Ubicación seleccionada: ${selectedDeliveryLat.toFixed(6)}, ${selectedDeliveryLng.toFixed(6)}`;
        status.className = "checkout-location-status selected";
    }

    const error = getCheckoutElement("checkoutError");
    if (error?.textContent === orderErrorMessages.DELIVERY_ADDRESS_REQUIRED) {
        error.hidden = true;
    }
}

function resetCheckoutDeliveryLocation() {
    selectedDeliveryLat = null;
    selectedDeliveryLng = null;
    selectedDeliveryMapsUrl = null;

    if (checkoutDeliveryMarker && checkoutDeliveryMap) {
        checkoutDeliveryMap.removeLayer(checkoutDeliveryMarker);
    }

    checkoutDeliveryMarker = null;

    const status = getCheckoutElement("checkoutLocationStatus");
    if (status) {
        status.textContent = "Aún no seleccionaste una ubicación.";
        status.className = "checkout-location-status";
    }
}

function useCurrentCheckoutLocation() {
    const loading = getCheckoutElement("checkoutLocationLoading");
    const button = getCheckoutElement("checkoutUseLocationButton");

    if (!checkoutDeliveryMap) initializeCheckoutDeliveryMap();

    if (!checkoutDeliveryMap) {
        showCheckoutError("No pudimos cargar el mapa. Revisa tu conexión e inténtalo nuevamente.");
        return;
    }

    if (!navigator.geolocation) {
        showCheckoutError("Tu navegador no permite obtener la ubicación. Selecciona un punto en el mapa.");
        return;
    }

    if (button) button.disabled = true;
    if (loading) loading.hidden = false;

    navigator.geolocation.getCurrentPosition(
        position => {
            setCheckoutDeliveryLocation(
                position.coords.latitude,
                position.coords.longitude,
                true
            );
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

    return reference
        ? `${selectedDeliveryMapsUrl} | Referencia: ${reference}`
        : selectedDeliveryMapsUrl;
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
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

    if (error || !profile) return;
    nameInput.value = profile.full_name || "";
}

function renderCheckoutSummary() {
    const summary = getCheckoutElement("checkoutSummary");
    const totalElement = getCheckoutElement("checkoutTotal");
    if (!summary || !totalElement) return;

    let estimatedTotal = 0;

    summary.innerHTML = cart.map(item => {
        const product = products.find(currentProduct => currentProduct.id === item.id);
        if (!product) return "";

        const subtotal = Number(product.price) * item.quantity;
        estimatedTotal += subtotal;

        return `<div class="checkout-summary-item">
            <span>${KANTU_ORDERS.escapeHtml(product.name)} x${Number(item.quantity) || 0}</span>
            <strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(subtotal))}</strong>
        </div>`;
    }).join("");

    totalElement.textContent = KANTU_ORDERS.formatMoney(estimatedTotal);
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

    if (!name || !phone || !address) {
        showCheckoutError(
            !name
                ? orderErrorMessages.CUSTOMER_NAME_REQUIRED
                : !phone
                    ? orderErrorMessages.CUSTOMER_PHONE_REQUIRED
                    : orderErrorMessages.DELIVERY_ADDRESS_REQUIRED
        );
        return;
    }

    const loading = getCheckoutElement("checkoutLoading");
    setOrderButtonState(true);
    if (loading) loading.hidden = false;

    const { data, error } = await supabaseClient.rpc("create_order", {
        p_customer_name: name,
        p_customer_phone: phone,
        p_delivery_address: address
    });

    setOrderButtonState(false);
    if (loading) loading.hidden = true;

    if (error) {
        showCheckoutError(getOrderErrorMessage(error));
        return;
    }

    const order = Array.isArray(data) ? data[0] : data;

    if (!order?.order_id) {
        showCheckoutError("El pedido no devolvió un identificador válido.");
        return;
    }

    cart = [];
    saveCart();
    updateCart();
    closeCart();

    openPaymentOptionsForOrder({
        id: order.order_id,
        total: order.total,
        status: "pendiente",
        payment_status: "pending"
    });

    if (typeof loadActiveCustomerOrder === "function") {
        loadActiveCustomerOrder();
    }
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
    showOrderSuccess(orderId, total);
    return true;
}

function showOrderSuccess(orderId, total) {
    const formView = getCheckoutElement("checkoutFormView");
    const successView = getCheckoutElement("checkoutSuccess");
    const message = getCheckoutElement("checkoutSuccessMessage");
    const paymentButton = getCheckoutElement("mercadoPagoButton");
    const paymentError = getCheckoutElement("mercadoPagoError");

    if (formView) formView.hidden = true;
    if (successView) successView.hidden = false;

    if (message) {
        message.innerHTML = `Pedido <strong>#${KANTU_ORDERS.escapeHtml(orderId)}</strong> listo para pagar.<br>`
            + `Total definitivo: <strong>${KANTU_ORDERS.escapeHtml(KANTU_ORDERS.formatMoney(total))}</strong>`;
    }

    currentPaymentOrderId = String(orderId);

    if (typeof setManualPaymentOrder === "function") {
        setManualPaymentOrder(orderId, total);
    }

    if (paymentButton) {
        paymentButton.hidden = false;
        paymentButton.disabled = false;
        paymentButton.textContent = "Pagar con Mercado Pago";
    }

    if (paymentError) {
        paymentError.hidden = true;
        paymentError.textContent = "";
    }
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

    if (paymentError) {
        paymentError.hidden = true;
        paymentError.textContent = "";
    }

    try {
        const { data, error } = await supabaseClient.functions.invoke(
            "create-mp-preference",
            {
                body: { order_id: String(currentPaymentOrderId) }
            }
        );

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
    const checkoutModal = getCheckoutElement("checkoutModal");
    if (checkoutModal) {
        checkoutModal.addEventListener("click", event => {
            if (event.target === checkoutModal) closeCheckout();
        });
    }

    getCheckoutElement("mercadoPagoButton")?.addEventListener("click", startMercadoPagoPayment);
    getCheckoutElement("checkoutUseLocationButton")?.addEventListener("click", useCurrentCheckoutLocation);
    showPaymentReturnMessage();
});