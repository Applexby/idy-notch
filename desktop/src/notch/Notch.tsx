import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { on, openSettings, openWeb, setHitRect } from "../lib/native";
import { checkUpdate, updates } from "../lib/update";
import { getSettings, PAGE_LABEL, useSettings, type PageId } from "../lib/settings";
import { focus, FOCUS_LABEL, onFocusDone, remaining, total } from "../lib/focus";
import { addPaths, addText, shelf } from "../lib/shelf";
import { alarm as alarmSound, chime } from "../lib/sound";
import { dueEvents, snoozeReminder, snoozeTask, type AlarmEvent } from "../lib/sync";
import { currentLine } from "../lib/lyrics";
import { BASE_W, placeWindow, type Placement } from "../lib/window";
import { mediaStore, sysStore, usePosition, useSystemHuds } from "./useNative";
import { Ico, PAGE_ICON } from "./icons";
import Llama, { type Mood } from "./Llama";
import MusicPage from "./pages/Music";
import FocusPage from "./pages/Focus";
import ShelfPage from "./pages/Shelf";
import TasksPage from "./pages/Tasks";
import NotesPage from "./pages/Notes";
import RemindersPage from "./pages/Reminders";

interface Hud { id: number; icon: string; color: string; title: string; sub?: string; progress?: number }
type Geo = { w: number; h: number; r: number };

const G = {
  resting: { w: 196, h: 32, r: 15 },
  minimal: { w: 112, h: 5, r: 3 },
  music: { w: 236, h: 32, r: 15 },
  focus: { w: 272, h: 32, r: 15 },
  mascot: { w: 214, h: 32, r: 15 },
  hud: { w: 380, h: 40, r: 20 },
  alarm: { w: 470, h: 132, r: 32 },
  open: { w: 590, h: 210, r: 32 },
} satisfies Record<string, Geo>;
const EAR = 12;

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(t: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return t.length * 7;
  measureCtx.font = "600 13px 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
  return measureCtx.measureText(t).width;
}

export default function Notch() {
  const s = useSettings();
  const sys = sysStore.use();
  const med = mediaStore.use();
  const f = focus.use();
  const sh = shelf.use();
  const pos = usePosition(4);

  const pages = s.pages.length ? s.pages : (["music"] as PageId[]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PageId>(pages[0]);
  const [inputHold, setInputHold] = useState(false);
  const [userHidden, setUserHidden] = useState(false);
  const [huds, setHuds] = useState<Hud[]>([]);
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [place, setPlace] = useState<Placement | null>(null);
  const [hello, setHello] = useState(false);
  const [, tick] = useState(0);

  // ── Ventana ──
  useEffect(() => { placeWindow(s).then(setPlace); }, [s.size, s.monitor]);
  useEffect(() => {
    const u = on("toggle-hidden", () => setUserHidden((v) => !v));
    return () => { u.then((f) => f()); };
  }, []);
  // reloj
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  // ── HUDs ──
  const pushHud = useCallback((h: Omit<Hud, "id">) => setHuds((q) => [...q.slice(-3), { ...h, id: Date.now() + Math.random() }]), []);
  useEffect(() => {
    if (!huds.length) return;
    const t = setTimeout(() => setHuds((q) => q.slice(1)), 3400);
    return () => clearTimeout(t);
  }, [huds]);
  useSystemHuds((kind, d) => {
    if (kind === "bt" && s.hudHeadphones && "name" in d) pushHud({ icon: "headphones", color: "#64d2ff", title: d.name, sub: d.connected ? "Conectado" : "Desconectado" });
    if ((kind === "charging" || kind === "battery") && s.hudCharging && "percent" in d)
      pushHud({ icon: kind === "charging" ? "bolt" : "battery", color: kind === "charging" ? "#30d158" : "#ffd60a",
        title: kind === "charging" ? "Cargando" : "Con batería", sub: `${d.percent}%`, progress: d.percent / 100 });
  });
  useEffect(() => onFocusDone((mode, next) => pushHud({
    icon: "timer", color: "#ff9f0a", title: mode === "focus" ? "¡Buen trabajo!" : "Se acabó el descanso", sub: `Sigue: ${FOCUS_LABEL[next]}`,
  })), [pushHud]);

  // ── Alarmas (recordatorios y tareas) ──
  useEffect(() => {
    const t = setInterval(() => {
      for (const ev of dueEvents()) {
        if (ev.kind === "reminder" && !ev.loud) { chime(); pushHud({ icon: "alarm", color: "#ff9f0a", title: ev.reminder.title, sub: "Recordatorio" }); }
        else if (ev.kind === "task-start") { chime(); pushHud({ icon: "todo", color: "#0a84ff", title: ev.task.title, sub: "Empieza ahora" }); }
        else setAlarms((q) => (q.some((x) => x.key === ev.key) ? q : [...q, ev]));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [pushHud]);
  const current = alarms[0];
  useEffect(() => {
    if (!current) return;
    if (current.kind === "reminder") return alarmSound();
    chime(true);
  }, [current?.key]);
  const dismiss = (snoozeMin?: number) => {
    if (current && snoozeMin) {
      if (current.kind === "reminder") snoozeReminder(current.reminder.id, snoozeMin);
      if (current.kind === "task-end") snoozeTask(current.task, snoozeMin);
    }
    setAlarms((q) => q.slice(1));
  };

  // ── Mascota ──
  const prevIdle = useRef(0);
  useEffect(() => {
    if (prevIdle.current >= 25 && sys.idle < 3 && s.mascot) { setHello(true); setTimeout(() => setHello(false), 2800); }
    prevIdle.current = sys.idle;
  }, [sys.idle, s.mascot]);

  // ── Abrir / cerrar ──
  const closeTimer = useRef<number>();
  const hold = inputHold || sh.dragging || !!current;
  useEffect(() => {
    clearTimeout(closeTimer.current);
    if (sys.hover) {
      if (s.openOn === "hover" && !current) closeTimer.current = window.setTimeout(() => setOpen(true), 90);
    } else if (!inputHold && !sh.dragging) {
      closeTimer.current = window.setTimeout(() => setOpen(false), 320);
    }
  }, [sys.hover, s.openOn, inputHold, sh.dragging, current]);

  // Arrastrar archivos al notch → abre el Estante (los eventos llegan desde Rust)
  useEffect(() => {
    const u1 = on<boolean>("shelf-drag", (v) => {
      if (shelf.get().outgoing) return; // es nuestro propio arrastre hacia fuera
      shelf.set({ dragging: v });
      if (v) { setOpen(true); if (pages.includes("shelf")) setPage("shelf"); }
    });
    const u2 = on<string[]>("shelf-drop", (paths) => {
      if (shelf.get().outgoing) return;
      shelf.set({ dragging: false });
      addPaths(paths);
      setOpen(true);
      if (pages.includes("shelf")) setPage("shelf");
    });
    const u3 = on("open-web", () => openWeb(getSettings().webUrl));
    // Texto arrastrado desde el navegador u otra app → tarjeta de texto
    const u4 = on<string>("shelf-text", (t) => {
      if (shelf.get().outgoing) return;
      shelf.set({ dragging: false });
      addText(t);
      setOpen(true);
      if (pages.includes("shelf")) setPage("shelf");
    });
    return () => { [u1, u2, u3, u4].forEach((u) => u.then((f) => f())); };
  }, [pages.join()]);

  // Buscar actualizaciones al iniciar y cada 6 h
  const upd = updates.use();
  useEffect(() => {
    const t = setTimeout(checkUpdate, 15e3);
    const i = setInterval(checkUpdate, 6 * 3600e3);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);
  const announced = useRef(false);
  useEffect(() => {
    if (upd.status === "available" && !announced.current) {
      announced.current = true;
      pushHud({ icon: "download", color: "#64d2ff", title: `IDY ${upd.version} disponible`, sub: "Ajustes › Acerca de" });
    }
  }, [upd.status]);

  // Cambiar de página con rueda / flechas
  const wheelLock = useRef(0);
  const step = (d: number) => {
    const i = pages.indexOf(page);
    setPage(pages[(i + d + pages.length) % pages.length]);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!open || Date.now() - wheelLock.current < 380) return;
    const target = e.target as HTMLElement;
    if (target.closest(".scroll, .nowheel")) return; // listas con scroll propio
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8) return;
    wheelLock.current = Date.now();
    step(d > 0 ? 1 : -1);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!open || (e.target as HTMLElement).tagName.match(/INPUT|TEXTAREA/)) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // ── ¿Qué muestra el notch cerrado? ──
  const playing = med.m.has_session && med.m.playing;
  const lyricIdx = med.lyrics ? currentLine(med.lyrics, pos) : -1;
  const lyricText = lyricIdx >= 0 ? med.lyrics![lyricIdx].text : "";
  const focusOn = f.running;
  const hidden = userHidden || (s.hideFullscreen && sys.fullscreen && !current);

  // Sobre una ventana maximizada (p. ej. el navegador) el notch se reduce a una barrita
  // para no tapar la barra de direcciones; al pasar el mouse vuelve a crecer.
  const dodge = s.dodgeMaximized && sys.foreground === 1;
  const away = sys.idle >= 25; // sin mouse ni teclado
  type Closed = "lyrics" | "music" | "focus" | "mascot-sleep" | "mascot" | "hello" | "minimal" | "resting";
  const closed: Closed = useMemo(() => {
    // La mascota aparece con inactividad, salvo que haya música o video sonando
    if (s.mascot && !playing && hello && !dodge) return "hello";
    if (s.mascot && !playing && sys.idle >= 180) return "mascot-sleep";
    if (s.mascot && !playing && away) return "mascot";
    // Con la letra activada, la línea se queda visible encima de cualquier programa
    if (playing && s.showLyrics && s.lyricsActive && s.lyricsInClosed && lyricText) return "lyrics";
    if (dodge) return "minimal";
    if (focusOn) return "focus";
    if (playing) return "music";
    if (s.minimal) return "minimal";
    return "resting";
  }, [focusOn, playing, s.showLyrics, s.lyricsActive, s.lyricsInClosed, lyricText, s.mascot, hello, sys.idle, away, s.minimal, dodge]);

  const mode = hidden ? "hidden" : current ? "alarm" : open ? "open" : huds.length ? "hud" : "closed";
  const geo: Geo = mode === "alarm" ? G.alarm : mode === "open" ? G.open : mode === "hud" ? G.hud
    : closed === "lyrics" ? { w: Math.min(560, Math.max(300, textWidth(lyricText) + 118)), h: 32, r: 15 }
    : closed === "music" ? G.music : closed === "focus" ? G.focus : closed === "minimal" ? G.minimal
    : closed.startsWith("mascot") || closed === "hello" ? G.mascot : G.resting;

  // ── Zona interactiva → Rust ──
  const lastGeo = useRef<Geo>(geo);
  useEffect(() => {
    if (!place || sh.outgoing) return;
    const send = (g: Geo, visible: boolean) => {
      const sc = place.scale, d = place.dpr;
      const wCss = (g.w + EAR * 2) * sc;
      const x = place.x + ((BASE_W * sc - wCss) / 2) * d;
      setHitRect({ x, y: place.y, w: visible ? wCss * d : 0, h: Math.max(g.h, 10) * sc * d, hold });
    };
    const grow = geo.w >= lastGeo.current.w && geo.h >= lastGeo.current.h;
    lastGeo.current = geo;
    if (grow || mode === "hidden") { send(geo, mode !== "hidden"); return; }
    // al encoger, espera a que termine la animación para no "perder" el hover
    const t = setTimeout(() => send(geo, true), 420);
    return () => clearTimeout(t);
  }, [place, geo.w, geo.h, hold, mode, sh.outgoing]);

  const lyricsOpen = mode === "open" && page === "music" && s.lyricsActive && s.showLyrics && !!med.lyrics?.length && playing !== undefined;
  const style = {
    "--tint": med.tint ?? "#3a2a1a",
    "--w": `${geo.w}px`, "--h": `${geo.h}px`, "--r": `${geo.r}px`, "--s": place?.scale ?? 1,
    "--dur": dodge && mode === "closed" ? "0.24s" : s.animSpeed === "fast" ? "0.32s" : "0.52s",
  } as React.CSSProperties;

  const now = new Date();
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const hud = huds[0];

  return (
    <div className={`stage mode-${mode} closed-${closed} ${lyricsOpen ? "lyrics-open" : ""}`} style={style} onWheel={onWheel}>
      <div className="notch" onClick={() => mode === "closed" && setOpen(true)}>
        <span className="ear l" /><span className="ear r" />
        <div className="clip">
        {/* ───── Cerrado ───── */}
        {mode === "closed" && (
          <div className="c-wrap" key={closed}>
            {closed === "resting" && <>
              <PowerIcon />
              <span className="c-time mid">{time}</span>
              <span className="c-spacer" /></>}
            {closed === "music" && <>
              {sys.power?.charging ? <span className="c-charge"><Ico n="bolt" s={11} fill /></span> : <Art src={med.art} size={20} />}
              <span className="c-time">{time}</span><Bars on={playing} /></>}
            {closed === "lyrics" && <><Art src={med.art} size={20} /><span className="c-lyric" key={lyricIdx}>{lyricText}</span><Bars on /></>}
            {closed === "focus" && <><Ring p={1 - remaining() / total()} color={f.mode === "focus" ? "#ff9f0a" : "#30d158"} />
              <span className="c-focus" style={{ color: f.mode === "focus" ? "#ff9f0a" : "#30d158" }}>{fmtMs(remaining())}</span></>}
            {(closed === "mascot" || closed === "mascot-sleep" || closed === "hello") && <Mascot mood={closed === "hello" ? "hello" : closed === "mascot" ? "awake" : "sleep"} />}
          </div>
        )}

        {/* ───── HUD breve ───── */}
        {mode === "hud" && hud && (
          <div className="c-wrap hud" key={hud.id}>
            <span className="hud-ico" style={{ color: hud.color }}><Ico n={hud.icon} s={19} w={2} fill={hud.icon === "bolt"} /></span>
            <span className="hud-text"><b>{hud.title}</b>{hud.sub && <small style={{ color: hud.color }}>{hud.sub}</small>}</span>
            {hud.progress !== undefined && <span className="hud-bar"><i style={{ width: `${hud.progress * 100}%`, background: hud.color }} /></span>}
          </div>
        )}

        {/* ───── Alarma ───── */}
        {mode === "alarm" && current && (
          <div className="alarm" key={current.key}>
            <div className="alarm-ico"><Ico n={current.kind === "reminder" ? "alarm" : "todo"} s={26} w={2.1} /></div>
            <div className="alarm-main">
              <small>{current.kind === "reminder" ? "Recordatorio" : "¡Se acabó el tiempo!"}</small>
              <strong>{current.kind === "reminder" ? current.reminder.title : current.task.title}</strong>
              <div className="alarm-btns">
                <button className="nb" onClick={() => dismiss(s.snoozeMin)}><Ico n="snooze" s={15} /> {s.snoozeMin} min</button>
                <button className="nb primary" onClick={() => dismiss()}>{current.kind === "reminder" ? "Detener" : "Listo"}</button>
              </div>
            </div>
            {alarms.length > 1 && <span className="alarm-more">+{alarms.length - 1}</span>}
          </div>
        )}

        {/* ───── Abierto ───── */}
        {mode === "open" && (
          <div className="open" onFocusCapture={(e) => (e.target as HTMLElement).tagName.match(/INPUT|TEXTAREA/) && setInputHold(true)}
            onBlurCapture={() => setInputHold(false)}>
            <div className="page" key={page}>
              {page === "music" && <MusicPage pos={pos} onPage={step} />}
              {page === "focus" && <FocusPage />}
              {page === "shelf" && <ShelfPage />}
              {page === "tasks" && <TasksPage />}
              {page === "notes" && <NotesPage />}
              {page === "reminders" && <RemindersPage />}
            </div>
            <nav className={`dots ${s.pageIcons ? "with-icons" : ""}`}>
              {pages.map((p) => (
                <button key={p} className={p === page ? "on" : ""} onClick={() => setPage(p)} title={PAGE_LABEL[p]} aria-label={PAGE_LABEL[p]}>
                  <i /><span className="dot-ico"><Ico n={PAGE_ICON[p]} s={14} /></span>
                </button>
              ))}
              <button className={`gear ${upd.status === "available" ? "has-update" : ""}`} onClick={() => openSettings(upd.status === "available" ? "about" : undefined)}
                title={upd.status === "available" ? `Actualizar a ${upd.version}` : "Ajustes"} aria-label="Ajustes"><Ico n="gear" s={14} /></button>
            </nav>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export function fmtMs(ms: number) {
  const t = Math.round(ms / 1000), m = Math.floor(t / 60), sec = t % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function Art({ src, size }: { src: string | null; size: number }) {
  return src ? <img className="art" src={src} width={size} height={size} alt="" draggable={false} />
    : <span className="art empty" style={{ width: size, height: size }}><Ico n="music" s={size * 0.55} /></span>;
}

export function Bars({ on }: { on: boolean }) {
  return <span className={`bars ${on ? "on" : ""}`}><i /><i /><i /><i /></span>;
}

function PowerIcon() {
  const { power } = sysStore.use();
  if (!power?.has_battery) return <span className="c-spacer" />;
  if (power.charging) return <span className="c-charge"><Ico n="bolt" s={11} fill /></span>;
  const c = power.percent <= 20 ? "#ff453a" : power.percent <= 40 ? "#ffd60a" : "#f5f5f7";
  return <span className="c-batt" title={`${power.percent}%`}><i style={{ width: `${power.percent}%`, background: c }} /></span>;
}

function Ring({ p, color }: { p: number; color: string }) {
  const r = 8, c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r={r} stroke="#333" strokeWidth="2.6" fill="none" />
      <circle cx="10" cy="10" r={r} stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 10 10)" />
    </svg>
  );
}

function Mascot({ mood }: { mood: Mood }) {
  return <Llama mood={mood} />;
}
