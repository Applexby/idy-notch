// Datos sincronizados con Supabase (recordatorios, tareas, notas) + planificador
// local de alarmas para que suenen al segundo exacto en el notch.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Note, Reminder, Repeat, Task } from "@shared/types";
import { supabase } from "./supa";
import { getSettings, local } from "./settings";

export interface SyncState {
  session: Session | null;
  ready: boolean;
  reminders: Reminder[];
  tasks: Task[];
  notes: Note[];
}

let state: SyncState = { session: null, ready: false, reminders: [], tasks: [], notes: [] };
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const useSync = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export const getSync = () => state;

async function loadAll() {
  if (!state.session) return set({ reminders: [], tasks: [], notes: [], ready: true });
  const since = new Date(Date.now() - 864e5).toISOString();
  const [r, t, n] = await Promise.all([
    supabase.from("reminders").select("*").or(`done.eq.false,last_fired_at.gte.${since}`).order("next_fire_at", { nullsFirst: false }),
    supabase.from("tasks").select("*").or(`done.eq.false,completed_at.gte.${since}`).order("due_at", { nullsFirst: false }).order("position"),
    supabase.from("notes").select("*").eq("archived", false).order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(20),
  ]);
  set({ reminders: (r.data ?? []) as Reminder[], tasks: (t.data ?? []) as Task[], notes: (n.data ?? []) as Note[], ready: true });
}

let channel: ReturnType<typeof supabase.channel> | null = null;
let reloadTimer: number | undefined;
const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = window.setTimeout(loadAll, 250); };

export async function startSync() {
  const { data } = await supabase.auth.getSession();
  set({ session: data.session });
  supabase.auth.onAuthStateChange((_e, s) => {
    const changed = s?.user.id !== state.session?.user.id;
    set({ session: s });
    if (changed) { subscribe(); loadAll(); }
  });
  subscribe();
  await loadAll();
  // Respaldo por si Realtime se corta (suspensión del PC, red)
  setInterval(loadAll, 5 * 60e3);
  window.addEventListener("online", loadAll);
  // La sesión se inicia en la ventana de Ajustes: recógela aquí
  window.addEventListener("storage", (e) => { if (e.key === "idy-auth") supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user.id !== state.session?.user.id) { set({ session: data.session }); subscribe(); loadAll(); }
  }); });
}

function subscribe() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  if (!state.session) return;
  channel = supabase.channel("idy-desktop")
    .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, scheduleReload)
    .subscribe();
}

// ───────── Acciones ─────────
const patch = <K extends "reminders" | "tasks" | "notes">(k: K, id: string, p: Partial<SyncState[K][number]> | null) =>
  set({ [k]: p === null ? (state[k] as { id: string }[]).filter((x) => x.id !== id) : (state[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...p } : x)) } as Partial<SyncState>);

export async function addTask(title: string) {
  await supabase.from("tasks").insert({ title });
  scheduleReload();
}
export async function toggleTask(t: Task) {
  const p = { done: !t.done, completed_at: !t.done ? new Date().toISOString() : null };
  patch("tasks", t.id, p);
  await supabase.from("tasks").update(p).eq("id", t.id);
}
export async function addNote(body: string) {
  const [first, ...rest] = body.trim().split("\n");
  const payload = rest.length ? { title: first.slice(0, 120), body: rest.join("\n") } : { title: "", body: first };
  await supabase.from("notes").insert(payload);
  scheduleReload();
}
export async function addReminder(title: string, at: Date, opts: { repeat?: Repeat; alarm?: boolean } = {}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Lima";
  await supabase.from("reminders").insert({ title, fire_at: at.toISOString(), timezone, repeat: opts.repeat ?? "none", alarm: opts.alarm ?? true });
  scheduleReload();
}
export async function deleteTask(id: string) {
  patch("tasks", id, null);
  await supabase.from("tasks").delete().eq("id", id);
}
export async function clearDoneTasks() {
  const ids = state.tasks.filter((t) => t.done).map((t) => t.id);
  if (!ids.length) return;
  set({ tasks: state.tasks.filter((t) => !t.done) });
  await supabase.from("tasks").delete().in("id", ids);
}
export async function updateNote(id: string, p: Partial<Note>) {
  patch("notes", id, p);
  await supabase.from("notes").update(p).eq("id", id);
}
export async function deleteNote(id: string) {
  patch("notes", id, null);
  await supabase.from("notes").delete().eq("id", id);
}
export async function deleteReminder(id: string) {
  patch("reminders", id, null);
  await supabase.from("reminders").delete().eq("id", id);
}
export async function snoozeReminder(id: string, min: number) {
  const fire_at = new Date(Date.now() + min * 60e3).toISOString();
  patch("reminders", id, { fire_at, next_fire_at: fire_at, done: false });
  await supabase.from("reminders").update({ fire_at, done: false }).eq("id", id);
}
export async function snoozeTask(t: Task, min: number) {
  // mueve el fin de la tarea: extiende la duración
  const dur = (t.duration_min ?? 0) + min;
  patch("tasks", t.id, { duration_min: dur });
  await supabase.from("tasks").update({ duration_min: dur }).eq("id", t.id);
}

// ───────── Planificador de alarmas ─────────
export type AlarmEvent =
  | { kind: "reminder"; key: string; reminder: Reminder; loud: boolean }
  | { kind: "task-start"; key: string; task: Task }
  | { kind: "task-end"; key: string; task: Task };

const FIRED_KEY = "idy-fired";
let fired: Record<string, number> = local.get(FIRED_KEY, {});

function markFired(key: string) {
  fired[key] = Date.now();
  // poda: conserva 3 días
  const cut = Date.now() - 3 * 864e5;
  fired = Object.fromEntries(Object.entries(fired).filter(([, v]) => v > cut));
  local.set(FIRED_KEY, fired);
}

/** Devuelve los eventos que tocan ahora y aún no se mostraron. Llamar cada segundo. */
export function dueEvents(now = Date.now()): AlarmEvent[] {
  const out: AlarmEvent[] = [];
  const GRACE = 3 * 60e3; // si el PC estaba dormido, no suena algo de hace más de 3 min
  for (const r of state.reminders) {
    // candidato: la próxima ocurrencia ya vencida, o la que el servidor acaba de marcar como disparada
    for (const iso of [r.next_fire_at, r.last_fired_at]) {
      if (!iso) continue;
      const t = new Date(iso).getTime();
      if (t > now || now - t > GRACE) continue;
      if (iso === r.next_fire_at && r.done) continue;
      const key = `r:${r.id}:${t}`;
      if (fired[key]) continue;
      markFired(key);
      out.push({ kind: "reminder", key, reminder: r, loud: r.alarm });
    }
  }
  const s = getSettings();
  for (const t of state.tasks) {
    if (t.done || !t.due_at) continue;
    const start = new Date(t.due_at).getTime();
    if (s.todoRemindStart && start <= now && now - start < GRACE) {
      const key = `ts:${t.id}:${start}`;
      if (!fired[key]) { markFired(key); out.push({ kind: "task-start", key, task: t }); }
    }
    if (s.todoRemindEnd && t.duration_min) {
      const end = start + t.duration_min * 60e3;
      if (end <= now && now - end < GRACE) {
        const key = `te:${t.id}:${end}`;
        if (!fired[key]) { markFired(key); out.push({ kind: "task-end", key, task: t }); }
      }
    }
  }
  return out;
}

/** Solo para el modo navegador de diseño */
export const __mockSync = (p: Partial<SyncState>) => set(p);
