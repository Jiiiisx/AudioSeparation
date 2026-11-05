import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { IntegrationMetrics } from "../lib/riemann";
import { IconChartAreaLineFilled } from "@tabler/icons-react";

interface IntegrationMetricsTableProps {
  metrics: IntegrationMetrics;
}

const TEX: { name: string; tex: string; key: keyof IntegrationMetrics }[] = [
  { name: "Riemann Kiri", tex: "\\sum_{k=0}^{N-1} P(t_k)\\,\\Delta t", key: "leftRiemann" },
  { name: "Riemann Kanan", tex: "\\sum_{k=1}^{N} P(t_k)\\,\\Delta t", key: "rightRiemann" },
  { name: "Titik Tengah", tex: "\\sum_{k=0}^{N-1} P\\!\\left(t_k+\\tfrac{\\Delta t}{2}\\right)\\Delta t", key: "midpointRiemann" },
  { name: "Trapesium", tex: "\\frac{\\Delta t}{2}\\left(P_0+2\\sum_{k=1}^{N-1}P_k+P_N\\right)", key: "trapezoidal" },
  { name: "Simpson 1/3", tex: "\\tfrac{\\Delta t}{3}\\left(P_0+\\,4{\\textstyle\\sum}P_{k\\,\\text{ganjil}}+\\,2{\\textstyle\\sum}P_{k\\,\\text{genap}}+P_N\\right)", key: "simpson" },
];

const renderTex = (tex: string): string =>
  katex.renderToString(tex, { throwOnError: false, output: "mathml" });

const TeX: React.FC<{ tex: string; className?: string }> = ({ tex, className }) => {
  const html = useMemo(() => renderTex(tex), [tex]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export const IntegrationMetricsTable: React.FC<IntegrationMetricsTableProps> = ({ metrics }) => {
  return (
    <section className="bg-[#181818] rounded-lg p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <IconChartAreaLineFilled className="size-5 text-[#1db954]" />
          Komparasi Metode Integrasi
        </h2>
        <TeX
          tex={`N=${metrics.partitionCount},\\ \\Delta t=${(metrics.deltaT * 1000).toFixed(2)}\\ \\mathrm{ms}`}
          className="text-xs text-[#a7a7a7]"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[#a7a7a7] border-b border-white/10">
              <th className="pb-2 font-medium pr-2">Metode</th>
              <th className="pb-2 font-medium hidden sm:table-cell">Rumus</th>
              <th className="pb-2 font-medium text-right">Energi (J)</th>
            </tr>
          </thead>
          <tbody>
            {TEX.map((r) => (
              <tr key={r.name} className="border-b border-white/5 last:border-0">
                <td className="py-2.5 text-white font-medium pr-2 align-middle">{r.name}</td>
                <td className="py-2.5 hidden sm:table-cell align-middle">
                  <TeX tex={r.tex} className="text-[#d6d6d6]" />
                </td>
                <td className="py-2.5 text-right font-mono text-[#1ed760] align-middle">
                  {metrics[r.key]!.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#a7a7a7] items-center">
        <span>
          Galat kiri vs Simpson:{" "}
          <b className="text-white">{metrics.errorLeftVsSimp.toFixed(3)}%</b>
        </span>
        <span>
          Daya puncak:{" "}
          <TeX tex={`\\max P(t)=${metrics.peakPower.toFixed(3)}`} className="text-white font-bold" />
        </span>
        <span>
          Daya rata-rata:{" "}
          <TeX tex={`\\bar{P}=${metrics.averagePower.toFixed(3)}`} className="text-white font-bold" />
        </span>
      </div>
    </section>
  );
};
