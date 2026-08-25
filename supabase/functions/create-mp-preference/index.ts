import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

type RequestBody = {
    order_id?: string | number;
};

type OrderItem = {
    product_id: string | number;
    quantity: number;
    unit_price: number | string;
};

type Product = {
    id: string | number;
    name: string;
    image: string | null;
    stock: number | string | null;
    active: boolean;
};

type MercadoPagoPreference = {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
};

type MercadoPagoEnvironment = "test" | "production";

const RETRYABLE_PAYMENT_STATUSES = new Set(["pending", "rejected", "cancelled"]);
const PREFERENCE_VALIDITY_MINUTES = 30;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function requiredEnvironmentVariable(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new Error(`MISSING_ENVIRONMENT_VARIABLE:${name}`);
    return value;
}

function getMercadoPagoEnvironment(): MercadoPagoEnvironment {
    const value = (Deno.env.get("MP_MODE") || "test").trim().toLowerCase();
    if (value === "test" || value === "production") return value;
    throw new Error("INVALID_MP_MODE");
}

function normalizeOrderId(value: unknown): string | null {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    }
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { raw_response: text };
    }
}

Deno.serve(async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") {
        return jsonResponse({ error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, 405);
    }

    try {
        const supabaseUrl = requiredEnvironmentVariable("SUPABASE_URL");
        const supabaseAnonKey = requiredEnvironmentVariable("SUPABASE_ANON_KEY");
        const serviceRoleKey = requiredEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");
        const mercadoPagoAccessToken = requiredEnvironmentVariable("MP_ACCESS_TOKEN");
        const mercadoPagoEnvironment = getMercadoPagoEnvironment();
        const siteUrl = requiredEnvironmentVariable("SITE_URL").replace(/\/+$/, "");

        let parsedSiteUrl: URL;
        try {
            parsedSiteUrl = new URL(siteUrl);
        } catch {
            return jsonResponse({ error: "INVALID_SITE_URL", message: "SITE_URL no contiene una URL válida." }, 500);
        }
        if (parsedSiteUrl.protocol !== "https:") {
            return jsonResponse({ error: "INVALID_SITE_URL", message: "SITE_URL debe utilizar HTTPS." }, 500);
        }

        const authorization = request.headers.get("Authorization");
        const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!bearerToken) {
            return jsonResponse({ error: "AUTHENTICATION_REQUIRED", message: "Debes iniciar sesión para pagar el pedido." }, 401);
        }

        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const { data: { user }, error: userError } = await authClient.auth.getUser(bearerToken);
        if (userError || !user) {
            console.error("No se pudo validar al usuario:", userError);
            return jsonResponse({ error: "INVALID_AUTHENTICATION", message: "Tu sesión no es válida o ha expirado." }, 401);
        }

        let body: RequestBody;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: "INVALID_JSON", message: "El cuerpo de la solicitud no es válido." }, 400);
        }

        const orderId = normalizeOrderId(body.order_id);
        if (!orderId) {
            return jsonResponse({ error: "INVALID_ORDER_ID", message: "El identificador del pedido no es válido." }, 400);
        }

        const databaseClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data: order, error: orderError } = await databaseClient
            .from("orders")
            .select("id, user_id, status, payment_status, total, subtotal, delivery_fee, discount_amount, promotion_code")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (orderError) {
            console.error("No se pudo consultar el pedido:", orderError);
            return jsonResponse({ error: "ORDER_QUERY_FAILED", message: "No pudimos consultar el pedido." }, 500);
        }
        if (!order) {
            return jsonResponse({ error: "ORDER_NOT_FOUND", message: "El pedido no existe o no te pertenece." }, 404);
        }
        if (order.status !== "pendiente") {
            return jsonResponse({ error: "INVALID_ORDER_STATUS", message: "Solo se pueden pagar pedidos pendientes." }, 409);
        }
        if (!RETRYABLE_PAYMENT_STATUSES.has(String(order.payment_status || ""))) {
            return jsonResponse({ error: "INVALID_PAYMENT_STATUS", message: "Este pedido no está disponible para pago." }, 409);
        }

        const orderTotal = Number(order.total);
        const orderSubtotal = Number(order.subtotal);
        const deliveryFee = Number(order.delivery_fee) || 0;
        const discountAmount = Number(order.discount_amount) || 0;
        if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
            return jsonResponse({ error: "ORDER_TOTAL_NOT_PAYABLE", message: "El total del pedido no es válido para pago online." }, 409);
        }
        if (!Number.isFinite(orderSubtotal) || orderSubtotal < 0
            || !Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > orderSubtotal) {
            return jsonResponse({ error: "INVALID_ORDER_DISCOUNT", message: "El descuento del pedido no pudo validarse." }, 409);
        }

        const { data: orderItems, error: orderItemsError } = await databaseClient
            .from("order_items")
            .select("product_id, quantity, unit_price")
            .eq("order_id", orderId)
            .returns<OrderItem[]>();
        if (orderItemsError) {
            console.error("No se pudieron consultar los productos del pedido:", orderItemsError);
            return jsonResponse({ error: "ORDER_ITEMS_QUERY_FAILED", message: "No pudimos consultar los productos del pedido." }, 500);
        }
        if (!orderItems?.length) {
            return jsonResponse({ error: "ORDER_ITEMS_EMPTY", message: "El pedido no contiene productos." }, 409);
        }

        for (const item of orderItems) {
            const quantity = Number(item.quantity);
            const unitPrice = Number(item.unit_price);
            if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                return jsonResponse({ error: "INVALID_ORDER_ITEM_QUANTITY", message: "Uno de los productos tiene una cantidad inválida." }, 409);
            }
            if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
                return jsonResponse({ error: "INVALID_ORDER_ITEM_PRICE", message: "Uno de los productos tiene un precio histórico inválido." }, 409);
            }
        }

        const productIds = [...new Set(orderItems.map(item => String(item.product_id)))];
        const { data: products, error: productsError } = await databaseClient
            .from("products")
            .select("id, name, image, stock, active")
            .in("id", productIds)
            .returns<Product[]>();
        if (productsError) {
            console.error("No se pudieron consultar los productos:", productsError);
            return jsonResponse({ error: "PRODUCTS_QUERY_FAILED", message: "No pudimos consultar los productos del pedido." }, 500);
        }

        const productsById = new Map((products || []).map(product => [String(product.id), product]));
        if (orderItems.some(item => !productsById.has(String(item.product_id)))) {
            return jsonResponse({ error: "ORDER_PRODUCT_NOT_FOUND", message: "Uno de los productos del pedido ya no existe." }, 409);
        }

        const requiredByProduct = new Map<string, number>();
        for (const item of orderItems) {
            const productId = String(item.product_id);
            requiredByProduct.set(productId, (requiredByProduct.get(productId) || 0) + Number(item.quantity));
        }

        for (const [productId, requiredQuantity] of requiredByProduct) {
            const product = productsById.get(productId)!;
            const stock = Number(product.stock);
            if (product.active !== true) {
                return jsonResponse({ error: "PRODUCT_NOT_AVAILABLE", message: "Uno de los productos ya no está disponible." }, 409);
            }
            if (!Number.isSafeInteger(stock) || stock < requiredQuantity) {
                return jsonResponse({ error: "INSUFFICIENT_STOCK", message: "No hay stock suficiente para completar este pedido." }, 409);
            }
        }

        let mercadoPagoItems = orderItems.map(item => {
            const product = productsById.get(String(item.product_id))!;
            const pictureUrl = product.image?.trim();
            return {
                id: String(item.product_id),
                title: product.name,
                currency_id: "PEN",
                quantity: Number(item.quantity),
                unit_price: Number(item.unit_price),
                ...(pictureUrl ? { picture_url: pictureUrl } : {})
            };
        });

        if (discountAmount > 0) {
            mercadoPagoItems = [{
                id: `order-${orderId}`,
                title: order.promotion_code
                    ? `Pedido Kantu Floral · promoción ${String(order.promotion_code)}`
                    : "Pedido Kantu Floral · promoción aplicada",
                currency_id: "PEN",
                quantity: 1,
                unit_price: orderTotal
            }];
        } else if (deliveryFee > 0) {
            mercadoPagoItems.push({
                id: "delivery",
                title: "Delivery Kantu Floral",
                currency_id: "PEN",
                quantity: 1,
                unit_price: deliveryFee
            });
        }

        const calculatedTotalCents = Math.round(
            mercadoPagoItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) * 100
        );
        const orderTotalCents = Math.round(orderTotal * 100);
        if (calculatedTotalCents !== orderTotalCents) {
            console.error("El total preparado para Mercado Pago no coincide con orders.total.", {
                orderId,
                calculatedTotalCents,
                orderTotalCents,
                discountAmount
            });
            return jsonResponse({
                error: "ORDER_TOTAL_MISMATCH",
                message: "El total del pedido no pudo validarse."
            }, 409);
        }

        const encodedOrderId = encodeURIComponent(orderId);
        const preferenceStartsAt = new Date();
        const preferenceExpiresAt = new Date(preferenceStartsAt.getTime() + PREFERENCE_VALIDITY_MINUTES * 60_000);
        const preferencePayload = {
            items: mercadoPagoItems,
            external_reference: String(orderId),
            auto_return: "approved",
            expires: true,
            expiration_date_from: preferenceStartsAt.toISOString(),
            expiration_date_to: preferenceExpiresAt.toISOString(),
            back_urls: {
                success: `${siteUrl}/index.html?payment=success&order_id=${encodedOrderId}`,
                pending: `${siteUrl}/index.html?payment=pending&order_id=${encodedOrderId}`,
                failure: `${siteUrl}/index.html?payment=failure&order_id=${encodedOrderId}`
            },
            ...(user.email ? { payer: { email: user.email } } : {})
        };

        const mercadoPagoResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${mercadoPagoAccessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(preferencePayload)
        });
        const mercadoPagoBody = await parseResponseBody(mercadoPagoResponse);
        if (!mercadoPagoResponse.ok) {
            console.error("Mercado Pago rechazó la preferencia:", {
                status: mercadoPagoResponse.status,
                response: mercadoPagoBody,
                environment: mercadoPagoEnvironment
            });
            return jsonResponse({ error: "MERCADO_PAGO_PREFERENCE_FAILED", message: "No pudimos iniciar el pago con Mercado Pago." }, 502);
        }

        const preference = mercadoPagoBody as MercadoPagoPreference;
        const checkoutUrl = mercadoPagoEnvironment === "production"
            ? preference?.init_point
            : preference?.sandbox_init_point;
        if (!preference?.id || !checkoutUrl) {
            console.error("Mercado Pago devolvió una respuesta incompleta:", {
                response: mercadoPagoBody,
                environment: mercadoPagoEnvironment
            });
            return jsonResponse({ error: "INVALID_MERCADO_PAGO_RESPONSE", message: "Mercado Pago devolvió una respuesta incompleta." }, 502);
        }

        const { data: updatedOrder, error: updateError } = await databaseClient
            .from("orders")
            .update({ payment_provider: "mercadopago", payment_preference_id: preference.id })
            .eq("id", orderId)
            .eq("user_id", user.id)
            .eq("status", "pendiente")
            .eq("payment_status", order.payment_status)
            .select("id")
            .maybeSingle();
        if (updateError) {
            console.error("No se pudo asociar la preferencia al pedido:", updateError);
            const errorText = [updateError.message, updateError.details, updateError.hint].filter(Boolean).join(" ").toUpperCase();
            if (errorText.includes("INSUFFICIENT_STOCK")) {
                return jsonResponse({ error: "INSUFFICIENT_STOCK", message: "El stock cambió mientras preparábamos el pago. Actualiza tu carrito." }, 409);
            }
            return jsonResponse({ error: "ORDER_PAYMENT_UPDATE_FAILED", message: "La preferencia fue creada, pero no pudimos asociarla al pedido." }, 500);
        }
        if (!updatedOrder) {
            return jsonResponse({ error: "ORDER_CHANGED_DURING_PAYMENT", message: "El pedido cambió mientras se preparaba el pago. Actualiza la página." }, 409);
        }

        return jsonResponse({
            preference_id: preference.id,
            init_point: preference.init_point,
            ...(mercadoPagoEnvironment === "test" && preference.sandbox_init_point
                ? { sandbox_init_point: preference.sandbox_init_point }
                : {}),
            environment: mercadoPagoEnvironment,
            expires_at: preferenceExpiresAt.toISOString()
        });
    } catch (error) {
        console.error("Error inesperado creando la preferencia:", error);
        return jsonResponse({ error: "INTERNAL_SERVER_ERROR", message: "No pudimos preparar el pago." }, 500);
    }
});
