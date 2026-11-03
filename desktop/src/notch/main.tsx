import React from "react";
import { createRoot } from "react-dom/client";
import Notch from "./Notch";
import { startSync } from "../lib/sync";
import { IS_TAURI } from "../lib/native";
import "./notch.css";

if (!IS_TAURI && location.search.includes("mock")) import("./mock").then((m) => m.installMock());
else startSync();
createRoot(document.getElementById("root")!).render(<React.StrictMode><Notch /></React.StrictMode>);
