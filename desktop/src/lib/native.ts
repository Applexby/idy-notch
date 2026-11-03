// Puente con Rust/Tauri. En un navegador normal (para diseñar) usa simulaciones.
import type { UnlistenFn } from "@tauri-apps/api/event";

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface MediaState {
  has_session: boolean; title: string; artist: string; album: string; app: string;
  playing: boolean; position_ms: number; duration_ms: number;
}
export interface Power { has_battery: boolean; charging: boolean; percent: number }
export interface Bt { name: string; connected: boolean }
export interface HitRect { x: number; y: number; w: number; h: number; hold: boolean }

type Handler<T> = (payload: T) => void;
const mockBus = new Map<string, Set<Handler<unknown>>>();

export async function on<T>(event: string, cb: Handler<T>): Promise<UnlistenFn> {
  if (IS_TAURI) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<T>(event, (e) => cb(e.payload));
  }
  const set = mockBus.get(event) ?? new Set();
  set.add(cb as Handler<unknown>);
  mockBus.set(event, set);
  return () => set.delete(cb as Handler<unknown>);
}

/** Solo para el modo navegador: dispara un evento simulado */
export function mockEmit(event: string, payload: unknown) {
  mockBus.get(event)?.forEach((f) => f(payload));
}

export async function invoke<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!IS_TAURI) { console.debug("[mock invoke]", cmd, args); return undefined; }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const media = (action: "toggle" | "next" | "prev" | "seek", position_ms?: number) =>
  invoke("media_command", { action, positionMs: position_ms ?? null }).catch(() => {});
export const setHitRect = (rect: HitRect) => invoke("set_hit_rect", { rect }).catch(() => {});
export const openSettings = (page?: string) => invoke("open_settings", { page: page ?? null });
export const quitApp = () => invoke("quit_app");

export async function openPath(p: string) {
  if (!IS_TAURI) return;
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(p).catch(console.error);
}

export async function startFileDrag(paths: string[]) {
  if (!IS_TAURI) return;
  const [{ startDrag }, { resolveResource }] = await Promise.all([
    import("@crabnebula/tauri-plugin-drag"), import("@tauri-apps/api/path"),
  ]);
  const icon = await resolveResource("resources/drag.png");
  await startDrag({ item: paths, icon }).catch(console.error);
}

export async function fileSrc(path: string) {
  if (!IS_TAURI) return "";
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

export async function autostart() {
  if (!IS_TAURI) return { enabled: async () => false, set: async (_v: boolean) => {} };
  const m = await import("@tauri-apps/plugin-autostart");
  return { enabled: () => m.isEnabled(), set: (v: boolean) => (v ? m.enable() : m.disable()) };
}

export async function openUrl(url: string) {
  if (!IS_TAURI) { window.open(url, "_blank"); return; }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url).catch(console.error);
}
