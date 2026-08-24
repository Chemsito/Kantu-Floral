import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

type Body = Record<string, unknown>;

function json(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function isoDate(value: unknown): string | null {
  const normalized = text(value, 10);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? null : normalized;
}

function items(value: unknown): Array<{ product_id: number; quantity: number }> | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const result: Array<{ product_id: number; quantity: number }> = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const productId = Number((row as Record<string, unknown>).product_id);
    const quantity = Number((row as Record<string, unknown>).quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
    result.push({ product_id: productId, quantity });
  }
  return result;
}

function customizations(value: unknown): Record<string, string> | null {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 30) return null;
  const result: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (!/^[1-9]\d*$/.test(key) || typeof raw !== "string") return null;
    const selection = raw.trim();
    if (!selection || selection.length > 120) return null;
    result[key] = selection;
  }
  return result;
}

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "edge-unknown";
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVICE_CONFIGURATION_ERROR" }, 503);

    const body = await request.json().catch(() => null) as Body | null;
    if (!body) return json({ error: "INVALID_JSON", message: "La solicitud no es válida." }, 400);

    const normalizedItems = items(body.items);
    const name = text(body.customer_name, 120);
    const phone = text(body.customer_phone, 40);
    const address = text(body.delivery_address, 700);
    const lat = coordinate(body.delivery_lat, -90, 90);
    const lng = coordinate(body.delivery_lng, -180, 180);
    const options = customizations(body.customizations);
    if (!normalizedItems || !name || !phone || !address || lat === null || lng === null || options === null) {
      return json({ error: "INVALID_GUEST_ORDER", message: "Revisa los datos del pedido e inténtalo nuevamente." }, 400);
    }

    const database = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const fingerprint = await sha256(`${serviceRoleKey}|kantu-guest|create|${clientIp(request)}`);
    const rate = await database.rpc("consume_guest_checkout_rate_limit", {
      p_fingerprint_hash: fingerprint,
      p_action: "create",
      p_limit: 10,
      p_window_seconds: 3600
    });
    if (rate.error) return json({ error: "RATE_LIMIT_UNAVAILABLE", message: "No pudimos validar la solicitud." }, 503);
    const rateRow = Array.isArray(rate.data) ? rate.data[0] : rate.data;
    if (rateRow?.allowed === false) {
      const retry = Math.max(1, Number(rateRow.retry_after_seconds) || 60);
      return json({ error: "RATE_LIMITED", message: "Se alcanzó el límite temporal de intentos." }, 429, { "Retry-After": String(retry) });
    }

    const guestToken = token();
    const tokenHash = await sha256(guestToken);
    const result = await database.rpc("create_guest_order_customized", {
      p_access_token_hash: tokenHash,
      p_items: normalizedItems,
      p_customer_name: name,
      p_customer_phone: phone,
      p_delivery_address: address,
      p_delivery_lat: lat,
      p_delivery_lng: lng,
      p_recipient_name: text(body.recipient_name, 120),
      p_recipient_phone: text(body.recipient_phone, 40),
      p_gift_message: text(body.gift_message, 500),
      p_is_surprise: Boolean(body.is_surprise),
      p_requested_delivery_date: isoDate(body.requested_delivery_date),
      p_requested_delivery_slot: text(body.requested_delivery_slot, 32),
      p_customizations: options
    });

    if (result.error) {
      console.error("Atomic guest order creation failed:", result.error.message);
      const raw = String(result.error.message || "").toUpperCase();
      const codes = [
        "PRODUCT_CUSTOMIZATION_REQUIRED",
        "INVALID_PRODUCT_CUSTOMIZATION",
        "INSUFFICIENT_STOCK",
        "PRODUCT_NOT_AVAILABLE",
        "DELIVERY_OUT_OF_RANGE",
        "DELIVERY_SLOT_TOO_SOON",
        "DELIVERY_SLOT_FULL",
        "DELIVERY_DATE_BLOCKED",
        "INVALID_DELIVERY_SLOT",
        "DELIVERY_SCHEDULING_DISABLED"
      ];
      const code = codes.find(value => raw.includes(value)) || "GUEST_ORDER_CREATION_FAILED";
      const message = code === "PRODUCT_CUSTOMIZATION_REQUIRED"
        ? "Elige el mensaje del topper antes de crear el pedido."
        : code === "INVALID_PRODUCT_CUSTOMIZATION"
          ? "El mensaje elegido para el topper ya no está disponible."
          : code === "INSUFFICIENT_STOCK"
            ? "No hay stock suficiente para uno de los productos."
            : code === "PRODUCT_NOT_AVAILABLE"
              ? "Uno de los productos ya no está disponible."
              : code === "DELIVERY_OUT_OF_RANGE"
                ? "La ubicación está fuera de la zona de reparto."
                : code.includes("DELIVERY_") || code === "INVALID_DELIVERY_SLOT"
                  ? "La fecha o franja de entrega ya no está disponible."
                  : "No pudimos crear el pedido.";
      return json({ error: code, message }, 409);
    }

    const order = Array.isArray(result.data) ? result.data[0] : result.data;
    return json({ order, guest_token: guestToken, access_expires_at: order?.access_expires_at }, 201);
  } catch (error) {
    console.error("guest-order-create:", error);
    return json({ error: "UNEXPECTED_ERROR", message: "No pudimos crear el pedido." }, 500);
  }
});
