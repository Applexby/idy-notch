// Envía una notificación de prueba al usuario que la pide.
import { admin, cors, json, secrets, sendToUsers, setupVapid } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);
  setupVapid(await secrets(db));
  const r = await sendToUsers(db, [user.id], {
    title: "🔔 IDY funciona",
    body: "Así te llegarán los recordatorios.",
    tag: "test",
    url: "/",
  });
  return json(r);
});
