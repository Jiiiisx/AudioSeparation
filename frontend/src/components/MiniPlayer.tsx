import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconAdjustmentsHorizontal } from "@tabler/icons-react";

interface MiniPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  trackName: string;
  artist: string;
  cover?: string;
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onOpenMixer: () => void;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

/** Mini-player ala Spotify mobile: garis progress tipis + cover + judul + play/pause + mixer. */
export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  isPlaying,
  currentTime,
  duration,
  trackName,
  artist,
  cover,
  onPlayPause,
  onSeek,
  onOpenMixer,
}) => {
  return (
    <footer
      className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-[#181818] border-t border-white/5"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* garis progress tipis */}
      <input
        type="range"
        min="0"
        max={Math.max(0.01, duration)}
        step="0.01"
        value={Math.min(currentTime, duration)}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        aria-label="Posisi lagu"
        className="w-full h-2 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:rounded [&::-webkit-slider-runnable-track]:bg-[#4d4d4d] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:-mt-[3.5px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-track]:h-0.5 [&::-moz-range-track]:bg-[#4d4d4d] [&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
      />
      <div className="flex items-center gap-3 px-2 py-1.5">
        {cover ? (
          <img src={cover} alt="" className="size-9 rounded object-cover shrink-0" />
        ) : (
          <div className="size-9 rounded bg-[#282828] shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white truncate leading-tight">{trackName}</div>
          <div className="text-[11px] text-[#a7a7a7] truncate leading-tight">{artist}</div>
        </div>
        <span className="text-[10px] text-[#a7a7a7] font-mono shrink-0">{fmt(currentTime)}</span>
        <button onClick={onOpenMixer} title="Stem Mixer" className="text-[#a7a7a7] hover:text-white p-2 -mr-1 cursor-pointer">
          <IconAdjustmentsHorizontal className="size-5" />
        </button>
        <button
          onClick={onPlayPause}
          title={isPlaying ? "Jeda" : "Putar"}
          className="size-9 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition cursor-pointer"
        >
          {isPlaying ? <IconPlayerPauseFilled className="size-4.5" /> : <IconPlayerPlayFilled className="size-4.5 ml-0.5" />}
        </button>
      </div>
    </footer>
  );
};
