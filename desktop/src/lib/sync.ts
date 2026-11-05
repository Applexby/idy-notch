// Datos sincronizados con Supabase (recordatorios, tareas, notas) + planificador
// local de alarmas para que suenen al segundo exacto en el notch.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Note, Reminder, Repeat, Task } from "@shared/types";
import { supabase } from "./supa";
import { getSettings, local } from "./settings";
import { cache, createOffline, newId, type Table } from "@shared/offline";
import type { Parsed } from "@shared/parse";

export interface SyncState {
  session: Session | null;
  ready: boolean;
  online: boolean;
  pending: number; // cambios guardados que aún no se subieron
  reminders: Reminder[];
  tasks: Task[];
  notes: Note[];
}

const CACHE_KEY = "idy-cache";
type Snapshot = { reminders: Reminder[]; tasks: Task[]; notes: Note[]; uid?: string };
// Lo que vino del servidor (sin los cambios pendientes encima)
let server: Snapshot = cache.get<Snapshot>(CACHE_KEY) ?? { reminders: [], tasks: [], notes: [] };

let state: SyncState = { session: null, ready: false, online: navigator.onLine, pending: 0, reminders: [], tasks: [], notes: [] };
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const useSync = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export const getSync = () => state;

const byNext = (a: Reminder, b: Reminder) => (a.next_fire_at ?? "9").localeCompare(b.next_fire_at ?? "9");
const byDue = (a: Task, b: Task) => Number(a.done) - Number(b.done) || (a.due_at ?? "9").localeCompare(b.due_at ?? "9") || a.position - b.position;
const byNote = (a: Note, b: Note) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at);

/** Muestra lo del servidor + los cambios pendientes */
function render() {
  set({
    reminders: offline.overlay("reminders", server.reminders).sort(byNext),
    tasks: offline.overlay("tasks", server.tasks).sort(byDue),
    notes: offline.overlay("notes", server.notes).sort(byNote).slice(0, 20),
    pending: offline.pending(),
  });
}
const offline = createOffline(supabase, "idy-outbox", () => render());

async function loadAll() {
  if (!state.session) return set({ reminders: [], tasks: [], notes: [], ready: true });
  await offline.flush(); // primero sube lo pendiente
  const since = new Date(Date.now() - 864e5).toISOString();
  try {
    const [r, t, n] = await Promise.all([
      supabase.from("reminders").select("*").or(`done.eq.false,last_fired_at.gte.${since}`),
      supabase.from("tasks").select("*").or(`done.eq.false,completed_at.gte.${since}`),
      supabase.from("notes").select("*").eq("archived", false).order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(30),
    ]);
    if (r.error || t.error || n.error) throw r.error ?? t.error ?? n.error;
    server = { reminders: r.data as Reminder[], tasks: t.data as Task[], notes: n.data as Note[], uid: state.session.user.id };
    cache.set(CACHE_KEY, server);
    set({ online: true });
  } catch {
    set({ online: false }); // sin red: seguimos con la caché
  }
  render();
  set({ ready: true });
}

let channel: ReturnType<typeof supabase.channel> | null = null;
let reloadTimer: number | undefined;
const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = window.setTimeout(loadAll, 250); };

export async function startSync() {
  const { data } = await supabase.auth.getSession();
  set({ session: data.session });
  // Abre al instante con lo guardado (aunque no haya internet)
  if (data.session && server.uid === data.session.user.id) { render(); set({ ready: true }); }
  supabase.auth.onAuthStateChange((_e, s) => {
    const changed = s?.user.id !== state.session?.user.id;
    set({ session: s });
    if (changed) {
      if (!s) { server = { reminders: [], tasks: [], notes: [] }; cache.set(CACHE_KEY, server); offline.clear(); }
      subscribe(); loadAll();
    }
  });
  subscribe();
  await loadAll();
  // Respaldo por si Realtime se corta (suspensión del PC, red)
  setInterval(loadAll, 5 * 60e3);
  window.addEventListener("online", () => { set({ online: true }); loadAll(); });
  window.addEventListener("offline", () => set({ online: false }));
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

// ───────── Acciones (funcionan sin internet) ─────────
const uid = () => state.session?.user.id ?? "";
const nowIso = () => new Date().toISOString();
const upd = (table: Table, id: string, data: Record<string, unknown>) => offline.push({ table, kind: "update", id, data });
const del = (table: Table, id: string) => offline.push({ table, kind: "delete", id });

export function addTask(title: string, due?: Date | null) {
  const id = newId();
  const data = { title, due_at: due ? due.toISOString() : null };
  const row: Task = { id, owner_id: uid(), group_id: null, title, notes: null, due_at: data.due_at, duration_min: null, priority: 0, color: "blue",
    done: false, completed_at: null, position: Date.now() / 1000, created_at: nowIso(), updated_at: nowIso() };
  offline.push({ table: "tasks", kind: "insert", id, data, row: row as unknown as Record<string, unknown> });
}
export function toggleTask(t: Task) {
  upd("tasks", t.id, { done: !t.done, completed_at: !t.done ? nowIso() : null });
}
export function addNote(body: string) {
  const [first, ...rest] = body.trim().split("\n");
  const data = rest.length ? { title: first.slice(0, 120), body: rest.join("\n") } : { title: "", body: first };
  const id = newId();
  const row: Note = { id, owner_id: uid(), group_id: null, ...data, checklist: [], color: "default", pinned: false, archived: false, created_at: nowIso(), updated_at: nowIso() };
  offline.push({ table: "notes", kind: "insert", id, data, row: row as unknown as Record<string, unknown> });
}
export function addReminder(title: string, at: Date, opts: { repeat?: Repeat; alarm?: boolean } = {}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Lima";
  const id = newId();
  const data = { title, fire_at: at.toISOString(), timezone, repeat: opts.repeat ?? "none", alarm: opts.alarm ?? true };
  const row: Reminder = { id, owner_id: uid(), group_id: null, notes: null, next_fire_at: data.fire_at, color: "orange", last_fired_at: null, done: false,
    created_at: nowIso(), updated_at: nowIso(), ...data };
  offline.push({ table: "reminders", kind: "insert", id, data, row: row as unknown as Record<string, unknown> });
}
export function deleteTask(id: string) { del("tasks", id); }
export function clearDoneTasks() { state.tasks.filter((t) => t.done).forEach((t) => del("tasks", t.id)); }
export function updateNote(id: string, p: Partial<Note>) { upd("notes", id, { ...p, updated_at: nowIso() }); }
export function deleteNote(id: string) { del("notes", id); }
export function deleteReminder(id: string) { del("reminders", id); }
export function snoozeReminder(id: string, min: number) {
  const fire_at = new Date(Date.now() + min * 60e3).toISOString();
  upd("reminders", id, { fire_at, next_fire_at: fire_at, done: false });
}
export function snoozeTask(t: Task, min: number) {
  upd("tasks", t.id, { duration_min: (t.duration_min ?? 0) + min }); // extiende la duración
}

/** Crea lo que diga una frase ("mañana a las 11 llamar a cliente") */
export function createFromPhrase(p: Parsed, defaultLoud = true) {
  if (p.kind === "note") addNote(p.title);
  else if (p.kind === "task") addTask(p.title, p.at);
  else addReminder(p.title, p.at ?? new Date(Date.now() + 36e5), { repeat: p.repeat, alarm: p.loud ?? defaultLoud });
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
