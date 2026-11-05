import { useState } from "react";
import { COLORS } from "@shared/types";
import { parsePhrase } from "@shared/parse";
import { addTask, clearDoneTasks, deleteTask, toggleTask, useSync } from "../../lib/sync";
import { Ico } from "../icons";
import { Gate } from "./Gate";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function TasksPage() {
  const { tasks } = useSync();
  const [t, setT] = useState("");
  const today = new Date().toDateString();
  const list = tasks.filter((x) => !x.done || (x.completed_at && new Date(x.completed_at).toDateString() === today));
  const doneN = list.filter((x) => x.done).length;
  // "mañana enviar cotización" → tarea con fecha
  const submit = () => { if (!t.trim()) return; const p = parsePhrase(t); addTask(p.title, p.at); setT(""); };

  return (
    <Gate color="#0a84ff" icon="todo">
      <div className="tasks">
        <div className="pg-head">
          <strong>To-do <span className="muted">{doneN}/{list.length}</span></strong>
          <div className="row">
            {doneN > 0 && <button className="nb small ghost" onClick={clearDoneTasks} title="Borrar las completadas"><Ico n="trash" s={12} /> Hechas</button>}
            <div className="mini-add">
              <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Nueva tarea…" />
              <button className="nb icon small" onClick={submit} aria-label="Añadir"><Ico n="plus" s={14} w={2.4} /></button>
            </div>
          </div>
        </div>
        <ul className="tlist scroll">
          {list.length === 0 && <li className="muted pad">Todo al día ✨</li>}
          {list.map((x) => (
            <li key={x.id} className={x.done ? "done" : ""}>
              <button className="circle" style={{ borderColor: COLORS[x.color] ?? COLORS.blue, background: x.done ? COLORS[x.color] : undefined }}
                onClick={() => toggleTask(x)} aria-label="Completar">{x.done && <Ico n="check" s={11} w={3.2} />}</button>
              <span className="t-title">{x.priority > 0 && <b className="prio">{"!".repeat(x.priority)}</b>}{x.title}</span>
              {x.due_at && <span className={`t-time ${!x.done && new Date(x.due_at) < new Date() ? "late" : ""}`}>{hhmm(x.due_at)}</span>}
              {x.group_id && <Ico n="users" s={13} />}
              <button className="nb icon tiny ghost del" onClick={() => deleteTask(x.id)} aria-label="Eliminar tarea"><Ico n="x" s={11} /></button>
            </li>
          ))}
        </ul>
      </div>
    </Gate>
  );
}
