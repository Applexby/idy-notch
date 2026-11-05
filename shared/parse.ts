// Intérprete de frases en español → recordatorio, nota o tarea.
// Ej.: "recuérdame mañana a las 11 llamar a cliente", "alarma en 20 min sacar la ropa",
// "todos los lunes a las 8 reunión", "nota: ideas para el reel", "tarea comprar cables".
// Sin IA: reglas ligeras que corren al instante en el notch, la web y la voz.
import type { Repeat } from "./types";

export type Kind = "reminder" | "note" | "task";
export interface Parsed {
  kind: Kind;
  title: string;
  at: Date | null;      // fecha/hora exacta (null = sin hora)
  repeat: Repeat;
  loud: boolean | null; // true = alarma, false = aviso, null = lo que diga el ajuste
  understood: string[]; // trozos reconocidos (para mostrar o depurar)
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, media: 0.5,
};
const NUMW = "(\\d{1,3}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|media)";
const HOURW = "(\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)";
const toNum = (s: string) => (/^\d/.test(s) ? Number(s) : NUM[s] ?? NaN);

/** minúsculas y sin tildes, MISMA longitud que el original (para recortar el título) */
function fold(s: string) {
  let out = "";
  for (const ch of s) {
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += base.length === 1 ? base : ch.toLowerCase().slice(0, 1);
  }
  return out;
}

export function parsePhrase(input: string, now = new Date()): Parsed {
  const original = input.replace(/\s+/g, " ").trim();
  const text = fold(original);
  const cut: [number, number][] = [];
  const understood: string[] = [];
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text);
    if (!m) return null;
    // no reutilizar un trozo ya tomado
    if (cut.some(([a, b]) => m.index < b && m.index + m[0].length > a)) return null;
    cut.push([m.index, m.index + m[0].length]);
    understood.push(m[0].trim());
    return m;
  };

  let kind: Kind | null = null;
  let loud: boolean | null = null;

  // ── Tipo (al inicio de la frase) ──
  const lead = "^(?:(?:pon(?:me)?|crea(?:me)?|agrega|anade|haz|programa|guarda)\\s+(?:un|una|el|la)?\\s*)?";
  let m: RegExpExecArray | null;
  if ((m = take(new RegExp(lead + "(alarma|recordatorio|recuerdame|recuerda(?:me)?|recordar|aviso|avisame|avisa(?:me)?)\\b[\\s,:]*(?:de\\s+que|que|para|de)?\\s*", "")))) {
    kind = "reminder";
    if (/alarma/.test(m[1])) loud = true;
    if (/avis/.test(m[1])) loud = false;
  } else if ((m = take(new RegExp(lead + "(nota|anota(?:r)?|apunta(?:r)?|apunte)\\b[\\s,:]*(?:que)?\\s*", "")))) {
    kind = "note";
  } else if ((m = take(new RegExp(lead + "(tarea|pendiente|to-?do)\\b[\\s,:]*(?:de)?\\s*", "")))) {
    kind = "task";
  }
  take(/\bcon\s+(?:el\s+)?(?:tema|titulo|nombre)\b\s*:?\s*/);

  // ── Repetición ──
  let repeat: Repeat = "none";
  let repeatDay: number | null = null;
  if (take(/\b(?:todos\s+los\s+dias|cada\s+dia|diariamente|a\s+diario|diario)\b/)) repeat = "daily";
  else if (take(/\b(?:de\s+lunes\s+a\s+viernes|entre\s+semana|dias\s+de\s+semana|dias\s+laborables)\b/)) repeat = "weekdays";
  else if ((m = take(/\b(?:todos\s+los|cada)\s+(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b/))) {
    repeat = "weekly"; repeatDay = DAYS.indexOf(m[1].replace(/^(sabado|domingo)s$/, "$1"));
  } else if (take(/\b(?:todas\s+las\s+semanas|cada\s+semana|semanalmente|semanal)\b/)) repeat = "weekly";
  else if (take(/\b(?:todos\s+los\s+meses|cada\s+mes|mensualmente|mensual)\b/)) repeat = "monthly";

  // ── Tiempo relativo: "en 20 minutos", "dentro de una hora", "en media hora" ──
  let at: Date | null = null;
  if ((m = take(new RegExp(`\\b(?:en|dentro\\s+de)\\s+${NUMW}\\s*(minutos?|mins?|m|horas?|hrs?|h|dias?)\\b(?:\\s+y\\s+media)?`)))) {
    const n = toNum(m[1]);
    const unit = m[2];
    const extra = /y\s+media/.test(m[0]) ? 0.5 : 0;
    const ms = unit.startsWith("d") ? 864e5 : /^h/.test(unit) ? 36e5 : 6e4;
    if (!isNaN(n)) at = new Date(now.getTime() + (n + extra) * ms);
  } else if (take(/\ben\s+(?:media\s+hora)\b/)) {
    at = new Date(now.getTime() + 30 * 6e4);
  }

  // ── Periodo del día (antes de "mañana" para no confundir "de la mañana") ──
  let period: "am" | "pm" | "night" | "dawn" | null = null;
  if (take(/\b(?:de|por|en)\s+la\s+(?:manana)\b/)) period = "am";
  else if (take(/\b(?:de|por|en)\s+la\s+tarde\b/)) period = "pm";
  else if (take(/\b(?:de|por|en)\s+la\s+noche\b/)) period = "night";
  else if (take(/\bde\s+la\s+madrugada\b/)) period = "dawn";

  // ── Día ──
  let day: Date | null = null;
  const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  let tonight = false, thisAfternoon = false;
  if (take(/\bpasado\s+manana\b/)) day = addDays(startOf(now), 2);
  else if (take(/\bmanana\b/)) day = addDays(startOf(now), 1);
  else if (take(/\besta\s+noche\b/)) { day = startOf(now); tonight = true; }
  else if (take(/\besta\s+tarde\b/)) { day = startOf(now); thisAfternoon = true; }
  else if (take(/\bhoy\b/)) day = startOf(now);

  if (!day && (m = take(/\b(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(\d{4}))?\b/))) {
    const mo = MONTHS.indexOf(m[2] === "setiembre" ? "septiembre" : m[2]);
    const y = m[3] ? Number(m[3]) : now.getFullYear();
    day = new Date(y, mo, Number(m[1]));
    if (!m[3] && day < startOf(now)) day.setFullYear(y + 1);
  }
  if (!day && (m = take(/\b(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    day = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && day < startOf(now)) day.setFullYear(y + 1);
  }
  let weekday: number | null = repeatDay;
  if (!day && weekday === null && (m = take(/\b(?:el\s+|este\s+|el\s+proximo\s+|proximo\s+|el\s+otro\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+que\s+viene)?\b/))) {
    weekday = DAYS.indexOf(m[1]);
  }
  if (!day && (m = take(/\bel\s+(?:dia\s+)?(\d{1,2})\b(?!\s*[:.h]\d)(?!\s*(?:am|pm|de\s+la))/))) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) {
      day = new Date(now.getFullYear(), now.getMonth(), d);
      if (day < startOf(now)) day = new Date(now.getFullYear(), now.getMonth() + 1, d);
    }
  }

  // ── Hora ──
  let hh: number | null = null, mm = 0, explicitAmPm: "am" | "pm" | null = null;
  if (take(/\b(?:al|a)\s+mediodia\b/)) { hh = 12; }
  else if (take(/\ba\s+(?:la\s+)?medianoche\b/)) { hh = 0; if (!day) day = addDays(startOf(now), 1); }
  else if ((m = take(new RegExp(`\\b(?:a\\s+las?|a\\s+eso\\s+de\\s+las?|tipo|las)\\s+${HOURW}(?:\\s*(?::|\\.|h)\\s*(\\d{2}))?(?:\\s+(y\\s+media|y\\s+cuarto|menos\\s+cuarto|en\\s+punto))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|am|pm|hrs?|horas)?\\b`)))
    || (m = take(/\b(\d{1,2})\s*:\s*(\d{2})\s*(?:(y\s+media|y\s+cuarto|menos\s+cuarto|en\s+punto))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm|hrs?|horas)?\b/))
    || (m = take(/\b(\d{1,2})\s*()()(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)\b/))) {
    hh = toNum(m[1]);
    mm = m[2] ? Number(m[2]) : 0;
    if (m[3]) { if (/media/.test(m[3])) mm = 30; else if (/y\s+cuarto/.test(m[3])) mm = 15; else if (/menos/.test(m[3])) { hh = (hh ?? 0) - 1; mm = 45; } }
    if (m[4]) explicitAmPm = /p/.test(m[4]) ? "pm" : /a/.test(m[4]) ? "am" : null;
  }

  if (hh !== null && !isNaN(hh)) {
    const p = explicitAmPm ?? (period === "pm" || period === "night" || tonight || thisAfternoon ? "pm" : period === "am" || period === "dawn" ? "am" : null);
    if (p === "pm" && hh < 12) hh += 12;
    if (p === "am" && hh === 12) hh = 0;
    const base = day ?? (weekday !== null ? nextWeekday(now, weekday, hh, mm) : startOf(now));
    const cand = new Date(base); cand.setHours(hh, mm, 0, 0);
    if (!p && repeat !== "none" && hh >= 5 && hh < 12) {
      // rutina repetida sin "am/pm" ("todos los días a las 7"): de mañana, la próxima vez
      at = cand <= now && !day && weekday === null ? addDays(cand, 1) : cand;
    } else if (!day && weekday === null && !p) {
      // sin "am/pm": elige la próxima vez que llega esa hora (hoy o mañana; 1–7 suele ser tarde)
      const pmCand = new Date(cand); if (hh < 12) pmCand.setHours(hh + 12);
      if (hh >= 1 && hh <= 7 && pmCand > now) at = pmCand;
      else if (cand > now) at = cand;
      else if (hh < 12 && pmCand > now) at = pmCand;
      else at = addDays(cand, 1);
    } else if (!day && weekday === null && cand <= now) {
      at = addDays(cand, 1);
    } else at = cand;
  } else if (!at && (day || weekday !== null || tonight || thisAfternoon)) {
    // día sin hora → 9:00 (esta tarde 16:00, esta noche 20:00)
    const base = day ?? nextWeekday(now, weekday!, 9, 0);
    at = new Date(base);
    at.setHours(tonight ? 20 : thisAfternoon ? 16 : period === "pm" ? 16 : period === "night" ? 20 : 9, 0, 0, 0);
    if (at <= now) at = new Date(now.getTime() + 60 * 6e4);
  }

  // ── Título: lo que queda ──
  let title = "";
  let i = 0;
  for (const [a, b] of [...cut].sort((x, y) => x[0] - y[0])) { title += original.slice(i, a) + " "; i = Math.max(i, b); }
  title += original.slice(i);
  title = title.replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]*(?:(?:de\s+que|que|para|de|a|y|el|la)\s+)*/i, "")
    .replace(/[\s,.:;-]*(?:\s(?:a|de|para|el|la|y|en))?[\s,.:;-]*$/i, "")
    .trim();
  title = title ? title[0].toUpperCase() + title.slice(1) : "";

  if (!kind) kind = at ? "reminder" : "task";
  if (!title) title = kind === "note" ? "Nota" : kind === "task" ? "Tarea" : "Recordatorio";
  if (kind === "reminder" && !at) at = new Date(now.getTime() + 60 * 6e4); // por si acaso: en 1 hora
  return { kind, title, at, repeat, loud, understood };
}

function nextWeekday(now: Date, wd: number, hh: number, mm: number) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  let ahead = (wd - now.getDay() + 7) % 7;
  const today = new Date(now); today.setHours(hh, mm, 0, 0);
  if (ahead === 0 && today <= now) ahead = 7;
  d.setDate(d.getDate() + ahead);
  return d;
}

const REP_ES: Record<Repeat, string> = { none: "", daily: "cada día", weekdays: "de lunes a viernes", weekly: "cada semana", monthly: "cada mes" };

/** "Mañana 11:00 · Llamar a cliente" */
export function describe(p: Parsed, now = new Date()): string {
  if (p.kind === "note") return `Nota · ${p.title}`;
  if (!p.at) return `Tarea · ${p.title}`;
  const d = p.at;
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const hm = d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
  const when = sameDay(d, now) ? `Hoy ${hm}` : sameDay(d, tomorrow) ? `Mañana ${hm}`
    : `${d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })} ${hm}`;
  const rep = REP_ES[p.repeat] ? ` (${REP_ES[p.repeat]})` : "";
  return `${p.kind === "task" ? "Tarea · " : ""}${when}${rep} · ${p.title}`;
}
