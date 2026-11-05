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
  timed: boolean;       // se entendió una fecha u hora
  explicit: boolean;    // se dijo el tipo ("recordatorio", "tarea", "anota"…)
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, media: 0.5,
};
const UNITS = "uno|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve";
const WORDS = "dieciseis|diecisiete|dieciocho|diecinueve|veintiuno|veintiuna|veintiun|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|" +
  "un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|media";
const NUMW = `(\\d{1,3}|(?:treinta|cuarenta|cincuenta)\\s+y\\s+(?:${UNITS})|${WORDS})`;
const HOURW = "(\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintiuna|veintidos|veintitres)";
const MINW = `(\\d{1,2}|cuarto|media|(?:treinta|cuarenta|cincuenta)\\s+y\\s+(?:${UNITS})|${WORDS})`;
function toNum(s: string): number {
  if (/^\d/.test(s)) return Number(s);
  const m = /^(treinta|cuarenta|cincuenta)\s+y\s+(\w+)$/.exec(s);
  if (m) return NUM[m[1]] + (NUM[m[2]] ?? NaN);
  return NUM[s] ?? NaN;
}

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
  // primera coincidencia que no pise un trozo ya tomado
  const find = (re: RegExp): RegExpExecArray | null => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const mm = m;
      if (!cut.some(([a, b]) => mm.index < b && mm.index + mm[0].length > a)) return mm;
      g.lastIndex = mm.index + 1; // reintenta justo después del inicio

    }
    return null;
  };
  const commit = (m: RegExpExecArray) => {
    cut.push([m.index, m.index + m[0].length]);
    understood.push(m[0].trim());
    return m;
  };
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = find(re);
    return m ? commit(m) : null;
  };

  let kind: Kind | null = null;
  let loud: boolean | null = null;
  let wake = false;

  // ── Muletillas: "oye", "por favor", "puedes…", "quiero que…" ──
  take(/^(?:(?:oye|hola|ey|hey|idy|aidi|ok|okay|vale|bueno|porfa|por\s+favor|porfavor)\b[\s,.!]*)+/);
  take(/^(?:(?:me\s+)?(?:puedes|podrias|quisiera\s+que|quiero\s+que|necesito\s+que|necesito|quiero)\s+)/);
  take(/[\s,]*\b(?:por\s+favor|porfa|porfavor)\b[\s,.!]*/);

  // "con el título…", "bajo el título…", "ponle de título…", "que diga…"
  take(/\b(?:con|bajo|y\s+de|de|como)\s+(?:el\s+|un\s+)?(?:titulo|nombre|tema|asunto)\b\s*(?:de\s+)?[:,]?\s*/);

  // ── Tipo: recordatorio, nota o tarea, dicho de cualquier forma y en cualquier parte ──
  const VERB = "(?:pon|ponme|ponle|poner|crea|creame|crear|agrega|agregame|agregar|anade|anademe|haz|hazme|hacer|programa|programame|programar|activa|activame|activar|" +
    "agenda|agendame|agendar|configura|configurame|establece|mete|metele|guarda|guardame|genera|generame|registra|registrame|apunta|apuntame|anota|anotame|" +
    "deja|dejame|necesito|quiero|nueva|nuevo)";
  const ART = "(?:\\s+(?:me|un|una|el|la|otra|otro|nueva|nuevo|mi))*";
  const PRE = `(?:\\b(?:${VERB}${ART}|un|una|otra|otro|nueva|nuevo|mi)\\s+)?`;
  const AFTER = "\\b[\\s,:.]*(?:(?:de\\s+que|que|para\\s+que|para|de|sobre|acerca\\s+de)\\s+)?";
  const kinds: { re: RegExp; kind: Kind; loud?: boolean }[] = [
    // recordatorios y alarmas
    { kind: "reminder", loud: true, re: new RegExp(`${PRE}\\b(?:alarmas?|despertador)${AFTER}`) },
    { kind: "reminder", loud: true, re: new RegExp(`\\b(?:despiertame|levantame|despertarme)${AFTER}`) },
    { kind: "reminder", loud: false, re: new RegExp(`${PRE}\\b(?:avisos?|notificacion(?:es)?)${AFTER}`) },
    { kind: "reminder", loud: false, re: new RegExp(`\\b(?:avisame|avisanos|avisa(?:me)?|notificame|notifica(?:me)?)(?:lo|la)?${AFTER}`) },
    { kind: "reminder", re: new RegExp(`${PRE}\\brecordatorios?${AFTER}`) },
    { kind: "reminder", re: new RegExp(`\\b(?:haz|hazme|hasme|has|hacer|hagas)\\s+(?:(?:me|un)\\s+)?(?:recordar|acordar)(?:lo|la)?${AFTER}`) },
    { kind: "reminder", re: new RegExp(`\\b(?:no\\s+(?:me\\s+)?(?:dejes|dejas)\\s+olvidar|que\\s+no\\s+se\\s+me\\s+olvide|que\\s+no\\s+me\\s+olvide)${AFTER}`) },
    { kind: "reminder", re: new RegExp(`\\b(?:recuerdame|recuerdeme|recuerdanos|recuerdamelo|recuerdamela|recuerda(?:me)?|recordarme|recordar|acuerdame|acuerdate|(?:me\\s+)?recuerdes|(?:me\\s+)?recuerde)(?:lo|la)?${AFTER}`) },
    // notas
    { kind: "note", re: new RegExp(`\\btoma(?:r)?\\s+(?:una\\s+)?nota${AFTER}`) },
    { kind: "note", re: new RegExp(`${PRE}\\bnotas?${AFTER}`) },
    { kind: "note", re: new RegExp(`\\b(?:anota(?:me|r)?|apunta(?:me|r)?|apunte|escribe(?:me)?)(?:lo|la)?(?:\\s+(?:en\\s+)?(?:las\\s+)?notas)?${AFTER}`) },
    // tareas
    { kind: "task", re: new RegExp(`${PRE}\\b(?:tareas?|pendientes?|to-dos?|cosas?\\s+por\\s+hacer|cosas?\\s+que\\s+hacer)${AFTER}`) },
  ];
  // gana la que aparece primero en la frase
  let best: { m: RegExpExecArray; k: (typeof kinds)[number] } | null = null;
  for (const k of kinds) {
    const r = find(k.re);
    if (r && (!best || r.index < best.m.index)) best = { m: r, k };
  }
  if (best) {
    const r = best.m;
    cut.push([r.index, r.index + r[0].length]);
    understood.push(r[0].trim());
    kind = best.k.kind;
    wake = /despi|desper|levant/.test(r[0]);
    if (best.k.loud !== undefined) loud = best.k.loud;
    // "una nota que diga…", "un recordatorio que se llame…"
    const end = r.index + r[0].length;
    const q = /^\s*(?:que\s+)?(?:diga|dice|se\s+llame)\b[\s:,]*/.exec(text.slice(end));
    if (q) cut.push([end, end + q[0].length]);
  }
  take(/\b(?:que\s+diga|que\s+se\s+llame)\b\s*:?\s*/);
  let m: RegExpExecArray | null;
  // "con el título…", "bajo el título…", "que diga…", "llamado…"
  // un verbo suelto al inicio ("pon bajo el título…") no es parte del título
  // un verbo de orden al inicio ("pon bajo el título…", "agéndame una reunión…") no es parte del título
  take(new RegExp(`^(?:pon|ponme|ponle|crea|creame|agrega|agregame|anade|anademe|programa|programame|activa|activame|agenda|agendame|configura|guarda|guardame|genera|generame|registra|registrame|anota|anotame|apunta|apuntame|dejame${best ? "|haz|hazme|deja" : ""})(?:\\s+(?:me|un|una|el|la))*\\b[\\s,:]*`));

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
  if ((m = take(new RegExp(`(?:\\b(?:en|dentro\\s+de|de\\s+aqui\\s+a|luego\\s+de|despues\\s+de|por)\\s+${kind === "reminder" ? "|^|(?<=\\s)" : ""})${NUMW}\\s*(minutos?|mins?|m|horas?|hrs?|h|dias?)\\b(?:\\s+y\\s+media)?`)))) {
    const n = toNum(m[1]);
    const unit = m[2];
    const extra = /y\s+media/.test(m[0]) ? 0.5 : 0;
    const ms = unit.startsWith("d") ? 864e5 : /^h/.test(unit) ? 36e5 : 6e4;
    if (!isNaN(n)) at = new Date(now.getTime() + (n + extra) * ms);
  } else if (take(/\b(?:en|dentro\s+de)\s+(?:media\s+hora)\b/)) {
    at = new Date(now.getTime() + 30 * 6e4);
  } else if (take(/\b(?:en\s+un\s+(?:ratito|rato)|en\s+un\s+momento)\b/)) {
    at = new Date(now.getTime() + 30 * 6e4);
  }

  // ── Periodo del día (antes de "mañana" para no confundir "de la mañana") ──
  let period: "am" | "pm" | "night" | "dawn" | null = null;
  let pm_: RegExpExecArray | null;
  if ((pm_ = take(/\b(?:de|por|en|a)\s+la\s+(?:manana)\b/))) period = "am";
  else if ((pm_ = take(/\b(?:de|por|en|a)\s+la\s+tarde\b/))) period = "pm";
  else if ((pm_ = take(/\b(?:de|por|en|a)\s+la\s+noche\b/))) period = "night";
  else if ((pm_ = take(/\b(?:de|por|en|a)\s+la\s+madrugada\b/))) period = "dawn";
  const periodAt = pm_ ? pm_.index : -1;

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
  const AMPM = "(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|am|pm|hrs?\\.?|horas)?";
  const MINS = `(?:\\s*(?::|\\.|h)\\s*(\\d{2}))?(?:\\s+(?:y|con)\\s+${MINW}(?:\\s+minutos?)?|\\s+(menos\\s+cuarto|menos\\s+${MINW.replace(/^\(/, "(?:")}|en\\s+punto))?`;
  const setMin = (mw?: string, rest?: string) => {
    if (mw) { mm = mw === "cuarto" ? 15 : mw === "media" ? 30 : toNum(mw); }
    if (rest) {
      if (/en\s+punto/.test(rest)) mm = 0;
      else if (/menos/.test(rest)) { const k = rest.replace(/^menos\s+/, ""); const d = k === "cuarto" ? 15 : toNum(k); hh = (hh ?? 0) - 1; mm = 60 - (isNaN(d) ? 15 : d); }
    }
  };
  if (take(/\b(?:al|a|para\s+el|el)\s+mediodia\b/)) { hh = 12; }
  else if (take(/\b(?:a|para)\s+(?:la\s+)?medianoche\b/)) { hh = 0; if (!day) day = addDays(startOf(now), 1); }
  else if ((m = take(new RegExp(`\\b(?:(?:a|para|como\\s+a|tipo|sobre|hacia|desde|cuando\\s+sean?)\\s+las?|a\\s+eso\\s+de\\s+las?|tipo|las|la)\\s+${HOURW}${MINS}\\s*${AMPM}(?![\\w])`)))) {
    hh = toNum(m[1]);
    if (m[2]) mm = Number(m[2]);
    setMin(m[3], m[4]);
    if (m[5]) explicitAmPm = /^p/.test(m[5]) ? "pm" : /^a/.test(m[5]) ? "am" : null;
  } else if ((m = take(new RegExp(`\\b(\\d{1,2})\\s*[:.]\\s*(\\d{2})\\s*${AMPM}(?![\\w])`)))) {
    hh = Number(m[1]); mm = Number(m[2]);
    if (m[3]) explicitAmPm = /^p/.test(m[3]) ? "pm" : /^a/.test(m[3]) ? "am" : null;
  } else if ((m = take(/\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm|hrs?\.?|horas)(?![\w])/))) {
    hh = Number(m[1]);
    explicitAmPm = /^p/.test(m[2]) ? "pm" : /^a/.test(m[2]) ? "am" : null;
  } else if (periodAt > 0) {
    // "mañana 5 de la tarde": número suelto justo antes del periodo
    const before = text.slice(0, periodAt);
    const r = new RegExp(`(?:^|\\s)${HOURW}(?:\\s*[:.]\\s*(\\d{2}))?(?:\\s+y\\s+${MINW})?\\s*$`).exec(before);
    if (r && !cut.some(([a, b]) => r.index < b && r.index + r[0].length > a)) {
      hh = toNum(r[1]);
      if (r[2]) mm = Number(r[2]);
      setMin(r[3]);
      cut.push([r.index, r.index + r[0].length]);
      understood.push(r[0].trim());
    }
  }
  if (isNaN(mm) || mm < 0 || mm > 59) mm = 0;
  if (hh !== null && (hh < 0 || hh > 23)) hh = null;

  if (hh !== null && !isNaN(hh)) {
    let p = explicitAmPm ?? (period === "pm" || period === "night" || tonight || thisAfternoon ? "pm" : period === "am" || period === "dawn" ? "am" : null);
    // "despiértame a las 6" → de mañana; con día puesto, 1–6 sin "am/pm" suele ser de tarde
    if (!p && hh < 12 && wake) p = "am";
    if (!p && hh >= 1 && hh <= 6 && (day || weekday !== null) && repeat === "none") p = "pm";
    if (p === "pm" && hh < 12) hh += 12;
    if (p === "am" && hh === 12) hh = 0;
    const base = day ?? (weekday !== null ? nextWeekday(now, weekday, hh, mm) : startOf(now));
    const cand = new Date(base); cand.setHours(hh, mm, 0, 0);
    if (!p && repeat !== "none" && hh >= 5 && hh < 12) {
      // rutina repetida sin "am/pm" ("todos los días a las 7"): de mañana, la próxima vez
      at = cand <= now && !day && weekday === null ? addDays(cand, 1) : cand;
    } else if (!day && weekday === null && p === "am" && wake) {
      at = cand <= now ? addDays(cand, 1) : cand;
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
    .replace(/^[\s,.:;¡!¿?-]*(?:(?:de\s+que|que|para\s+que|para|de|a|y|me|se|con|sobre|acerca\s+de|tengo\s+que|debo|hay\s+que)\s+)*/i, "")
    .replace(/[\s,.:;!?-]*(?:\s(?:a|de|para|el|la|y|en|que|con|un|una))?[\s,.:;!?-]*$/i, "")
    .trim();
  title = title ? title[0].toUpperCase() + title.slice(1) : "";

  const timed = at !== null;
  const explicit = kind !== null;
  if (!kind) kind = at ? "reminder" : "task";
  if (!title) title = kind === "note" ? "Nota" : kind === "task" ? "Tarea" : wake ? "Despertar" : loud ? "Alarma" : loud === false ? "Aviso" : "Recordatorio";
  if (kind === "reminder" && !at) at = new Date(now.getTime() + 60 * 6e4); // por si acaso: en 1 hora
  return { kind, title, at, repeat, loud, understood, timed, explicit };
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
