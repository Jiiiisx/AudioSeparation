import React from "react";
import type { StemKey, StemTrackConfig } from "../lib/audioEngine";
import { IconAdjustmentsHorizontal, IconDisc, IconWaveSine, IconMicrophone2, IconGuitarPick, IconPiano, IconDeviceSpeaker } from "@tabler/icons-react";

interface StemMixerProps {
  availableKeys: StemKey[];
  trackConfigs: Map<StemKey, StemTrackConfig>;
  activeStemKey: StemKey;
  setActiveStemKey: (key: StemKey) => void;
  onVolumeChange: (key: StemKey, vol: number) => void;
  onToggleMute: (key: StemKey) => void;
  onToggleSolo: (key: StemKey) => void;
  stemEnergies: Record<StemKey, number>;
}

const STEM_META: { key: StemKey; label: string; color: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "drums", label: "Drums & Perkusi", color: "text-amber-400", icon: IconDisc },
  { key: "bass", label: "Bass & Sub-Bass", color: "text-purple-400", icon: IconWaveSine },
  { key: "vocals", label: "Vokal", color: "text-blue-400", icon: IconMicrophone2 },
  { key: "guitar", label: "Gitar", color: "text-lime-400", icon: IconGuitarPick },
  { key: "piano", label: "Piano / Keys", color: "text-cyan-400", icon: IconPiano },
  { key: "other", label: "Instrumen Lain", color: "text-rose-400", icon: IconDeviceSpeaker },
];

export const StemMixer: React.FC<StemMixerProps> = ({
  availableKeys,
  trackConfigs,
  activeStemKey,
  setActiveStemKey,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
  stemEnergies,
}) => {
  const totalE = Math.max(1e-9, availableKeys.reduce((sum, k) => sum + (stemEnergies[k] ?? 0), 0));

  return (
    <section className="bg-[#181818] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <IconAdjustmentsHorizontal className="size-5 text-[#1db954]" />
          Stem Mixer
        </h2>
        <span className="text-xs text-[#a7a7a7]">{availableKeys.length}/6 channel terpisah</span>
      </div>

      <div className="flex flex-col gap-2">
        {STEM_META.map(({ key, label, color, icon: Icon }) => {
          const cfg = trackConfigs.get(key);
          if (!cfg) return null;
          const available = availableKeys.includes(key);
          const sharePct = ((stemEnergies[key] ?? 0) / totalE) * 100;
          const isActive = activeStemKey === key && available;

          return (
            <div
              key={key}
            onClick={available ? () => setActiveStemKey(key) : undefined}
            className={`group p-3 rounded-md ${
              !available
                ? "opacity-35 grayscale"
                : isActive
                ? "bg-[#282828] cursor-pointer"
                : "bg-transparent hover:bg-[#1a1a1a] cursor-pointer"
            }`}
            >
              <div className="flex items-center gap-3">
                {!available && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#a7a7a7] bg-[#282828] rounded-full px-2 py-0.5 whitespace-nowrap">
                    Belum Model
                  </span>
                )}
                <div className={`size-9 rounded-full bg-[#242424] flex items-center justify-center ${color} shrink-0`}>
                  <Icon className="size-[18px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{label}</span>
                    <span className="text-xs font-mono text-[#a7a7a7] shrink-0">{sharePct.toFixed(1)}%</span>
                  </div>
                  {/* Energy share bar */}
                  <div className="mt-1 h-1 rounded-full bg-[#4d4d4d] overflow-hidden">
                    <div className="h-full rounded-full bg-[#1db954] transition-all duration-150" style={{ width: `${sharePct}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSolo(key); }}
                  className={`size-7 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    cfg.isSolo ? "bg-[#1ed760] text-black" : "bg-[#333] text-[#a7a7a7] hover:text-white"
                  }`}
                  title="Solo"
                >
                  S
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleMute(key); }}
                  className={`size-7 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    cfg.isMuted ? "bg-rose-500 text-white" : "bg-[#333] text-[#a7a7a7] hover:text-white"
                  }`}
                  title="Mute"
                >
                  M
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={cfg.volume}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onVolumeChange(key, parseFloat(e.target.value))}
                  style={{ "--fill-percent": `${cfg.volume * 100}%` } as React.CSSProperties}
                  className="flex-1"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
