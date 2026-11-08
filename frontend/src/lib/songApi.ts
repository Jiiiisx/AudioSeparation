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
  cover?: string | null;
}

export interface LibrarySong {
  id: number;
  url: string;
  title: string;
  artist: string;
  stems: Record<string, string>;
  created_at: string;
  cover?: string | null;
}

/* ---------- Riwayat lokal per browser (device) ----------
   DB server mencadangkan SEMUA lagu yang pernah diproses (cache cepat),
   tapi daftar yang tampil di UI hanya lagu yang pernah di-link dari
   browser ini — ditandai lewat localStorage. */
const LOCAL_HISTORY_KEY = "riemann-local-links";

function readLocalHistory(): string[] {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]") as string[]) || [];
  } catch {
    return [];
  }
}

export function getLocalHistory(): Set<string> {
  return new Set(readLocalHistory());
}

/** Tandai sebuah link/query sebagai dimiliki browser ini. */
export function markLocalLink(url: string): void {
  if (!url) return;
  const hist = readLocalHistory();
  if (!hist.includes(url)) {
    hist.push(url);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(hist.slice(-500)));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function decodeStemsToTrack(
  stemsMap: Record<string, string>,
  name: string,
  artist: string,
  onStatus?: (msg: string, pct?: number) => void,
  cover?: string | null
): Promise<TrackStemData> {
  if (!stemsMap || !stemsMap.drums) {
    throw new Error("Data stem tidak lengkap dari server. Coba tautkan ulang lagunya.");
  }
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxClass();

  let sampleRate = 44100;
  let duration = 0;

  const fetched: Record<string, Float32Array> = {};
  const stemKeys = ["drums", "bass", "vocals", "guitar", "piano", "other"].filter((k) => stemsMap[k]);
  for (let si = 0; si < stemKeys.length; si++) {
    const key = stemKeys[si];
    onStatus?.(`Mengunduh stem ${key}...`, 92 + Math.round(((si + 1) / (stemKeys.length + 1)) * 6));
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

  ctx.close();

  if (!fetched.drums) throw new Error("Stem utama (drums) tidak ditemukan di response backend.");

  // Master = jumlah stem berbobot (disimulasikan di sisi klien)
  const weights: [string, number][] = [["drums", 0.9], ["bass", 0.8], ["vocals", 0.8], ["guitar", 0.75], ["piano", 0.75], ["other", 0.7]];
  const chunks = weights.filter(([k]) => fetched[k]);
  const master = new Float32Array(fetched.drums.length);
  for (let i = 0; i < master.length; i++) {
    let sum = 0;
    for (const [k, w] of chunks) sum += fetched[k][i] * w;
    master[i] = Math.tanh(sum);
  }

  const stems: TrackStemData["stems"] = {
    drums: fetched.drums,
    bass: fetched.bass,
    vocals: fetched.vocals,
    other: fetched.other,
    master,
  };
  if (fetched.guitar) stems.guitar = fetched.guitar;
  if (fetched.piano) stems.piano = fetched.piano;

  return {
    name,
    artist,
    cover: cover ? `${API_BASE}${cover}` : undefined,
    genre: "YOUTUBE",
    bpm: 120,
    duration,
    sampleRate,
    stems,
  };
}

export interface SearchHit {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string;
}

/** Cari kandidat lagu di YouTube (backend /api/search). */
export async function searchSongs(q: string): Promise<SearchHit[]> {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Pencarian gagal — coba lagi atau tempel link langsung.");
  return res.json();
}

/**
 * Alur: link Spotify → backend antri pekerjaan (job) → polling status
 * → saat selesai, fetch stem MP3 → decode jadi PCM mono → TrackStemData.
 */
export async function resolveSpotifyTrack(
  url: string,
  onStatus?: (msg: string, pct?: number) => void
): Promise<TrackStemData> {
  onStatus?.("Mengirim ke backend...", 1);
  const startRes = await fetch(`${API_BASE}/api/process-track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!startRes.ok) {
    throw new Error("Backend tidak merespons. Server masih tidur (free tier) atau sedang blocked.");
  }
  const { job_id } = (await startRes.json()) as { job_id: string };
  spotifyJob.id = job_id;
  try {
    return await pollSpotifyJob(job_id, onStatus, url);
  } finally {
    spotifyJob.id = null;
  }
}

/** id job Spotify yang sedang aktif di tab ini (dipakai tombol Tutup utk cancel). */
export const spotifyJob: { id: string | null } = { id: null };

/** Minta backend menghentikan job tautan yang sedang berjalan. */
export async function cancelSpotifyJob(): Promise<void> {
  const id = spotifyJob.id;
  if (!id) return;
  spotifyJob.id = null;
  await fetch(`${API_BASE}/api/job/${id}/cancel`, { method: "POST" }).catch(() => {});
}

async function pollSpotifyJob(
  job_id: string,
  onStatus?: (msg: string, pct?: number) => void,
  url = ""
): Promise<TrackStemData> {

  // Polling selama max 10 menit (6-stem lebih lambat dari 4-stem)
  let job: JobResponse | null = null;
  const deadline = Date.now() + 10 * 60 * 1000;
  let stage = "";
  let stageStart = 0;
  let pct = 2;
  while (Date.now() < deadline) {
    await sleep(3000);
    const poll = await fetch(`${API_BASE}/api/job/${job_id}`);
    if (!poll.ok) throw new Error("Polling status gagal.");
    job = (await poll.json()) as JobResponse;
    if (job.status !== stage) { stage = job.status; stageStart = Date.now(); }
    const elapsed = (Date.now() - stageStart) / 1000;
    // Estimasi progres berbasis waktu (backend tidak memberi persen asli Demucs):
    // start 1-5 → mengunduh 5-25 → memisahkan 25-95 (kurva halus ~2.5 mnt) → stem 92-99
    const target =
      stage === "downloading" ? Math.min(25, 5 + elapsed * 1.2)
      : stage === "separating" ? Math.min(95, 26 + 69 * (1 - Math.exp(-elapsed / 90)))
      : stage === "done" ? 99
      : Math.min(pct + 2, 5);
    pct = Math.max(pct, Math.min(target, 99));
    if (job.message) onStatus?.(job.message, pct);
    if (job.status === "done" || job.status === "error") break;
  }

  if (!job) throw new Error("Timeout menunggu backend.");
  if (job.status === "error") throw new Error(job.message || "Pemrosesan gagal di server.");
  if (!job.stems) throw new Error("Job selesai tetapi file stem tidak tersedia di server. Coba proses ulang lagunya.");

  markLocalLink(url);
  return decodeStemsToTrack(job.stems!, job.title ?? "Lagu Spotify", job.artist ?? "Resolver", onStatus, job.cover);
}

export async function fetchLibrary(): Promise<LibrarySong[]> {
  const res = await fetch(`${API_BASE}/api/library`);
  if (!res.ok) throw new Error(`Pustaka gagal dimuat (HTTP ${res.status}). Coba muat ulang halaman.`);
  const rows = (await res.json()) as LibrarySong[];
  for (const row of rows) {
    row.stems = typeof row.stems === "string" ? JSON.parse(row.stems) : row.stems;
  }
  return rows;
}

export async function deleteLibrarySong(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/library/${id}`, { method: "DELETE" });
}

/** Muat ulang lagu dari pustaka tanpa proses ulang (stems tersimpan di server). */
export async function loadLibrarySong(
  song: LibrarySong,
  onStatus?: (msg: string, pct?: number) => void
): Promise<TrackStemData> {
  return decodeStemsToTrack(song.stems, song.title, song.artist, onStatus, song.cover);
}
