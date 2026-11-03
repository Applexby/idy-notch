// Coloca la ventana transparente del notch arriba al centro del monitor elegido.
import { IS_TAURI } from "./native";
import type { Settings } from "./settings";

export const BASE_W = 720;
export const BASE_H = 300;

export interface Placement { x: number; y: number; dpr: number; scale: number; W: number; H: number }

export function scaleFor(s: Settings, logicalWidth: number) {
  if (s.size === "auto") return logicalWidth >= 2200 ? 1.15 : 1;
  return s.size / 100;
}

export async function placeWindow(s: Settings): Promise<Placement> {
  if (!IS_TAURI) {
    const scale = scaleFor(s, window.screen.width);
    return { x: 0, y: 0, dpr: window.devicePixelRatio, scale, W: BASE_W * scale, H: BASE_H * scale };
  }
  const { getCurrentWindow, availableMonitors, primaryMonitor } = await import("@tauri-apps/api/window");
  const { LogicalSize, PhysicalPosition } = await import("@tauri-apps/api/dpi");
  const mons = await availableMonitors();
  const m = mons.find((x) => x.name === s.monitor) ?? (await primaryMonitor()) ?? mons[0];
  const win = getCurrentWindow();
  const dpr = m.scaleFactor;
  const scale = scaleFor(s, m.size.width / dpr);
  const W = Math.round(BASE_W * scale), H = Math.round(BASE_H * scale);
  const pos = () => new PhysicalPosition(Math.round(m.position.x + (m.size.width - W * dpr) / 2), m.position.y);
  // posición → tamaño → posición: así el tamaño lógico usa el DPI del monitor destino
  await win.setPosition(pos());
  await win.setSize(new LogicalSize(W, H));
  await win.setPosition(pos());
  await win.show();
  const p = pos();
  return { x: p.x, y: p.y, dpr, scale, W, H };
}

export async function listMonitors() {
  if (!IS_TAURI) return [{ name: "Pantalla 1", width: 1920, height: 1080, primary: true }];
  const { availableMonitors, primaryMonitor } = await import("@tauri-apps/api/window");
  const [mons, prim] = await Promise.all([availableMonitors(), primaryMonitor()]);
  return mons.map((m) => ({
    name: m.name ?? "", width: Math.round(m.size.width), height: Math.round(m.size.height), primary: m.name === prim?.name,
  }));
}
