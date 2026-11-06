import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    if (request.headers.get("x-webhook-secret") !== requireEnv("PUSH_WEBHOOK_SECRET")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const service = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: feature } = await service.from("app_features")
      .select("enabled,config").eq("key", "aprobacion_online").maybeSingle();
    const reminderDays = Number(feature?.config?.reminder_days) || 0;
    const maxReminders = Number(feature?.config?.max_reminders) || 3;
    if (!feature?.enabled || reminderDays <= 0) return new Response("recordatorios desactivados");

    const { data: pending, error } = await service.from("presupuesto_aprobaciones")
      .select("id,token,presupuestoid,email,telefono,baseurl,createdat,ultimorecordatorio,recordatorios_enviados")
      .eq("estado", "pendiente")
      .eq("recordatorios_activos", true)
      .gt("expiresat", new Date().toISOString())
      .lt("recordatorios_enviados", maxReminders);
    if (error) throw error;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    let emailed = 0;
    let notifiedAdmin = 0;

    for (const item of pending || []) {
      const reference = new Date(item.ultimorecordatorio || item.createdat).getTime();
      if (Date.now() - reference < reminderDays * DAY_MS - 60 * 60 * 1000) continue;

      const { data: presupuesto } = await service.from("presupuestos")
        .select("id,clientenombre,total,estado").eq("id", item.presupuestoid).maybeSingle();
      if (!presupuesto || !["borrador", "enviado"].includes(String(presupuesto.estado || "").toLowerCase())) continue;

      const link = item.baseurl ? `${item.baseurl.split("#")[0]}#${item.token}` : "";
      let delivered = false;
      if (item.email && resendKey && from && link) {
        const total = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(presupuesto.total) || 0);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [item.email],
            subject: `Recordatorio: presupuesto ${presupuesto.id} pendiente de aprobación`,
            html: `<p>Hola ${escapeHtml(presupuesto.clientenombre || "")},</p>
              <p>Le recordamos que tiene pendiente de respuesta el presupuesto <strong>${escapeHtml(String(presupuesto.id))}</strong> por un total de ${escapeHtml(total)}.</p>
              <p><a href="${escapeHtml(link)}">Revisar y aprobar el presupuesto</a></p>`,
          }),
        });
        delivered = response.ok;
        if (!response.ok) console.error("[recordatorios] Resend:", await response.text());
      }

      // Sin email o sin Resend (p. ej. cliente solo por WhatsApp): se avisa a administración para reenviar a mano.
      if (!delivered) {
        const push = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": requireEnv("PUSH_WEBHOOK_SECRET") },
          body: JSON.stringify({
            kind: "presupuesto_recordatorio",
            presupuesto: presupuesto.id,
            cliente: presupuesto.clientenombre || "",
          }),
        });
        if (push.ok) notifiedAdmin++;
      } else {
        emailed++;
      }

      await service.from("presupuesto_aprobaciones").update({
        recordatorios_enviados: (item.recordatorios_enviados || 0) + 1,
        ultimorecordatorio: new Date().toISOString(),
      }).eq("id", item.id);
    }

    return new Response(`emails ${emailed}, avisos a administración ${notifiedAdmin}`);
  } catch (err) {
    console.error(err);
    return new Response("Error", { status: 500 });
  }
});
