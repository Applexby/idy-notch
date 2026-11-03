import { useEffect, useRef, useState } from "react";
import type { Note } from "@shared/types";
import { COLORS } from "@shared/types";
import { relTime } from "@shared/time";
import { addNote, deleteNote, updateNote, useSync } from "../../lib/sync";
import { Ico } from "../icons";
import { Gate } from "./Gate";

export default function NotesPage() {
  const { notes } = useSync();
  const [v, setV] = useState("");
  const [saved, setSaved] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = notes.find((n) => n.id === openId) ?? null;

  const save = async () => {
    if (!v.trim()) return;
    await addNote(v);
    setV(""); setSaved(true); setTimeout(() => setSaved(false), 1400);
  };

  return (
    <Gate color="#ffd60a" icon="note">
      {open ? <Editor note={open} onClose={() => setOpenId(null)} /> : (
        <div className="notes">
          <div className="note-compose">
            <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder="Anota algo al vuelo…  (Enter guarda · Shift+Enter salto)"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }} />
            <span className={`saved ${saved ? "in" : ""}`}>Guardada ✓</span>
          </div>
          <div className="note-strip scroll" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
            {notes.slice(0, 20).map((n) => (
              <button key={n.id} className="note-card" style={{ borderColor: n.color !== "default" ? COLORS[n.color] : undefined }}
                onClick={() => setOpenId(n.id)}>
                {n.title && <b>{n.title}</b>}
                <p>{n.body || n.checklist.map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("\n")}</p>
                <small>{n.pinned ? "📌 " : ""}{relTime(n.updated_at)}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </Gate>
  );
}

/** Nota abierta en grande: editar, marcar elementos, borrar */
function Editor({ note, onClose }: { note: Note; onClose: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<number>();
  const dirty = title !== note.title || body !== note.body;

  // guardado automático
  useEffect(() => {
    if (!dirty) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => updateNote(note.id, { title, body }), 600);
    return () => clearTimeout(timer.current);
  }, [title, body]);

  const close = () => { if (dirty) updateNote(note.id, { title, body }); onClose(); };
  const toggle = (id: string) => updateNote(note.id, { checklist: note.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) });
  const removeItem = (id: string) => updateNote(note.id, { checklist: note.checklist.filter((c) => c.id !== id) });
  const color = note.color !== "default" ? COLORS[note.color] : "#ffd60a";

  return (
    <div className="note-editor">
      <div className="ne-head">
        <button className="nb icon small ghost" onClick={close} aria-label="Volver"><Ico n="back" s={15} /></button>
        <input className="ne-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" style={{ caretColor: color }} />
        <button className={`nb icon small ghost ${note.pinned ? "lit-y" : ""}`} onClick={() => updateNote(note.id, { pinned: !note.pinned })} aria-label="Fijar"><Ico n="pin" s={14} /></button>
        <button className={`nb small ${confirm ? "danger" : "ghost"}`} onClick={() => confirm ? (deleteNote(note.id), onClose()) : (setConfirm(true), setTimeout(() => setConfirm(false), 2500))}>
          <Ico n="trash" s={13} /> {confirm ? "¿Borrar?" : ""}
        </button>
        <button className="nb small primary" onClick={close}>Listo</button>
      </div>
      {note.checklist.length > 0 ? (
        <ul className="ne-check scroll">
          {note.checklist.map((c) => (
            <li key={c.id} className={c.done ? "done" : ""}>
              <button className="box" onClick={() => toggle(c.id)}>{c.done && <Ico n="check" s={10} w={3.2} />}</button>
              <span>{c.text}</span>
              <button className="nb icon tiny ghost" onClick={() => removeItem(c.id)} aria-label="Quitar"><Ico n="x" s={11} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <textarea className="ne-body scroll" autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe aquí…" style={{ caretColor: color }} />
      )}
    </div>
  );
}
