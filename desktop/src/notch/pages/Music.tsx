import { useEffect, useRef, useState } from "react";
import { getVolume, media, setVolume } from "../../lib/native";
import { currentLine } from "../../lib/lyrics";
import { setSettings, useSettings } from "../../lib/settings";
import { mediaStore, sysStore } from "../useNative";
import { Art, Bars, fmtMs } from "../Notch";
import { Ico } from "../icons";

const pad2 = (ms: number) => { const t = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

/** Barra de progreso que se puede arrastrar para adelantar */
function Seek({ pos, dur, big }: { pos: number; dur: number; big?: boolean }) {
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const at = (x: number) => { const r = ref.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * dur; };
  const shown = drag ?? pos;
  const pct = dur ? (shown / dur) * 100 : 0;
  return (
    <div className={`seek ${big ? "big" : ""} ${drag !== null ? "dragging" : ""}`}>
      <span className="tm">{pad2(shown)}</span>
      <div className="seek-track" ref={ref}
        onPointerDown={(e) => { if (!dur) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e.clientX)); }}
        onPointerMove={(e) => drag !== null && setDrag(at(e.clientX))}
        onPointerUp={(e) => { if (drag === null) return; media("seek", Math.round(at(e.clientX))); setTimeout(() => setDrag(null), 600); }}>
        <div className="seek-rail"><i style={{ width: `${pct}%` }} /></div>
        <span className="seek-knob" style={{ left: `${pct}%` }} />
      </div>
      <span className="tm">-{pad2(Math.max(0, dur - shown))}</span>
    </div>
  );
}

/** Volumen del sistema: pasa el mouse sobre el altavoz y desliza (o usa la rueda) */
function VolumeCtl() {
  const [v, setV] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const dragging = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const read = () => !dragging.current && getVolume().then((x) => x && setV(x.muted ? 0 : x.level));
    read();
    const t = setInterval(read, 2000);
    return () => clearInterval(t);
  }, []);
  const apply = (x: number) => { const n = Math.min(1, Math.max(0, x)); setV(n); setVolume(n); };
  const fromX = (cx: number) => { const r = ref.current!.getBoundingClientRect(); apply((cx - r.left) / r.width); };
  const icon = v === null || v > 0.5 ? "vol-hi" : v > 0 ? "vol-lo" : "vol-off";
  return (
    <div className={`vol nowheel ${open ? "show" : ""}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => !dragging.current && setOpen(false)}
      onWheel={(e) => apply((v ?? 0.5) + (e.deltaY < 0 ? 0.05 : -0.05))}>
      <div className="vol-track" ref={ref}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromX(e.clientX); }}
        onPointerMove={(e) => dragging.current && fromX(e.clientX)}
        onPointerUp={() => { dragging.current = false; }}>
        <div className="seek-rail"><i style={{ width: `${(v ?? 0) * 100}%` }} /></div>
      </div>
      <button className="nb icon ghost" onClick={() => apply(v ? 0 : 0.5)} aria-label="Volumen" title={v !== null ? `${Math.round(v * 100)}%` : "Volumen"}>
        <Ico n={icon} s={18} />
      </button>
    </div>
  );
}

export default function MusicPage({ pos, onPage }: { pos: number; onPage: (d: number) => void }) {
  const { m, art, lyrics } = mediaStore.use();
  const sys = sysStore.use();
  const s = useSettings();
  const listRef = useRef<HTMLDivElement>(null);
  const idx = lyrics ? currentLine(lyrics, pos) : -1;
  const hasLyrics = s.showLyrics && !!lyrics?.length;
  const split = s.lyricsActive && hasLyrics;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(".on");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [idx, split]);

  const now = new Date();
  const header = (
    <div className="m-header">
      {sys.power?.charging && <span className="c-charge sm"><Ico n="bolt" s={9} fill /></span>}
      <span className="m-date">{now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
      <b>{now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</b>
    </div>
  );
  const arrows = <>
    <button className="side-arrow l" onClick={() => onPage(-1)} aria-label="Página anterior"><Ico n="left" s={13} w={2.6} /></button>
    <button className="side-arrow r" onClick={() => onPage(1)} aria-label="Página siguiente"><Ico n="right" s={13} w={2.6} /></button>
  </>;

  if (!m.has_session || !m.title) {
    return (
      <div className="music2 empty-m">
        {header}{arrows}
        <div className="pg-empty">
          <span className="pg-empty-ico" style={{ color: "#ff375f" }}><Ico n="music" s={24} /></span>
          <strong>Nada sonando</strong>
          <small>Pon música en Spotify, Apple Music o YouTube y aparecerá aquí.</small>
        </div>
      </div>
    );
  }

  const subtitle = [m.artist, m.album].filter(Boolean).join(" - ");
  const lyricBtn = s.showLyrics && (
    <button className={`nb icon ghost ${s.lyricsActive ? "lit" : ""}`} disabled={!hasLyrics && !s.lyricsActive}
      onClick={() => setSettings({ lyricsActive: !s.lyricsActive })}
      title={s.lyricsActive ? "Ocultar letra" : hasLyrics ? "Mostrar letra" : "Sin letra sincronizada"}><Ico n="lyrics" s={18} /></button>
  );
  const transport = <>
    <button className="nb icon ghost" onClick={() => media("prev")} aria-label="Anterior"><Ico n="rew" s={20} fill /></button>
    <button className="nb icon ghost big-play" onClick={() => media("toggle")} aria-label={m.playing ? "Pausa" : "Reproducir"}><Ico n={m.playing ? "pause" : "play"} s={24} fill /></button>
    <button className="nb icon ghost" onClick={() => media("next")} aria-label="Siguiente"><Ico n="ffw" s={20} fill /></button>
  </>;

  if (split) {
    return (
      <div className="music2 split">
        <div className="sp-left">
          <div className="sp-head">
            <Art src={art} size={58} />
            <div className="m-titles"><strong title={m.title}>{m.title}</strong><small title={subtitle}>{subtitle}</small></div>
          </div>
          <Seek pos={pos} dur={m.duration_ms} />
          <div className="m-ctl compact">{lyricBtn}{transport}</div>
        </div>
        <div className="sp-right lyrics scroll" ref={listRef}>
          {lyrics!.map((l, i) => (
            <p key={i} className={i === idx ? "on" : i < idx ? "past" : ""} onClick={() => media("seek", l.t)}>{l.text || "♪"}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="music2">
      {header}{arrows}
      <span className="m-bars"><Bars on={m.playing} /></span>
      <div className="m-top">
        <Art src={art} size={76} />
        <div className="m-titles"><strong title={m.title}>{m.title}</strong><small title={subtitle}>{subtitle}</small></div>
      </div>
      <Seek pos={pos} dur={m.duration_ms} big />
      <div className="m-ctl">
        <div className="m-ctl-l">{lyricBtn}</div>
        <div className="m-ctl-c">{transport}</div>
        <div className="m-ctl-r"><VolumeCtl /></div>
      </div>
    </div>
  );
}

export { fmtMs };
