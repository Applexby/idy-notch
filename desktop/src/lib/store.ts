import { useSyncExternalStore } from "react";

/** Mini-store reactivo */
export function createStore<T>(initial: T) {
  let s = initial;
  const subs = new Set<() => void>();
  return {
    get: () => s,
    set(p: Partial<T> | ((s: T) => Partial<T>)) {
      s = { ...s, ...(typeof p === "function" ? p(s) : p) };
      subs.forEach((f) => f());
    },
    use(): T { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => s); },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}
