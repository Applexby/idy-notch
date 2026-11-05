import { useMemo, useState } from "react";
import type { Reminder, Repeat } from "@shared/types";
import { COLORS, REPEAT_LABEL } from "@shared/types";
import { fmtWhen, fromLocalInput, relTime, toLocalInput } from "@shared/time";
import { useApp } from "../App";
import { useNow, useTable } from "../hooks";
import { insert, remove as removeRow, update } from "../db";
import { describe, parsePhrase } from "@shared/parse";
import { ColorDots, Empty, GroupSelect, Icon, Row, Sheet, Toggle, toast } from "../ui";

type Draft = Partial<Reminder> & { title: string; when: string };

const blank = (): Draft => ({ title: "", when: toLocalInput(null), repeat: "none", alarm: true, color: "orange", notes: "", group_id: null });

export default function Reminders() {
  const { groups } = useApp();
  const { rows, loading, patchLocal } = useTable<Reminder>("reminders", [{ col: "next_fire_at" }]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDone, setShowDone] = useState(false);
  useNow();

  const upcoming = useMemo(() => rows.filter((r) => !r.done), [rows]);
  const done = useMemo(() => rows.filter((r) => r.done).sort((a, b) => (b.last_fired_at ?? "").localeCompare(a.last_fired_at ?? "")), [rows]);
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;

  async function save() {
    if (!draft || !draft.title.trim()) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Lima";
    const payload = {
      title: draft.title.trim(), notes: draft.notes?.trim() || null, fire_at: fromLocalInput(draft.when),
      repeat: draft.repeat ?? "none", alarm: draft.alarm ?? true, color: draft.color ?? "orange",
      group_id: draft.group_id ?? null, timezone: tz, done: false,
    };
    const { error } = draft.id
      ? update("reminders", draft.id, payload)
      : insert("reminders", payload);
    if (error) return toast(error.message);
    setDraft(null);
    toast(draft.id ? "Recordatorio actualizado" : `Te avisaré ${relTime(payload.fire_at)}`);
  }

  async function remove(r: Reminder) {
    patchLocal(r.id, null);
    removeRow("reminders", r.id);
    setDraft(null);
  }

  async function snooze(r: Reminder, min: number) {
    const fire_at = new Date(Date.now() + min * 60e3).toISOString();
    patchLocal(r.id, { fire_at, next_fire_at: fire_at, done: false });
    update("reminders", r.id, { fire_at, done: false });
    toast(`Pospuesto ${min} min`);
  }

  async function markDone(r: Reminder) {
    patchLocal(r.id, { done: true });
    update("reminders", r.id, { done: true });
  }

  // Barra rápida: escribe o dicta ("mañana a las 11 llamar a cliente")
  const [quick, setQuick] = useState("");
  const qp = quick.trim() ? parsePhrase(quick) : null;
  function quickAdd() {
    if (!qp) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Lima";
    if (qp.kind === "note") insert("notes", { title: "", body: qp.title });
    else if (qp.kind === "task" && !qp.at) insert("tasks", { title: qp.title });
    else insert("reminders", { title: qp.title, fire_at: (qp.at ?? new Date(Date.now() + 36e5)).toISOString(), repeat: qp.repeat, alarm: qp.loud ?? true, timezone: tz });
    toast(describe(qp));
    setQuick("");
  }

  return (
    <>
      <header className="top">
        <h1>Recordatorios</h1>
        <button className="fab" style={{ background: COLORS.orange }} onClick={() => setDraft(blank())} aria-label="Nuevo recordatorio">
          <Icon name="plus" size={22} stroke={2.4} />
        </button>
      </header>

      <div className="quick-add phrase">
        <Icon name="plus" size={18} />
        <input placeholder="Escribe o dicta: mañana a las 11 llamar a cliente" value={quick} enterKeyHint="done"
          onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && quickAdd()} />
      </div>
      {qp && <button className="phrase-preview" onClick={quickAdd}>{describe(qp)} <span>Crear</span></button>}

      {!loading && !upcoming.length && (
        <Empty icon="alarm" title="Nada pendiente" text="Crea un recordatorio y te llegará al iPhone y sonará en tu notch." />
      )}

      <ul className="list">
        {upcoming.map((r) => {
          const due = r.next_fire_at && new Date(r.next_fire_at).getTime() < Date.now();
          return (
            <li key={r.id} className="item rem" onClick={() => setDraft({ ...r, when: toLocalInput(r.next_fire_at ?? r.fire_at) })}>
              <span className="bar" style={{ background: COLORS[r.color] ?? COLORS.orange }} />
              <div className="item-main">
                <strong>{r.title}</strong>
                <div className="meta">
                  <span className={due ? "late" : ""}><Icon name="clock" size={14} /> {fmtWhen(r.next_fire_at)}</span>
                  {r.repeat !== "none" && <span><Icon name="repeat" size={14} /> {REPEAT_LABEL[r.repeat]}</span>}
                  {r.group_id && <span><Icon name="users" size={14} /> {groupName(r.group_id)}</span>}
                </div>
              </div>
              <div className="item-side">
                <span className="rel">{relTime(r.next_fire_at)}</span>
                {r.repeat === "none" && (
                  <button className="chk" aria-label="Marcar hecho" onClick={(e) => { e.stopPropagation(); markDone(r); }}>
                    <Icon name="check" size={16} stroke={2.6} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {done.length > 0 && (
        <section className="section">
          <button className="section-toggle" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Ocultar" : "Ver"} anteriores ({done.length})
          </button>
          {showDone && (
            <ul className="list dim">
              {done.slice(0, 50).map((r) => (
                <li key={r.id} className="item rem">
                  <span className="bar" style={{ background: "#444" }} />
                  <div className="item-main"><strong>{r.title}</strong>
                    <div className="meta"><span>{fmtWhen(r.last_fired_at ?? r.fire_at)}</span></div></div>
                  <div className="item-side row-btns">
                    <button className="pill" onClick={() => snooze(r, 10)}>+10 min</button>
                    <button className="icon-btn" aria-label="Borrar" onClick={() => remove(r)}><Icon name="trash" size={18} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Editar" : "Nuevo recordatorio"}
        actions={<button className="link strong" onClick={save}>Guardar</button>}>
        {draft && <>
          <input className="big-input" autoFocus placeholder="¿Qué te recuerdo?" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
          <div className="quick">
            {[["10 min", 10], ["30 min", 30], ["1 h", 60], ["Mañana 9:00", -1]].map(([l, m]) => (
              <button key={l} className="pill" onClick={() => {
                let d = new Date(Date.now() + (m as number) * 60e3);
                if (m === -1) { d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
                setDraft({ ...draft, when: toLocalInput(d.toISOString()) });
              }}>{l}</button>
            ))}
          </div>
          <div className="card">
            <label className="field inline"><span>Fecha y hora</span>
              <input type="datetime-local" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} />
            </label>
            <label className="field inline"><span>Repetir</span>
              <select value={draft.repeat} onChange={(e) => setDraft({ ...draft, repeat: e.target.value as Repeat })}>
                {Object.entries(REPEAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <Row label="Sonar como alarma" hint="En el notch suena hasta que lo apagues">
              <Toggle checked={draft.alarm ?? true} onChange={(v) => setDraft({ ...draft, alarm: v })} />
            </Row>
          </div>
          <GroupSelect groups={groups} value={draft.group_id ?? null} onChange={(v) => setDraft({ ...draft, group_id: v })} />
          <label className="field"><span>Notas</span>
            <textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Opcional" />
          </label>
          <ColorDots value={draft.color ?? "orange"} onChange={(c) => setDraft({ ...draft, color: c })}
            palette={["orange", "yellow", "green", "blue", "purple", "pink", "teal"]} />
          {draft.id && <button className="btn danger" onClick={() => remove(draft as Reminder)}>Eliminar recordatorio</button>}
        </>}
      </Sheet>
    </>
  );
}
