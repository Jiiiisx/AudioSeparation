import type { TrackStemData } from "./proceduralSongs";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined
  ?? "http://localhost:8000";

export const apiBase = API_BASE;

interface JobResponse {
  job_id: string;
  status: "queued" | "downloading" | "separating" | "done" | "error";
  message?: string;
  title?: string;
  artist?: string;
  stems?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Alur: link Spotify → backend antri pekerjaan (job) → polling status
 * → saat selesai, fetch 4 stem MP3 → decode jadi PCM mono → TrackStemData.
 */
export async function resolveSpotifyTrack(
  url: string,
  onStatus?: (msg: string) => void
): Promise<TrackStemData> {
  const startRes = await fetch(`${API_BASE}/api/process-track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!startRes.ok) {
    throw new Error("Backend tidak merespons. Server masih tidur (free tier) atau sedang blocked.");
  }
  const { job_id } = (await startRes.json()) as { job_id: string };

  // Polling selama max 8 menit
  let job: JobResponse | null = null;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const poll = await fetch(`${API_BASE}/api/job/${job_id}`);
    if (!poll.ok) throw new Error("Polling status gagal.");
    job = (await poll.json()) as JobResponse;
    if (job.message) onStatus?.(job.message);
    if (job.status === "done" || job.status === "error") break;
  }

  if (!job) throw new Error("Timeout menunggu backend.");
  if (job.status === "error") throw new Error(job.message || "Pemrosesan gagal di server.");

  const stemsMap = job.stems!;
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxClass();

  let sampleRate = 44100;
  let duration = 0;

  // Master = jumlah keempat stem (di simulasi sisi klien)
  const fetched: Record<string, Float32Array> = {};
  for (const key of ["drums", "bass", "vocals", "other"]) {
    onStatus?.(`Mengunduh stem ${key}...`);
    const res = await fetch(`${API_BASE}${stemsMap[key]}`);
    if (!res.ok) throw new Error(`Gagal unduh stem ${key}.`);
    const arr = await res.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arr);
    sampleRate = audioBuf.sampleRate;
    duration = audioBuf.duration;
    const left = audioBuf.getChannelData(0);
    const right = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : left;
    const mono = new Float32Array(audioBuf.length);
    for (let i = 0; i < audioBuf.length; i++) mono[i] = (left[i] + right[i]) * 0.5;
    fetched[key] = mono;
  }

  const master = new Float32Array(fetched.drums.length);
  for (let i = 0; i < master.length; i++) {
    master[i] = Math.tanh(fetched.drums[i] * 0.9 + fetched.bass[i] * 0.8 + fetched.vocals[i] * 0.8 + fetched.other[i] * 0.7);
  }

  ctx.close();

  return {
    name: job.title ?? "Lagu Spotify",
    artist: job.artist ?? "Resolver",
    genre: "SPOTIFY",
    bpm: 120,
    duration,
    sampleRate,
    stems: {
      drums: fetched.drums,
      bass: fetched.bass,
      vocals: fetched.vocals,
      other: fetched.other,
      master,
    },
  };
}
