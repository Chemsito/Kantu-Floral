import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

const MAX_BODY_BYTES = 24_000;

function jsonResponse(body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extra,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "edge-unknown";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "PAYLOAD_TOO_LARGE", message: "El formulario es demasiado grande." }, 413);
  }

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_JSON", message: "No pudimos leer el formulario." }, 400);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ error: "INVALID_PAYLOAD", message: "El formulario no es válido." }, 400);
    }

    let userId: string | null = null;
    const token = bearerToken(request);
    if (token) {
      const { data } = await serviceClient.auth.getUser(token);
      userId = data?.user?.id || null;
    }

    const fingerprint = await sha256Hex(`${serviceRoleKey}|kantu-claims|${clientIp(request)}`);
    const { data, error } = await serviceClient.rpc("service_submit_customer_claim", {
      p_payload: payload,
      p_fingerprint_hash: fingerprint,
      p_user_id: userId
    });

    if (error) {
      const text = String(error.message || "").toUpperCase();
      if (text.includes("RATE_LIMITED")) {
        return jsonResponse({ error: "RATE_LIMITED", message: "Has enviado varios formularios en poco tiempo. Inténtalo más tarde." }, 429);
      }
      if (text.includes("CHECK CONSTRAINT") || text.includes("INVALID_CLAIM") || text.includes("NOT-NULL")) {
        return jsonResponse({ error: "INVALID_CLAIM", message: "Revisa los campos obligatorios e inténtalo nuevamente." }, 400);
      }
      console.error("Claim submission failed:", error.message);
      return jsonResponse({ error: "CLAIM_SUBMISSION_FAILED", message: "No pudimos registrar tu solicitud. Inténtalo nuevamente." }, 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.claim_number) {
      return jsonResponse({ error: "INVALID_CLAIM_RESULT", message: "No pudimos confirmar el registro." }, 500);
    }

    return jsonResponse({
      ok: true,
      claim_id: row.claim_id,
      claim_number: row.claim_number,
      message: "Tu registro fue recibido correctamente."
    }, 201);
  } catch (error) {
    console.error("Unexpected claim error:", error instanceof Error ? error.message : "UNKNOWN");
    return jsonResponse({ error: "INTERNAL_SERVER_ERROR", message: "No pudimos registrar tu solicitud." }, 500);
  }
});
