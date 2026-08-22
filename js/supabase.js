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
    fetchLatestPaymentProof: kantuFetchLatestPaymentProof,
    fetchOrderPaymentContext: kantuFetchOrderPaymentContext,
    fetchOrderItemsWithProducts: kantuFetchOrderItemsWithProducts,
    orderStatusLabels: KANTU_ORDER_STATUS_LABELS,
    paymentStatusLabels: KANTU_PAYMENT_STATUS_LABELS,
    paymentMethodLabels: KANTU_PAYMENT_METHOD_LABELS,
    proofStatusLabels: KANTU_PROOF_STATUS_LABELS
});