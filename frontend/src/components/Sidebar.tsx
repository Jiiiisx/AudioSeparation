import React, { useRef } from "react";
import {
  IconHomeFilled,
  IconHome,
  IconChartHistogram,
  IconMusic,
  IconUpload,
  IconLoader2,
  IconBrandYoutube,
  IconLink,
} from "@tabler/icons-react";

interface SidebarProps {
  activeView: "home" | "studio";
  onSelectView: (v: "home" | "studio") => void;
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  onOpenSpotify: () => void;
  className?: string;
  hasSpotifyJob: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  onFileUpload,
  isProcessing,
  onOpenSpotify,
  hasSpotifyJob,
  className = "",
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside className={`flex w-full w-[280px] max-w-full shrink-0 flex-col gap-2 py-2 h-full ${className}`}>
    {/* desktop parent menyembunyikan via kelas di App */}
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
        <div className="px-4 pt-3 pb-2 font-bold text-[#a7a7a7] flex items-center justify-between">
          <span>Pustaka</span>
          <button onClick={onOpenSpotify} className="text-[10px] font-bold uppercase tracking-wider text-[#1ed760] hover:text-white transition cursor-pointer">
            Taautkan
          </button>
        </div>

        <div className="px-2 pb-2 space-y-1">
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
            <div className="size-9 rounded bg-[#333] flex items-center justify-center shrink-0">
              {isProcessing
                ? <IconLoader2 className="size-4 text-[#a7a7a7] animate-spin" />
                : <IconUpload className="size-4 text-[#a7a7a7]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {isProcessing ? "Memproses sinyal..." : "Unggah File"}
              </div>
              <div className="text-xs text-[#a7a7a7] truncate">MP3 / WAV lokal</div>
            </div>
          </button>

          <button
            onClick={onOpenSpotify}
            className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-[#1a1a1a] transition text-left cursor-pointer"
          >
            <div className="size-9 rounded bg-[#333] flex items-center justify-center shrink-0">
              <IconBrandYoutube className={`size-4 ${hasSpotifyJob ? "text-[#1ed760] animate-pulse" : "text-[#aaaaaa]"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {hasSpotifyJob ? "Memproses lagu..." : "Cari lagu"}
              </div>
              <div className="text-xs text-[#a7a7a7] truncate">Cari dari YouTube</div>
            </div>
            <IconLink className="size-4 text-[#a7a7a7]" />
          </button>

          <div className="px-2 pt-1 text-xs text-[#7a7a7a] leading-relaxed">
            Daftar lagu tersimpan ada di <b className="text-[#a7a7a7]">Beranda</b>.
          </div>
        </div>
      </div>
    </aside>
  );
};
