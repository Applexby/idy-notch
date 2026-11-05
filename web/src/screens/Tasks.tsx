import { useMemo, useState } from "react";
import type { Task } from "@shared/types";
import { COLORS } from "@shared/types";
import { fmtWhen, fromLocalInput, toLocalInput } from "@shared/time";
import { useApp } from "../App";
import { useNow, useTable } from "../hooks";
import { insert, remove as removeRow, update } from "../db";
import { ColorDots, Empty, GroupSelect, Icon, Row, Segmented, Sheet, Toggle, toast } from "../ui";

type Filter = "today" | "upcoming" | "all" | "done";
type Draft = Partial<Task> & { title: string; hasDue: boolean; when: string };

const PRIO = ["Normal", "Baja", "Media", "Alta"];

function isToday(iso: string | null) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function Tasks() {
  const { groups } = useApp();
  const { rows, loading, patchLocal } = useTable<Task>("tasks", [{ col: "done" }, { col: "due_at" }, { col: "position" }]);
  const [filter, setFilter] = useState<Filter>("all");
  const [quick, setQuick] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  useNow();

  const list = useMemo(() => {
    const open = rows.filter((t) => !t.done);
    switch (filter) {
      case "today": return open.filter((t) => isToday(t.due_at) || (t.due_at && new Date(t.due_at) < new Date()));
      case "upcoming": return open.filter((t) => t.due_at && new Date(t.due_at) > new Date());
      case "done": return rows.filter((t) => t.done).sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
      default: return open;
    }
  }, [rows, filter]);
  const openCount = rows.filter((t) => !t.done).length;

  async function addQuick() {
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    const { error } = insert("tasks", { title, due_at: filter === "today" ? endOfToday() : null });
    if (error) toast(error.message);
  }

  async function toggle(t: Task) {
    const patch = { done: !t.done, completed_at: !t.done ? new Date().toISOString() : null };
    patchLocal(t.id, patch);
    update("tasks", t.id, patch);
  }

  async function save() {
    if (!draft || !draft.title.trim()) return;
    const payload = {
      title: draft.title.trim(), notes: draft.notes?.trim() || null,
      due_at: draft.hasDue ? fromLocalInput(draft.when) : null,
      duration_min: draft.hasDue && draft.duration_min ? Number(draft.duration_min) : null,
      priority: draft.priority ?? 0, color: draft.color ?? "blue", group_id: draft.group_id ?? null,
    };
    const { error } = draft.id ? update("tasks", draft.id, payload) : insert("tasks", payload);
    if (error) return toast(error.message);
    setDraft(null);
  }

  async function remove(id: string) {
    patchLocal(id, null);
    setDraft(null);
    removeRow("tasks", id);
  }

  return (
    <>
      <header className="top">
        <h1>Tareas <span className="count">{openCount}</span></h1>
        <button className="fab" style={{ background: COLORS.blue }} aria-label="Nueva tarea"
          onClick={() => setDraft({ title: "", hasDue: false, when: toLocalInput(null), color: "blue", priority: 0, group_id: null })}>
          <Icon name="plus" size={22} stroke={2.4} />
        </button>
      </header>

      <Segmented value={filter} onChange={setFilter} options={[
        { value: "all", label: "Todas" }, { value: "today", label: "Hoy" },
        { value: "upcoming", label: "Próximas" }, { value: "done", label: "Hechas" },
      ]} />

      {filter !== "done" && (
        <div className="quick-add">
          <Icon name="plus" size={18} />
          <input placeholder="Añadir tarea y pulsar Enter" value={quick} onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addQuick()} enterKeyHint="done" />
        </div>
      )}

      {!loading && !list.length && <Empty icon="task" title={filter === "done" ? "Aún nada terminado" : "Todo al día"} text="Las tareas con hora te avisan en el notch cuando empiezan." />}

      <ul className="list">
        {list.map((t) => {
          const late = !t.done && t.due_at && new Date(t.due_at) < new Date();
          return (
            <li key={t.id} className={`item task ${t.done ? "is-done" : ""}`}
              onClick={() => setDraft({ ...t, hasDue: !!t.due_at, when: toLocalInput(t.due_at) })}>
              <button className="circle" style={{ borderColor: COLORS[t.color] ?? COLORS.blue, background: t.done ? COLORS[t.color] : undefined }}
                aria-label={t.done ? "Desmarcar" : "Completar"} onClick={(e) => { e.stopPropagation(); toggle(t); }}>
                {t.done && <Icon name="check" size={14} stroke={3} />}
              </button>
              <div className="item-main">
                <strong>{t.priority > 0 && <span className="prio">{"!".repeat(t.priority)}</span>}{t.title}</strong>
                {(t.due_at || t.group_id) && <div className="meta">
                  {t.due_at && <span className={late ? "late" : ""}><Icon name="clock" size={14} /> {fmtWhen(t.due_at)}{t.duration_min ? ` · ${t.duration_min} min` : ""}</span>}
                  {t.group_id && <span><Icon name="users" size={14} /> {groups.find((g) => g.id === t.group_id)?.name}</span>}
                </div>}
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Editar tarea" : "Nueva tarea"}
        actions={<button className="link strong" onClick={save}>Guardar</button>}>
        {draft && <>
          <input className="big-input" autoFocus={!draft.id} placeholder="Tarea" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
          <div className="card">
            <Row label="Con hora" hint="El notch te avisa al empezar y al terminar">
              <Toggle checked={draft.hasDue} onChange={(v) => setDraft({ ...draft, hasDue: v })} />
            </Row>
            {draft.hasDue && <>
              <label className="field inline"><span>Empieza</span>
                <input type="datetime-local" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} />
              </label>
              <label className="field inline"><span>Duración</span>
                <select value={draft.duration_min ?? ""} onChange={(e) => setDraft({ ...draft, duration_min: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sin duración</option>
                  {[15, 25, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
            </>}
            <label className="field inline"><span>Prioridad</span>
              <select value={draft.priority ?? 0} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}>
                {PRIO.map((p, i) => <option key={p} value={i}>{p}</option>)}
              </select>
            </label>
          </div>
          <GroupSelect groups={groups} value={draft.group_id ?? null} onChange={(v) => setDraft({ ...draft, group_id: v })} />
          <label className="field"><span>Notas</span>
            <textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Opcional" />
          </label>
          <ColorDots value={draft.color ?? "blue"} onChange={(c) => setDraft({ ...draft, color: c })}
            palette={["blue", "teal", "green", "yellow", "orange", "pink", "purple"]} />
          {draft.id && <button className="btn danger" onClick={() => remove(draft.id!)}>Eliminar tarea</button>}
        </>}
      </Sheet>
    </>
  );
}

function endOfToday() { const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); }
