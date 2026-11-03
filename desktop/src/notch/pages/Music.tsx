import { useEffect, useRef } from "react";
import { media } from "../../lib/native";
import { currentLine } from "../../lib/lyrics";
import { setSettings, useSettings } from "../../lib/settings";
import { mediaStore } from "../useNative";
import { Art, fmtMs } from "../Notch";
import { Ico } from "../icons";

function appName(aumid: string) {
  const a = aumid.toLowerCase();
  if (a.includes("spotify")) return "Spotify";
  if (a.includes("applemusic") || a.includes("apple")) return "Apple Music";
  if (a.includes("chrome")) return "Chrome";
  if (a.includes("msedge") || a.includes("edge")) return "Edge";
  if (a.includes("firefox")) return "Firefox";
  if (a.includes("zune") || a.includes("media")) return "Reproductor";
  return aumid.split(/[!\\.]/)[0] || "";
}

export default function MusicPage({ pos }: { pos: number }) {
  const { m, art, lyrics } = mediaStore.use();
  const s = useSettings();
  const listRef = useRef<HTMLDivElement>(null);
  const idx = lyrics ? currentLine(lyrics, pos) : -1;
  const split = s.lyricsActive;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(".on");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [idx, split]);

  if (!m.has_session || !m.title) {
    return (
      <div className="pg-empty">
        <span className="pg-empty-ico" style={{ color: "#ff375f" }}><Ico n="music" s={26} /></span>
        <strong>Nada sonando</strong>
        <small>Pon música en Spotify, Apple Music o YouTube y aparecerá aquí.</small>
      </div>
    );
  }

  const pct = m.duration_ms ? (pos / m.duration_ms) * 100 : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!m.duration_ms) return;
    const r = e.currentTarget.getBoundingClientRect();
    media("seek", Math.round(((e.clientX - r.left) / r.width) * m.duration_ms));
  };
  const hasLyrics = s.showLyrics && !!lyrics?.length;

  return (
    <div className={`music ${split && hasLyrics ? "split" : ""}`}>
      <div className="music-art">
        <Art src={art} size={split && hasLyrics ? 64 : 104} />
      </div>
      <div className="music-main">
        <div className="music-head">
          <div className="music-titles">
            <strong title={m.title}>{m.title}</strong>
            <small>{[m.artist, appName(m.app)].filter(Boolean).join(" · ")}</small>
          </div>
          {s.showLyrics && (
            <button className={`nb icon ${split ? "lit" : ""}`} disabled={!hasLyrics && !split} onClick={() => setSettings({ lyricsActive: !split })}
              title={split ? "Ocultar letra" : hasLyrics ? "Mostrar letra" : "Sin letra sincronizada"}><Ico n="quote" s={16} /></button>
          )}
        </div>
        <div className="progress" onClick={seek}>
          <div className="track"><i style={{ width: `${pct}%` }} /></div>
          <div className="times"><span>{fmtMs(pos)}</span><span>-{fmtMs(Math.max(0, m.duration_ms - pos))}</span></div>
        </div>
        <div className="controls">
          <button className="nb icon ghost" onClick={() => media("prev")} aria-label="Anterior"><Ico n="prev" s={20} fill /></button>
          <button className="nb icon play" onClick={() => media("toggle")} aria-label={m.playing ? "Pausa" : "Reproducir"}>
            <Ico n={m.playing ? "pause" : "play"} s={22} fill /></button>
          <button className="nb icon ghost" onClick={() => media("next")} aria-label="Siguiente"><Ico n="next" s={20} fill /></button>
        </div>
      </div>
      {split && hasLyrics && (
        <div className="lyrics scroll" ref={listRef}>
          {lyrics!.map((l, i) => (
            <p key={i} className={i === idx ? "on" : i < idx ? "past" : ""} onClick={() => media("seek", l.t)}>{l.text || "♪"}</p>
          ))}
        </div>
      )}
    </div>
  );
}
