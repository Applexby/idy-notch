// Registro con usuario + contraseña + código de invitación (sin correo).
import { admin, cors, json, secrets } from "../_shared/push.ts";

export const EMAIL_DOMAIN = "users.idynotch.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: { username?: string; password?: string; invite_code?: string; display_name?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!/^[a-z0-9_.]{3,24}$/.test(username)) return json({ error: "El usuario debe tener 3–24 letras, números, punto o guion bajo." }, 400);
  if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);

  const db = admin();
  const s = await secrets(db);
  if ((body.invite_code ?? "").trim().toUpperCase() !== s.invite_code.toUpperCase()) {
    return json({ error: "Código de invitación incorrecto." }, 403);
  }

  const { error } = await db.auth.admin.createUser({
    email: `${username}@${EMAIL_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: body.display_name?.trim() || username },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return json({ error: taken ? "Ese usuario ya existe." : error.message }, taken ? 409 : 400);
  }
  return json({ ok: true });
});
