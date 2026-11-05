import React, { useRef, useEffect } from 'react';
import { extractRiemannBars } from '../lib/riemann';
import { ZoomIn, Eye, Activity } from 'lucide-react';

interface RiemannVisualizerProps {
  samples: Float32Array | null;
  sampleRate: number;
  currentTime: number;
  duration: number;
  partitionCount: number;
  setPartitionCount: (n: number) => void;
  windowDurationSec: number;
  setWindowDurationSec: (sec: number) => void;
  isBeatHit: boolean;
  activeStemLabel: string;
}

export const RiemannVisualizer: React.FC<RiemannVisualizerProps> = ({
  samples,
  sampleRate,
  currentTime,
  duration,
  partitionCount,
  setPartitionCount,
  windowDurationSec,
  setWindowDurationSec,
  isBeatHit,
  activeStemLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // Background fill
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Subtle grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridCols = 8;
    for (let c = 1; c < gridCols; c++) {
      const x = (width / gridCols) * c;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    const gridRows = 4;
    for (let r = 1; r < gridRows; r++) {
      const y = (height / gridRows) * r;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!samples || samples.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Tidak ada sinyal audio yang dimuat', width / 2, height / 2);
      return;
    }

    // Hitung jendela waktu di sekitar currentTime
    const winStart = Math.max(0, currentTime - windowDurationSec / 2);
    const { bars, deltaT } = extractRiemannBars(
      samples,
      sampleRate,
      winStart,
      windowDurationSec,
      partitionCount
    );

    // Cari daya maksimum pada jendela ini untuk normalisasi skala Y
    let maxP = 0.05;
    for (const b of bars) {
      if (b.power > maxP) maxP = b.power;
    }
    const scaleY = (height - 30) / maxP;

    // 1. Gambar Balok-Balok Riemann Diskrit
    const barWidthPx = width / bars.length;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const barHeightPx = Math.max(2, bar.power * scaleY);
      const x = i * barWidthPx;
      const y = height - barHeightPx - 10;

      // Warna balok: Cyan gradien ke emerald
      const isWindowCenter = Math.abs(bar.timeStart - currentTime) < 0.025; // 50ms window
      if (isWindowCenter && isBeatHit) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.85)'; // Amber saat beat
        ctx.strokeStyle = '#fbbf24';
      } else if (isWindowCenter) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.75)';
        ctx.strokeStyle = '#22d3ee';
      } else {
        ctx.fillStyle = 'rgba(14, 116, 144, 0.45)';
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
      }

      ctx.fillRect(x, y, Math.max(1, barWidthPx - 1), barHeightPx);
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, Math.max(1, barWidthPx - 1), barHeightPx);
    }

    // 2. Gambar Garis Kurva Kontinu Daya P(t) = [f(t)]^2 di atas balok
    ctx.beginPath();
    ctx.strokeStyle = isBeatHit ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 2;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const x = i * barWidthPx + barWidthPx / 2;
      const y = height - (bar.power * scaleY) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Garis Indikator Playhead Sesaat (Waktu Sekarang)
    const playheadRatio = (currentTime - winStart) / windowDurationSec;
    if (playheadRatio >= 0 && playheadRatio <= 1) {
      const phX = playheadRatio * width;

      // Bayangan / Glow Playhead
      ctx.strokeStyle = isBeatHit ? 'rgba(245, 158, 11, 0.9)' : 'rgba(239, 68, 68, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label Playhead
      ctx.fillStyle = isBeatHit ? '#f59e0b' : '#ef4444';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${currentTime.toFixed(3)}s`, phX, 16);
    }

    // 4. Keterangan Matematis di Sudut Canvas
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Partisi N = ${partitionCount} Balok`, 12, 22);
    ctx.fillText(`Δt = ${(deltaT * 1000).toFixed(2)} ms / balok`, 12, 38);
    ctx.fillText(`Fungsi Daya P(t) = [f(t)]² ≥ 0`, 12, 54);

    ctx.textAlign = 'right';
    ctx.fillStyle = isBeatHit ? '#f59e0b' : '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`Target: ${activeStemLabel}`, width - 12, 22);

  }, [samples, sampleRate, currentTime, duration, partitionCount, windowDurationSec, isBeatHit, activeStemLabel]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-sm">
      {/* Header Visualizer */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            Visualisasi Balok Riemann Kurva Daya <span className="font-mono text-cyan-400 text-sm">P(t) = [f(t)]²</span>
          </h2>
        </div>

        {/* Zoom duration presets */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <span className="text-slate-400 px-1.5 flex items-center gap-1">
            <ZoomIn className="w-3.5 h-3.5" /> Jendela:
          </span>
          {[0.1, 0.25, 0.5, 1.0, 2.0].map((sec) => (
            <button
              key={sec}
              onClick={() => setWindowDurationSec(sec)}
              className={`px-2 py-0.5 rounded transition ${
                windowDurationSec === sec
                  ? 'bg-cyan-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {sec < 1 ? `${sec * 1000}ms` : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Canvas */}
      <div className="relative w-full h-64 md:h-72 rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {isBeatHit && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-mono font-bold animate-pulse flex items-center gap-1.5 shadow-lg shadow-amber-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            BEAT HIT (LONJAKAN ENERGI)
          </div>
        )}
      </div>

      {/* Slider Kontrol Partisi N */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-[240px]">
          <div className="flex justify-between text-xs mb-1.5 font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-cyan-400" /> Kerapatan Partisi Balok (N):
            </span>
            <span className="text-cyan-400 font-bold">{partitionCount} balok</span>
          </div>
          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={partitionCount}
            onChange={(e) => setPartitionCount(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>Aproksimasi Kasar (N=10)</span>
            <span className="text-slate-400">Teorema Limit: lim (N→∞) S_N = ∫ P(t) dt</span>
            <span>Aproksimasi Rapat (N=300)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
