import React, { useRef } from "react";
import {
  IconHomeFilled,
  IconHome,
  IconChartHistogram,
  IconMusic,
  IconUpload,
  IconLoader2,
  IconBrandSpotify,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import type { TrackStemData } from "../lib/proceduralSongs";
import type { LibrarySong } from "../lib/songApi";

interface SidebarProps {
  activeView: "home" | "studio";
  onSelectView: (v: "home" | "studio") => void;
  currentTrack: TrackStemData | null;
  library: LibrarySong[];
  onSelectLibrary: (song: LibrarySong) => void;
  onDeleteLibrary: (id: number) => void;
  loadingLibrarySong: number | null;
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  onOpenSpotify: () => void;
  className?: string;
  hasSpotifyJob: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  currentTrack,
  library,
  onSelectLibrary,
  onDeleteLibrary,
  loadingLibrarySong,
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
        <div className="px-4 pt-3 pb-2 font-bold text-[#a7a7a7]">Pustaka Kamu</div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {library.map((song) => {
            const isCurrent = currentTrack?.name === song.title;
            const isLoading = loadingLibrarySong === song.id;
            return (
              <div
                key={song.id}
                onClick={() => !isLoading && onSelectLibrary(song)}
                className={`w-full flex items-center gap-3 p-2 rounded-md transition text-left ${
                  isLoading ? "opacity-60" : "cursor-pointer hover:bg-[#1a1a1a]"
                } ${isCurrent ? "bg-[#1a1a1a]" : ""}`}
              >
                <div className="size-11 rounded bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center shrink-0">
                  {isLoading
                    ? <IconLoader2 className="size-5 text-white/80 animate-spin" />
                    : <IconBrandSpotify className="size-5 text-white/80" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isCurrent ? "text-[#1ed760]" : "text-white"}`}>
                    {song.title}
                  </div>
                  <div className="text-xs text-[#a7a7a7] truncate">{song.artist}</div>
                </div>
                <button
                  title="Hapus dari pustaka"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLibrary(song.id);
                  }}
                  className="p-1 rounded hover:bg-[#333] text-[#a7a7a7] hover:text-white transition shrink-0 cursor-pointer"
                >
                  <IconTrash className="size-4" />
                </button>
              </div>
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

          <button
            onClick={onOpenSpotify}
            className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-[#1a1a1a] transition text-left cursor-pointer"
          >
            <div className="size-11 rounded bg-[#333] flex items-center justify-center shrink-0">
              <IconBrandSpotify className={`size-5 ${hasSpotifyJob ? "text-[#1ed760] animate-pulse" : "text-[#1db954]"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {hasSpotifyJob ? "Memproses lagu..." : "Tautkan Spotify"}
              </div>
              <div className="text-xs text-[#a7a7a7] truncate">Tempel link lagu Spotify</div>
            </div>
            <IconLink className="size-4 text-[#a7a7a7]" />
          </button>

          {library.length === 0 && (
            <div className="px-3 py-4 text-xs text-[#7a7a7a] leading-relaxed">
              Belum ada lagu tersimpan. Tempel link Spotify — lagu yang sudah diproses otomatis muncul di sini dan bisa diputar ulang tanpa proses ulang.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
