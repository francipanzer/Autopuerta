import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar el secreto ${name} en Supabase.`);
  return value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Método no permitido." });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Solicitud JSON no válida." });
  }

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse(401, { error: "Debes iniciar sesión." });

  try {
    const service = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse(401, { error: "Sesión no válida." });

    const { data: profile, error: profileError } = await service
      .from("user_profiles")
      .select("is_active")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_active) return jsonResponse(403, { error: "La cuenta no está activa." });

    const path = String(body.path || "");
    const prefix = `${authData.user.id}/`;
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/") || path.includes("..")) {
      return jsonResponse(400, { error: "Ruta de archivo no válida." });
    }

    const requestedName = String(body.filename || "revision.pdf");
    const filename = requestedName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "revision.pdf";
    const { data: signed, error: signedError } = await service.storage
      .from("revision-pdfs")
      .createSignedUrl(path, 7 * 24 * 60 * 60, { download: filename });
    if (signedError) throw signedError;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return jsonResponse(200, { url: signed.signedUrl, emailSent: false });

    const to = Deno.env.get("REVISION_NOTIFICATION_EMAIL") || "franmerino78@gmail.com";
    const from = requireEnv("RESEND_FROM_EMAIL");
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Revisión completada: ${filename}`,
        html: `<p>Se ha completado una revisión.</p><p><a href="${escapeHtml(signed.signedUrl)}">Descargar ${escapeHtml(filename)}</a></p><p>Este enlace caduca en 7 días.</p>`,
      }),
    });
    if (!emailResponse.ok) {
      const details = await emailResponse.text();
      console.error("[share-revision] Error de Resend:", details);
      return jsonResponse(200, { url: signed.signedUrl, emailSent: false, emailError: true });
    }

    return jsonResponse(200, { url: signed.signedUrl, emailSent: true });
  } catch (error) {
    console.error("[share-revision]", error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : "No se pudo compartir la revisión." });
  }
});