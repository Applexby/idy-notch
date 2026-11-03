// Actualizaciones automáticas (GitHub Releases + firma)
import { IS_TAURI } from "./native";
import { createStore } from "./store";

type Status = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error";
export const updates = createStore<{ status: Status; version: string | null; progress: number; error: string | null }>({
  status: "idle", version: null, progress: 0, error: null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: any = null;

export async function checkUpdate() {
  if (!IS_TAURI) return;
  updates.set({ status: "checking", error: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check();
    pending = u;
    updates.set(u ? { status: "available", version: u.version } : { status: "none" });
  } catch (e) {
    updates.set({ status: "error", error: String(e) });
  }
}

export async function installUpdate() {
  if (!pending) await checkUpdate();
  if (!pending) return;
  let total = 0, got = 0;
  updates.set({ status: "downloading", progress: 0 });
  try {
    await pending.downloadAndInstall((ev: { event: string; data: { contentLength?: number; chunkLength?: number } }) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? 0;
      if (ev.event === "Progress") { got += ev.data.chunkLength ?? 0; if (total) updates.set({ progress: got / total }); }
      if (ev.event === "Finished") updates.set({ status: "ready", progress: 1 });
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    updates.set({ status: "error", error: String(e) });
  }
}
