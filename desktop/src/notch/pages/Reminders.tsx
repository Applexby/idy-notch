import { useState } from "react";
import { COLORS } from "@shared/types";
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

export default function RemindersPage() {
  const { reminders } = useSync();
  const [t, setT] = useState("");
  const [custom, setCustom] = useState("");
  const upcoming = reminders.filter((r) => !r.done && r.next_fire_at).slice(0, 6);
  const add = (at: Date) => { if (!t.trim()) return; addReminder(t.trim(), at); setT(""); setCustom(""); };

  return (
    <Gate color="#ff9f0a" icon="alarm">
      <div className="rem">
        <div className="rem-add">
          <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Recuérdame…" />
          <div className="chips">
            {QUICK.map(([l, f]) => <button key={l} className="chip" disabled={!t.trim()} onClick={() => add(f())}>{l}</button>)}
            <input type="time" className="chip time" value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && custom) { const [h, m] = custom.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); add(d); } }}
              title="Hora exacta (Enter)" />
          </div>
        </div>
        <ul className="rlist scroll">
          {upcoming.length === 0 && <li className="muted pad">Sin recordatorios pendientes</li>}
          {upcoming.map((r) => (
            <li key={r.id}>
              <i className="rdot" style={{ background: COLORS[r.color] ?? COLORS.orange }} />
              <span className="r-title">{r.title}</span>
              <span className="r-when" title={fmtWhen(r.next_fire_at)}>{relTime(r.next_fire_at)}</span>
              {r.repeat !== "none" && <Ico n="reset" s={12} />}
              {r.group_id && <Ico n="users" s={13} />}
              <button className="nb icon tiny ghost" onClick={() => deleteReminder(r.id)} aria-label="Borrar"><Ico n="x" s={12} /></button>
            </li>
          ))}
        </ul>
      </div>
    </Gate>
  );
}
