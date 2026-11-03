export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface Profile { id: string; username: string; display_name: string | null; timezone: string }
export interface Group { id: string; name: string; invite_code: string; owner_id: string; created_at: string }
export interface GroupMember { group_id: string; user_id: string; role: "owner" | "member"; profiles?: Profile }

export interface Reminder {
  id: string; owner_id: string; group_id: string | null;
  title: string; notes: string | null;
  fire_at: string; next_fire_at: string | null; repeat: Repeat; timezone: string;
  alarm: boolean; color: string; last_fired_at: string | null; done: boolean;
  created_at: string; updated_at: string;
}

export interface ChecklistItem { id: string; text: string; done: boolean }
export interface Note {
  id: string; owner_id: string; group_id: string | null;
  title: string; body: string; checklist: ChecklistItem[];
  color: string; pinned: boolean; archived: boolean;
  created_at: string; updated_at: string;
}

export interface Task {
  id: string; owner_id: string; group_id: string | null;
  title: string; notes: string | null; due_at: string | null; duration_min: number | null;
  priority: number; color: string; done: boolean; completed_at: string | null;
  position: number; created_at: string; updated_at: string;
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Una vez", daily: "Cada día", weekdays: "Lunes a viernes", weekly: "Cada semana", monthly: "Cada mes",
};

export const COLORS: Record<string, string> = {
  default: "#2a2a2e", orange: "#ff9f0a", yellow: "#ffd60a", green: "#30d158",
  blue: "#0a84ff", purple: "#bf5af2", pink: "#ff375f", teal: "#64d2ff",
};
