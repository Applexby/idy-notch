import { FormEvent, useState } from "react";
import { usernameToEmail } from "@shared/config";
import { callFn, supabase } from "../supabase";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        await callFn("signup", { username, password, invite_code: invite, display_name: name });
      }
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
      if (error) throw new Error(error.message.includes("Invalid") ? "Usuario o contraseña incorrectos." : error.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <img className="hero-icon" src="/icons/icon-192.png" width={96} height={96} alt="" />
        <h1>IDY</h1>
        <p>Recordatorios, notas y tareas que viven en tu notch.</p>
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Entrar</button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>Crear cuenta</button>
        </div>
        <label className="field"><span>Usuario</span>
          <input autoCapitalize="none" autoCorrect="off" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} placeholder="tu_usuario" required />
        </label>
        <label className="field"><span>Contraseña</span>
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required minLength={6} />
        </label>
        {mode === "signup" && <>
          <label className="field"><span>Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo te verán tus amigos" />
          </label>
          <label className="field"><span>Código de invitación</span>
            <input autoCapitalize="characters" value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="IDY…" required />
          </label>
        </>}
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear y entrar"}</button>
      </form>
    </div>
  );
}
