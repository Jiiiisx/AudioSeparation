import React from "react";
import type { IntegrationMetrics } from "../lib/riemann";
import { IconChartAreaLineFilled } from "@tabler/icons-react";

interface IntegrationMetricsTableProps {
  metrics: IntegrationMetrics;
}

export const IntegrationMetricsTable: React.FC<IntegrationMetricsTableProps> = ({ metrics }) => {
  const rows = [
    { name: "Riemann Kiri", formula: "∑ P(t_k) Δt", value: metrics.leftRiemann },
    { name: "Riemann Kanan", formula: "∑ P(t_k+1) Δt", value: metrics.rightRiemann },
    { name: "Titik Tengah", formula: "∑ P(t_k+½) Δt", value: metrics.midpointRiemann },
    { name: "Trapesium", formula: "(Δt/2)(P₀ + 2∑P_k + P_N)", value: metrics.trapezoidal },
    { name: "Simpson 1/3", formula: "(Δt/3)(P₀ + 4∑P_odd + 2∑P_even + P_N)", value: metrics.simpson },
  ];

  return (
    <section className="bg-[#181818] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <IconChartAreaLineFilled className="size-5 text-[#1db954]" />
          Komparasi Metode Integrasi
        </h2>
        <span className="text-xs text-[#a7a7a7]">
          N = {metrics.partitionCount} · Δt = {(metrics.deltaT * 1000).toFixed(2)} ms
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-[#a7a7a7] border-b border-white/10">
            <th className="pb-2 font-medium">Metode</th>
            <th className="pb-2 font-medium hidden sm:table-cell">Rumus</th>
            <th className="pb-2 font-medium text-right">Energi (J)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-white/5 last:border-0">
              <td className="py-2 text-white font-medium">{r.name}</td>
              <td className="py-2 text-[#a7a7a7] text-xs font-mono hidden sm:table-cell">{r.formula}</td>
              <td className="py-2 text-right font-mono text-[#1ed760]">
                {r.value.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#a7a7a7]">
        <span>Galat Kiri vs Simpson: <b className="text-white">{metrics.errorLeftVsSimp.toFixed(3)}%</b></span>
        <span>Daya puncak: <b className="text-white">{metrics.peakPower.toFixed(3)}</b></span>
        <span>Daya rata-rata: <b className="text-white">{metrics.averagePower.toFixed(3)}</b></span>
      </div>
    </section>
  );
};
