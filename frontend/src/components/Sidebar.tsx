import React, { useRef } from "react";
import {
  IconHomeFilled,
  IconHome,
  IconChartHistogram,
  IconMusic,
  IconUpload,
  IconLoader2,
} from "@tabler/icons-react";
import type { TrackStemData } from "../lib/proceduralSongs";

interface SidebarProps {
  activeView: "home" | "studio";
  onSelectView: (v: "home" | "studio") => void;
  currentTrack: TrackStemData | null;
  onSelectPreset: (genre: "edm" | "pop" | "rock") => void;
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
}

const PRESETS: { genre: "edm" | "pop" | "rock"; name: string; artist: string; gradient: string; duration: string }[] = [
  { genre: "edm", name: "Neon Cyber Drop", artist: "Riemann Waves", gradient: "from-[#1db954] to-[#0f5e2e]", duration: "0:16" },
  { genre: "pop", name: "Midnight Groove", artist: "The Atmos", gradient: "from-[#8b5cf6] to-[#4c1d95]", duration: "0:16" },
  { genre: "rock", name: "Overdrive Ignition", artist: "Volt Circuit", gradient: "from-[#fb7185] to-[#9f1239]", duration: "0:16" },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  currentTrack,
  onSelectPreset,
  onFileUpload,
  isProcessing,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside className="hidden md:flex w-[280px] shrink-0 flex-col gap-2 py-2 pl-2 h-full">
      <nav className="bg-[#121212] rounded-lg p-2">
        <div className="flex items-center gap-2 px-3 py-2 mb-2">
          <div className="size-7 rounded-full bg-[#1db954] flex items-center justify-center">
            <IconMusic className="size-4 text-black" />
          </div>
          <span className="font-bold text-white tracking-tight">Riemann Audio Lab</span>
        </div>

        <button
          onClick={() => onSelectView("home")}
          className={`w-full flex items-center gap-4 px-3 py-2.5 rounded-md font-semibold cursor-pointer transition ${
            activeView === "home" ? "text-white" : "text-[#a7a7a7] hover:text-white"
          }`}
        >
          {activeView === "home" ? <IconHomeFilled className="size-6" /> : <IconHome className="size-6" />}
          Beranda
        </button>

        <button
          onClick={() => onSelectView("studio")}
          className={`w-full flex items-center gap-4 px-3 py-2.5 rounded-md font-semibold cursor-pointer transition ${
            activeView === "studio" ? "text-white" : "text-[#a7a7a7] hover:text-white"
          }`}
        >
          <IconChartHistogram className="size-6" />
          Studio Analisis
        </button>
      </nav>

      <div className="bg-[#121212] rounded-lg flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-3 pb-2 font-bold text-[#a7a7a7]">Pustaka Kamu</div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {PRESETS.map((p) => {
            const isCurrent = currentTrack?.name === p.name;
            return (
              <button
                key={p.genre}
                onClick={() => onSelectPreset(p.genre)}
                className={`w-full flex items-center gap-3 p-2 rounded-md cursor-pointer transition text-left ${
                  isCurrent ? "bg-[#1a1a1a]" : "hover:bg-[#1a1a1a]"
                }`}
              >
                <div className={`size-11 rounded bg-gradient-to-br ${p.gradient} flex items-center justify-center shrink-0`}>
                  <IconMusic className="size-5 text-white/80" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isCurrent ? "text-[#1ed760]" : "text-white"}`}>
                    {p.name}
                  </div>
                  <div className="text-xs text-[#a7a7a7] truncate">
                    Preset {p.genre.toUpperCase()} · {p.artist}
                  </div>
                </div>
                <span className="text-xs text-[#a7a7a7]">{p.duration}</span>
              </button>
            );
          })}

          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onFileUpload(e.target.files[0]);
                e.target.value = "";
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-[#1a1a1a] transition text-left disabled:opacity-50 cursor-pointer"
          >
            <div className="size-11 rounded bg-[#333] flex items-center justify-center shrink-0">
              {isProcessing
                ? <IconLoader2 className="size-5 text-[#a7a7a7] animate-spin" />
                : <IconUpload className="size-5 text-[#a7a7a7]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {isProcessing ? "Memproses sinyal..." : "Unggah File"}
              </div>
              <div className="text-xs text-[#a7a7a7] truncate">MP3 / WAV lokal</div>
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
};
