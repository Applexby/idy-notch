// Utilidades compartidas: cliente admin + envío Web Push
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function secrets(db: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await db.from("app_secrets").select("key,value");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

let vapidReady = false;
export function setupVapid(s: Record<string, string>) {
  if (vapidReady) return;
  webpush.setVapidDetails(s.vapid_subject, s.vapid_public, s.vapid_private);
  vapidReady = true;
}

export type PushPayload = { title: string; body?: string; tag?: string; url?: string; data?: Record<string, unknown> };

/** Envía a todas las suscripciones de los usuarios y limpia las caducadas. */
export async function sendToUsers(db: SupabaseClient, userIds: string[], payload: PushPayload) {
  const { data: subs, error } = await db.from("push_subscriptions").select("*").in("user_id", userIds);
  if (error) throw error;
  let sent = 0;
  const dead: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      else console.error("push error", code, (e as Error).message);
    }
  }));
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length, total: subs?.length ?? 0 };
}
