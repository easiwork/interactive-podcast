import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AudioTranscriptPlayer from "./App.tsx";

createRoot(document.getElementById("root")!).render(<AudioTranscriptPlayer />);
