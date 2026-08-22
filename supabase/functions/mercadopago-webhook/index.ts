import { createClient } from "npm:@supabase/supabase-js@2";

type WebhookBody = {
    type?: string;
    topic?: string;
    live_mode?: boolean;
    data?: { id?: string | number };
};

type MercadoPagoPayment = {
    id?: string | number;
    status?: string;
    status_detail?: string | null;
    external_reference?: string | number | null;
    transaction_amount?: string | number;
    currency_id?: string;
    date_approved?: string | null;
};

const PAYMENT_STATUS_MAP: Record<string, string> = {
    approved: "approved",
    pending: "pending",
    in_process: "pending",
    in_mediation: "pending",
    rejected: "rejected",
    cancelled: "cancelled",
    refunded: "refunded",
    charged_back: "refunded"
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function requiredEnvironmentVariable(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new Error(`MISSING_ENVIRONMENT_VARIABLE:${name}`);
    return value;
}

async function readJsonSafely(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { raw_response: text };
    }
}

function parseSignatureHeader(value: string): {
    timestamp: string | null;
    signatures: string[];
} {
    let timestamp: string | null = null;
    const signatures: string[] = [];

    for (const part of value.split(",")) {
        const separator = part.indexOf("=");
        if (separator === -1) continue;

        const key = part.slice(0, separator).trim();
        const partValue = part.slice(separator + 1).trim();

        if (key === "ts") timestamp = partValue;
        if (key === "v1" && partValue) signatures.push(partValue.toLowerCase());
    }

    return { timestamp, signatures };
}

function hexToBytes(value: string): Uint8Array | null {
    if (value.length !== 64 || !/^[a-f0-9]{64}$/i.test(value)) return null;

    const bytes = new Uint8Array(32);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function constantTimeEqual(first: Uint8Array, second: Uint8Array): boolean {
    if (first.length !== second.length) return false;

    let difference = 0;
    for (let index = 0; index < first.length; index += 1) {
        difference |= first[index] ^ second[index];
    }
    return difference === 0;
}

async function validateMercadoPagoSignature(
    signatureHeader: string | null,
    requestId: string | null,
    dataId: string | null,
    secret: string
): Promise<boolean> {
    if (!signatureHeader || !requestId || !dataId) return false;

    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
    if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
        return false;
    }

    const manifest =
        `id:${dataId.toLowerCase()};` +
        `request-id:${requestId};` +
        `ts:${timestamp};`;

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const calculatedSignature = new Uint8Array(
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(manifest)
        )
    );

    return signatures.some(signature => {
        const receivedSignature = hexToBytes(signature);
        return receivedSignature !== null &&
            constantTimeEqual(calculatedSignature, receivedSignature);
    });
}

function normalizePositiveBigint(value: unknown): string | null {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).trim();
    return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

function normalizePaymentStatusDetail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, 255) : null;
}

function decimalToCents(value: unknown): bigint | null {
    if (typeof value !== "string" && typeof value !== "number") return null;

    const match = String(value).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return null;

    return BigInt(`${match[1]}${(match[2] || "").padEnd(2, "0")}`);
}

function getApprovedAt(dateApproved: string | null | undefined): string {
    if (dateApproved) {
        const parsed = new Date(dateApproved);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
}

Deno.serve(async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
        return jsonResponse({ received: true, ignored: true, reason: "METHOD_NOT_ALLOWED" });
    }

    try {
        const mercadoPagoAccessToken = requiredEnvironmentVariable("MP_ACCESS_TOKEN");
        const webhookSecret = requiredEnvironmentVariable("MP_WEBHOOK_SECRET");
        const supabaseUrl = requiredEnvironmentVariable("SUPABASE_URL");
        const serviceRoleKey = requiredEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");

        let body: WebhookBody;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: "INVALID_WEBHOOK_BODY" }, 400);
        }

        const requestUrl = new URL(request.url);
        const queryDataId = requestUrl.searchParams.get("data.id");
        const bodyDataId = body.data?.id === undefined
            ? null
            : String(body.data.id);
        const dataId = queryDataId || bodyDataId;

        const signatureIsValid = await validateMercadoPagoSignature(
            request.headers.get("x-signature"),
            request.headers.get("x-request-id"),
            dataId,
            webhookSecret
        );

        if (!signatureIsValid) {
            console.warn("Webhook de Mercado Pago con firma inválida.", {
                requestId: request.headers.get("x-request-id")
            });
            return jsonResponse({ error: "INVALID_SIGNATURE" }, 401);
        }

        const eventType =
            body.type ||
            body.topic ||
            requestUrl.searchParams.get("type") ||
            requestUrl.searchParams.get("topic");

        if (eventType !== "payment") {
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "UNSUPPORTED_EVENT"
            });
        }

        const paymentId = normalizePositiveBigint(dataId);
        if (!paymentId) {
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "INVALID_PAYMENT_ID"
            });
        }

        const paymentResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
            {
                headers: {
                    "Authorization": `Bearer ${mercadoPagoAccessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );
        const paymentBody = await readJsonSafely(paymentResponse);

        if (!paymentResponse.ok) {
            if (paymentResponse.status === 404 && body.live_mode === false) {
                console.info("Pago simulado no encontrado; notificación ignorada.", {
                    paymentId
                });
                return jsonResponse({
                    received: true,
                    ignored: true,
                    simulation: true,
                    reason: "SIMULATED_PAYMENT_NOT_FOUND"
                });
            }

            console.error("No se pudo consultar el pago en Mercado Pago.", {
                paymentId,
                status: paymentResponse.status,
                response: paymentBody
            });
            return jsonResponse({ error: "MERCADO_PAGO_QUERY_FAILED" }, 500);
        }

        const payment = paymentBody as MercadoPagoPayment;
        const realPaymentId = normalizePositiveBigint(payment.id);
        const orderId = normalizePositiveBigint(payment.external_reference);
        const paymentStatusDetail = normalizePaymentStatusDetail(payment.status_detail);

        if (!realPaymentId || !orderId) {
            console.error("Pago sin identificadores válidos.", {
                paymentId,
                externalReference: payment.external_reference
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "INVALID_PAYMENT_REFERENCE"
            });
        }

        if (realPaymentId !== paymentId) {
            console.error("El ID del pago consultado no coincide.", {
                signedPaymentId: paymentId,
                realPaymentId
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "PAYMENT_ID_MISMATCH"
            });
        }

        const mappedPaymentStatus = payment.status
            ? PAYMENT_STATUS_MAP[payment.status]
            : undefined;

        if (!mappedPaymentStatus) {
            console.warn("Estado de Mercado Pago no soportado.", {
                paymentId,
                status: payment.status,
                statusDetail: paymentStatusDetail
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "UNSUPPORTED_PAYMENT_STATUS"
            });
        }

        const databaseClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });

        const { data: order, error: orderError } = await databaseClient
            .from("orders")
            .select("id, status, total, payment_status, payment_provider, payment_id, payment_preference_id, paid_at")
            .eq("id", orderId)
            .maybeSingle();

        if (orderError) {
            console.error("Error consultando pedido:", orderError);
            return jsonResponse({ error: "ORDER_QUERY_FAILED" }, 500);
        }

        if (!order) {
            console.error("No existe pedido para external_reference.", { orderId, paymentId });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "ORDER_NOT_FOUND"
            });
        }

        if (order.payment_provider !== null && order.payment_provider !== "mercadopago") {
            console.error("El pedido pertenece a otro proveedor.", {
                orderId,
                provider: order.payment_provider
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "PAYMENT_PROVIDER_MISMATCH"
            });
        }

        const paidAmount = decimalToCents(payment.transaction_amount);
        const orderAmount = decimalToCents(order.total);

        if (
            payment.currency_id !== "PEN" ||
            paidAmount === null ||
            orderAmount === null ||
            paidAmount !== orderAmount
        ) {
            console.error("Monto o moneda incorrectos.", {
                orderId,
                paymentId,
                paymentAmount: payment.transaction_amount,
                orderTotal: order.total,
                currency: payment.currency_id
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH"
            });
        }

        /* Nunca reemplazar el ID de un pago aprobado o confirmado. */
        if (
            (order.payment_status === "approved" || order.status === "confirmado") &&
            order.payment_id !== null &&
            String(order.payment_id) !== realPaymentId
        ) {
            console.error("Pedido ya aprobado con otro payment_id.", {
                orderId,
                storedPaymentId: order.payment_id,
                receivedPaymentId: realPaymentId
            });
            return jsonResponse({
                received: true,
                ignored: true,
                requires_attention: true,
                reason: "ORDER_ALREADY_PAID_WITH_ANOTHER_PAYMENT"
            });
        }

        if (
            order.payment_status === "approved" &&
            !["approved", "refunded"].includes(mappedPaymentStatus)
        ) {
            return jsonResponse({ received: true, ignored: true, reason: "STALE_PAYMENT_STATUS" });
        }

        if (order.payment_status === "refunded" && mappedPaymentStatus !== "refunded") {
            return jsonResponse({ received: true, ignored: true, reason: "REFUND_ALREADY_RECORDED" });
        }

        if (
            mappedPaymentStatus === "refunded" &&
            order.payment_id !== null &&
            String(order.payment_id) !== realPaymentId
        ) {
            console.error("Refund asociado a otro payment_id.", {
                orderId,
                storedPaymentId: order.payment_id,
                receivedPaymentId: realPaymentId
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "REFUND_PAYMENT_ID_MISMATCH"
            });
        }

        const paymentUpdate: Record<string, unknown> = {
            payment_status: mappedPaymentStatus,
            payment_status_detail: paymentStatusDetail,
            payment_provider: "mercadopago",
            payment_id: realPaymentId
        };

        if (mappedPaymentStatus === "approved") {
            paymentUpdate.paid_at = getApprovedAt(payment.date_approved);
        }

        let paymentUpdateQuery = databaseClient
            .from("orders")
            .update(paymentUpdate)
            .eq("id", orderId)
            .eq("status", order.status)
            .eq("payment_status", order.payment_status);

        paymentUpdateQuery = order.payment_id === null
            ? paymentUpdateQuery.is("payment_id", null)
            : paymentUpdateQuery.eq("payment_id", order.payment_id);

        const {
            data: updatedPaymentOrder,
            error: paymentUpdateError
        } = await paymentUpdateQuery
            .select("id")
            .maybeSingle();

        if (paymentUpdateError) {
            console.error("No se pudo actualizar el estado del pago:", paymentUpdateError);
            return jsonResponse({ error: "PAYMENT_UPDATE_FAILED" }, 500);
        }

        if (!updatedPaymentOrder) {
            console.warn("El pedido cambió mientras se procesaba el pago.", {
                orderId,
                paymentId: realPaymentId
            });
            return jsonResponse({ error: "CONCURRENT_PAYMENT_UPDATE" }, 500);
        }

        if (mappedPaymentStatus === "approved") {
            const paidAt = paymentUpdate.paid_at as string;
            const { data: confirmation, error: confirmationError } =
                await databaseClient.rpc("confirm_paid_order", {
                    p_order_id: orderId,
                    p_payment_id: realPaymentId,
                    p_paid_at: paidAt
                });

            if (confirmationError) {
                const errorText = [
                    confirmationError.message,
                    confirmationError.details,
                    confirmationError.hint
                ].filter(Boolean).join(" ").toUpperCase();

                console.error("Pago aprobado, pero el pedido no pudo confirmarse.", {
                    orderId,
                    paymentId,
                    error: confirmationError
                });

                const permanentErrors = [
                    "INSUFFICIENT_STOCK",
                    "ORDER_ITEMS_EMPTY",
                    "ORDER_PRODUCT_NOT_FOUND",
                    "ORDER_CANNOT_BE_CONFIRMED"
                ];

                if (permanentErrors.some(code => errorText.includes(code))) {
                    return jsonResponse({
                        received: true,
                        payment_recorded: true,
                        payment_status_detail: paymentStatusDetail,
                        order_confirmed: false,
                        requires_attention: true
                    });
                }

                return jsonResponse({ error: "ORDER_CONFIRMATION_FAILED" }, 500);
            }

            return jsonResponse({
                received: true,
                payment_status: "approved",
                payment_status_detail: paymentStatusDetail,
                order_confirmed: true,
                confirmation
            });
        }

        return jsonResponse({
            received: true,
            payment_status: mappedPaymentStatus,
            payment_status_detail: paymentStatusDetail
        });
    } catch (error) {
        console.error("Error inesperado procesando webhook:", error);
        return jsonResponse({ error: "INTERNAL_SERVER_ERROR" }, 500);
    }
});
