import React from 'react';
import type { StemKey, StemTrackConfig } from '../lib/audioEngine';
import { SlidersHorizontal, Volume2, VolumeX, Radio, Disc, Mic, Music, Drum } from 'lucide-react';

interface StemMixerProps {
  trackConfigs: Map<StemKey, StemTrackConfig>;
  activeStemKey: StemKey;
  setActiveStemKey: (key: StemKey) => void;
  onVolumeChange: (key: StemKey, vol: number) => void;
  onToggleMute: (key: StemKey) => void;
  onToggleSolo: (key: StemKey) => void;
  stemEnergies: Record<StemKey, number>;
}

export const StemMixer: React.FC<StemMixerProps> = ({
  trackConfigs,
  activeStemKey,
  setActiveStemKey,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
  stemEnergies,
}) => {
  const stemList: { key: StemKey; label: string; sublabel: string; icon: React.ReactNode; color: string }[] = [
    {
      key: 'drums',
      label: 'Drums & Percussion',
      sublabel: 'Kick, Snare, Hi-Hat (Fokus Beat Detection)',
      icon: <Drum className="w-4 h-4 text-amber-400" />,
      color: 'accent-amber-500',
    },
    {
      key: 'bass',
      label: 'Bass & Sub-Bass',
      sublabel: 'Low-frequency (<250 Hz)',
      icon: <Disc className="w-4 h-4 text-purple-400" />,
      color: 'accent-purple-500',
    },
    {
      key: 'vocals',
      label: 'Vocal Track',
      sublabel: 'Mute untuk Mode Karaoke / Instrumental',
      icon: <Mic className="w-4 h-4 text-cyan-400" />,
      color: 'accent-cyan-500',
    },
    {
      key: 'other',
      label: 'Other Instruments',
      sublabel: 'Synthesizer, Guitar, Piano, Chords',
      icon: <Music className="w-4 h-4 text-emerald-400" />,
      color: 'accent-emerald-500',
    },
  ];

  // Hitung total energi stem untuk menghitung persentase kontribusi Riemann
  const totalStemEnergy = Math.max(
    1e-7,
    (stemEnergies.drums || 0) + (stemEnergies.bass || 0) + (stemEnergies.vocals || 0) + (stemEnergies.other || 0)
  );

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            AI Multi-Track Stem Mixer (4 Channel)
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          DSP / Web Audio API
        </span>
      </div>

      <p className="text-xs text-slate-400 mb-3 leading-relaxed">
        Gunakan tombol <span className="text-amber-400 font-semibold">[S] Solo</span> untuk mendengar satu instrumen, atau <span className="text-red-400 font-semibold">[M] Mute</span> untuk mematikan vokal (karaoke).
      </p>

      {/* Daftar Track Stem */}
      <div className="space-y-3">
        {stemList.map((item) => {
          const cfg = trackConfigs.get(item.key) || {
            key: item.key,
            label: item.label,
            volume: 0.8,
            isMuted: false,
            isSolo: false,
          };

          const energy = stemEnergies[item.key] || 0;
          const energySharePercent = Math.min(100, Math.max(0, (energy / totalStemEnergy) * 100));
          const isSelected = activeStemKey === item.key;

          return (
            <div
              key={item.key}
              className={`p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-slate-950/90 border-cyan-500/50 shadow-md shadow-cyan-500/5'
                  : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-slate-900 border border-slate-800">
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      {item.label}
                      {cfg.isMuted && <span className="text-[10px] text-red-400 font-mono font-normal">[MUTED]</span>}
                      {cfg.isSolo && <span className="text-[10px] text-amber-400 font-mono font-normal">[SOLO]</span>}
                    </div>
                    <div className="text-[10px] text-slate-500">{item.sublabel}</div>
                  </div>
                </div>

                {/* Tombol Target Riemann Analysis & Solo/Mute */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveStemKey(item.key)}
                    title="Analisis stem ini di monitor balok Riemann"
                    className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Radio className="w-3 h-3" /> Riemann
                  </button>

                  <button
                    onClick={() => onToggleSolo(item.key)}
                    className={`w-7 h-7 rounded text-xs font-mono font-bold transition flex items-center justify-center ${
                      cfg.isSolo
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    S
                  </button>

                  <button
                    onClick={() => onToggleMute(item.key)}
                    className={`w-7 h-7 rounded text-xs font-mono font-bold transition flex items-center justify-center ${
                      cfg.isMuted
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    M
                  </button>
                </div>
              </div>

              {/* Slider Volume & Live Energy Gauge */}
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-8 flex items-center gap-2">
                  <span className="text-slate-500">
                    {cfg.isMuted || cfg.volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={cfg.isMuted ? 0 : cfg.volume}
                    onChange={(e) => onVolumeChange(item.key, parseFloat(e.target.value))}
                    disabled={cfg.isMuted}
                    className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer ${item.color}`}
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                    {Math.round((cfg.isMuted ? 0 : cfg.volume) * 100)}%
                  </span>
                </div>

                <div className="col-span-4">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                    <span>Porsi Energi:</span>
                    <span className="text-slate-200 font-bold">{energySharePercent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-100"
                      style={{ width: `${energySharePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
