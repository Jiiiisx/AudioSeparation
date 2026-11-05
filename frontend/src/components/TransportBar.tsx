import React from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Music } from 'lucide-react';

interface TransportBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  trackName: string;
  artist: string;
  genre: string;
  masterVolume: number;
  isMasterMuted: boolean;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onRestart: () => void;
  onMasterVolumeChange: (vol: number) => void;
  onToggleMasterMute: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  currentTime,
  duration,
  trackName,
  artist,
  genre,
  masterVolume,
  isMasterMuted,
  onPlayPause,
  onSeek,
  onRestart,
  onMasterVolumeChange,
  onToggleMasterMute,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
  };

  
  return (
    <div className="bg-slate-900/95 border-t border-slate-800 sticky bottom-0 z-40 px-4 py-3 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Track Metadata */}
        <div className="flex items-center gap-3 w-full md:w-1/4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div className="truncate">
            <div className="text-xs font-bold text-slate-100 truncate">{trackName}</div>
            <div className="text-[11px] text-slate-400 truncate">{artist}</div>
            <span className="inline-block text-[9px] font-mono uppercase px-1 rounded bg-slate-800 text-cyan-400 mt-0.5">
              {genre}
            </span>
          </div>
        </div>

        {/* Center: Play Controls & Timeline Slider */}
        <div className="flex-1 max-w-2xl w-full flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button
              onClick={onRestart}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition cursor-pointer"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={onPlayPause}
              className="w-9 h-9 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition shadow-lg shadow-cyan-500/25 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
          </div>

          {/* Time Scrubber */}
          <div className="w-full flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span className="w-12 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.05"
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="w-12">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Master Volume */}
        <div className="flex items-center justify-end gap-2 w-full md:w-1/4">
          <button
            onClick={onToggleMasterMute}
            className="text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            {isMasterMuted || masterVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={isMasterMuted ? 0 : masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-300"
          />
          <span className="text-[10px] font-mono text-slate-400 w-8">
            {Math.round((isMasterMuted ? 0 : masterVolume) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
