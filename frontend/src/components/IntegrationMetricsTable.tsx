import React from 'react';
import type { IntegrationMetrics } from '../lib/riemann';
import { Calculator, BarChart3 } from 'lucide-react';

interface IntegrationMetricsTableProps {
  metrics: IntegrationMetrics;
}

export const IntegrationMetricsTable: React.FC<IntegrationMetricsTableProps> = ({ metrics }) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            Komparasi Akumulasi Energi (Metode Integrasi Numerik)
          </h2>
        </div>
        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/30">
          N = {metrics.partitionCount} Partisi (Δt = {(metrics.deltaT * 1000).toFixed(2)} ms)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 font-mono text-xs">
        {/* Riemann Kiri */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="font-semibold text-slate-200">Riemann Kiri (Left)</span>
            <span className="text-[10px] text-cyan-400">Pertemuan 11</span>
          </div>
          <div className="text-cyan-400 text-lg font-bold">
            {metrics.leftRiemann.toFixed(6)} <span className="text-xs font-normal text-slate-400">J</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            ∑ [f(t_k)]² · Δt (alas kiri)
          </div>
        </div>

        {/* Riemann Titik Tengah */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="font-semibold text-slate-200">Riemann Titik Tengah</span>
            <span className="text-[10px] text-cyan-400">Midpoint</span>
          </div>
          <div className="text-cyan-300 text-lg font-bold">
            {metrics.midpointRiemann.toFixed(6)} <span className="text-xs font-normal text-slate-400">J</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Aproksimasi titik tengah sub-interval
          </div>
        </div>

        {/* Simpson 1/3 Rule */}
        <div className="bg-slate-950 p-3 rounded-lg border border-emerald-900/40 bg-emerald-950/10">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="font-semibold text-emerald-200">Aturan Simpson 1/3</span>
            <span className="text-[10px] text-emerald-400 font-bold">Paling Presisi</span>
          </div>
          <div className="text-emerald-400 text-lg font-bold">
            {metrics.simpson.toFixed(6)} <span className="text-xs font-normal text-slate-400">J</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Interpolasi parabola orde-2 (Δt/3)
          </div>
        </div>
      </div>

      {/* Row Tambahan: Riemann Kanan & Trapesium */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 font-mono text-xs">
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
          <div>
            <span className="text-slate-400">Riemann Kanan (Right Sum):</span>
            <div className="text-[10px] text-slate-500">Evaluasi sampel t_(k+1)</div>
          </div>
          <div className="text-right">
            <span className="text-slate-200 font-bold">{metrics.rightRiemann.toFixed(6)} J</span>
          </div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
          <div>
            <span className="text-slate-400">Aturan Trapesium (Trapezoid):</span>
            <div className="text-[10px] text-slate-500">Rata-rata balok kiri & kanan</div>
          </div>
          <div className="text-right">
            <span className="text-slate-200 font-bold">{metrics.trapezoidal.toFixed(6)} J</span>
          </div>
        </div>
      </div>

      {/* Analisis Galat (Error Analysis untuk Artikel Ilmiah) */}
      <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 text-slate-300 font-semibold mb-1">
          <BarChart3 className="w-3.5 h-3.5 text-cyan-400" /> Analisis Galat Komputasi (Bahan Artikel Ilmiah):
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed mb-2">
          Dengan membandingkan aproksimasi <span className="text-cyan-300">Jumlah Riemann</span> terhadap standar acuan <span className="text-emerald-300">Simpson 1/3</span> pada selang waktu yang sama, diperoleh galat relatif sebesar:
        </p>
        <div className="flex items-center justify-between font-mono bg-slate-900 px-3 py-1.5 rounded border border-slate-800">
          <span className="text-slate-400">Galat Relatif (|S_left - S_simp| / S_simp):</span>
          <span className={`font-bold ${metrics.errorLeftVsSimp < 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {metrics.errorLeftVsSimp.toFixed(4)} %
          </span>
        </div>
      </div>
    </div>
  );
};
