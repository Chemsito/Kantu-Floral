import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

type RequestBody = { order_id?: string | number; guest_token?: string };
type OrderItem = { product_id: string | number; quantity: number; unit_price: number | string };
type Product = { id: string | number; name: string; image: string | null; stock: number | string | null; active: boolean };
type MercadoPagoPreference = { id?: string; init_point?: string; sandbox_init_point?: string };
type MercadoPagoEnvironment = "test" | "production";

const RETRYABLE_PAYMENT_STATUSES = new Set(["pending", "rejected", "cancelled"]);
const ACTIVE_PROOF_STATUSES = new Set(["uploaded", "verifying", "needs_review", "approved"]);

function jsonResponse(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
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
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{43}$/.test(normalized) ? normalized : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "edge-unknown";
}

async function enforceRateLimit(databaseClient: any, serviceRoleKey: string, request: Request): Promise<Response | null> {
  const fingerprint = await sha256Hex(`${serviceRoleKey}|kantu-guest|guest_mp|${clientIp(request)}`);
  const { data, error } = await databaseClient.rpc("consume_guest_checkout_rate_limit", {
    p_fingerprint_hash: fingerprint,
    p_action: "guest_mp",
    p_limit: 20,
    p_window_seconds: 3600
  });
  if (error) {
    return jsonResponse({ error: "RATE_LIMIT_UNAVAILABLE", message: "No pudimos validar la solicitud." }, 503);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.allowed === false) {
    const retry = Math.max(1, Number(row.retry_after_seconds) || 60);
    return jsonResponse(
      {
        error: "RATE_LIMITED",
        message: "Se alcanzó el límite temporal de intentos.",
        retry_after_seconds: retry
      },
      429,
      { "Retry-After": String(retry) }
    );
  }
  return null;
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

    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_JSON", message: "El cuerpo de la solicitud no es válido." }, 400);
    }

    const orderId = normalizeOrderId(body.order_id);
    const guestToken = normalizeToken(body.guest_token);
    if (!orderId || !guestToken) {
      return jsonResponse({ error: "GUEST_ACCESS_DENIED", message: "No encontramos acceso válido a este pedido invitado." }, 403);
    }

    const databaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const rateResponse = await enforceRateLimit(databaseClient, serviceRoleKey, request);
    if (rateResponse) return rateResponse;

    const tokenHash = await sha256Hex(guestToken);
    const { data: access, error: accessError } = await databaseClient
      .from("guest_order_access")
      .select("order_id")
      .eq("order_id", orderId)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (accessError || !access) {
      return jsonResponse({ error: "GUEST_ACCESS_DENIED", message: "No encontramos acceso válido a este pedido invitado." }, 403);
    }

    const { data: order, error: orderError } = await databaseClient
      .from("orders")
      .select("id, user_id, status, payment_status, payment_provider, total, subtotal, delivery_fee, discount_amount, promotion_code")
      .eq("id", orderId)
      .is("user_id", null)
      .maybeSingle();
    if (orderError) {
      return jsonResponse({ error: "ORDER_QUERY_FAILED", message: "No pudimos consultar el pedido." }, 500);
    }
    if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND", message: "El pedido no existe." }, 404);
    if (order.status !== "pendiente") {
      return jsonResponse({ error: "INVALID_ORDER_STATUS", message: "Solo se pueden pagar pedidos pendientes." }, 409);
    }
    if (!RETRYABLE_PAYMENT_STATUSES.has(String(order.payment_status || ""))) {
      return jsonResponse({ error: "INVALID_PAYMENT_STATUS", message: "Este pedido no está disponible para pago." }, 409);
    }
    if (order.payment_provider && order.payment_provider !== "mercadopago") {
      return jsonResponse({ error: "PAYMENT_PROVIDER_MISMATCH", message: "Este pedido ya está asociado a otro medio de pago." }, 409);
    }

    const latestProof = await databaseClient
      .from("payment_proofs")
      .select("verification_status")
      .eq("order_id", orderId)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestProof.error) {
      return jsonResponse({ error: "PAYMENT_PROOF_QUERY_FAILED", message: "No pudimos validar el estado de pago." }, 500);
    }
    if (latestProof.data && ACTIVE_PROOF_STATUSES.has(String(latestProof.data.verification_status))) {
      return jsonResponse({ error: "MANUAL_PAYMENT_IN_PROGRESS", message: "Ya existe un comprobante activo para este pedido." }, 409);
    }

    const orderTotal = Number(order.total);
    const orderSubtotal = Number(order.subtotal);
    const deliveryFee = Number(order.delivery_fee) || 0;
    const discountAmount = Number(order.discount_amount) || 0;
    if (!Number.isFinite(orderTotal) || orderTotal <= 0 || !Number.isFinite(orderSubtotal) || orderSubtotal < 0 || discountAmount !== 0) {
      return jsonResponse({ error: "INVALID_GUEST_ORDER_TOTAL", message: "El total del pedido no pudo validarse." }, 409);
    }
    if (Math.round((orderSubtotal + deliveryFee) * 100) !== Math.round(orderTotal * 100)) {
      return jsonResponse({ error: "ORDER_TOTAL_MISMATCH", message: "El total del pedido no pudo validarse." }, 409);
    }

    const { data: orderItems, error: orderItemsError } = await databaseClient
      .from("order_items")
      .select("product_id, quantity, unit_price")
      .eq("order_id", orderId)
      .returns<OrderItem[]>();
    if (orderItemsError) {
      return jsonResponse({ error: "ORDER_ITEMS_QUERY_FAILED", message: "No pudimos consultar los productos del pedido." }, 500);
    }
    if (!orderItems?.length) {
      return jsonResponse({ error: "ORDER_ITEMS_EMPTY", message: "El pedido no contiene productos." }, 409);
    }

    const productIds = [...new Set(orderItems.map(item => String(item.product_id)))];
    const { data: products, error: productsError } = await databaseClient
      .from("products")
      .select("id, name, image, stock, active")
      .in("id", productIds)
      .returns<Product[]>();
    if (productsError) {
      return jsonResponse({ error: "PRODUCTS_QUERY_FAILED", message: "No pudimos consultar los productos." }, 500);
    }

    const productsById = new Map((products || []).map(product => [String(product.id), product]));
    if (orderItems.some(item => !productsById.has(String(item.product_id)))) {
      return jsonResponse({ error: "ORDER_PRODUCT_NOT_FOUND", message: "Uno de los productos ya no existe." }, 409);
    }

    const requiredByProduct = new Map<string, number>();
    for (const item of orderItems) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        return jsonResponse({ error: "INVALID_ORDER_ITEM", message: "Uno de los productos del pedido es inválido." }, 409);
      }
      const productId = String(item.product_id);
      requiredByProduct.set(productId, (requiredByProduct.get(productId) || 0) + quantity);
    }

    for (const [productId, requiredQuantity] of requiredByProduct) {
      const product = productsById.get(productId)!;
      const stock = Number(product.stock);
      if (product.active !== true) {
        return jsonResponse({ error: "PRODUCT_NOT_AVAILABLE", message: "Uno de los productos ya no está disponible." }, 409);
      }
      if (!Number.isSafeInteger(stock) || stock < requiredQuantity) {
        return jsonResponse({ error: "INSUFFICIENT_STOCK", message: "No hay stock suficiente para completar el pedido." }, 409);
      }
    }

    const mercadoPagoItems = orderItems.map(item => {
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
    if (deliveryFee > 0) {
      mercadoPagoItems.push({
        id: "delivery",
        title: "Delivery Kantu Floral",
        currency_id: "PEN",
        quantity: 1,
        unit_price: deliveryFee
      });
    }

    const calculatedTotalCents = Math.round(
      mercadoPagoItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) * 100
    );
    if (calculatedTotalCents !== Math.round(orderTotal * 100)) {
      return jsonResponse({ error: "ORDER_TOTAL_MISMATCH", message: "El total del pedido no pudo validarse." }, 409);
    }

    const encodedOrderId = encodeURIComponent(orderId);
    const preferencePayload = {
      items: mercadoPagoItems,
      external_reference: String(orderId),
      auto_return: "approved",
      back_urls: {
        success: `${siteUrl}/index.html?payment=success&order_id=${encodedOrderId}&guest=1`,
        pending: `${siteUrl}/index.html?payment=pending&order_id=${encodedOrderId}&guest=1`,
        failure: `${siteUrl}/index.html?payment=failure&order_id=${encodedOrderId}&guest=1`
      }
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
      console.error("Mercado Pago guest preference failed:", {
        status: mercadoPagoResponse.status,
        environment: mercadoPagoEnvironment
      });
      return jsonResponse({ error: "MERCADO_PAGO_PREFERENCE_FAILED", message: "No pudimos iniciar el pago con Mercado Pago." }, 502);
    }

    const preference = mercadoPagoBody as MercadoPagoPreference;
    const checkoutUrl = mercadoPagoEnvironment === "production"
      ? preference?.init_point
      : preference?.sandbox_init_point;
    if (!preference?.id || !checkoutUrl) {
      return jsonResponse({ error: "INVALID_MERCADO_PAGO_RESPONSE", message: "Mercado Pago devolvió una respuesta incompleta." }, 502);
    }

    const { data: updatedOrder, error: updateError } = await databaseClient
      .from("orders")
      .update({ payment_provider: "mercadopago", payment_preference_id: preference.id })
      .eq("id", orderId)
      .is("user_id", null)
      .eq("status", "pendiente")
      .eq("payment_status", order.payment_status)
      .select("id")
      .maybeSingle();
    if (updateError) {
      return jsonResponse({ error: "ORDER_PAYMENT_UPDATE_FAILED", message: "No pudimos asociar la preferencia al pedido." }, 500);
    }
    if (!updatedOrder) {
      return jsonResponse({ error: "ORDER_CHANGED_DURING_PAYMENT", message: "El pedido cambió mientras se preparaba el pago." }, 409);
    }

    return jsonResponse({
      preference_id: preference.id,
      init_point: preference.init_point,
      ...(mercadoPagoEnvironment === "test" && preference.sandbox_init_point
        ? { sandbox_init_point: preference.sandbox_init_point }
        : {}),
      environment: mercadoPagoEnvironment
    });
  } catch (error) {
    console.error("Unexpected guest Mercado Pago error:", error instanceof Error ? error.message : "UNKNOWN");
    return jsonResponse({ error: "INTERNAL_SERVER_ERROR", message: "No pudimos preparar el pago." }, 500);
  }
});
