import React from "react";
import type { StemKey, StemTrackConfig } from "../lib/audioEngine";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";

interface StemMixerProps {
  trackConfigs: Map<StemKey, StemTrackConfig>;
  activeStemKey: StemKey;
  setActiveStemKey: (key: StemKey) => void;
  onVolumeChange: (key: StemKey, vol: number) => void;
  onToggleMute: (key: StemKey) => void;
  onToggleSolo: (key: StemKey) => void;
  stemEnergies: Record<StemKey, number>;
}

const STEM_META: { key: StemKey; label: string; color: string }[] = [
  { key: "drums", label: "Drums & Percussion", color: "text-amber-400" },
  { key: "bass", label: "Bass & Sub-Bass", color: "text-purple-400" },
  { key: "vocals", label: "Vocal Track", color: "text-blue-400" },
  { key: "other", label: "Instruments Lain", color: "text-rose-400" },
];

export const StemMixer: React.FC<StemMixerProps> = ({
  trackConfigs,
  activeStemKey,
  setActiveStemKey,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
  stemEnergies,
}) => {
  const totalE = Math.max(1e-9, stemEnergies.drums + stemEnergies.bass + stemEnergies.vocals + stemEnergies.other);

  return (
    <section className="bg-[#181818] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <IconAdjustmentsHorizontal className="size-5 text-[#1db954]" />
          Stem Mixer
        </h2>
        <span className="text-xs text-[#a7a7a7]">4 channel terpisah</span>
      </div>

      <div className="flex flex-col gap-2">
        {STEM_META.map(({ key, label, color }) => {
          const cfg = trackConfigs.get(key);
          if (!cfg) return null;
          const sharePct = (stemEnergies[key] / totalE) * 100;
          const isActive = activeStemKey === key;

          return (
            <div
              key={key}
              onClick={() => setActiveStemKey(key)}
              className={`group p-3 rounded-md cursor-pointer transition ${
                isActive ? "bg-[#282828]" : "bg-transparent hover:bg-[#1a1a1a]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`size-9 rounded-full bg-[#333] flex items-center justify-center ${color} shrink-0`}>
                  <span className="text-xs font-bold uppercase">{key.slice(0, 2)}</span>
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
