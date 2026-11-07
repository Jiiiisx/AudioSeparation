import React from "react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconArrowsShuffle,
  IconRepeat,
  IconVolume2,
  IconVolume3,
  IconMusic,
} from "@tabler/icons-react";

interface PlayerBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  trackName: string;
  artist: string;
  cover?: string | null;
  masterVolume: number;
  isMasterMuted: boolean;
  onPlayPause: () => void;
  onSeek: (secs: number) => void;
  onRestart: () => void;
  onMasterVolumeChange: (vol: number) => void;
  onToggleMasterMute: () => void;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const PlayerBar: React.FC<PlayerBarProps> = ({
  isPlaying,
  currentTime,
  duration,
  trackName,
  artist,
  cover,
  masterVolume,
  isMasterMuted,
  onPlayPause,
  onSeek,
  onRestart,
  onMasterVolumeChange,
  onToggleMasterMute,
}) => {
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="h-[72px] shrink-0 bg-black flex items-center justify-between gap-4 px-4">
      {/* Kiri: info track */}
      <div className="flex items-center gap-3 w-[30%] min-w-0">
        {cover ? (
          <img src={cover} alt="" className="size-14 rounded-md object-cover shrink-0" />
        ) : (
          <div className="size-14 rounded-md bg-gradient-to-br from-[#1db954]/60 to-[#191414] flex items-center justify-center shrink-0">
            <IconMusic className="size-6 text-white/80" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{trackName}</div>
          <div className="text-xs text-[#a7a7a7] truncate">{artist}</div>
        </div>
      </div>

      {/* Tengah: transport */}
      <div className="flex flex-col items-center gap-1.5 w-[40%] max-w-[540px]">
        <div className="flex items-center gap-5">
          <button
            className="text-[#a7a7a7] hover:text-white transition cursor-pointer"
            title="Acak (segera hadir)"
          >
            <IconArrowsShuffle className="size-5" />
          </button>
          <button
            onClick={onRestart}
            className="text-[#a7a7a7] hover:text-white transition cursor-pointer"
            title="Mulai awal"
          >
            <IconPlayerSkipBackFilled className="size-6" />
          </button>
          <button
            onClick={onPlayPause}
            className="size-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition cursor-pointer"
          >
            {isPlaying ? <IconPlayerPauseFilled className="size-5" /> : <IconPlayerPlayFilled className="size-5 ml-0.5" />}
          </button>
          <button className="text-[#b3b3b3]/40 cursor-not-allowed" title="Berikutnya (segera hadir)">
            <IconPlayerSkipForwardFilled className="size-6" />
          </button>
          <button className="text-[#a7a7a7] hover:text-white transition cursor-pointer" title="Ulangi (segera hadir)">
            <IconRepeat className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 w-full">
          <span className="text-[11px] text-[#a7a7a7] w-9 text-right font-mono">{fmt(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(0.01, duration)}
            step="0.01"
            value={Math.min(currentTime, duration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            style={{ "--fill-percent": `${progressPct}%` } as React.CSSProperties}
            className="flex-1"
          />
          <span className="text-[11px] text-[#a7a7a7] w-9 font-mono">{fmt(duration)}</span>
        </div>
      </div>

      {/* Kanan: volume */}
      <div className="flex items-center justify-end gap-2 w-[30%]">
        <button
          onClick={onToggleMasterMute}
          className="text-[#a7a7a7] hover:text-white transition cursor-pointer"
          title={isMasterMuted ? "Aktifkan suara" : "Bisukan"}
        >
          {isMasterMuted ? <IconVolume3 className="size-5" /> : <IconVolume2 className="size-5" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMasterMuted ? 0 : masterVolume}
          onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
          style={{ "--fill-percent": `${(isMasterMuted ? 0 : masterVolume) * 100}%` } as React.CSSProperties}
          className="w-24"
        />
      </div>
    </footer>
  );
};
