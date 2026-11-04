import { useRef, useState } from "react";
import type { Repeat } from "@shared/types";
import { COLORS, REPEAT_LABEL } from "@shared/types";
import { fmtWhen, relTime } from "@shared/time";
import { addReminder, deleteReminder, useSync } from "../../lib/sync";
import { Ico } from "../icons";
import { Gate } from "./Gate";

const QUICK: [string, () => Date][] = [
  ["10 min", () => new Date(Date.now() + 10 * 60e3)],
  ["30 min", () => new Date(Date.now() + 30 * 60e3)],
  ["1 h", () => new Date(Date.now() + 60 * 60e3)],
  ["Mañana 9:00", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }],
];
const REPEATS: Repeat[] = ["none", "daily", "weekdays", "weekly"];
const SHORT: Record<string, string> = { none: "1 vez", daily: "Diario", weekdays: "L–V", weekly: "Semanal" };
const pad = (n: number) => String(n).padStart(2, "0");

function dayLabel(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const name = offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : d.toLocaleDateString("es", { weekday: "long" });
  return { name: name[0].toUpperCase() + name.slice(1), date: d.toLocaleDateString("es", { day: "numeric", month: "short" }) };
}

export default function RemindersPage() {
  const { reminders } = useSync();
  const [t, setT] = useState("");
  const [loud, setLoud] = useState(true);
  const [custom, setCustom] = useState(false);
  const soon = new Date(Date.now() + 60 * 60e3);
  const [day, setDay] = useState(0);
  const [h, setH] = useState(soon.getHours());
  const [m, setM] = useState(soon.getMinutes());
  const [rep, setRep] = useState<Repeat>("none");

  const upcoming = reminders.filter((r) => !r.done && r.next_fire_at).slice(0, 6);
  const target = (() => { const d = new Date(); d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0); return d; })();
  const past = target.getTime() <= Date.now();

  const add = (at: Date, repeat: Repeat = "none") => {
    if (!t.trim()) return;
    addReminder(t.trim(), at, { repeat, alarm: loud });
    setT(""); setCustom(false); setRep("none");
  };

  const wheel = (set: (f: (v: number) => number) => void, max: number, step: number) => (e: React.WheelEvent) =>
    set((v) => (v + (e.deltaY > 0 ? -step : step) + max) % max);
  const dl = dayLabel(day);

  return (
    <Gate color="#ff9f0a" icon="alarm">
      <div className="rem">
        <div className="rem-add">
          <div className="rem-title">
            <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Recuérdame…"
              onKeyDown={(e) => e.key === "Enter" && custom && !past && add(target, rep)} />
            <button className={`nb small ${loud ? "lit-o" : "ghost"}`} onClick={() => setLoud(!loud)} title={loud ? "Sonará como alarma en el notch" : "Solo aviso con campanita"}>
              <Ico n={loud ? "alarm" : "bell"} s={13} /> {loud ? "Alarma" : "Aviso"}
            </button>
          </div>
          <div className="chips">
            {QUICK.map(([l, f]) => <button key={l} className="chip" disabled={!t.trim()} onClick={() => add(f())}>{l}</button>)}
            <button className={`chip ${custom ? "on" : ""}`} onClick={() => setCustom(!custom)}><Ico n="clock" s={12} /> Elegir hora</button>
          </div>
        </div>

        {custom ? (
          <div className="picker nowheel">
            <div className="pk-day">
              <button className="nb icon tiny ghost" disabled={day === 0} onClick={() => setDay(day - 1)} aria-label="Día anterior"><Ico n="left" s={13} /></button>
              <div><b>{dl.name}</b><small>{dl.date}</small></div>
              <button className="nb icon tiny ghost" disabled={day >= 30} onClick={() => setDay(day + 1)} aria-label="Día siguiente"><Ico n="right" s={13} /></button>
            </div>
            <div className="pk-time">
              <Spin value={h} max={23} set={setH} onWheel={wheel(setH, 24, 1)} label="Hora" />
              <span className="pk-colon">:</span>
              <Spin value={m} max={59} set={setM} onWheel={wheel(setM, 60, 1)} label="Minutos" />
            </div>
            <div className="pk-side">
              <div className="chips tight">
                {REPEATS.map((r) => <button key={r} title={REPEAT_LABEL[r]} className={`chip ${rep === r ? "on" : ""}`} onClick={() => setRep(r)}>{SHORT[r]}</button>)}
              </div>
              <button className="nb primary go" disabled={!t.trim() || past} onClick={() => add(target, rep)}>
                {past ? "Esa hora ya pasó" : !t.trim() ? "Escribe qué recordar" : `Programar · ${relTime(target.toISOString())}`}
              </button>
            </div>
          </div>
        ) : (
          <ul className="rlist scroll">
            {upcoming.length === 0 && <li className="muted pad">Sin recordatorios pendientes</li>}
            {upcoming.map((r) => (
              <li key={r.id}>
                <i className="rdot" style={{ background: COLORS[r.color] ?? COLORS.orange }} />
                <span className="r-title">{r.title}</span>
                <span className="r-when" title={relTime(r.next_fire_at)}>{fmtWhen(r.next_fire_at)}</span>
                {r.repeat !== "none" && <Ico n="reset" s={12} />}
                {r.group_id && <Ico n="users" s={13} />}
                <button className="nb icon tiny ghost" onClick={() => deleteReminder(r.id)} aria-label="Borrar"><Ico n="x" s={12} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Gate>
  );
}

/** Número de 2 dígitos: rueda, flechas (mantener pulsado repite) o escribir directo */
function Spin({ value, max, set, onWheel, label }: {
  value: number; max: number; set: (f: (v: number) => number) => void; onWheel: (e: React.WheelEvent) => void; label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const rep = useRef<number>();
  const bump = (d: number) => set((v) => (v + d + max + 1) % (max + 1));
  const hold = (d: number) => {
    bump(d);
    let delay = 380;
    const go = () => { bump(d); delay = Math.max(45, delay * 0.8); rep.current = window.setTimeout(go, delay); };
    rep.current = window.setTimeout(go, delay);
  };
  const stop = () => clearTimeout(rep.current);
  const commit = () => {
    if (draft !== null && draft !== "") set(() => Math.min(max, Math.max(0, parseInt(draft, 10) || 0)));
    setDraft(null);
  };
  return (
    <div className="spin" onWheel={onWheel}>
      <button onPointerDown={() => hold(1)} onPointerUp={stop} onPointerLeave={stop} aria-label={`Subir ${label}`}><Ico n="up" s={14} /></button>
      <input className="spin-in" inputMode="numeric" aria-label={label} value={draft ?? pad(value)} maxLength={2}
        onFocus={(e) => { setDraft(""); e.currentTarget.select(); }}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 2); setDraft(v); if (v.length === 2) { set(() => Math.min(max, parseInt(v, 10))); } }}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp") { e.preventDefault(); bump(1); } if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); } }} />
      <button onPointerDown={() => hold(-1)} onPointerUp={stop} onPointerLeave={stop} aria-label={`Bajar ${label}`}><Ico n="down" s={14} /></button>
    </div>
  );
}
