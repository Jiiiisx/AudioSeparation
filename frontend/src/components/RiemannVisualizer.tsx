import React, { useRef, useEffect } from "react";
import { extractRiemannBars } from "../lib/riemann";
import { IconChartHistogram, IconFocus } from "@tabler/icons-react";

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, width, height);

    // Subtle grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let c = 1; c < 8; c++) {
      const x = (width / 8) * c;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let r = 1; r < 4; r++) {
      const y = (height / 4) * r;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!samples || samples.length === 0) {
      ctx.fillStyle = "#a7a7a7";
      ctx.font = "13px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Memuat sinyal audio...", width / 2, height / 2);
      return;
    }

    const winStart = Math.max(0, currentTime - windowDurationSec / 2);
    const { bars, deltaT } = extractRiemannBars(
      samples,
      sampleRate,
      winStart,
      windowDurationSec,
      partitionCount
    );

    let maxP = 0.05;
    for (const b of bars) {
      if (b.power > maxP) maxP = b.power;
    }
    const scaleY = (height - 30) / maxP;

    const barWidthPx = width / bars.length;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const barHeightPx = Math.max(2, bar.power * scaleY);
      const x = i * barWidthPx;
      const y = height - barHeightPx - 10;

      const isWindowCenter = Math.abs(bar.timeStart - currentTime) < 0.025;
      if (isWindowCenter && isBeatHit) {
        ctx.fillStyle = "rgba(30, 215, 96, 0.95)";
        ctx.strokeStyle = "#1ed760";
      } else if (isWindowCenter) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
      } else {
        ctx.fillStyle = "rgba(29, 185, 84, 0.35)";
        ctx.strokeStyle = "rgba(29, 185, 84, 0.55)";
      }

      ctx.fillRect(x, y, Math.max(1, barWidthPx - 1), barHeightPx);
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, Math.max(1, barWidthPx - 1), barHeightPx);
    }

    // Kurva kontinu P(t)
    ctx.beginPath();
    ctx.strokeStyle = isBeatHit ? "#1ed760" : "#ffffff";
    ctx.lineWidth = 2;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const x = i * barWidthPx + barWidthPx / 2;
      const y = height - bar.power * scaleY - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Playhead
    const playheadRatio = (currentTime - winStart) / windowDurationSec;
    if (playheadRatio >= 0 && playheadRatio <= 1) {
      const phX = playheadRatio * width;
      ctx.strokeStyle = isBeatHit ? "rgba(30, 215, 96, 0.9)" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isBeatHit ? "#1ed760" : "#a7a7a7";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${currentTime.toFixed(2)}s`, phX, 14);
    }

    ctx.fillStyle = "#a7a7a7";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`N = ${partitionCount} balok  |  Δt = ${(deltaT * 1000).toFixed(2)} ms`, 12, 20);

    ctx.textAlign = "right";
    ctx.fillStyle = "#1ed760";
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    ctx.fillText(activeStemLabel.toUpperCase(), width - 12, 20);
  }, [samples, sampleRate, currentTime, partitionCount, windowDurationSec, isBeatHit, activeStemLabel]);

  return (
    <section className="bg-[#181818] rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <IconChartHistogram className="size-5 text-[#1db954]" />
          Visualisasi Balok Riemann
          <span className="text-sm font-normal text-[#a7a7a7]">P(t) = [f(t)]²</span>
        </h2>
        <div className="flex items-center gap-1 bg-[#282828] p-1 rounded-full">
          <IconFocus className="size-4 text-[#a7a7a7] ml-1.5" />
          {[0.1, 0.25, 0.5, 1.0, 2.0].map((sec) => (
            <button
              key={sec}
              onClick={() => setWindowDurationSec(sec)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                windowDurationSec === sec
                  ? "bg-white text-black"
                  : "text-[#a7a7a7] hover:text-white"
              }`}
            >
              {sec < 1 ? `${sec * 1000}ms` : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full h-64 rounded-md overflow-hidden bg-[#0d0d0d]">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {isBeatHit && (
          <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-[#1ed760] text-black text-[11px] font-bold animate-pulse">
            BEAT HIT
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[#a7a7a7]">Kerapatan partisi (N)</span>
          <span className="text-[#1ed760] font-bold">{partitionCount} balok</span>
        </div>
        <input
          type="range"
          min="10"
          max="300"
          step="5"
          value={partitionCount}
          onChange={(e) => setPartitionCount(parseInt(e.target.value, 10))}
          style={{ "--fill-percent": `${((partitionCount - 10) / 290) * 100}%` } as React.CSSProperties}
          className="w-full"
        />
      </div>
    </section>
  );
};
