/* =====================================================
   KANTU FLORAL
   orders.js
   CHECKOUT MEDIANTE RPC DE SUPABASE
===================================================== */

const orderErrorMessages = {
    AUTHENTICATION_REQUIRED:
        "Tu sesión expiró. Inicia sesión para continuar.",
    CUSTOMER_NAME_REQUIRED:
        "Ingresa tu nombre completo.",
    CUSTOMER_PHONE_REQUIRED:
        "Ingresa un número de teléfono.",
    DELIVERY_ADDRESS_REQUIRED:
        "Ingresa una dirección de entrega.",
    CART_EMPTY:
        "Tu carrito está vacío.",
    INVALID_CART:
        "No se pudo validar tu carrito. Revísalo e inténtalo nuevamente.",
    PRODUCT_NOT_AVAILABLE:
        "Uno de los productos ya no está disponible.",
    INSUFFICIENT_STOCK:
        "No hay stock suficiente para uno de los productos."
};

const paymentReturnMessages = {
    success:
        "Mercado Pago informó que regresaste desde un pago aprobado. Estamos validando el pago.",
    pending:
        "Tu pago quedó pendiente. Estamos esperando confirmación de Mercado Pago.",
    failure:
        "El pago no se completó. Puedes intentarlo nuevamente."
};

let currentPaymentOrderId = null;


function getCheckoutElement(id) {

    return document.getElementById(id);

}


function openCheckout(user) {

    const checkoutModal =
        getCheckoutElement("checkoutModal");

    if (!checkoutModal) return;

    resetCheckoutView();
    renderCheckoutSummary();
    fillCheckoutName(user);

    checkoutModal.classList.add("show");

}


function closeCheckout() {

    const checkoutModal =
        getCheckoutElement("checkoutModal");

    if (checkoutModal) {
        checkoutModal.classList.remove("show");
    }

    if (typeof stopManualPaymentPolling === "function") {
        stopManualPaymentPolling();
    }

}


function resetCheckoutView() {

    const formView =
        getCheckoutElement("checkoutFormView");

    const successView =
        getCheckoutElement("checkoutSuccess");

    const form =
        getCheckoutElement("checkoutForm");

    const error =
        getCheckoutElement("checkoutError");

    const loading =
        getCheckoutElement("checkoutLoading");

    const paymentButton =
        getCheckoutElement("mercadoPagoButton");

    const paymentError =
        getCheckoutElement("mercadoPagoError");

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

    currentPaymentOrderId = null;

    if (typeof resetManualPayment === "function") {
        resetManualPayment();
    }

    setOrderButtonState(false);

}


async function fillCheckoutName(user) {

    const nameInput =
        getCheckoutElement("checkoutName");

    if (!nameInput || !user) return;

    const metadataName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name;

    if (metadataName) {
        nameInput.value = metadataName;
        return;
    }

    const { data: profile, error } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

    if (error || !profile) return;

    nameInput.value =
        profile.full_name ||
        profile.name ||
        profile.customer_name ||
        "";

}


function renderCheckoutSummary() {

    const summary =
        getCheckoutElement("checkoutSummary");

    const totalElement =
        getCheckoutElement("checkoutTotal");

    if (!summary || !totalElement) return;

    let estimatedTotal = 0;

    summary.innerHTML = cart.map(item => {

        const product =
            products.find(
                currentProduct => currentProduct.id === item.id
            );

        if (!product) return "";

        const subtotal =
            Number(product.price) * item.quantity;

        estimatedTotal += subtotal;

        return `
            <div class="checkout-summary-item">
                <span>${product.name} x${item.quantity}</span>
                <strong>S/ ${subtotal.toFixed(2)}</strong>
            </div>
        `;

    }).join("");

    totalElement.textContent =
        `S/ ${estimatedTotal.toFixed(2)}`;

}


function getOrderErrorMessage(error) {

    const errorText =
        `${error?.message || ""} ${error?.details || ""}`
            .toUpperCase();

    const errorCode =
        Object.keys(orderErrorMessages)
            .find(code => errorText.includes(code));

    if (errorCode) return orderErrorMessages[errorCode];

    if (errorText.includes("INVALID_CART_OR_INSUFFICIENT_STOCK")) {
        return "Uno de los productos no está disponible o no tiene stock suficiente.";
    }

    return "No se pudo crear el pedido. Inténtalo nuevamente.";

}


function setOrderButtonState(isLoading) {

    const button =
        getCheckoutElement("confirmOrderButton");

    if (!button) return;

    button.disabled = isLoading;
    button.textContent =
        isLoading
            ? "Procesando pedido..."
            : "Confirmar pedido";

}


function showCheckoutError(message) {

    const error =
        getCheckoutElement("checkoutError");

    if (!error) return;

    error.textContent = message;
    error.hidden = false;

}


async function submitOrder(event) {

    event.preventDefault();

    const name =
        getCheckoutElement("checkoutName")?.value.trim();

    const phone =
        getCheckoutElement("checkoutPhone")?.value.trim();

    const address =
        getCheckoutElement("checkoutAddress")?.value.trim();

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

    const loading =
        getCheckoutElement("checkoutLoading");

    setOrderButtonState(true);
    if (loading) loading.hidden = false;

    const { data, error } =
        await supabaseClient.rpc(
            "create_order",
            {
                p_customer_name: name,
                p_customer_phone: phone,
                p_delivery_address: address
            }
        );

    setOrderButtonState(false);
    if (loading) loading.hidden = true;

    if (error) {
        showCheckoutError(getOrderErrorMessage(error));
        return;
    }

    const order = Array.isArray(data) ? data[0] : data;

    if (!order?.order_id) {
        showCheckoutError(
            "El pedido no devolvió un identificador válido."
        );
        return;
    }

    cart = [];
    saveCart();
    updateCart();
    closeCart();
    showOrderSuccess(order.order_id, order.total);

}


function showOrderSuccess(orderId, total) {

    const formView =
        getCheckoutElement("checkoutFormView");

    const successView =
        getCheckoutElement("checkoutSuccess");

    const message =
        getCheckoutElement("checkoutSuccessMessage");

    const paymentButton =
        getCheckoutElement("mercadoPagoButton");

    const paymentError =
        getCheckoutElement("mercadoPagoError");

    if (formView) formView.hidden = true;
    if (successView) successView.hidden = false;

    if (message) {
        message.innerHTML =
            `Pedido <strong>#${orderId}</strong> creado correctamente.<br>` +
            `Total definitivo: <strong>S/ ${Number(total).toFixed(2)}</strong>`;
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

    const fallback =
        "No pudimos preparar el pago. Inténtalo nuevamente.";

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

    const button =
        getCheckoutElement("mercadoPagoButton");

    const paymentError =
        getCheckoutElement("mercadoPagoError");

    if (!button || !currentPaymentOrderId) return;

    button.disabled = true;
    button.textContent = "Preparando pago...";

    if (paymentError) {
        paymentError.hidden = true;
        paymentError.textContent = "";
    }

    try {
        const { data, error } =
            await supabaseClient.functions.invoke(
                "create-mp-preference",
                {
                    body: {
                        order_id:
                            String(currentPaymentOrderId)
                    }
                }
            );

        if (error) {
            if (paymentError) {
                paymentError.textContent =
                    await getPaymentFunctionErrorMessage(error);
                paymentError.hidden = false;
            }
            return;
        }

        const paymentUrl =
            data?.sandbox_init_point ||
            data?.init_point;

        if (!paymentUrl) {
            if (paymentError) {
                paymentError.textContent =
                    "Mercado Pago no devolvió una dirección de pago válida.";
                paymentError.hidden = false;
            }
            return;
        }

        window.location.href = paymentUrl;

    } catch (error) {
        console.error(
            "Error inesperado preparando pago:",
            error
        );

        if (paymentError) {
            paymentError.textContent =
                "No pudimos conectar con Mercado Pago. Inténtalo nuevamente.";
            paymentError.hidden = false;
        }
    } finally {
        button.disabled = false;
        button.textContent = "Pagar con Mercado Pago";
    }

}


function showPaymentReturnMessage() {

    const paymentStatus =
        new URLSearchParams(
            window.location.search
        ).get("payment");

    const message =
        Object.prototype.hasOwnProperty.call(
            paymentReturnMessages,
            paymentStatus
        )
            ? paymentReturnMessages[paymentStatus]
            : null;

    if (message && typeof showToast === "function") {
        showToast(message);
    }

}


document.addEventListener("DOMContentLoaded", () => {

    const checkoutModal =
        getCheckoutElement("checkoutModal");

    if (checkoutModal) {
        checkoutModal.addEventListener("click", event => {
            if (event.target === checkoutModal) closeCheckout();
        });
    }

    const paymentButton =
        getCheckoutElement("mercadoPagoButton");

    if (paymentButton) {
        paymentButton.addEventListener(
            "click",
            startMercadoPagoPayment
        );
    }

    showPaymentReturnMessage();

});
