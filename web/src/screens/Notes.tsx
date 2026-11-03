import { useMemo, useState } from "react";
import type { ChecklistItem, Note } from "@shared/types";
import { COLORS } from "@shared/types";
import { relTime } from "@shared/time";
import { useApp } from "../App";
import { useTable } from "../hooks";
import { supabase } from "../supabase";
import { ColorDots, Empty, GroupSelect, Icon, Sheet, toast } from "../ui";

type Draft = Partial<Note> & { title: string; body: string; checklist: ChecklistItem[] };
const uid = () => Math.random().toString(36).slice(2, 10);
const blank = (list = false): Draft => ({
  title: "", body: "", color: "default", pinned: false, group_id: null,
  checklist: list ? [{ id: uid(), text: "", done: false }] : [],
});

const tint = (c: string) => (c === "default" ? undefined : `color-mix(in srgb, ${COLORS[c]} 22%, #161618)`);

export default function Notes() {
  const { groups } = useApp();
  const { rows, loading, patchLocal } = useTable<Note>("notes", [{ col: "pinned", asc: false }, { col: "updated_at", asc: false }]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState("");

  const visible = useMemo(() => rows.filter((n) => n.archived === archived && (!q ||
    `${n.title} ${n.body} ${n.checklist.map((c) => c.text).join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [rows, archived, q]);
  const pinned = visible.filter((n) => n.pinned);
  const others = visible.filter((n) => !n.pinned);

  async function close() {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    const checklist = d.checklist.filter((c) => c.text.trim());
    const empty = !d.title.trim() && !d.body.trim() && !checklist.length;
    if (empty) { if (d.id) await remove(d.id); return; }
    const payload = { title: d.title.trim(), body: d.body, checklist, color: d.color ?? "default", pinned: !!d.pinned,
      archived: !!d.archived, group_id: d.group_id ?? null };
    if (d.id) { patchLocal(d.id, payload); }
    const { error } = d.id ? await supabase.from("notes").update(payload).eq("id", d.id) : await supabase.from("notes").insert(payload);
    if (error) toast(error.message);
  }

  async function remove(id: string) {
    patchLocal(id, null);
    await supabase.from("notes").delete().eq("id", id);
  }

  async function toggleItem(n: Note, itemId: string) {
    const checklist = n.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c));
    patchLocal(n.id, { checklist });
    await supabase.from("notes").update({ checklist }).eq("id", n.id);
  }

  const Card = ({ n }: { n: Note }) => (
    <article className="note" style={{ background: tint(n.color) }} onClick={() => setDraft({ ...n })}>
      {n.title && <h4>{n.title}</h4>}
      {n.body && <p>{n.body}</p>}
      {n.checklist.length > 0 && (
        <ul className="mini-check">
          {n.checklist.slice(0, 6).map((c) => (
            <li key={c.id} className={c.done ? "done" : ""} onClick={(e) => { e.stopPropagation(); toggleItem(n, c.id); }}>
              <span className="box">{c.done && <Icon name="check" size={11} stroke={3} />}</span>{c.text}
            </li>
          ))}
          {n.checklist.length > 6 && <li className="more">+{n.checklist.length - 6} más</li>}
        </ul>
      )}
      <footer>
        {n.group_id && <span><Icon name="users" size={12} /> {groups.find((g) => g.id === n.group_id)?.name}</span>}
        <span>{relTime(n.updated_at)}</span>
      </footer>
    </article>
  );

  return (
    <>
      <header className="top">
        <h1>{archived ? "Archivo" : "Notas"}</h1>
        <button className="icon-btn" onClick={() => setArchived(!archived)} aria-label="Archivo">
          <Icon name={archived ? "note" : "archive"} />
        </button>
      </header>

      <div className="search"><input placeholder="Buscar notas" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      {!archived && (
        <div className="composer">
          <button className="composer-main" onClick={() => setDraft(blank())}>Escribe una nota…</button>
          <button className="icon-btn" aria-label="Nueva lista" onClick={() => setDraft(blank(true))}><Icon name="list" /></button>
        </div>
      )}

      {!loading && !visible.length && (
        <Empty icon="note" title={archived ? "Archivo vacío" : "Sin notas"} text={archived ? "Las notas archivadas aparecen aquí." : "Apunta ideas al vuelo; también desde el notch."} />
      )}

      {pinned.length > 0 && <><div className="label">Fijadas</div><div className="masonry">{pinned.map((n) => <Card key={n.id} n={n} />)}</div></>}
      {others.length > 0 && <>{pinned.length > 0 && <div className="label">Otras</div>}<div className="masonry">{others.map((n) => <Card key={n.id} n={n} />)}</div></>}

      <Sheet open={!!draft} onClose={close} title={draft?.id ? "Nota" : "Nueva nota"}
        actions={draft && <>
          <button className={`icon-btn ${draft.pinned ? "lit" : ""}`} aria-label="Fijar" onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}><Icon name="pin" size={20} /></button>
          <button className="link strong" onClick={close}>Listo</button>
        </>}>
        {draft && <div className="note-editor" style={{ background: tint(draft.color ?? "default") }}>
          <input className="big-input" placeholder="Título" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          {draft.checklist.length === 0 ? (
            <textarea className="note-body" autoFocus={!draft.id} placeholder="Escribe aquí…" rows={8} value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          ) : (
            <ul className="check-edit">
              {draft.checklist.map((c, i) => (
                <li key={c.id}>
                  <button className={`box ${c.done ? "on" : ""}`} onClick={() => setDraft({ ...draft, checklist: draft.checklist.map((x) => x.id === c.id ? { ...x, done: !x.done } : x) })}>
                    {c.done && <Icon name="check" size={12} stroke={3} />}
                  </button>
                  <input value={c.text} autoFocus={i === draft.checklist.length - 1 && !c.text} placeholder="Elemento"
                    onChange={(e) => setDraft({ ...draft, checklist: draft.checklist.map((x) => x.id === c.id ? { ...x, text: e.target.value } : x) })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setDraft({ ...draft, checklist: [...draft.checklist, { id: uid(), text: "", done: false }] }); } }} />
                  <button className="icon-btn sm" aria-label="Quitar" onClick={() => setDraft({ ...draft, checklist: draft.checklist.filter((x) => x.id !== c.id) })}><Icon name="x" size={16} /></button>
                </li>
              ))}
              <li><button className="link" onClick={() => setDraft({ ...draft, checklist: [...draft.checklist, { id: uid(), text: "", done: false }] })}>+ Añadir elemento</button></li>
            </ul>
          )}
          <div className="editor-tools">
            <ColorDots value={draft.color ?? "default"} onChange={(c) => setDraft({ ...draft, color: c })} />
            <button className="pill" onClick={() => draft.checklist.length
              ? setDraft({ ...draft, body: [draft.body, ...draft.checklist.map((c) => c.text)].filter(Boolean).join("\n"), checklist: [] })
              : setDraft({ ...draft, checklist: (draft.body || "").split("\n").filter(Boolean).map((t) => ({ id: uid(), text: t, done: false })).concat(draft.body ? [] : [{ id: uid(), text: "", done: false }]), body: "" })}>
              {draft.checklist.length ? "Texto" : "Lista"}
            </button>
          </div>
          <GroupSelect groups={groups} value={draft.group_id ?? null} onChange={(v) => setDraft({ ...draft, group_id: v })} />
          {draft.id && <div className="row-btns spread">
            <button className="btn ghost" onClick={() => { setDraft({ ...draft, archived: !draft.archived }); toast(draft.archived ? "Se desarchivará" : "Se archivará"); }}>
              <Icon name="archive" size={18} /> {draft.archived ? "Desarchivar" : "Archivar"}
            </button>
            <button className="btn danger" onClick={() => { const id = draft.id!; setDraft(null); remove(id); }}><Icon name="trash" size={18} /> Borrar</button>
          </div>}
        </div>}
      </Sheet>
    </>
  );
}
