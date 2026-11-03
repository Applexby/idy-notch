import { useEffect, useRef, useState } from "react";
import { IS_TAURI, on, type Bt, type MediaState, type Power } from "../lib/native";
import { createStore } from "../lib/store";
import { fetchLyrics, type LyricLine } from "../lib/lyrics";
import { getSettings } from "../lib/settings";

const EMPTY: MediaState = { has_session: false, title: "", artist: "", album: "", app: "", playing: false, position_ms: 0, duration_ms: 0 };

export const mediaStore = createStore<{ m: MediaState; at: number; art: string | null; lyrics: LyricLine[] | null; tint: string | null }>({
  m: EMPTY, at: Date.now(), art: null, lyrics: null, tint: null,
});

/** Color predominante (y con algo de saturación) de la carátula */
function dominantColor(src: string): Promise<string | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 24;
        const x = c.getContext("2d")!; x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = mx ? (mx - mn) / mx : 0, lum = mx / 255;
          const wt = 0.15 + sat * 1.5 * (lum > 0.12 && lum < 0.95 ? 1 : 0.2);
          r += R * wt; g += G * wt; b += B * wt; w += wt;
        }
        res(w ? `rgb(${Math.round(r / w)}, ${Math.round(g / w)}, ${Math.round(b / w)})` : null);
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

let lastKey = "";
on<MediaState>("media", (m) => {
  mediaStore.set({ m, at: Date.now() });
  const key = `${m.title}|${m.artist}`;
  if (m.title && key !== lastKey) {
    lastKey = key;
    mediaStore.set({ lyrics: null });
    if (getSettings().showLyrics && (IS_TAURI || !location.search.includes("mock"))) fetchLyrics(m.title, m.artist, m.album, m.duration_ms).then((l) => {
      if (lastKey === key) mediaStore.set({ lyrics: l });
    });
  }
});
on<string | null>("media-art", (art) => {
  mediaStore.set({ art });
  if (art) dominantColor(art).then((tint) => mediaStore.get().art === art && mediaStore.set({ tint }));
  else mediaStore.set({ tint: null });
});

/** Posición interpolada entre actualizaciones (en ms) */
export function usePosition(fps = 4) {
  const { m, at } = mediaStore.use();
  const [, force] = useState(0);
  useEffect(() => {
    if (!m.playing) return;
    const t = setInterval(() => force((x) => x + 1), 1000 / fps);
    return () => clearInterval(t);
  }, [m.playing, fps]);
  const pos = m.playing ? m.position_ms + (Date.now() - at) : m.position_ms;
  return m.duration_ms ? Math.min(pos, m.duration_ms) : pos;
}

export const sysStore = createStore<{ power: Power | null; idle: number; fullscreen: boolean; foreground: number; hover: boolean }>({
  power: null, idle: 0, fullscreen: false, foreground: 0, hover: false,
});
on<number>("foreground", (foreground) => sysStore.set({ foreground }));
on<number>("idle", (idle) => sysStore.set({ idle }));
on<boolean>("fullscreen", (fullscreen) => sysStore.set({ fullscreen }));
on<boolean>("hover", (hover) => sysStore.set({ hover }));
on<Power>("power", (power) => sysStore.set({ power }));

/** Llama a cb con cada cambio de batería / auriculares (para HUDs) */
export function useSystemHuds(cb: (kind: "charging" | "battery" | "bt", data: Power | Bt) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let prev: Power | null = null;
    const u1 = on<Power>("power", (p) => {
      if (prev && p.has_battery && p.charging !== prev.charging) ref.current(p.charging ? "charging" : "battery", p);
      prev = p;
    });
    const u2 = on<Bt>("bluetooth", (b) => ref.current("bt", b));
    return () => { u1.then((f) => f()); u2.then((f) => f()); };
  }, []);
}
