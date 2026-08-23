import { createClient } from "npm:@supabase/supabase-js@2.112.3";

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

const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

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

function signatureTimestampIsFresh(timestamp: string): boolean {
    if (!/^\d+$/.test(timestamp)) return false;
    const raw = Number(timestamp);
    if (!Number.isFinite(raw) || raw <= 0) return false;

    const timestampMs = raw >= 1_000_000_000_000 ? raw : raw * 1000;
    const age = Date.now() - timestampMs;
    return age <= MAX_SIGNATURE_AGE_MS && age >= -MAX_FUTURE_CLOCK_SKEW_MS;
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
    if (!timestamp || !signatureTimestampIsFresh(timestamp) || signatures.length === 0) {
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

async function recordWebhookEvent(
    databaseClient: ReturnType<typeof createClient>,
    event: {
        requestId: string | null;
        dataId: string | null;
        eventType: string | null;
        liveMode: boolean | null;
        result: string;
        orderId?: string | null;
        paymentStatus?: string | null;
    }
): Promise<void> {
    try {
        const { error } = await databaseClient.from("mercadopago_webhook_events").insert({
            request_id: event.requestId,
            payment_id: normalizePositiveBigint(event.dataId),
            event_type: event.eventType,
            live_mode: event.liveMode,
            processing_result: event.result,
            order_id: normalizePositiveBigint(event.orderId),
            payment_status: event.paymentStatus || null
        });
        if (error) console.warn("No se pudo registrar auditoría del webhook:", error.message);
    } catch (error) {
        console.warn("Auditoría del webhook no disponible:", error);
    }
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
        const bodyDataId = body.data?.id === undefined ? null : String(body.data.id);
        const dataId = queryDataId || bodyDataId;
        const requestId = request.headers.get("x-request-id");

        const signatureIsValid = await validateMercadoPagoSignature(
            request.headers.get("x-signature"),
            requestId,
            dataId,
            webhookSecret
        );

        if (!signatureIsValid) {
            console.warn("Webhook de Mercado Pago con firma inválida o expirada.", { requestId });
            return jsonResponse({ error: "INVALID_OR_EXPIRED_SIGNATURE" }, 401);
        }

        const eventType =
            body.type ||
            body.topic ||
            requestUrl.searchParams.get("type") ||
            requestUrl.searchParams.get("topic");

        const databaseClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });

        if (eventType !== "payment") {
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "unsupported_event"
            });
            return jsonResponse({ received: true, ignored: true, reason: "UNSUPPORTED_EVENT" });
        }

        const paymentId = normalizePositiveBigint(dataId);
        if (!paymentId) {
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "invalid_payment_id"
            });
            return jsonResponse({ received: true, ignored: true, reason: "INVALID_PAYMENT_ID" });
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
                await recordWebhookEvent(databaseClient, {
                    requestId,
                    dataId,
                    eventType,
                    liveMode: false,
                    result: "simulated_payment_not_found"
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
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "invalid_payment_reference"
            });
            return jsonResponse({ received: true, ignored: true, reason: "INVALID_PAYMENT_REFERENCE" });
        }

        if (realPaymentId !== paymentId) {
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "payment_id_mismatch",
                orderId
            });
            return jsonResponse({ received: true, ignored: true, reason: "PAYMENT_ID_MISMATCH" });
        }

        const mappedPaymentStatus = payment.status ? PAYMENT_STATUS_MAP[payment.status] : undefined;
        if (!mappedPaymentStatus) {
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "unsupported_payment_status",
                orderId,
                paymentStatus: payment.status || null
            });
            return jsonResponse({ received: true, ignored: true, reason: "UNSUPPORTED_PAYMENT_STATUS" });
        }

        const { data: order, error: orderError } = await databaseClient
            .from("orders")
            .select("id, status, total, payment_status, payment_provider, payment_id, payment_preference_id, paid_at")
            .eq("id", orderId)
            .maybeSingle();

        if (orderError) return jsonResponse({ error: "ORDER_QUERY_FAILED" }, 500);

        if (!order) {
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "order_not_found",
                orderId,
                paymentStatus: mappedPaymentStatus
            });
            return jsonResponse({ received: true, ignored: true, reason: "ORDER_NOT_FOUND" });
        }

        if (order.payment_provider !== null && order.payment_provider !== "mercadopago") {
            return jsonResponse({ received: true, ignored: true, reason: "PAYMENT_PROVIDER_MISMATCH" });
        }

        const paidAmount = decimalToCents(payment.transaction_amount);
        const orderAmount = decimalToCents(order.total);

        if (
            payment.currency_id !== "PEN" ||
            paidAmount === null ||
            orderAmount === null ||
            paidAmount !== orderAmount
        ) {
            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "amount_or_currency_mismatch",
                orderId,
                paymentStatus: mappedPaymentStatus
            });
            return jsonResponse({
                received: true,
                ignored: true,
                reason: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH"
            });
        }

        if (
            (order.payment_status === "approved" || order.status === "confirmado") &&
            order.payment_id !== null &&
            String(order.payment_id) !== realPaymentId
        ) {
            return jsonResponse({
                received: true,
                ignored: true,
                requires_attention: true,
                reason: "ORDER_ALREADY_PAID_WITH_ANOTHER_PAYMENT"
            });
        }

        if (order.payment_status === "approved" && !["approved", "refunded"].includes(mappedPaymentStatus)) {
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
            return jsonResponse({ received: true, ignored: true, reason: "REFUND_PAYMENT_ID_MISMATCH" });
        }

        const paymentUpdate: Record<string, unknown> = {
            payment_status: mappedPaymentStatus,
            payment_status_detail: paymentStatusDetail,
            payment_provider: "mercadopago",
            payment_id: realPaymentId
        };

        if (mappedPaymentStatus === "approved") paymentUpdate.paid_at = getApprovedAt(payment.date_approved);

        let paymentUpdateQuery = databaseClient
            .from("orders")
            .update(paymentUpdate)
            .eq("id", orderId)
            .eq("status", order.status)
            .eq("payment_status", order.payment_status);

        paymentUpdateQuery = order.payment_id === null
            ? paymentUpdateQuery.is("payment_id", null)
            : paymentUpdateQuery.eq("payment_id", order.payment_id);

        const { data: updatedPaymentOrder, error: paymentUpdateError } = await paymentUpdateQuery
            .select("id")
            .maybeSingle();

        if (paymentUpdateError) return jsonResponse({ error: "PAYMENT_UPDATE_FAILED" }, 500);
        if (!updatedPaymentOrder) return jsonResponse({ error: "CONCURRENT_PAYMENT_UPDATE" }, 500);

        if (mappedPaymentStatus === "approved") {
            const paidAt = paymentUpdate.paid_at as string;
            const { data: confirmation, error: confirmationError } = await databaseClient.rpc("confirm_paid_order", {
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

                const permanentErrors = [
                    "INSUFFICIENT_STOCK",
                    "ORDER_ITEMS_EMPTY",
                    "ORDER_PRODUCT_NOT_FOUND",
                    "ORDER_CANNOT_BE_CONFIRMED"
                ];

                if (permanentErrors.some(code => errorText.includes(code))) {
                    await recordWebhookEvent(databaseClient, {
                        requestId,
                        dataId,
                        eventType,
                        liveMode: body.live_mode ?? null,
                        result: "payment_recorded_order_requires_attention",
                        orderId,
                        paymentStatus: "approved"
                    });
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

            await recordWebhookEvent(databaseClient, {
                requestId,
                dataId,
                eventType,
                liveMode: body.live_mode ?? null,
                result: "processed",
                orderId,
                paymentStatus: "approved"
            });

            return jsonResponse({
                received: true,
                payment_status: "approved",
                payment_status_detail: paymentStatusDetail,
                order_confirmed: true,
                confirmation
            });
        }

        await recordWebhookEvent(databaseClient, {
            requestId,
            dataId,
            eventType,
            liveMode: body.live_mode ?? null,
            result: "processed",
            orderId,
            paymentStatus: mappedPaymentStatus
        });

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
