// Modo sin conexión: cada cambio se aplica al instante en pantalla y entra en una cola
// guardada en el equipo. La cola se envía en orden cuando hay internet; si algo falla por
// red, se reintenta después. Los IDs se crean en el equipo, así un reintento no duplica nada.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Tipo mínimo del cliente de Supabase (así esta carpeta no depende de node_modules)
type Db = { from(table: string): any; auth: { getSession(): Promise<{ data: { session: unknown } }> } };

export type Table = "reminders" | "tasks" | "notes";
export interface Op {
  opId: string;
  table: Table;
  kind: "insert" | "update" | "delete";
  id: string;
  data?: Record<string, unknown>; // lo que se envía al servidor
  row?: Record<string, unknown>;  // fila completa para mostrar mientras tanto (insert)
  at: number;
}

export const newId = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto ? globalThis.crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    }));

const isNetError = (e: unknown) => {
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  return (typeof navigator !== "undefined" && !navigator.onLine) || /fetch|network|load failed|timeout|aborted/i.test(msg);
};

export function createOffline(db: Db, storageKey: string, onChange: () => void) {
  const read = (): Op[] => { try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; } };
  let ops: Op[] = read();
  let flushing = false;
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(ops)); } catch { /* lleno */ } };

  async function run(op: Op) {
    const t = db.from(op.table);
    if (op.kind === "insert") return t.upsert({ ...op.data, id: op.id }, { onConflict: "id", ignoreDuplicates: true });
    if (op.kind === "update") return t.update(op.data!).eq("id", op.id);
    return t.delete().eq("id", op.id);
  }

  async function flush(): Promise<void> {
    if (flushing || !ops.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const { data } = await db.auth.getSession();
    if (!data.session) return;
    flushing = true;
    try {
      while (ops.length) {
        const op = ops[0];
        let res: { error: { message: string } | null } | null = null;
        try { res = await run(op); } catch (e) { if (isNetError(e)) break; }
        if (res?.error && isNetError(res.error)) break; // sin red: reintentar luego
        ops.shift(); // enviado (o rechazado por el servidor: no se reintenta)
        save();
        onChange();
      }
    } finally { flushing = false; }
  }

  function push(op: Omit<Op, "opId" | "at">) {
    // Un cambio sobre algo que aún no se subió se fusiona con su alta
    if (op.kind === "update") {
      const ins = ops.find((o) => o.kind === "insert" && o.id === op.id);
      if (ins) { ins.data = { ...ins.data, ...op.data }; ins.row = { ...ins.row, ...op.data }; save(); onChange(); flush(); return; }
    }
    if (op.kind === "delete") {
      const had = ops.some((o) => o.kind === "insert" && o.id === op.id);
      ops = ops.filter((o) => o.id !== op.id);
      if (had) { save(); onChange(); return; } // nunca llegó al servidor: basta con olvidarlo
    }
    ops.push({ ...op, opId: newId(), at: Date.now() });
    save();
    onChange();
    flush();
  }

  /** Aplica los cambios pendientes encima de lo que vino del servidor */
  function overlay<T extends { id: string }>(table: Table, rows: T[]): T[] {
    let out = rows.slice();
    for (const op of ops) {
      if (op.table !== table) continue;
      if (op.kind === "insert" && !out.some((r) => r.id === op.id)) out.push({ ...(op.row as object), id: op.id } as T);
      else if (op.kind === "update") out = out.map((r) => (r.id === op.id ? { ...r, ...(op.data as object) } : r));
      else if (op.kind === "delete") out = out.filter((r) => r.id !== op.id);
    }
    return out;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => flush());
    setInterval(() => flush(), 30e3);
  }

  return { push, flush, overlay, pending: () => ops.length, clear: () => { ops = []; save(); onChange(); } };
}

/** Caché de lo último descargado, para abrir sin internet */
export const cache = {
  get<T>(key: string): T | null { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* lleno */ } },
};
