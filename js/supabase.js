/* KANTU FLORAL - BOOTSTRAP SUPABASE Y UTILIDADES COMPARTIDAS */

const SUPABASE_URL = "https://uzsbpgbsuetfqvdvvaiu.supabase.co";
const SUPABASE_KEY = "sb_publishable_9xRlh-aTcNuJSK3tWLp63Q_Y3hNL7vn";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const KANTU_ORDER_STATUS_LABELS = Object.freeze({
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    preparando: "Preparando",
    en_camino: "En camino",
    entregado: "Entregado",
    cancelado: "Cancelado"
});

const KANTU_PAYMENT_STATUS_LABELS = Object.freeze({
    pending: "Pendiente",
    approved: "Aprobado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
    refunded: "Reembolsado"
});

const KANTU_PAYMENT_METHOD_LABELS = Object.freeze({
    mercadopago: "Mercado Pago",
    yape: "Yape / Plin",
    transferencia: "Transferencia bancaria"
});

const KANTU_MERCADO_PAGO_STATUS_DETAIL_LABELS = Object.freeze({
    accredited: "Pago acreditado correctamente.",
    cc_rejected_bad_filled_card_number: "El número de tarjeta fue ingresado incorrectamente.",
    cc_rejected_bad_filled_date: "La fecha de vencimiento fue ingresada incorrectamente.",
    cc_rejected_bad_filled_other: "Hay datos del medio de pago que deben revisarse.",
    cc_rejected_bad_filled_security_code: "El código de seguridad fue ingresado incorrectamente.",
    cc_rejected_call_for_authorize: "El comprador debe autorizar la operación con su banco o emisor.",
    cc_rejected_card_disabled: "El medio de pago está deshabilitado o bloqueado para esta compra.",
    cc_rejected_duplicated_payment: "Mercado Pago o el emisor detectó un posible pago duplicado.",
    cc_rejected_insufficient_amount: "El medio de pago no tiene saldo o límite suficiente.",
    cc_rejected_invalid_installments: "La cantidad de cuotas seleccionada no está disponible.",
    cc_rejected_max_attempts: "Se alcanzó el máximo de intentos permitidos para este medio de pago.",
    cc_rejected_blacklist: "El pago fue rechazado por controles de prevención de fraude.",
    cc_rejected_high_risk: "Mercado Pago detectó un riesgo elevado y rechazó el pago por prevención de fraude.",
    cc_rejected_other_reason: "El emisor rechazó el pago por un motivo no especificado; puede estar relacionado con controles de riesgo.",
    pending_waiting_payment: "Mercado Pago está esperando que el comprador complete el pago.",
    pending_contingency: "El pago está siendo procesado por Mercado Pago.",
    pending_review_manual: "El pago está bajo revisión manual de Mercado Pago.",
    pending_card_payment: "Mercado Pago está esperando la confirmación del pago con tarjeta.",
    pending_cash_payment: "Mercado Pago está esperando la confirmación del pago en efectivo.",
    pending_bank_transfer: "Mercado Pago está esperando la confirmación de la transferencia.",
    refunded: "El pago fue reembolsado.",
    charged_back: "El pago recibió un contracargo."
});

const KANTU_PROOF_STATUS_LABELS = Object.freeze({
    uploaded: "Comprobante recibido",
    verifying: "Estamos verificando tu pago",
    needs_review: "Tu comprobante requiere revisión",
    approved: "Pago aprobado",
    rejected: "Comprobante rechazado"
});

function kantuElement(id) {
    return document.getElementById(id);
}

function kantuEscapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function kantuFormatMoney(value) {
    return new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "PEN"
    }).format(Number(value) || 0);
}

function kantuFormatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function kantuShortId(id) {
    const value = String(id || "");
    return value.length > 12 ? value.slice(0, 8).toUpperCase() : value;
}

function kantuParseDeliveryAddress(value) {
    const text = String(value || "");
    const mapsMatch = text.match(
        /(https:\/\/www\.google\.com\/maps\?q=-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)/i
    );
    const reference = text.match(/\|\s*Referencia:\s*(.+)$/i)?.[1]?.trim() || "";

    return {
        mapsUrl: mapsMatch?.[1] || "",
        reference,
        plain: mapsMatch ? "" : text
    };
}

function kantuRenderDeliveryAddress(value, linkLabel = "Abrir en Google Maps") {
    const location = kantuParseDeliveryAddress(value);
    if (!location.mapsUrl) {
        return kantuEscapeHtml(location.plain || "No registrada");
    }

    return `<div class="delivery-location-block">
        <a href="${kantuEscapeHtml(location.mapsUrl)}" target="_blank" rel="noopener noreferrer">${kantuEscapeHtml(linkLabel)}</a>
        ${location.reference
            ? `<small><strong>Referencia:</strong> ${kantuEscapeHtml(location.reference)}</small>`
            : ""}
    </div>`;
}

function kantuErrorText(error) {
    return [error?.message, error?.details, error?.hint]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
}

function kantuResolveErrorMessage(error, messages, fallback) {
    const text = kantuErrorText(error);
    const key = Object.keys(messages).find(code => text.includes(code));
    return key ? messages[key] : fallback;
}

function kantuMercadoPagoStatusDetailLabel(code) {
    const normalized = String(code || "").trim();
    if (!normalized) return "";
    return KANTU_MERCADO_PAGO_STATUS_DETAIL_LABELS[normalized]
        || "Mercado Pago devolvió un detalle técnico para este pago.";
}

async function kantuFetchLatestPaymentProof(orderId) {
    const result = await supabaseClient
        .from("payment_proofs")
        .select("id, order_id, payment_method, verification_status, verification_notes, uploaded_at, operation_number, amount, storage_path")
        .eq("order_id", orderId)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (result.error) throw result.error;
    return result.data || null;
}

async function kantuFetchOrderPaymentContext(orderId) {
    const [proofResult, orderResult] = await Promise.all([
        supabaseClient
            .from("payment_proofs")
            .select("id, verification_status, verification_notes, uploaded_at, operation_number, payment_method")
            .eq("order_id", orderId)
            .order("uploaded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabaseClient
            .from("orders")
            .select("status, payment_status")
            .eq("id", orderId)
            .maybeSingle()
    ]);

    if (proofResult.error || orderResult.error) {
        throw proofResult.error || orderResult.error;
    }

    return {
        proof: proofResult.data || null,
        order: orderResult.data || null
    };
}

async function kantuFetchOrderItemsWithProducts(orderId) {
    const itemsResult = await supabaseClient
        .from("order_items")
        .select("product_id, quantity, unit_price")
        .eq("order_id", orderId);

    if (itemsResult.error) throw itemsResult.error;

    const items = itemsResult.data || [];
    const productIds = [...new Set(items.map(item => item.product_id).filter(Boolean))];
    let productsById = new Map();

    if (productIds.length) {
        const productsResult = await supabaseClient
            .from("products")
            .select("id, name, image")
            .in("id", productIds);

        if (productsResult.error) throw productsResult.error;
        productsById = new Map(
            (productsResult.data || []).map(product => [String(product.id), product])
        );
    }

    return items.map(item => ({
        ...item,
        product: productsById.get(String(item.product_id)) || {}
    }));
}

window.KantuCore = Object.freeze({
    element: kantuElement,
    escapeHtml: kantuEscapeHtml,
    formatMoney: kantuFormatMoney,
    formatDate: kantuFormatDate,
    shortId: kantuShortId,
    parseDeliveryAddress: kantuParseDeliveryAddress,
    renderDeliveryAddress: kantuRenderDeliveryAddress,
    errorText: kantuErrorText,
    resolveErrorMessage: kantuResolveErrorMessage,
    mercadoPagoStatusDetailLabel: kantuMercadoPagoStatusDetailLabel,
    fetchLatestPaymentProof: kantuFetchLatestPaymentProof,
    fetchOrderPaymentContext: kantuFetchOrderPaymentContext,
    fetchOrderItemsWithProducts: kantuFetchOrderItemsWithProducts,
    orderStatusLabels: KANTU_ORDER_STATUS_LABELS,
    paymentStatusLabels: KANTU_PAYMENT_STATUS_LABELS,
    paymentMethodLabels: KANTU_PAYMENT_METHOD_LABELS,
    mercadoPagoStatusDetailLabels: KANTU_MERCADO_PAGO_STATUS_DETAIL_LABELS,
    proofStatusLabels: KANTU_PROOF_STATUS_LABELS
});
