// Solo en navegador (npm run dev): simula Windows para diseñar el notch sin compilar.
// Abre http://localhost:1420/?mock=music y prueba: resting, music, lyrics, focus, mascot, sleep, hud, alarm, open
import { mockEmit } from "../lib/native";
import { focus, start } from "../lib/focus";
import { mediaStore, sysStore } from "./useNative";
import { shelf } from "../lib/shelf";
import { __mockSync } from "../lib/sync";

const ART = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff9f0a'/><stop offset='1' stop-color='#ff375f'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/><circle cx='70' cy='34' r='14' fill='#ffe6a8'/><path d='M0 78 Q30 58 55 72 T100 66 V100 H0Z' fill='#3b0f2e'/></svg>`);

const song = { has_session: true, title: "Luz de Agosto", artist: "Paper Sky", album: "Costa", app: "Spotify.exe", playing: true, position_ms: 73000, duration_ms: 193000 };

export function installMock() {
  const scenario = new URLSearchParams(location.search).get("mock") ?? "resting";
  const w = window as unknown as Record<string, unknown>;
  w.__mock = run;
  run(scenario);

  function run(sc: string) {
    if (["music", "lyrics", "open", "open-lyrics"].includes(sc)) {
      mockEmit("media", song);
      mediaStore.set({ art: ART });
      if (sc !== "music") setTimeout(() => mediaStore.set({ lyrics: [
        { t: 60000, text: "doblamos la luz del verano" }, { t: 66000, text: "en pájaros de papel" },
        { t: 72000, text: "y los soltamos al cielo" }, { t: 78000, text: "para encontrarte junto al mar" },
        { t: 84000, text: "cada ala una pequeña canción" }, { t: 90000, text: "que nos lleva" },
      ] }), 300);
    }
    const uid = "u1", now = Date.now(), iso = (m: number) => new Date(now + m * 60e3).toISOString();
    __mockSync({ ready: true, session: { user: { id: uid } } as never,
      tasks: [
        { id: "t1", owner_id: uid, group_id: null, title: "Editar video Privateacher", notes: null, due_at: iso(90), duration_min: 60, priority: 2, color: "blue", done: false, completed_at: null, position: 1, created_at: "", updated_at: "" },
        { id: "t2", owner_id: uid, group_id: null, title: "Responder a Dina", notes: null, due_at: null, duration_min: null, priority: 0, color: "pink", done: false, completed_at: null, position: 2, created_at: "", updated_at: "" },
        { id: "t3", owner_id: uid, group_id: "g", title: "Reservar cancha", notes: null, due_at: iso(-20), duration_min: null, priority: 1, color: "green", done: false, completed_at: null, position: 3, created_at: "", updated_at: "" },
        { id: "t4", owner_id: uid, group_id: null, title: "Publicar parrilla semanal", notes: null, due_at: null, duration_min: null, priority: 0, color: "blue", done: true, completed_at: iso(-5), position: 4, created_at: "", updated_at: "" },
      ],
      reminders: [
        { id: "r1", owner_id: uid, group_id: null, title: "Llamar a la imprenta", notes: null, fire_at: sc === "alarm" ? iso(-0.05) : iso(25), next_fire_at: sc === "alarm" ? iso(-0.05) : iso(25), repeat: "none", timezone: "America/Lima", alarm: true, color: "orange", last_fired_at: null, done: false, created_at: "", updated_at: "" },
        { id: "r2", owner_id: uid, group_id: "g", title: "Fútbol de los jueves", notes: null, fire_at: iso(1500), next_fire_at: iso(1500), repeat: "weekly", timezone: "America/Lima", alarm: true, color: "green", last_fired_at: null, done: false, created_at: "", updated_at: "" },
      ],
      notes: [
        { id: "n1", owner_id: uid, group_id: null, title: "Idea reel", body: "Plano cenital del casco girando", checklist: [], color: "yellow", pinned: true, archived: false, created_at: "", updated_at: iso(-30) },
        { id: "n2", owner_id: uid, group_id: null, title: "Compras", body: "", checklist: [{ id: "a", text: "Carbón", done: true }, { id: "b", text: "Hielo", done: false }], color: "green", pinned: false, archived: false, created_at: "", updated_at: iso(-200) },
      ] });
    if (sc === "focus") { focus.set({ remainingMs: 18 * 60e3 + 42e3 }); start(); }
    if (sc === "mascot") sysStore.set({ idle: 40 });
    if (sc === "dodge") sysStore.set({ foreground: 1 });
    if (sc === "lyrics" || sc === "open-lyrics") localStorage.setItem("idy-settings", JSON.stringify({ lyricsActive: true }));
    if (sc === "sleep") sysStore.set({ idle: 400 });
    if (sc === "hello") { sysStore.set({ idle: 40 }); setTimeout(() => sysStore.set({ idle: 0 }), 400); }
    if (sc === "hud") setTimeout(() => mockEmit("bluetooth", { name: "AirBuds Pro", connected: true }), 50);
    if (sc === "charging") { mockEmit("power", { has_battery: true, charging: false, percent: 70 }); setTimeout(() => mockEmit("power", { has_battery: true, charging: true, percent: 70 }), 50); }
    if (sc.startsWith("open")) sysStore.set({ hover: true });
    if (sc === "shelf") {
      shelf.set({ items: [
        { path: "C:/x/playa.jpg", name: "playa.jpg", ext: "jpg", addedAt: 1 }, { path: "C:/x/Contrato MotoFacil.pdf", name: "Contrato MotoFacil.pdf", ext: "pdf", addedAt: 1 },
        { path: "C:/x/Brief", name: "Brief", ext: "carpeta", addedAt: 1 }, { path: "C:/x/reel_final_v3.mp4", name: "reel_final_v3.mp4", ext: "mp4", addedAt: 1 },
        { path: "C:/x/cotizacion.xlsx", name: "cotizacion.xlsx", ext: "xlsx", addedAt: 1 },
      ] });
      sysStore.set({ hover: true });
    }
  }
}
