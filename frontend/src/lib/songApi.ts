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

export interface LibrarySong {
  id: number;
  url: string;
  title: string;
  artist: string;
  stems: Record<string, string>;
  created_at: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function decodeStemsToTrack(
  stemsMap: Record<string, string>,
  name: string,
  artist: string,
  onStatus?: (msg: string) => void
): Promise<TrackStemData> {
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxClass();

  let sampleRate = 44100;
  let duration = 0;

  const fetched: Record<string, Float32Array> = {};
  for (const key of ["drums", "bass", "vocals", "guitar", "piano", "other"]) {
    if (!stemsMap[key]) continue;
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
    genre: "SPOTIFY",
    bpm: 120,
    duration,
    sampleRate,
    stems,
  };
}

/**
 * Alur: link Spotify → backend antri pekerjaan (job) → polling status
 * → saat selesai, fetch stem MP3 → decode jadi PCM mono → TrackStemData.
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

  // Polling selama max 10 menit (6-stem lebih lambat dari 4-stem)
  let job: JobResponse | null = null;
  const deadline = Date.now() + 10 * 60 * 1000;
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

  return decodeStemsToTrack(job.stems!, job.title ?? "Lagu Spotify", job.artist ?? "Resolver", onStatus);
}

export async function fetchLibrary(): Promise<LibrarySong[]> {
  const res = await fetch(`${API_BASE}/api/library`);
  if (!res.ok) return [];
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
  onStatus?: (msg: string) => void
): Promise<TrackStemData> {
  return decodeStemsToTrack(song.stems, song.title, song.artist, onStatus);
}

/* ---------- Playlist (batch antrian di backend) ---------- */

export interface BatchTrack {
  job_id: string;
  title: string;
  artist: string;
  status: "queued" | "downloading" | "separating" | "done" | "error";
  message?: string;
}

interface BatchResponse {
  batch_id: string;
  status: "running" | "done";
  done: number;
  total: number;
  tracks: BatchTrack[];
}

export const isPlaylistUrl = (url: string): boolean =>
  /open\.spotify\.com\/(playlist|album)\//.test(url);

/** Status batch aktif: dipakai tombol Hentikan walau modal sudah ditutup. */
export const batchControl: { id: string | null; cancelRequested: boolean } = {
  id: null,
  cancelRequested: false,
};

/** Minta backend menghentikan antrian playlist yang sedang berjalan. */
export async function cancelBatch(batchId?: string): Promise<void> {
  const id = batchId || batchControl.id;
  if (!id) return;
  batchControl.cancelRequested = true;
  await fetch(`${API_BASE}/api/batch/${id}/cancel`, { method: "POST" }).catch(() => {});
}

/** Kirim playlist ke backend, polling batch sampai semua lagu selesai/gagal. */
export async function resolvePlaylist(
  url: string,
  onProgress?: (t: BatchTrack[], done: number, total: number) => void,
  pollMs = 5000
): Promise<BatchResponse> {
  const startRes = await fetch(`${API_BASE}/api/process-playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!startRes.ok) {
    const err = (await startRes.json().catch(() => ({ detail: startRes.statusText }))) as { detail?: string };
    throw new Error(err.detail || "Backend menolak playlist ini.");
  }
  const { batch_id } = (await startRes.json()) as { batch_id: string };
  batchControl.id = batch_id;
  batchControl.cancelRequested = false;

  for (;;) {
    if (batchControl.cancelRequested) throw new Error("Dihentikan oleh pengguna.");
    await sleep(pollMs);
    const res = await fetch(`${API_BASE}/api/batch/${batch_id}`);
    if (!res.ok) throw new Error("Polling playlist gagal.");
    const batch = (await res.json()) as BatchResponse;
    onProgress?.(batch.tracks, batch.done, batch.total);
    if (batch.status === "done") return batch;
  }
}
