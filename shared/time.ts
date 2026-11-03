const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const a = Math.abs(diff);
  if (a < 45) return diff >= 0 ? "ahora" : "hace un momento";
  if (a < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Hoy, ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Mañana, ${time}`;
  return `${d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/** valor para <input type="datetime-local"> en hora local */
export function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => new Date(v).toISOString();
