import { ReactNode, useEffect, useState } from "react";
import { usernameToEmail } from "@shared/config";
import { autostart, invoke, IS_TAURI, on, openUrl, openWeb, quitApp } from "../lib/native";
import { checkUpdate, installUpdate, updates } from "../lib/update";
import { PAGE_LABEL, setSettings, useSettings, type PageId, type Settings } from "../lib/settings";
import { supabase } from "../lib/supa";
import { alarm, chime } from "../lib/sound";
import { clearShelf } from "../lib/shelf";
import { listMonitors } from "../lib/window";
import { Ico, PAGE_ICON } from "../notch/icons";

type Sec = "general" | "display" | "appearance" | "music" | "todo" | "focus" | "reminders" | "shelf" | "hud" | "account" | "about";
const SECS: { id: Sec; label: string; icon: string; color: string }[] = [
  { id: "general", label: "General", icon: "gear", color: "#8e8e93" },
  { id: "display", label: "Pantalla", icon: "display", color: "#5e5ce6" },
  { id: "appearance", label: "Apariencia", icon: "contrast", color: "#48484a" },
  { id: "music", label: "Música y letras", icon: "music", color: "#ff375f" },
  { id: "todo", label: "To-do", icon: "check", color: "#30d158" },
  { id: "focus", label: "Enfoque", icon: "timer", color: "#ff9f0a" },
  { id: "reminders", label: "Recordatorios", icon: "alarm", color: "#ff6b22" },
  { id: "shelf", label: "Estante", icon: "shelf", color: "#ffb340" },
  { id: "hud", label: "Avisos", icon: "bell", color: "#32ade6" },
  { id: "account", label: "Cuenta", icon: "user", color: "#0a84ff" },
];
const EXTRA: Record<string, string> = {
  display: "M3 5h18v11H3zM8 20h8M12 16v4",
  contrast: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18v18",
  bell: "M12 3a6 6 0 0 0-6 6v3.6L4.4 15a1 1 0 0 0 .8 1.6h13.6a1 1 0 0 0 .8-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2.5 15.5a2.5 2.5 0 0 0 5 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-3.9 3.1-7 7-7s7 3.1 7 7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8.5v.5",
  up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6",
};
const I = ({ n, s = 15 }: { n: string; s?: number }) =>
  EXTRA[n] ? <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={EXTRA[n]} /></svg> : <Ico n={n} s={s} w={2} />;

function initial(): Sec {
  const h = location.hash.slice(1) as Sec;
  return SECS.some((s) => s.id === h) || h === "about" ? h : "general";
}

export default function SettingsApp() {
  const [sec, setSec] = useState<Sec>(initial);
  useEffect(() => { const u = on<string>("settings-page", (p) => setSec(p as Sec)); return () => { u.then((f) => f()); }; }, []);
  const minimize = async () => {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  };
  const close = async () => {
    if (!IS_TAURI) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  };
  return (
    <div className="win">
      <aside className="side" data-tauri-drag-region>
        <div className="lights" data-tauri-drag-region>
          <button className="light red" onClick={close} aria-label="Cerrar" title="Cerrar">
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.6 2.6l4.8 4.8M7.4 2.6 2.6 7.4" /></svg>
          </button>
          <button className="light yellow" onClick={minimize} aria-label="Minimizar" title="Minimizar">
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.4 5h5.2" /></svg>
          </button>
        </div>
        <nav>
          {SECS.map((s) => (
            <button key={s.id} className={sec === s.id ? "on" : ""} onClick={() => setSec(s.id)}>
              <span className="sq" style={{ background: s.color }}><I n={s.icon} s={14} /></span>{s.label}
            </button>
          ))}
        </nav>
        <button className={`about ${sec === "about" ? "on" : ""}`} onClick={() => setSec("about")}>
          <span className="sq" style={{ background: "#636366" }}><I n="info" s={14} /></span>Acerca de
        </button>
      </aside>
      <main className="main">
        <div className="drag" data-tauri-drag-region />
        <div className="content" key={sec}>
          {sec === "general" && <General />}
          {sec === "display" && <Display />}
          {sec === "appearance" && <Appearance />}
          {sec === "music" && <Music />}
          {sec === "todo" && <Todo />}
          {sec === "focus" && <Focus />}
          {sec === "reminders" && <Reminders />}
          {sec === "shelf" && <Shelf />}
          {sec === "hud" && <Hud />}
          {sec === "account" && <Account />}
          {sec === "about" && <About />}
        </div>
      </main>
    </div>
  );
}

// ───────── Controles ─────────
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return <section>{title && <h4>{title}</h4>}<div className="group">{children}</div></section>;
}
function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return <div className="srow"><div className="srow-t"><div>{label}</div>{hint && <small>{hint}</small>}</div>{children}</div>;
}
function Sw({ k, label, hint }: { k: keyof Settings; label: string; hint?: string }) {
  const s = useSettings();
  return <Row label={label} hint={hint}><Switch on={!!s[k]} set={(v) => setSettings({ [k]: v } as Partial<Settings>)} /></Row>;
}
function Switch({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return <button role="switch" aria-checked={on} className={`sw ${on ? "on" : ""}`} onClick={() => set(!on)}><span /></button>;
}
function Seg<T extends string | number>({ value, opts, set, wide }: { value: T; opts: [T, string][]; set: (v: T) => void; wide?: boolean }) {
  return (
    <div className={`seg ${wide ? "wide" : ""}`}>
      {opts.map(([v, l]) => <button key={String(v)} className={v === value ? "on" : ""} onClick={() => set(v)}>{l}</button>)}
    </div>
  );
}
const H = ({ children }: { children: ReactNode }) => <h2>{children}</h2>;

// ───────── Secciones ─────────
function General() {
  const s = useSettings();
  const [auto, setAuto] = useState(false);
  useEffect(() => { autostart().then((a) => a.enabled()).then(setAuto).catch(() => {}); }, []);
  return <>
    <H>General</H>
    <Group title="Inicio">
      <Row label="Iniciar con Windows"><Switch on={auto} set={async (v) => { const a = await autostart(); await a.set(v); setAuto(await a.enabled()); }} /></Row>
    </Group>
    <Group title="Notch">
      <div className="srow col">
        <div className="srow-t"><div>Tamaño</div><small>Automático es un poco más grande en monitores anchos</small></div>
        <Seg wide value={s.size} set={(v) => setSettings({ size: v })} opts={[["auto", "Auto"], [100, "100%"], [115, "115%"], [130, "130%"], [150, "150%"]]} />
      </div>
      <Sw k="minimal" label="Notch mínimo" hint="Una línea fina cuando no suena nada" />
      <Sw k="mascot" label="Mascota" hint="Un par de ojitos que viven en el notch cuando estás inactivo" />
    </Group>
    <Group title="Sonidos">
      <Sw k="sounds" label="Sonidos de aviso" hint="Campanita para Enfoque, To-do y recordatorios" />
      <Row label="Volumen">
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => setSettings({ volume: Number(e.target.value) })} />
        <button className="btn small" onClick={() => chime(true)}>Probar</button>
      </Row>
    </Group>
    <Group title="Otras ventanas">
      <Sw k="hideFullscreen" label="Ocultar en pantalla completa" hint="Juegos, videos y presentaciones que llenan la pantalla" />
      <Sw k="dodgeMaximized" label="Encoger sobre ventanas maximizadas" hint="Se vuelve una barrita para no tapar la barra de direcciones del navegador" />
    </Group>
  </>;
}

function Display() {
  const s = useSettings();
  const [mons, setMons] = useState<{ name: string; width: number; height: number; primary: boolean }[]>([]);
  useEffect(() => { listMonitors().then(setMons); }, []);
  const active = s.monitor ?? mons.find((m) => m.primary)?.name;
  return <>
    <H>Pantalla</H>
    <Group title="Pantalla del notch">
      <div className="srow col">
        <div className="srow-t"><div>Pantalla</div><small>Haz clic en una pantalla para mover el notch ahí</small></div>
        <div className="mons">
          {mons.map((m, i) => (
            <button key={m.name + i} className={`mon ${m.name === active ? "on" : ""}`} onClick={() => setSettings({ monitor: m.name })}>
              {m.name === active && <i className="mon-notch" />}
              <b>{i + 1}</b><small>{m.width}×{m.height}{m.primary ? " · Principal" : ""}</small>
            </button>
          ))}
        </div>
      </div>
    </Group>
  </>;
}

function Appearance() {
  const s = useSettings();
  const all = Object.keys(PAGE_LABEL) as PageId[];
  const toggle = (p: PageId) => setSettings({ pages: s.pages.includes(p) ? s.pages.filter((x) => x !== p) : [...s.pages, p] });
  const move = (p: PageId, d: number) => {
    const a = [...s.pages], i = a.indexOf(p), j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setSettings({ pages: a });
  };
  const ordered = [...s.pages, ...all.filter((p) => !s.pages.includes(p))];
  return <>
    <H>Apariencia</H>
    <Group title="Notch">
      <Row label="Abrir el notch"><Seg value={s.openOn} set={(v) => setSettings({ openOn: v })} opts={[["hover", "Al pasar"], ["click", "Clic"]]} /></Row>
      <Sw k="pageIcons" label="Íconos de página" hint="Muestra los íconos al pasar por los puntos" />
    </Group>
    <Group title="Movimiento">
      <Row label="Velocidad de animación"><Seg value={s.animSpeed} set={(v) => setSettings({ animSpeed: v })} opts={[["normal", "Normal"], ["fast", "Rápida"]]} /></Row>
    </Group>
    <Group title="Páginas">
      {ordered.map((p) => {
        const on = s.pages.includes(p);
        return (
          <div className="srow" key={p}>
            <span className="pg-ico"><Ico n={PAGE_ICON[p]} s={15} /></span>
            <div className="srow-t"><div>{PAGE_LABEL[p]}</div></div>
            {on && <><button className="ib" onClick={() => move(p, -1)} aria-label="Subir"><I n="up" /></button>
              <button className="ib" onClick={() => move(p, 1)} aria-label="Bajar"><I n="down" /></button></>}
            <Switch on={on} set={() => (on && s.pages.length === 1 ? null : toggle(p))} />
          </div>
        );
      })}
    </Group>
  </>;
}

function Music() {
  return <>
    <H>Música y letras</H>
    <Group title="Letras">
      <Sw k="showLyrics" label="Mostrar letras" hint="Desde LRCLIB, una base de letras comunitaria" />
      <Sw k="lyricsInClosed" label="Letra en el notch cerrado" hint="La línea actual aparece mientras suena la canción" />
    </Group>
    <p className="note">Funciona con cualquier reproductor que use los controles multimedia de Windows: Spotify, Apple Music, YouTube en el navegador…</p>
  </>;
}

function Todo() {
  const s = useSettings();
  return <>
    <H>To-do</H>
    <Group title="Avisos">
      <Sw k="todoRemindStart" label="Cuando una tarea empieza" />
      <Sw k="todoRemindEnd" label="Cuando se acaba el tiempo" hint="Para tareas con duración" />
      <Row label="Posponer"><Seg value={s.snoozeMin} set={(v) => setSettings({ snoozeMin: v })} opts={[[5, "5 min"], [10, "10 min"], [15, "15 min"]]} /></Row>
    </Group>
    <p className="note">Las tareas se sincronizan con tu cuenta: créalas aquí, en el iPhone o compártelas con un grupo.</p>
  </>;
}

function Focus() {
  const s = useSettings();
  return <>
    <H>Enfoque</H>
    <Group title="Duración">
      <Row label="Enfoque"><Seg value={s.focusMin} set={(v) => setSettings({ focusMin: v })} opts={[[15, "15"], [25, "25"], [45, "45"], [50, "50"], [90, "90"]]} /></Row>
      <Row label="Descanso corto"><Seg value={s.shortMin} set={(v) => setSettings({ shortMin: v })} opts={[[3, "3"], [5, "5"], [10, "10"]]} /></Row>
      <Row label="Descanso largo"><Seg value={s.longMin} set={(v) => setSettings({ longMin: v })} opts={[[10, "10"], [15, "15"], [20, "20"], [30, "30"]]} /></Row>
      <Sw k="autoBreak" label="Encadenar automáticamente" hint="Empieza el siguiente bloque sin tocar nada" />
    </Group>
  </>;
}

function Reminders() {
  const [ringing, setRinging] = useState<null | (() => void)>(null);
  return <>
    <H>Recordatorios</H>
    <Group title="Alarma">
      <Sw k="alarmLoop" label="Sonar hasta que la detenga" hint="Si lo apagas, suena una sola vez" />
      <Row label="Probar alarma">
        <button className="btn small" onClick={() => { if (ringing) { ringing(); setRinging(null); } else setRinging(() => alarm()); }}>{ringing ? "Detener" : "Sonar"}</button>
      </Row>
    </Group>
    <p className="note">Los recordatorios llegan a tu iPhone como notificación y en el PC suenan como alarma en el notch. Créalos desde el notch (página Recordatorios) o desde la web.</p>
  </>;
}

function Shelf() {
  return <>
    <H>Estante</H>
    <Group title="Estante">
      <Sw k="shelfStartEmpty" label="Empezar con el estante vacío" hint="Los archivos de la sesión anterior se quitan al abrir IDY" />
      <Row label="Vaciar ahora"><button className="btn small" onClick={clearShelf}>Vaciar</button></Row>
    </Group>
    <p className="note">El estante solo guarda la ubicación de tus archivos; nunca los copia ni los mueve.</p>
  </>;
}

function Hud() {
  return <>
    <H>Avisos</H>
    <Group title="Avisos del sistema">
      <Sw k="hudCharging" label="Cargador" hint="Al conectar o desconectar el cargador" />
      <Sw k="hudHeadphones" label="Auriculares" hint="Al conectar o desconectar auriculares Bluetooth" />
    </Group>
  </>;
}

function WebApp() {
  const s = useSettings();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(s.webUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* sin portapapeles */ }
  };
  return (
    <Group title="Web app">
      <Row label="Abrir la web de IDY" hint="La misma app del iPhone, en una ventana del PC: grupos, notas, tareas y recordatorios completos">
        <button className="btn small primary-s" onClick={() => openWeb(s.webUrl)}>Abrir</button>
      </Row>
      <Row label="Copiar enlace" hint="Para abrirla en el iPhone o pasársela a un amigo">
        <button className="btn small" onClick={copy}>{copied ? "Copiado ✓" : "Copiar"}</button>
      </Row>
    </Group>
  );
}

function Account() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>(null);
  const [profile, setProfile] = useState<{ username: string; display_name: string | null } | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [inv, setInv] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return setProfile(null);
    supabase.from("profiles").select("username,display_name").eq("id", session.user.id).single().then(({ data }) => setProfile(data));
  }, [session?.user.id]);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.functions.invoke("signup", { body: { username: u, password: p, invite_code: inv, display_name: name } });
        if (error) {
          const ctx = (error as { context?: Response }).context;
          const j = ctx?.json ? await ctx.json().catch(() => null) : null;
          throw new Error(j?.error ?? error.message);
        }
        if (!data?.ok) throw new Error("No se pudo crear la cuenta");
      }
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password: p });
      if (error) throw new Error(error.message.includes("Invalid") ? "Usuario o contraseña incorrectos." : error.message);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (session) return <>
    <H>Cuenta</H>
    <Group>
      <div className="srow">
        <span className="avatar">{(profile?.display_name || profile?.username || "?")[0]?.toUpperCase()}</span>
        <div className="srow-t"><div>{profile?.display_name || profile?.username}</div><small>@{profile?.username} · sincronizado</small></div>
        <button className="btn small" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
    </Group>
    <WebApp />
    <p className="note">Grupos, invitaciones y notificaciones del iPhone se gestionan desde la web app (Ajustes).</p>
  </>;

  return <>
    <H>Cuenta</H>
    <Group>
      <div className="srow col">
        <Seg value={mode} set={setMode} opts={[["login", "Entrar"], ["signup", "Crear cuenta"]]} />
        <input className="in" placeholder="Usuario" value={u} onChange={(e) => setU(e.target.value.toLowerCase().replace(/\s/g, ""))} />
        <input className="in" type="password" placeholder="Contraseña" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {mode === "signup" && <>
          <input className="in" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="in" placeholder="Código de invitación" value={inv} onChange={(e) => setInv(e.target.value.toUpperCase())} />
        </>}
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !u || !p} onClick={submit}>{busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear y entrar"}</button>
      </div>
    </Group>
    <WebApp />
  </>;
}

function Updates() {
  const u = updates.use();
  useEffect(() => { if (u.status === "idle") checkUpdate(); }, []);
  const msg = {
    idle: "", checking: "Buscando…", none: "Tienes la última versión", available: `Versión ${u.version} disponible`,
    downloading: `Descargando… ${Math.round(u.progress * 100)}%`, ready: "Instalando…", error: "No se pudo buscar actualizaciones",
  }[u.status];
  return (
    <Group title="Actualizaciones">
      <Row label={msg || "Actualizaciones"} hint={u.status === "error" ? "Revisa tu conexión o que las versiones estén publicadas en GitHub" : u.status === "available" ? "Se descarga, se instala y IDY se reinicia solo" : undefined}>
        {u.status === "available" || u.status === "downloading" || u.status === "ready"
          ? <button className="btn small primary-s" disabled={u.status !== "available"} onClick={installUpdate}>Actualizar ahora</button>
          : <button className="btn small" disabled={u.status === "checking"} onClick={checkUpdate}>Buscar</button>}
      </Row>
      {u.status === "downloading" && <div className="srow"><div className="pbar"><i style={{ width: `${u.progress * 100}%` }} /></div></div>}
    </Group>
  );
}

function Diag() {
  const s = useSettings();
  const [fg, setFg] = useState<{ state: number; class: string } | null>(null);
  useEffect(() => {
    const read = () => invoke<{ state: number; class: string }>("get_foreground").then((v) => v && setFg(v)).catch(() => {});
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, []);
  const label = ["Normal (hora y fecha)", "Barrita (ventana maximizada)", "Oculto (pantalla completa)"][fg?.state ?? 0];
  return (
    <Group title="Diagnóstico">
      <Row label="Ventana activa" hint={fg?.class || "—"}><span className="muted">{label}</span></Row>
      {s.minimal && <Row label="Notch mínimo está activado" hint="Por eso ves una barrita en lugar de la hora"><button className="btn small" onClick={() => setSettings({ minimal: false })}>Desactivar</button></Row>}
    </Group>
  );
}

function About() {
  return <div className="aboutp">
    <img src="/app-icon.png" width={72} height={72} alt="" />
    <h3>IDY Notch</h3>
    <small>Versión 1.7.0 · Un notch vivo para Windows</small>
    <Group title="Info">
      <Row label="Letras"><button className="lnk" onClick={() => openUrl("https://lrclib.net")}>LRCLIB ›</button></Row>
      <Row label="Hecho por"><span className="muted">Applexby</span></Row>
    </Group>
    <Updates />
    <Diag />
    <button className="btn danger" onClick={() => quitApp()}>Salir de IDY</button>
  </div>;
}
