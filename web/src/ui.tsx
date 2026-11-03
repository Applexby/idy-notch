import { ReactNode, useEffect } from "react";
import type { Group } from "@shared/types";
import { COLORS } from "@shared/types";

const P: Record<string, string> = {
  bell: "M12 3a6 6 0 0 0-6 6v3.6L4.4 15a1 1 0 0 0 .8 1.6h13.6a1 1 0 0 0 .8-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2.5 15.5a2.5 2.5 0 0 0 5 0",
  note: "M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 0v4h4M8.5 12h7M8.5 16h5",
  check: "M5 12.5l4.2 4.2L19 7",
  task: "M4 6.5h2M4 12h2M4 17.5h2M9 6.5h11M9 12h11M9 17.5h11",
  gear: "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm7.4 2.8c0-.5 0-.9-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.3Z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  pin: "M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Zm3 10v6",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2 .8 3 2.8 3 5.5",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  archive: "M4 5h16v4H4zM5 9v10h14V9M10 13h4",
  list: "M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01",
  copy: "M8 8h11v11H8zM5 16V5h11",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  alarm: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11v3.5l2.5 1.5M3 5l3-2.5M21 5l-3-2.5",
};

export function Icon({ name, size = 22, stroke = 1.9 }: { name: keyof typeof P | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ""} />
    </svg>
  );
}

export function Sheet({ open, onClose, title, children, actions }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.classList.add("locked");
    return () => { window.removeEventListener("keydown", k); document.body.classList.remove("locked"); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <button className="link" onClick={onClose}>Cancelar</button>
          <h3>{title}</h3>
          <div className="sheet-actions">{actions}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value}
          className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /></button>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="row">
      <div className="row-text"><div>{label}</div>{hint && <small>{hint}</small>}</div>
      {children}
    </div>
  );
}

export function ColorDots({ value, onChange, palette = Object.keys(COLORS) }: {
  value: string; onChange: (c: string) => void; palette?: string[];
}) {
  return (
    <div className="dots">
      {palette.map((c) => (
        <button key={c} aria-label={c} className={`dot ${c === value ? "on" : ""}`}
          style={{ background: COLORS[c] }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

export function GroupSelect({ groups, value, onChange }: {
  groups: Group[]; value: string | null; onChange: (v: string | null) => void;
}) {
  if (!groups.length) return null;
  return (
    <label className="field">
      <span>Compartir con</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Solo yo</option>
        {groups.map((g) => <option key={g.id} value={g.id}>👥 {g.name}</option>)}
      </select>
    </label>
  );
}

export function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name={icon} size={28} /></div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function toast(msg: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 2400);
}
