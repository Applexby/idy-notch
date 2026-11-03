import { openSettings } from "../../lib/native";
import { useSync } from "../../lib/sync";
import { Ico } from "../icons";

/** Muestra un aviso si no hay sesión iniciada */
export function Gate({ color, icon, children }: { color: string; icon: string; children: React.ReactNode }) {
  const { session, ready } = useSync();
  if (!ready) return <div className="pg-empty"><small>Cargando…</small></div>;
  if (!session) return (
    <div className="pg-empty">
      <span className="pg-empty-ico" style={{ color }}><Ico n={icon} s={26} /></span>
      <strong>Conecta tu cuenta IDY</strong>
      <small>Así se sincroniza con tu iPhone y tus amigos.</small>
      <button className="nb small" onClick={() => openSettings("account")}><Ico n="login" s={14} /> Iniciar sesión</button>
    </div>
  );
  return <>{children}</>;
}
