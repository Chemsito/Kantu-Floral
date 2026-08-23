import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

type GuestAction =
  | "quote"
  | "schedule"
  | "availability"
  | "create"
  | "status"
  | "manual_upload_url"
  | "manual_submit"
  | "manual_cleanup";

type RequestBody = Record<string, unknown> & { action?: GuestAction };
type GuestAccess = { order_id: string | number; expires_at: string };
type GuestOrder = {
  id: string | number;
  user_id: string | null;
  status: string;
  payment_status: string;
  payment_provider: string | null;
  payment_preference_id: string | null;
  total: number | string;
  subtotal: number | string;
  delivery_fee: number | string;
  delivery_distance_km: number | string | null;
  estimated_delivery_minutes: number | null;
  requested_delivery_date: string | null;
  requested_delivery_slot: string | null;
  recipient_name: string | null;
  is_surprise: boolean;
  discount_amount: number | string;
  created_at: string;
};
type ScheduleSettings = {
  scheduling_enabled: boolean;
  min_lead_hours: number;
  max_days_ahead: number;
  slots: string[];
  blackout_dates: string[];
  slot_capacities: Record<string, number>;
};

const BUCKET = "payment-proofs";
const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const ACTIVE_PROOF_STATUSES = new Set(["uploaded", "verifying", "needs_review", "approved"]);
const SLOT_PATTERN = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

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

function normalizeOrderId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{43}$/.test(normalized) ? normalized : null;
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeItems(value: unknown): Array<{ product_id: number; quantity: number }> | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const rows: Array<{ product_id: number; quantity: number }> = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const productId = Number((row as Record<string, unknown>).product_id);
    const quantity = Number((row as Record<string, unknown>).quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
    rows.push({ product_id: productId, quantity });
  }
  return rows;
}

function normalizeIsoDate(value: unknown): string | null {
  const normalized = normalizeText(value, 10);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

function randomGuestToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || forwarded
    || "edge-unknown";
}

async function enforceRateLimit(
  databaseClient: any,
  serviceRoleKey: string,
  request: Request,
  action: string,
  limit: number
): Promise<Response | null> {
  const fingerprint = await sha256Hex(`${serviceRoleKey}|kantu-guest|${action}|${clientIp(request)}`);
  const { data, error } = await databaseClient.rpc("consume_guest_checkout_rate_limit", {
    p_fingerprint_hash: fingerprint,
    p_action: action,
    p_limit: limit,
    p_window_seconds: 3600
  });
  if (error) {
    console.error("Guest rate limit unavailable:", error.message);
    return jsonResponse({ error: "RATE_LIMIT_UNAVAILABLE", message: "No pudimos validar la solicitud. Inténtalo nuevamente." }, 503);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.allowed === false) {
    const retry = Math.max(1, Number(row.retry_after_seconds) || 60);
    return jsonResponse(
      {
        error: "RATE_LIMITED",
        message: "Se alcanzó el límite temporal de intentos. Inténtalo más tarde.",
        retry_after_seconds: retry
      },
      429,
      { "Retry-After": String(retry) }
    );
  }
  return null;
}

async function validateGuestAccess(
  databaseClient: any,
  orderIdValue: unknown,
  tokenValue: unknown
): Promise<{ order: GuestOrder; access: GuestAccess } | null> {
  const orderId = normalizeOrderId(orderIdValue);
  const token = normalizeToken(tokenValue);
  if (!orderId || !token) return null;
  const tokenHash = await sha256Hex(token);

  const { data: access, error: accessError } = await databaseClient
    .from("guest_order_access")
    .select("order_id, expires_at")
    .eq("order_id", orderId)
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (accessError || !access) return null;

  const { data: order, error: orderError } = await databaseClient
    .from("orders")
    .select("id, user_id, status, payment_status, payment_provider, payment_preference_id, total, subtotal, delivery_fee, delivery_distance_km, estimated_delivery_minutes, requested_delivery_date, requested_delivery_slot, recipient_name, is_surprise, discount_amount, created_at")
    .eq("id", orderId)
    .is("user_id", null)
    .maybeSingle();
  if (orderError || !order) return null;

  return { order: order as GuestOrder, access: access as GuestAccess };
}

async function latestProof(databaseClient: any, orderId: string | number) {
  const { data, error } = await databaseClient
    .from("payment_proofs")
    .select("id, payment_method, verification_status, verification_notes, uploaded_at, operation_number")
    .eq("order_id", orderId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function guestStatus(databaseClient: any, access: { order: GuestOrder; access: GuestAccess }) {
  const orderId = access.order.id;
  const [proof, itemsResult] = await Promise.all([
    latestProof(databaseClient, orderId),
    databaseClient.from("order_items").select("product_id, quantity, unit_price").eq("order_id", orderId)
  ]);
  if (itemsResult.error) throw itemsResult.error;

  const itemRows = itemsResult.data || [];
  const productIds = [...new Set(itemRows.map((row: any) => row.product_id).filter(Boolean))];
  let productsById = new Map<string, any>();
  if (productIds.length) {
    const products = await databaseClient.from("products").select("id, name, image").in("id", productIds);
    if (products.error) throw products.error;
    productsById = new Map((products.data || []).map((product: any) => [String(product.id), product]));
  }

  return {
    order: {
      ...access.order,
      access_expires_at: access.access.expires_at,
      items: itemRows.map((item: any) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        name: productsById.get(String(item.product_id))?.name || "Producto",
        image: productsById.get(String(item.product_id))?.image || null
      }))
    },
    proof
  };
}

function proofExtension(mimeType: string): string | null {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return null;
}

async function readSchedule(databaseClient: any): Promise<ScheduleSettings | null> {
  const { data, error } = await databaseClient
    .from("delivery_schedule_settings")
    .select("scheduling_enabled, min_lead_hours, max_days_ahead, slots, blackout_dates, slot_capacities")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;

  const capacities: Record<string, number> = {};
  const rawCapacities = data.slot_capacities && typeof data.slot_capacities === "object"
    ? data.slot_capacities as Record<string, unknown>
    : {};
  for (const [slot, value] of Object.entries(rawCapacities)) {
    const capacity = Number(value);
    if (Number.isInteger(capacity) && capacity > 0) capacities[slot] = capacity;
  }

  return {
    scheduling_enabled: Boolean(data.scheduling_enabled),
    min_lead_hours: Math.max(0, Number(data.min_lead_hours) || 0),
    max_days_ahead: Math.max(1, Number(data.max_days_ahead) || 30),
    slots: Array.isArray(data.slots) ? data.slots.map(String) : [],
    blackout_dates: Array.isArray(data.blackout_dates) ? data.blackout_dates.map(String) : [],
    slot_capacities: capacities
  };
}

function limaParts(date = new Date()): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const result: Record<string, number> = {};
  for (const part of parts) {
    if (["year", "month", "day", "hour", "minute", "second"].includes(part.type)) {
      result[part.type] = Number(part.value);
    }
  }
  return result;
}

function dateScalar(isoDate: string, time = "00:00"): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0);
}

function limaNowScalar(): { today: string; scalar: number } {
  const parts = limaParts();
  const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return {
    today,
    scalar: Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  };
}

async function scheduleAvailability(databaseClient: any, requestedDate: string, settings: ScheduleSettings) {
  const { today, scalar: nowScalar } = limaNowScalar();
  const requestedScalar = dateScalar(requestedDate);
  const todayScalar = dateScalar(today);
  const maxScalar = todayScalar + settings.max_days_ahead * 86400000;

  const reservations = await databaseClient
    .from("orders")
    .select("requested_delivery_slot")
    .eq("requested_delivery_date", requestedDate)
    .neq("status", "cancelado");
  if (reservations.error) throw reservations.error;

  const counts = new Map<string, number>();
  for (const row of reservations.data || []) {
    const slot = String(row.requested_delivery_slot || "");
    if (slot) counts.set(slot, (counts.get(slot) || 0) + 1);
  }

  return settings.slots.map(slot => {
    const capacity = settings.slot_capacities[slot] ?? null;
    const reservedCount = counts.get(slot) || 0;
    let available = true;
    let reason: string | null = null;

    if (!settings.scheduling_enabled) {
      available = false;
      reason = "SCHEDULING_DISABLED";
    } else if (requestedScalar < todayScalar || requestedScalar > maxScalar) {
      available = false;
      reason = "DATE_OUT_OF_RANGE";
    } else if (settings.blackout_dates.includes(requestedDate)) {
      available = false;
      reason = "DATE_BLOCKED";
    } else if (!SLOT_PATTERN.test(slot)) {
      available = false;
      reason = "INVALID_DELIVERY_SLOT";
    } else {
      const slotStart = slot.split("-")[0];
      const slotScalar = dateScalar(requestedDate, slotStart);
      if (slotScalar < nowScalar + settings.min_lead_hours * 3600000) {
        available = false;
        reason = "TOO_SOON";
      } else if (capacity !== null && reservedCount >= capacity) {
        available = false;
        reason = "SLOT_FULL";
      }
    }

    return {
      slot,
      available,
      capacity,
      reserved_count: reservedCount,
      reason
    };
  });
}

function validGuestStoragePath(orderId: string | number, pathValue: unknown): string | null {
  const storagePath = normalizeText(pathValue, 1024);
  if (!storagePath) return null;
  const expectedPrefix = `guest/${orderId}/`;
  if (!storagePath.startsWith(expectedPrefix)) return null;
  if (!/^guest\/[1-9]\d+\/[0-9a-f-]{36}\.(?:jpg|png)$/i.test(storagePath)) return null;
  return storagePath;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, 405);

  try {
    const supabaseUrl = requiredEnvironmentVariable("SUPABASE_URL");
    const serviceRoleKey = requiredEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");
    const databaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_JSON", message: "La solicitud no es válida." }, 400);
    }

    const action = body.action;
    const actions: GuestAction[] = [
      "quote",
      "schedule",
      "availability",
      "create",
      "status",
      "manual_upload_url",
      "manual_submit",
      "manual_cleanup"
    ];
    if (!action || !actions.includes(action)) {
      return jsonResponse({ error: "INVALID_ACTION", message: "La operación solicitada no es válida." }, 400);
    }

    const limits: Record<GuestAction, number> = {
      quote: 120,
      schedule: 120,
      availability: 180,
      create: 10,
      status: 180,
      manual_upload_url: 20,
      manual_submit: 20,
      manual_cleanup: 30
    };
    const rateResponse = await enforceRateLimit(databaseClient, serviceRoleKey, request, action, limits[action]);
    if (rateResponse) return rateResponse;

    if (action === "quote") {
      const lat = normalizeCoordinate(body.delivery_lat, -90, 90);
      const lng = normalizeCoordinate(body.delivery_lng, -180, 180);
      if (lat === null || lng === null) {
        return jsonResponse({ error: "INVALID_DELIVERY_COORDINATES", message: "La ubicación seleccionada no es válida." }, 400);
      }
      const { data, error } = await databaseClient.rpc("service_quote_delivery_fee", {
        p_delivery_lat: lat,
        p_delivery_lng: lng
      });
      if (error) {
        console.error("Guest delivery quote failed:", error.message);
        return jsonResponse({ error: "DELIVERY_QUOTE_FAILED", message: "No pudimos calcular el delivery." }, 500);
      }
      const quote = Array.isArray(data) ? data[0] : data;
      return jsonResponse({ quote });
    }

    if (action === "schedule" || action === "availability") {
      const schedule = await readSchedule(databaseClient);
      if (!schedule) {
        return jsonResponse({ error: "DELIVERY_SCHEDULE_UNAVAILABLE", message: "No pudimos consultar la programación de entregas." }, 500);
      }
      if (action === "schedule") {
        return jsonResponse({
          schedule: {
            scheduling_enabled: schedule.scheduling_enabled,
            min_lead_hours: schedule.min_lead_hours,
            max_days_ahead: schedule.max_days_ahead,
            slots: schedule.slots
          }
        });
      }

      const requestedDate = normalizeIsoDate(body.requested_delivery_date);
      if (!requestedDate) {
        return jsonResponse({ error: "INVALID_DELIVERY_DATE", message: "Selecciona una fecha de entrega válida." }, 400);
      }
      const availability = await scheduleAvailability(databaseClient, requestedDate, schedule);
      return jsonResponse({ availability });
    }

    if (action === "create") {
      const items = normalizeItems(body.items);
      const name = normalizeText(body.customer_name, 120);
      const phone = normalizeText(body.customer_phone, 40);
      const address = normalizeText(body.delivery_address, 700);
      const lat = normalizeCoordinate(body.delivery_lat, -90, 90);
      const lng = normalizeCoordinate(body.delivery_lng, -180, 180);
      if (!items || !name || !phone || !address || lat === null || lng === null) {
        return jsonResponse({ error: "INVALID_GUEST_ORDER", message: "Revisa los datos del pedido e inténtalo nuevamente." }, 400);
      }

      const guestToken = randomGuestToken();
      const tokenHash = await sha256Hex(guestToken);
      const { data, error } = await databaseClient.rpc("create_guest_order", {
        p_access_token_hash: tokenHash,
        p_items: items,
        p_customer_name: name,
        p_customer_phone: phone,
        p_delivery_address: address,
        p_delivery_lat: lat,
        p_delivery_lng: lng,
        p_recipient_name: normalizeText(body.recipient_name, 120),
        p_recipient_phone: normalizeText(body.recipient_phone, 40),
        p_gift_message: normalizeText(body.gift_message, 500),
        p_is_surprise: Boolean(body.is_surprise),
        p_requested_delivery_date: normalizeIsoDate(body.requested_delivery_date),
        p_requested_delivery_slot: normalizeText(body.requested_delivery_slot, 32)
      });
      if (error) {
        console.error("Guest order creation failed:", error.message);
        const text = String(error.message || "").toUpperCase();
        const known = [
          "INSUFFICIENT_STOCK",
          "PRODUCT_NOT_AVAILABLE",
          "DELIVERY_OUT_OF_RANGE",
          "DELIVERY_SLOT_TOO_SOON",
          "DELIVERY_SLOT_FULL",
          "DELIVERY_DATE_BLOCKED",
          "INVALID_DELIVERY_SLOT",
          "DELIVERY_SCHEDULING_DISABLED"
        ];
        const code = known.find(value => text.includes(value)) || "GUEST_ORDER_CREATION_FAILED";
        const message = code === "INSUFFICIENT_STOCK"
          ? "No hay stock suficiente para uno de los productos."
          : code === "PRODUCT_NOT_AVAILABLE"
            ? "Uno de los productos ya no está disponible."
            : code === "DELIVERY_OUT_OF_RANGE"
              ? "La ubicación está fuera de la zona de reparto."
              : code.includes("DELIVERY_") || code === "INVALID_DELIVERY_SLOT"
                ? "La fecha o franja de entrega ya no está disponible."
                : "No pudimos crear el pedido.";
        return jsonResponse({ error: code, message }, 409);
      }
      const order = Array.isArray(data) ? data[0] : data;
      return jsonResponse({
        order,
        guest_token: guestToken,
        access_expires_at: order?.access_expires_at
      }, 201);
    }

    const access = await validateGuestAccess(databaseClient, body.order_id, body.guest_token);
    if (!access) {
      return jsonResponse({ error: "GUEST_ACCESS_DENIED", message: "No encontramos acceso válido a este pedido invitado." }, 403);
    }

    if (action === "status") {
      const status = await guestStatus(databaseClient, access);
      return jsonResponse(status);
    }

    if (action === "manual_cleanup") {
      const storagePath = validGuestStoragePath(access.order.id, body.storage_path);
      if (!storagePath) {
        return jsonResponse({ error: "INVALID_STORAGE_PATH", message: "La ruta del comprobante no es válida." }, 400);
      }
      const cleanup = await databaseClient.storage.from(BUCKET).remove([storagePath]);
      if (cleanup.error) {
        return jsonResponse({ error: "PROOF_CLEANUP_FAILED", message: "No pudimos limpiar el archivo temporal." }, 500);
      }
      return jsonResponse({ cleaned: true });
    }

    if (access.order.status !== "pendiente" || access.order.payment_status !== "pending") {
      return jsonResponse({ error: "ORDER_NOT_AVAILABLE_FOR_PAYMENT", message: "Este pedido ya no admite un nuevo comprobante." }, 409);
    }
    if (access.order.payment_provider === "mercadopago" || access.order.payment_preference_id) {
      return jsonResponse({
        error: "ONLINE_PAYMENT_ALREADY_STARTED",
        message: "Ya iniciaste un pago con Mercado Pago. Espera su resultado o continúa desde ese medio de pago."
      }, 409);
    }

    const proof = await latestProof(databaseClient, access.order.id);
    if (proof && ACTIVE_PROOF_STATUSES.has(String(proof.verification_status))) {
      return jsonResponse({ error: "PAYMENT_PROOF_ALREADY_ACTIVE", message: "Ya existe un comprobante activo para este pedido." }, 409);
    }

    if (action === "manual_upload_url") {
      const mimeType = normalizeText(body.mime_type, 40) || "";
      const extension = proofExtension(mimeType);
      if (!extension) {
        return jsonResponse({ error: "INVALID_PROOF_TYPE", message: "El comprobante debe ser JPG, JPEG o PNG." }, 400);
      }
      const path = `guest/${access.order.id}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await databaseClient.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data?.token) {
        console.error("Guest signed upload URL failed:", error?.message);
        return jsonResponse({ error: "SIGNED_UPLOAD_FAILED", message: "No pudimos preparar la subida del comprobante." }, 500);
      }
      return jsonResponse({ path, token: data.token });
    }

    const method = body.payment_method === "yape" || body.payment_method === "transferencia"
      ? String(body.payment_method)
      : null;
    const storagePath = validGuestStoragePath(access.order.id, body.storage_path);
    const operationNumber = normalizeText(body.operation_number, 100);
    if (!method || !storagePath) {
      return jsonResponse({ error: "INVALID_PAYMENT_PROOF", message: "Faltan datos del comprobante." }, 400);
    }

    const expectedPrefix = `guest/${access.order.id}/`;
    const fileName = storagePath.slice(expectedPrefix.length);
    const { data: files, error: listError } = await databaseClient.storage
      .from(BUCKET)
      .list(`guest/${access.order.id}`, { limit: 100, search: fileName });
    if (listError) {
      return jsonResponse({ error: "PROOF_FILE_QUERY_FAILED", message: "No pudimos verificar el archivo subido." }, 500);
    }
    const file = (files || []).find((row: any) => row.name === fileName);
    if (!file) {
      return jsonResponse({ error: "PROOF_FILE_NOT_FOUND", message: "No encontramos el comprobante subido." }, 400);
    }

    const size = Number(file.metadata?.size);
    const mime = String(file.metadata?.mimetype || "").toLowerCase();
    if (!Number.isFinite(size) || size <= 0 || size > MAX_PROOF_SIZE || !["image/jpeg", "image/png"].includes(mime)) {
      await databaseClient.storage.from(BUCKET).remove([storagePath]);
      return jsonResponse({ error: "INVALID_PROOF_FILE", message: "El comprobante debe ser JPG/PNG y no superar 5 MB." }, 400);
    }

    const insert = await databaseClient.from("payment_proofs").insert({
      order_id: access.order.id,
      user_id: null,
      payment_method: method,
      amount: Number(access.order.total),
      storage_path: storagePath,
      operation_number: operationNumber,
      verification_status: "uploaded"
    }).select("id, payment_method, verification_status, uploaded_at, operation_number").single();

    if (insert.error) {
      console.error("Guest payment proof insert failed:", insert.error.message);
      await databaseClient.storage.from(BUCKET).remove([storagePath]);
      return jsonResponse({ error: "PAYMENT_PROOF_INSERT_FAILED", message: "No pudimos registrar el comprobante." }, 500);
    }

    return jsonResponse({ proof: insert.data }, 201);
  } catch (error) {
    console.error("Unexpected guest checkout error:", error instanceof Error ? error.message : "UNKNOWN");
    return jsonResponse({ error: "INTERNAL_SERVER_ERROR", message: "No pudimos completar la operación." }, 500);
  }
});
