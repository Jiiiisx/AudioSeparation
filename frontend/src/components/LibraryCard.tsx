import { IconMusic, IconPlayerPlayFilled, IconTrash, IconBrandSpotify } from "@tabler/icons-react";
import { apiBase } from "../lib/songApi";
import type { LibrarySong } from "../lib/songApi";

// Komponen ini HARUS tetap di scope modul (bukan di dalam App). Kalau didefinisikan
// ulang tiap render, React menganggapnya tipe baru → subtree unmount/remount →
// <img> reload → thumbnail flicker (dipicu re-render tiap tick audio).
export const LibraryCard: React.FC<{
  song: LibrarySong;
  variant: "grid" | "compact" | "list";
  isLoading: boolean;
  active: boolean;
  status?: string;
  index?: number;
  onSelect: (song: LibrarySong) => void;
  onDelete: (id: number) => void;
}> = ({ song, variant, isLoading, active, status, index, onSelect, onDelete }) => {
  const del = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(song.id);
  };

  if (variant === "compact") {
    return (
      <button
        onClick={() => !isLoading && onSelect(song)}
        disabled={isLoading}
        className="group relative aspect-square rounded-md overflow-hidden cursor-pointer"
        title={`${song.title} · ${song.artist}`}
      >
        {song.cover ? (
          <img src={`${apiBase}${song.cover}`} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center">
            <IconBrandSpotify className="size-6 text-white/80" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          {!isLoading && <IconPlayerPlayFilled className="size-5 text-white" />}
        </div>
        {active && <div className="absolute inset-0 ring-2 ring-inset ring-[#1ed760]" />}
        <span role="button" onClick={del} className="absolute top-1 right-1 p-0.5 rounded bg-black/60 opacity-0 group-hover:opacity-100 text-white/80 hover:text-red-400 transition cursor-pointer">
          <IconTrash className="size-3.5" />
        </span>
      </button>
    );
  }

  if (variant === "list") {
    return (
      <button
        onClick={() => !isLoading && onSelect(song)}
        disabled={isLoading}
        className={`group w-full flex items-center gap-3 px-3 py-2 hover:bg-[#1f1f1f] transition text-left cursor-pointer ${active ? "bg-[#1a1a1a]" : ""}`}
      >
        <span className="w-5 text-xs text-[#7a7a7a] text-right shrink-0 hidden sm:block">{index}</span>
        <span className="relative size-10 rounded overflow-hidden shrink-0">
          {song.cover ? (
            <img src={`${apiBase}${song.cover}`} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center">
              <IconMusic className="size-4 text-white/80" />
            </div>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold truncate ${active ? "text-[#1ed760]" : "text-white"}`}>{song.title}</span>
          <span className="block text-xs text-[#a7a7a7] truncate">{song.artist}</span>
        </span>
        <span className="hidden group-hover:block text-[#1ed760] shrink-0 w-5 text-center">
          {isLoading ? "..." : <IconPlayerPlayFilled className="size-4" />}
        </span>
        <span role="button" onClick={del} className="p-1 rounded opacity-0 group-hover:opacity-100 text-[#a7a7a7] hover:text-red-400 transition cursor-pointer">
          <IconTrash className="size-4" />
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => !isLoading && onSelect(song)}
      disabled={isLoading}
      className="group relative p-3 rounded-lg bg-[#181818] hover:bg-[#1f1f1f] transition text-left cursor-pointer"
    >
      <div className="relative mb-2">
        {isLoading && (
          <div className="absolute inset-0 z-10 rounded-md bg-black/70 flex flex-col items-center justify-center gap-2">
            <div className="size-7 rounded-full border-2 border-white/20 border-t-[#1ed760] animate-spin" />
            <span className="text-[11px] text-white/80 text-center px-2">{status || "Memuat stem..."}</span>
          </div>
        )}
        {song.cover ? (
          <img src={`${apiBase}${song.cover}`} alt="" className="aspect-square w-full rounded-md object-cover" loading="lazy" />
        ) : (
          <div className="aspect-square w-full rounded-md bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center">
            <IconBrandSpotify className="size-8 text-white/80" />
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 size-9 rounded-full bg-[#1ed760] flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition shadow-lg">
          <IconPlayerPlayFilled className="size-[18px] text-black fill-black" />
        </div>
      </div>
      <div className={`text-sm font-semibold truncate ${active ? "text-[#1ed760]" : "text-white"}`}>{song.title}</div>
      <div className="text-xs text-[#a7a7a7] truncate">{song.artist}</div>
      <span role="button" title="Hapus dari pustaka" onClick={del} className="absolute top-2 right-2 p-1 rounded bg-black/50 opacity-0 group-hover:opacity-100 text-[#a7a7a7] hover:text-red-400 transition cursor-pointer">
        <IconTrash className="size-4" />
      </span>
    </button>
  );
};
