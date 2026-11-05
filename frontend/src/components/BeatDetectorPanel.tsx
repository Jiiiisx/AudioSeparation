import React from "react";
import type { BeatState } from "../lib/beatDetector";
import { IconBolt, IconWaveSine } from "@tabler/icons-react";

interface BeatDetectorPanelProps {
  beatState: BeatState;
  sensitivityC: number;
  setSensitivityC: (c: number) => void;
}

export const BeatDetectorPanel: React.FC<BeatDetectorPanelProps> = ({
  beatState,
  sensitivityC,
  setSensitivityC,
}) => {
  const scaleMax = Math.max(1e-5, beatState.threshold * 1.5);
  const energyPct = Math.min(100, (beatState.currentEnergy / scaleMax) * 100);

  return (
    <section className="bg-[#181818] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <IconBolt className="size-5 text-[#1db954]" />
          Deteksi Ketukan Bass
        </h2>
        <div
          className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-colors ${
            beatState.isBeat ? "bg-[#1ed760] text-black" : "bg-[#282828] text-[#a7a7a7]"
          }`}
        >
          <span className={`size-2 rounded-full ${beatState.isBeat ? "bg-black" : "bg-[#535353]"}`}></span>
          {beatState.isBeat ? "BEAT TERDETEKSI" : "IDLE"}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#a7a7a7] mb-1">Lebar jendela</div>
          <div className="text-white font-bold text-sm">{beatState.windowDurationMs} ms</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#a7a7a7] mb-1">Partisi M</div>
          <div className="text-white font-bold text-sm">{beatState.sampleCountM} balok</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#a7a7a7] mb-1">Energi sesaat</div>
          <div className="text-white font-bold text-sm">{(beatState.currentEnergy * 1000).toFixed(2)} mJ</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#a7a7a7] mb-1">Rasio vs ambang</div>
          <div className={`font-bold text-sm ${beatState.ratio >= sensitivityC ? "text-[#1ed760]" : "text-white"}`}>
            {beatState.ratio.toFixed(2)}x
          </div>
        </div>
      </div>

      {/* Gauge energi */}
      <div className="mb-4">
        <div className="relative h-1.5 rounded-full bg-[#3e3e3e] overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-100 ${
              beatState.isBeat ? "bg-[#1ed760]" : "bg-white/60"
            }`}
            style={{ width: `${energyPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[#a7a7a7] mt-1">
          <span>E_window</span>
          <span>C × E_avg = {(sensitivityC * beatState.averageEnergy * 1000).toFixed(1)} mJ</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[#a7a7a7] flex items-center gap-1.5">
            <IconWaveSine className="size-4 text-[#1db954]" />
            Sensitivitas C
          </span>
          <span className="text-[#1ed760] font-bold">{sensitivityC.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="1.1"
          max="1.8"
          step="0.05"
          value={sensitivityC}
          onChange={(e) => setSensitivityC(parseFloat(e.target.value))}
          style={{ "--fill-percent": `${((sensitivityC - 1.1) / 0.7) * 100}%` } as React.CSSProperties}
          className="w-full"
        />
      </div>
    </section>
  );
};
