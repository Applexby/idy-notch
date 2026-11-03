// Temporizador de enfoque (Pomodoro)
import { chime } from "./sound";
import { getSettings, local } from "./settings";
import { createStore } from "./store";

export type FocusMode = "focus" | "short" | "long";
export const FOCUS_LABEL: Record<FocusMode, string> = { focus: "Enfoque", short: "Descanso corto", long: "Descanso largo" };

interface FocusState { mode: FocusMode; running: boolean; endsAt: number | null; remainingMs: number; sessions: number; day: string }

const today = () => new Date().toDateString();
const minutesFor = (m: FocusMode) => { const s = getSettings(); return m === "focus" ? s.focusMin : m === "short" ? s.shortMin : s.longMin; };

const saved = local.get<FocusState | null>("idy-focus", null);
export const focus = createStore<FocusState>(saved && saved.day === today() ? saved : {
  mode: "focus", running: false, endsAt: null, remainingMs: minutesFor("focus") * 60e3, sessions: 0, day: today(),
});
focus.subscribe(() => local.set("idy-focus", focus.get()));

type DoneCb = (mode: FocusMode, next: FocusMode) => void;
let onDone: DoneCb = () => {};
export const onFocusDone = (cb: DoneCb) => { onDone = cb; };

export const remaining = () => { const f = focus.get(); return f.running && f.endsAt ? Math.max(0, f.endsAt - Date.now()) : f.remainingMs; };
export const total = () => minutesFor(focus.get().mode) * 60e3;

export function start() { const f = focus.get(); focus.set({ running: true, endsAt: Date.now() + f.remainingMs }); }
export function pause() { focus.set({ running: false, remainingMs: remaining(), endsAt: null }); }
export function reset(mode = focus.get().mode) { focus.set({ mode, running: false, endsAt: null, remainingMs: minutesFor(mode) * 60e3 }); }
export const toggle = () => (focus.get().running ? pause() : start());

setInterval(() => {
  const f = focus.get();
  if (f.day !== today()) focus.set({ day: today(), sessions: 0 });
  if (!f.running || !f.endsAt || Date.now() < f.endsAt) return;
  const sessions = f.mode === "focus" ? f.sessions + 1 : f.sessions;
  const next: FocusMode = f.mode === "focus" ? (sessions % 4 === 0 ? "long" : "short") : "focus";
  focus.set({ sessions });
  reset(next);
  chime();
  onDone(f.mode, next);
  if (getSettings().autoBreak) start();
}, 500);
