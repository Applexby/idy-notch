// Estante: guarda referencias a archivos (no los copia)
import { getSettings, local } from "./settings";
import { createStore } from "./store";

export interface ShelfItem { path: string; name: string; ext: string; addedAt: number }

const KEY = "idy-shelf";
export const shelf = createStore<{ items: ShelfItem[]; selected: string[]; dragging: boolean }>({
  items: getSettings().shelfStartEmpty ? [] : local.get<ShelfItem[]>(KEY, []),
  selected: [], dragging: false,
});
shelf.subscribe(() => local.set(KEY, shelf.get().items));

const nameOf = (p: string) => p.split(/[\\/]/).pop() || p;
export function addPaths(paths: string[]) {
  const have = new Set(shelf.get().items.map((i) => i.path));
  const add = paths.filter((p) => !have.has(p)).map((p) => {
    const name = nameOf(p);
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "carpeta";
    return { path: p, name, ext, addedAt: Date.now() };
  });
  shelf.set((s) => ({ items: [...add, ...s.items].slice(0, 200) }));
}
export const removePaths = (paths: string[]) =>
  shelf.set((s) => ({ items: s.items.filter((i) => !paths.includes(i.path)), selected: s.selected.filter((p) => !paths.includes(p)) }));
export const clearShelf = () => shelf.set({ items: [], selected: [] });
export const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
