// La llama pg_cron cada minuto. Dispara los recordatorios vencidos por Web Push.
import { admin, json, secrets, sendToUsers, setupVapid } from "../_shared/push.ts";

Deno.serve(async (req) => {
  const db = admin();
  const s = await secrets(db);
  if (req.headers.get("x-cron-secret") !== s.cron_secret) return json({ error: "unauthorized" }, 401);
  setupVapid(s);

  const { data: due, error } = await db.rpc("claim_due_reminders");
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const r of due ?? []) {
    const body = [r.group_name ? `👥 ${r.group_name}` : null, r.notes].filter(Boolean).join(" · ") || "Recordatorio";
    results.push(await sendToUsers(db, r.user_ids, {
      title: `⏰ ${r.title}`,
      body,
      tag: `reminder-${r.reminder_id}`,
      url: "/?tab=reminders",
      data: { reminder_id: r.reminder_id },
    }));
  }
  return json({ fired: due?.length ?? 0, results });
});
