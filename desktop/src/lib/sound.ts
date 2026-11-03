// Sonidos sintetizados con Web Audio (no hace falta incluir archivos de audio).
import { getSettings } from "./settings";

let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new AudioContext());

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + dur + 0.05);
}

/** Campanita suave (Pomodoro, tareas) */
export function chime(force = false) {
  const s = getSettings();
  if (!s.sounds && !force) return;
  const v = 0.35 * s.volume;
  ac().resume();
  tone(880, 0, 1.2, v); tone(1318.5, 0.14, 1.4, v * 0.8); tone(1760, 0.28, 1.6, v * 0.5);
}

/** Patrón de alarma: se repite hasta que se llame a stop() */
export function alarm(): () => void {
  const s = getSettings();
  ac().resume();
  const v = 0.5 * s.volume;
  const ring = () => {
    for (let i = 0; i < 4; i++) { tone(1046.5, i * 0.18, 0.16, v, "triangle"); tone(1568, i * 0.18 + 0.02, 0.14, v * 0.4); }
  };
  ring();
  if (!s.alarmLoop) return () => {};
  let n = 0;
  const t = setInterval(() => { if (++n > 110) return clearInterval(t); ring(); }, 1600); // ~3 min máx.
  return () => clearInterval(t);
}
