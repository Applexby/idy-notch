import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Group, Profile } from "@shared/types";
import { supabase } from "./supabase";
import { Icon } from "./ui";
import { useOnline } from "./hooks";
import Auth from "./screens/Auth";
import Reminders from "./screens/Reminders";
import Notes from "./screens/Notes";
import Tasks from "./screens/Tasks";
import Settings from "./screens/Settings";

type Ctx = { session: Session; profile: Profile | null; groups: Group[]; reloadGroups: () => Promise<void> };
const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

type Tab = "reminders" | "notes" | "tasks" | "settings";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "reminders", label: "Recordatorios", icon: "alarm" },
  { id: "notes", label: "Notas", icon: "note" },
  { id: "tasks", label: "Tareas", icon: "task" },
  { id: "settings", label: "Ajustes", icon: "gear" },
];

function initialTab(): Tab {
  const t = new URLSearchParams(location.search).get("tab") as Tab | null;
  if (t && TABS.some((x) => x.id === t)) return t;
  try { return (localStorage.getItem("idy-tab") as Tab) || "reminders"; } catch { return "reminders"; }
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reloadGroups = async () => {
    const { data } = await supabase.from("groups").select("*").order("created_at");
    setGroups((data ?? []) as Group[]);
  };

  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile(data as Profile));
    reloadGroups();
  }, [session?.user.id]);

  useEffect(() => {
    try { localStorage.setItem("idy-tab", tab); } catch { /* sin almacenamiento */ }
    if (location.search) history.replaceState(null, "", "/");
  }, [tab]);

  if (session === undefined) return <div className="splash"><div className="notch-logo"><i /><i /></div></div>;
  if (!session) return <Auth />;

  return (
    <AppCtx.Provider value={{ session, profile, groups, reloadGroups }}>
      <OfflineBar />
      <main className={`app tab-${tab}`}>
        {tab === "reminders" && <Reminders />}
        {tab === "notes" && <Notes />}
        {tab === "tasks" && <Tasks />}
        {tab === "settings" && <Settings />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} aria-label={t.label}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </AppCtx.Provider>
  );
}

function OfflineBar() {
  const { online, pending } = useOnline();
  if (online && !pending) return null;
  return (
    <div className="offline-bar">
      {online ? `Subiendo ${pending} cambio${pending === 1 ? "" : "s"}…` : `Sin conexión · ${pending ? `${pending} cambio${pending === 1 ? "" : "s"} se subirán al volver internet` : "lo que hagas se guardará"}`}
    </div>
  );
}
