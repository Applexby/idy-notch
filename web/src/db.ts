// Escrituras que funcionan sin conexión: se ven al instante y se suben cuando hay internet.
import { createOffline, newId, type Table } from "@shared/offline";
import { supabase } from "./supabase";

const listeners = new Set<() => void>();
export const offline = createOffline(supabase, "idy-web-outbox", () => listeners.forEach((f) => f()));
export const onLocalChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

let uid = "";
supabase.auth.getSession().then(({ data }) => { uid = data.session?.user.id ?? ""; });
supabase.auth.onAuthStateChange((_e, s) => { if ((s?.user.id ?? "") !== uid && !s) offline.clear(); uid = s?.user.id ?? ""; });

const now = () => new Date().toISOString();
const DEFAULTS: Record<Table, Record<string, unknown>> = {
  reminders: { notes: null, repeat: "none", timezone: "America/Lima", alarm: true, color: "orange", last_fired_at: null, done: false, group_id: null },
  tasks: { notes: null, due_at: null, duration_min: null, priority: 0, color: "blue", done: false, completed_at: null, group_id: null },
  notes: { title: "", body: "", checklist: [], color: "default", pinned: false, archived: false, group_id: null },
};

export function insert(table: Table, data: Record<string, unknown>) {
  const id = newId();
  const extra: Record<string, unknown> = table === "reminders" ? { next_fire_at: data.fire_at } : table === "tasks" ? { position: Date.now() / 1000 } : {};
  const row = { ...DEFAULTS[table], ...extra, ...data, id, owner_id: uid, created_at: now(), updated_at: now() };
  offline.push({ table, kind: "insert", id, data, row });
  return { error: null as null | { message: string } };
}
export function update(table: Table, id: string, data: Record<string, unknown>) {
  const local = table === "reminders" && "fire_at" in data ? { ...data, next_fire_at: data.fire_at } : data;
  offline.push({ table, kind: "update", id, data: { ...local, updated_at: now() } });
  return { error: null as null | { message: string } };
}
export function remove(table: Table, id: string) {
  offline.push({ table, kind: "delete", id });
}
