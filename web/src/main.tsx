import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerSW } from "./push";
import "./styles.css";

registerSW();
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

// Quita el splash de los ojitos en cuanto la app está lista (mínimo ~0,5 s para que se vea el parpadeo)
const t0 = performance.now();
requestAnimationFrame(() => setTimeout(() => {
  const el = document.getElementById("splash");
  if (!el) return;
  el.classList.add("out");
  setTimeout(() => el.remove(), 260);
}, Math.max(0, 520 - (performance.now() - t0))));
