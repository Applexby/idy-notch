import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/** Lee una tabla y se mantiene al día con Realtime. */
export function useTable<T extends { id: string }>(table: string, order: { col: string; asc?: boolean }[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const orderRef = useRef(order);

  const load = useCallback(async () => {
    let q = supabase.from(table).select("*");
    for (const o of orderRef.current) q = q.order(o.col, { ascending: o.asc ?? true, nullsFirst: false });
    const { data, error } = await q;
    if (!error) setRows((data ?? []) as T[]);
    setLoading(false);
  }, [table]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => load())
      .subscribe();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
  }, [table, load]);

  /** Actualización optimista local */
  const patchLocal = useCallback((id: string, patch: Partial<T> | null) => {
    setRows((rs) => patch === null ? rs.filter((r) => r.id !== id) : rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  return { rows, loading, reload: load, patchLocal, setRows };
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
