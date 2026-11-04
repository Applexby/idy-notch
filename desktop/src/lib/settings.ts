import { useSyncExternalStore } from "react";

export type PageId = "music" | "focus" | "shelf" | "tasks" | "notes" | "reminders";

export interface Settings {
  size: "auto" | 100 | 115 | 130 | 150;
  minimal: boolean;
  mascot: boolean;
  sounds: boolean;
  hideFullscreen: boolean;
  dodgeMaximized: boolean;
  monitor: string | null; // nombre del monitor; null = principal
  openOn: "hover" | "click";
  pageIcons: boolean;
  animSpeed: "normal" | "fast";
  showLyrics: boolean;
  lyricsActive: boolean; // el botón de letra en la página de Música
  lyricsInClosed: boolean;
  todoRemindStart: boolean;
  todoRemindEnd: boolean;
  snoozeMin: 5 | 10 | 15;
  focusMin: number;
  shortMin: number;
  longMin: number;
  autoBreak: boolean;
  shelfStartEmpty: boolean;
  hudCharging: boolean;
  hudHeadphones: boolean;
  alarmLoop: boolean;
  volume: number; // 0..1
  pages: PageId[];
  webUrl: string;
}

export const DEFAULTS: Settings = {
  size: "auto", minimal: false, mascot: true, sounds: true, hideFullscreen: true, dodgeMaximized: true, monitor: null,
  openOn: "hover", pageIcons: true, animSpeed: "normal",
  showLyrics: true, lyricsActive: false, lyricsInClosed: true,
  todoRemindStart: true, todoRemindEnd: true, snoozeMin: 10,
  focusMin: 25, shortMin: 5, longMin: 15, autoBreak: false,
  shelfStartEmpty: false, hudCharging: true, hudHeadphones: true,
  alarmLoop: true, volume: 0.7,
  pages: ["music", "focus", "shelf", "tasks", "notes", "reminders"],
  webUrl: "https://web-mauve-five-n7g1wnmllz.vercel.app",
};

export const PAGE_LABEL: Record<PageId, string> = {
  music: "Música", focus: "Enfoque", shelf: "Estante", tasks: "To-do", notes: "Notas", reminders: "Recordatorios",
};

const KEY = "idy-settings";
let cache: Settings = load();
const subs = new Set<() => void>();

const OLD_WEB = ["https://idy-notch.vercel.app", ""];
function load(): Settings {
  try {
    const s = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Settings>) };
    // La dirección vieja por defecto ya no existe: pásala a la web real
    if (OLD_WEB.includes(s.webUrl.replace(/\/$/, ""))) s.webUrl = DEFAULTS.webUrl;
    return s;
  } catch { return { ...DEFAULTS }; }
}

export function getSettings() { return cache; }

export function setSettings(patch: Partial<Settings>) {
  cache = { ...cache, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* */ }
  subs.forEach((f) => f());
}

// Otra ventana (ajustes ↔ notch) cambió algo
window.addEventListener("storage", (e) => {
  if (e.key === KEY) { cache = load(); subs.forEach((f) => f()); }
});

export function useSettings(): Settings {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cache);
}

/** Almacenamiento local simple con JSON */
export const local = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};
