import React from 'react';
import type { BeatState } from '../lib/beatDetector';
import { Zap, Gauge, Sliders } from 'lucide-react';

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
  const energyPercent = Math.min(100, (beatState.currentEnergy / Math.max(1e-5, beatState.threshold * 1.5)) * 100);
  const thresholdPercent = Math.min(100, (beatState.threshold / Math.max(1e-5, beatState.threshold * 1.5)) * 100);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            Detektor Dentuman Bass (Moving Window Riemann)
          </h2>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold transition-colors duration-150 flex items-center gap-1.5 ${
          beatState.isBeat 
            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' 
            : 'bg-slate-800 text-slate-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${beatState.isBeat ? 'bg-slate-950 animate-ping' : 'bg-slate-600'}`}></span>
          {beatState.isBeat ? 'BASS DROP / BEAT HIT' : 'IDLE'}
        </div>
      </div>

      {/* Grid Metrik Window Riemann */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 font-mono text-xs">
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[10px] uppercase">Lebar Window (ΔT)</div>
          <div className="text-slate-100 font-bold mt-0.5">{beatState.windowDurationMs} ms</div>
          <div className="text-[10px] text-slate-500">M = {beatState.sampleCountM} balok</div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[10px] uppercase">Energi Sesaat (E_win)</div>
          <div className={`font-bold mt-0.5 ${beatState.isBeat ? 'text-amber-400' : 'text-cyan-400'}`}>
            {(beatState.currentEnergy * 1000).toFixed(3)} mJ
          </div>
          <div className="text-[10px] text-slate-500">∑ [f(t_k)]² · Δt</div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[10px] uppercase">Rata-Rata (E_avg)</div>
          <div className="text-slate-300 font-bold mt-0.5">
            {(beatState.averageEnergy * 1000).toFixed(3)} mJ
          </div>
          <div className="text-[10px] text-slate-500">Histori background</div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[10px] uppercase">Ambang Batas (C·E_avg)</div>
          <div className="text-amber-300 font-bold mt-0.5">
            {(beatState.threshold * 1000).toFixed(3)} mJ
          </div>
          <div className="text-[10px] text-slate-500">Rasio: {beatState.ratio.toFixed(2)}x</div>
        </div>
      </div>

      {/* Visual Energy vs Threshold Bar */}
      <div className="mb-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
        <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
          <span className="flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Rasio Energi Sesaat vs Threshold:
          </span>
          <span className={`font-bold ${beatState.isBeat ? 'text-amber-400' : 'text-slate-300'}`}>
            {beatState.ratio.toFixed(2)} / {sensitivityC.toFixed(2)} C
          </span>
        </div>
        <div className="relative w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          {/* Energy Fill */}
          <div
            className={`h-full transition-all duration-75 ${
              beatState.isBeat ? 'bg-amber-400 shadow-lg shadow-amber-400/50' : 'bg-cyan-500'
            }`}
            style={{ width: `${energyPercent}%` }}
          />
          {/* Threshold Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
            style={{ left: `${thresholdPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
          <span>0 J</span>
          <span className="text-red-400">Garis Merah: Ambang Batas C={sensitivityC.toFixed(2)}</span>
          <span>Max Sinyal</span>
        </div>
      </div>

      {/* Sensitivity C Slider */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex justify-between items-center text-xs font-mono mb-1.5">
          <span className="text-slate-400 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-amber-400" /> Sensitivitas Ambang Batas (C):
          </span>
          <span className="text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
            C = {sensitivityC.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="1.1"
          max="2.0"
          step="0.05"
          value={sensitivityC}
          onChange={(e) => setSensitivityC(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
          <span>1.10 (Sangat Sensitif)</span>
          <span className="text-slate-400">Standar Diktat: 1.30 – 1.50</span>
          <span>2.00 (Hanya Hentakan Kuat)</span>
        </div>
      </div>
    </div>
  );
};
