import { useEffect, useState } from "react";
import type { GroupMember } from "@shared/types";
import { useApp } from "../App";
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported } from "../push";
import { callFn, supabase } from "../supabase";
import { Icon, Row, Toggle, toast } from "../ui";

export default function Settings() {
  const { profile, groups, reloadGroups, session } = useApp();
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});
  const [newGroup, setNewGroup] = useState("");
  const [code, setCode] = useState("");

  const needsInstall = isIOS() && !isStandalone();

  useEffect(() => { currentSubscription().then((s) => setPushOn(!!s)).catch(() => {}); }, []);

  useEffect(() => {
    if (!groups.length) return;
    supabase.from("group_members").select("group_id,user_id,role,profiles(id,username,display_name)")
      .in("group_id", groups.map((g) => g.id)).then(({ data }) => {
        const by: Record<string, GroupMember[]> = {};
        for (const m of (data ?? []) as unknown as GroupMember[]) (by[m.group_id] ??= []).push(m);
        setMembers(by);
      });
  }, [groups]);

  async function togglePush(v: boolean) {
    setBusy(true);
    try {
      if (v) {
        const r = await enablePush();
        if (r === "ok") { setPushOn(true); toast("Notificaciones activadas"); }
        else if (r === "denied") toast("Permiso denegado. Actívalo en Ajustes › Notificaciones › IDY.");
        else toast("Este navegador no admite notificaciones.");
      } else { await disablePush(); setPushOn(false); }
    } catch (e) { toast(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function test() {
    try {
      const r = await callFn<{ sent: number }>("push-test");
      toast(r.sent ? "Enviada. Debería llegarte en segundos." : "No hay dispositivos suscritos.");
    } catch (e) { toast(e instanceof Error ? e.message : "Error"); }
  }

  async function createGroup() {
    if (!newGroup.trim()) return;
    const { error } = await supabase.rpc("create_group", { group_name: newGroup.trim() });
    if (error) return toast(error.message);
    setNewGroup(""); reloadGroups(); toast("Grupo creado");
  }
  async function joinGroup() {
    if (!code.trim()) return;
    const { error } = await supabase.rpc("join_group", { code: code.trim() });
    if (error) return toast(error.message.replace(/^.*?: /, ""));
    setCode(""); reloadGroups(); toast("Te uniste al grupo");
  }
  async function leave(id: string, name: string) {
    if (!confirm(`¿Salir de "${name}"?`)) return;
    await supabase.rpc("leave_group", { gid: id });
    reloadGroups();
  }

  return (
    <>
      <header className="top"><h1>Ajustes</h1></header>

      <div className="profile card">
        <div className="avatar">{(profile?.display_name || profile?.username || "?").slice(0, 1).toUpperCase()}</div>
        <div><strong>{profile?.display_name || profile?.username}</strong><small>@{profile?.username}</small></div>
      </div>

      <div className="label">Notificaciones en este dispositivo</div>
      {needsInstall ? (
        <div className="card install">
          <strong>Instala IDY en tu iPhone</strong>
          <ol>
            <li>Toca <b>Compartir</b> (el cuadrado con flecha ↑) en Safari</li>
            <li>Elige <b>Añadir a pantalla de inicio</b></li>
            <li>Abre IDY desde el ícono y vuelve aquí</li>
          </ol>
          <small>iOS solo permite notificaciones a las web apps instaladas.</small>
        </div>
      ) : (
        <div className="card">
          <Row label="Recibir recordatorios" hint={pushSupported() ? "Llegan aunque la app esté cerrada" : "No disponible en este navegador"}>
            <Toggle checked={pushOn} onChange={(v) => !busy && togglePush(v)} />
          </Row>
          {pushOn && <button className="btn ghost full" onClick={test}><Icon name="bell" size={18} /> Enviar prueba</button>}
        </div>
      )}
      <p className="foot">En iPhone suenan con el tono normal de notificación. Si usas modo Silencio o Concentración, permite IDY para que no se pierdan.</p>

      <div className="label">Grupos</div>
      {groups.map((g) => (
        <div key={g.id} className="card group">
          <div className="group-head">
            <strong><Icon name="users" size={18} /> {g.name}</strong>
            <button className="pill" onClick={() => { navigator.clipboard?.writeText(g.invite_code); toast("Código copiado"); }}>
              <Icon name="copy" size={14} /> {g.invite_code}
            </button>
          </div>
          <div className="members">
            {(members[g.id] ?? []).map((m) => (
              <span key={m.user_id} className="chip">{m.profiles?.display_name || m.profiles?.username}{m.role === "owner" ? " ★" : ""}</span>
            ))}
          </div>
          {g.owner_id !== session.user.id && <button className="link danger" onClick={() => leave(g.id, g.name)}>Salir del grupo</button>}
        </div>
      ))}
      <div className="card">
        <div className="inline-form">
          <input placeholder="Nombre del grupo nuevo" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
          <button className="btn small" onClick={createGroup}>Crear</button>
        </div>
        <div className="inline-form">
          <input placeholder="Código para unirte" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn small" onClick={joinGroup}>Unirme</button>
        </div>
      </div>
      <p className="foot">Lo que compartas con un grupo (recordatorios, notas o tareas) lo ven y reciben todos sus miembros.</p>

      <div className="card">
        <button className="btn ghost full danger-text" onClick={() => supabase.auth.signOut()}><Icon name="logout" size={18} /> Cerrar sesión</button>
      </div>
      <p className="foot center">IDY · v1.0</p>
    </>
  );
}
