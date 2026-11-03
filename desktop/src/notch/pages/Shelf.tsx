import { useEffect, useRef, useState } from "react";
import { fileSrc, openPath, startFileDrag } from "../../lib/native";
import { addText, clearShelf, IMAGE_EXT, removePaths, shelf, type ShelfItem } from "../../lib/shelf";
import { Ico } from "../icons";

const EXT_COLOR: Record<string, string> = {
  pdf: "#ff453a", doc: "#0a84ff", docx: "#0a84ff", xls: "#30d158", xlsx: "#30d158", csv: "#30d158", ppt: "#ff9f0a", pptx: "#ff9f0a",
  zip: "#bf5af2", rar: "#bf5af2", mp4: "#ff375f", mov: "#ff375f", mp3: "#ff375f", wav: "#ff375f", psd: "#64d2ff", ai: "#ff9f0a",
  prproj: "#bf5af2", aep: "#bf5af2", carpeta: "#ffd60a",
};

function Thumb({ item }: { item: ShelfItem }) {
  const [src, setSrc] = useState("");
  useEffect(() => { if (IMAGE_EXT.has(item.ext)) fileSrc(item.path).then(setSrc); }, [item.path, item.ext]);
  if (src) return <img className="thumb img" src={src} alt="" draggable={false} />;
  if (item.text !== undefined) return <span className="thumb txt"><span>{item.text.slice(0, 60)}</span></span>;
  const c = EXT_COLOR[item.ext] ?? "#8e8e93";
  return (
    <span className="thumb" style={{ color: c, background: `color-mix(in srgb, ${c} 16%, #1c1c1e)` }}>
      <Ico n={item.ext === "carpeta" ? "folder" : "file"} s={22} />
      {item.ext !== "carpeta" && <b>{item.ext.slice(0, 4)}</b>}
    </span>
  );
}

export default function ShelfPage() {
  const { items, selected, dragging } = shelf.use();
  const down = useRef<{ x: number; y: number; path: string } | null>(null);
  const [flash, setFlash] = useState("");
  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(""), 1600); };

  // Ctrl+V con el Estante abierto → tarjeta de texto
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      const t = e.clipboardData?.getData("text/plain");
      if (t?.trim()) { e.preventDefault(); addText(t); say("Texto guardado"); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  const pasteBtn = async () => {
    try { const t = await navigator.clipboard.readText(); if (t.trim()) { addText(t); say("Texto guardado"); } else say("El portapapeles está vacío"); }
    catch { say("Pulsa Ctrl+V aquí"); }
  };

  const click = (e: React.MouseEvent, it: ShelfItem) => {
    if (e.ctrlKey || e.metaKey) {
      shelf.set({ selected: selected.includes(it.path) ? selected.filter((p) => p !== it.path) : [...selected, it.path] });
    } else if (e.shiftKey && selected.length) {
      const idx = items.map((i) => i.path);
      const a = idx.indexOf(selected[selected.length - 1]), b = idx.indexOf(it.path);
      shelf.set({ selected: idx.slice(Math.min(a, b), Math.max(a, b) + 1) });
    } else if (selected.length) {
      shelf.set({ selected: [] });
    } else if (it.text !== undefined) {
      navigator.clipboard.writeText(it.text).then(() => say("Copiado al portapapeles"), () => say("No se pudo copiar"));
    } else openPath(it.path);
  };

  const move = (e: React.MouseEvent) => {
    const d = down.current;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    down.current = null;
    const paths = selected.includes(d.path) ? selected : [d.path];
    startFileDrag(paths);
  };

  return (
    <div className="shelf" onMouseMove={move} onMouseUp={() => (down.current = null)}>
      <div className="pg-head">
        <strong>Estante <span className="muted">{items.length || ""}</span>{flash && <span className="flash">{flash}</span>}</strong>
        <div className="row">
          <button className="nb small ghost" onClick={pasteBtn} title="Pegar texto (Ctrl+V)"><Ico n="paste" s={13} /> Pegar texto</button>
          {selected.length > 0 && <button className="nb small" onClick={() => removePaths(selected)}><Ico n="trash" s={13} /> Quitar {selected.length}</button>}
          {items.length > 0 && <button className="nb small ghost" onClick={clearShelf}>Vaciar</button>}
        </div>
      </div>
      {dragging || !items.length ? (
        <div className={`dropzone ${dragging ? "hot" : ""}`}>
          <Ico n="shelf" s={24} />
          <span>{dragging ? "Suelta para guardar aquí" : "Arrastra archivos al notch para tenerlos a mano"}</span>
          {!dragging && <small>Pega textos con Ctrl+V · clic para abrir o copiar · arrástralos fuera cuando quieras</small>}
        </div>
      ) : (
        <div className="tiles scroll" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
          {items.map((it) => (
            <button key={it.path} className={`tile ${selected.includes(it.path) ? "sel" : ""}`} title={it.text ?? it.path}
              onMouseDown={(e) => { if (e.button === 0) down.current = { x: e.clientX, y: e.clientY, path: it.path }; }}
              onClick={(e) => click(e, it)}
              onContextMenu={(e) => { e.preventDefault(); removePaths([it.path]); }}>
              <Thumb item={it} />
              <span className="tile-name">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
