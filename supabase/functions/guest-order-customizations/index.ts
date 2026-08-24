import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function normalizeOrderId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

function normalizeToken(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{43}$/.test(normalized) ? normalized : null;
}

function normalizeCustomizations(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 30) return null;
  for (const [key, raw] of entries) {
    if (!/^[1-9]\d*$/.test(key) || typeof raw !== "string") return null;
    const selection = raw.trim();
    if (!selection || selection.length > 120) return null;
    result[key] = selection;
  }
  return result;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVICE_CONFIGURATION_ERROR" }, 503);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const orderId = normalizeOrderId(body?.order_id);
    const guestToken = normalizeToken(body?.guest_token);
    const customizations = normalizeCustomizations(body?.customizations);
    if (!orderId || !guestToken || !customizations) {
      return json({ error: "INVALID_CUSTOMIZATION_REQUEST", message: "Revisa la selección del complemento." }, 400);
    }

    const database = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const tokenHash = await sha256Hex(guestToken);

    const access = await database
      .from("guest_order_access")
      .select("order_id")
      .eq("order_id", orderId)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (access.error || !access.data) {
      return json({ error: "GUEST_ACCESS_DENIED", message: "No pudimos validar el acceso a este pedido." }, 403);
    }

    const { error } = await database.rpc("service_set_guest_order_customizations", {
      p_order_id: orderId,
      p_customizations: customizations
    });

    if (error) {
      const code = String(error.message || "");
      const message = code.includes("PRODUCT_CUSTOMIZATION_REQUIRED")
        ? "Elige el mensaje del topper antes de continuar."
        : code.includes("INVALID_PRODUCT_CUSTOMIZATION")
          ? "La opción elegida ya no está disponible."
          : "No pudimos guardar la personalización del complemento.";
      return json({ error: "CUSTOMIZATION_REJECTED", message }, 409);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("guest-order-customizations:", error);
    return json({ error: "UNEXPECTED_ERROR", message: "No pudimos guardar la personalización." }, 500);
  }
});
