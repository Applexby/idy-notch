import { useState } from "react";
import { COLORS } from "@shared/types";
import { relTime } from "@shared/time";
import { addNote, useSync } from "../../lib/sync";
import { Gate } from "./Gate";

export default function NotesPage() {
  const { notes } = useSync();
  const [v, setV] = useState("");
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (!v.trim()) return;
    await addNote(v);
    setV(""); setSaved(true); setTimeout(() => setSaved(false), 1400);
  };
  return (
    <Gate color="#ffd60a" icon="note">
      <div className="notes">
        <div className="note-compose">
          <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder="Anota algo al vuelo…  (Enter guarda · Shift+Enter salto)"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }} />
          <span className={`saved ${saved ? "in" : ""}`}>Guardada ✓</span>
        </div>
        <div className="note-strip scroll" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
          {notes.slice(0, 12).map((n) => (
            <div key={n.id} className="note-card" style={{ borderColor: n.color !== "default" ? COLORS[n.color] : undefined }}>
              {n.title && <b>{n.title}</b>}
              <p>{n.body || n.checklist.map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("\n")}</p>
              <small>{relTime(n.updated_at)}</small>
            </div>
          ))}
        </div>
      </div>
    </Gate>
  );
}
