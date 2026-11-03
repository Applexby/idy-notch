import { focus, FOCUS_LABEL, remaining, reset, toggle, total, type FocusMode } from "../../lib/focus";
import { fmtMs } from "../Notch";
import { Ico } from "../icons";

export default function FocusPage() {
  const f = focus.use();
  const rem = remaining(), tot = total();
  const p = 1 - rem / tot;
  const color = f.mode === "focus" ? "#ff9f0a" : "#30d158";
  const R = 52, C = 2 * Math.PI * R;
  return (
    <div className="focus">
      <div className="focus-ring">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={R} stroke="#262628" strokeWidth="9" fill="none" />
          <circle cx="64" cy="64" r={R} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 64 64)" style={{ transition: "stroke-dashoffset .6s" }} />
        </svg>
        <div className="focus-time"><b>{fmtMs(rem)}</b><small>{FOCUS_LABEL[f.mode]}</small></div>
      </div>
      <div className="focus-side">
        <div className="chips">
          {(Object.keys(FOCUS_LABEL) as FocusMode[]).map((m) => (
            <button key={m} className={`chip ${f.mode === m ? "on" : ""}`} onClick={() => reset(m)}>{FOCUS_LABEL[m]}</button>
          ))}
        </div>
        <div className="focus-btns">
          <button className="nb primary big" style={{ background: color }} onClick={toggle}>
            <Ico n={f.running ? "pause" : "play"} s={16} fill /> {f.running ? "Pausar" : rem < tot ? "Seguir" : "Empezar"}
          </button>
          <button className="nb icon" onClick={() => reset()} aria-label="Reiniciar"><Ico n="reset" s={16} /></button>
        </div>
        <small className="muted">Hoy: {f.sessions} {f.sessions === 1 ? "sesión" : "sesiones"} {"●".repeat(Math.min(f.sessions, 8))}</small>
      </div>
    </div>
  );
}
