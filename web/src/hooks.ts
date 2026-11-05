import { useCallback, useEffect, useRef, useState } from "react";
import { cache, type Table } from "@shared/offline";
import { supabase } from "./supabase";
import { offline, onLocalChange } from "./db";

type Order = { col: string; asc?: boolean }[];
function sortRows<T>(rows: T[], order: Order) {
  return rows.slice().sort((a, b) => {
    for (const o of order) {
      const x = (a as Record<string, unknown>)[o.col], y = (b as Record<string, unknown>)[o.col];
      if (x === y) continue;
      if (x === null || x === undefined) return 1; // vacíos al final
      if (y === null || y === undefined) return -1;
      const c = x < y ? -1 : 1;
      return o.asc === false ? -c : c;
    }
    return 0;
  });
}

/** Lee una tabla, la guarda para usarla sin conexión y se mantiene al día con Realtime. */
export function useTable<T extends { id: string }>(table: Table, order: Order) {
  const key = `idy-web-${table}`;
  const serverRef = useRef<T[]>(cache.get<T[]>(key) ?? []);
  const orderRef = useRef(order);
  const view = () => sortRows(offline.overlay(table, serverRef.current), orderRef.current);
  const [rows, setRows] = useState<T[]>(view);
  const [loading, setLoading] = useState(serverRef.current.length === 0);

  const load = useCallback(async () => {
    await offline.flush();
    const { data, error } = await supabase.from(table).select("*");
    if (!error && data) { serverRef.current = data as T[]; cache.set(key, data); }
    setRows(view());
    setLoading(false);
  }, [table]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => load())
      .subscribe();
    const off = onLocalChange(() => setRows(view()));
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", load);
    return () => { supabase.removeChannel(ch); off(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", load); };
  }, [table, load]);

  /** Retoque local inmediato (el cambio real va por db.ts) */
  const patchLocal = useCallback((id: string, patch: Partial<T> | null) => {
    serverRef.current = patch === null ? serverRef.current.filter((r) => r.id !== id) : serverRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setRows(view());
  }, []);

  return { rows, loading, reload: load, patchLocal, setRows };
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  const [pending, setPending] = useState(offline.pending());
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener("online", a); window.addEventListener("offline", b);
    const off = onLocalChange(() => setPending(offline.pending()));
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); off(); };
  }, []);
  return { online: on, pending };
}
