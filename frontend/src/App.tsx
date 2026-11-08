import { useState, useEffect, useRef, useMemo } from "react";
import { MultiTrackAudioEngine } from "./lib/audioEngine";
import type { StemKey } from "./lib/audioEngine";
import { SlidingWindowBeatDetector } from "./lib/beatDetector";
import type { BeatState } from "./lib/beatDetector";
import { computeIntegrationMetrics } from "./lib/riemann";
import type { IntegrationMetrics } from "./lib/riemann";
import type { TrackStemData } from "./lib/proceduralSongs";
import {
  IconMenu2,
  IconX,
  IconAdjustmentsHorizontal,
    IconMusic,
    IconPlayerPlayFilled,
    IconBrandSpotify,
    IconBrandYoutube,
  IconSearch,
  IconTrash,
  IconLayoutGrid,
  IconLayoutKanban,
  IconListSearch,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { Sidebar } from "./components/Sidebar";
import { fetchLibrary, deleteLibrarySong, loadLibrarySong, resolveSpotifyTrack, cancelSpotifyJob, getLocalHistory, apiBase, searchSongs, type SearchHit } from "./lib/songApi";
import type { LibrarySong } from "./lib/songApi";
import { PlayerBar } from "./components/PlayerBar";
import { RiemannVisualizer } from "./components/RiemannVisualizer";
import { BeatDetectorPanel } from "./components/BeatDetectorPanel";
import { IntegrationMetricsTable } from "./components/IntegrationMetricsTable";
import { StemMixer} from "./components/StemMixer";

export function App() {
  const engineRef = useRef<MultiTrackAudioEngine | null>(null);
  const beatDetectorRef = useRef<SlidingWindowBeatDetector>(new SlidingWindowBeatDetector());

  const [activeView, setActiveView] = useState<"home" | "studio">("home");
  const [currentTrack, setCurrentTrack] = useState<TrackStemData | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStemKey, setActiveStemKey] = useState<StemKey>("drums");

  const [partitionCount, setPartitionCount] = useState<number>(80);
  const [windowDurationSec, setWindowDurationSec] = useState<number>(0.25);
  const [sensitivityC, setSensitivityC] = useState<number>(1.35);

  const [beatState, setBeatState] = useState<BeatState>({
    isBeat: false,
    currentEnergy: 0,
    averageEnergy: 0,
    threshold: 0,
    ratio: 1,
    windowDurationMs: 50,
    sampleCountM: 2205,
  });

  const [stemEnergies, setStemEnergies] = useState<Record<StemKey, number>>({
    drums: 0, bass: 0, vocals: 0, guitar: 0, piano: 0, other: 0, master: 0,
  });

  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [, setTrackConfigsVersion] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showSpotifyModal, setShowSpotifyModal] = useState<boolean>(false);
  const [spotifyUrl, setSpotifyUrl] = useState<string>("");
  const [spotifyStatus, setSpotifyStatus] = useState<string>("");
  const [spotifyProgress, setSpotifyProgress] = useState<number>(0);
  const [spotifyBusy, setSpotifyBusy] = useState<boolean>(false);
  const [showStopConfirm, setShowStopConfirm] = useState<boolean>(false);
  const [ytQuery, setYtQuery] = useState<string>("");
  const [ytHits, setYtHits] = useState<SearchHit[]>([]);
  const [ytSearching, setYtSearching] = useState<boolean>(false);
  const [library, setLibrary] = useState<LibrarySong[]>([]);
  const [loadingLibrarySongId, setLoadingLibrarySongId] = useState<number | null>(null);
  const [showMobileNav, setShowMobileNav] = useState<boolean>(false);
  const [showMixerSheet, setShowMixerSheet] = useState<boolean>(false);
  const [studioTab, setStudioTab] = useState<"visual" | "beats" | "integrasi">("visual");
  const [, setLocalLinks] = useState<Set<string>>(() => getLocalHistory());
  const [libraryLoadStatus, setLibraryLoadStatus] = useState("");

  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryView, setLibraryView] = useState<"grid" | "compact" | "list">("grid");
  const [libraryError, setLibraryError] = useState(false);
  const localLibrary = library; // tampilkan SEMUA lagu dari backend (filter pencarian terpisah di bawah)

  const GridCard = ({ song }: { song: LibrarySong }) => {
    const isLoading = loadingLibrarySongId === song.id;
    const active = currentTrack?.name === song.title;
    return (
      <button
        onClick={() => !isLoading && handleSelectLibrary(song)}
        disabled={isLoading}
        className="group relative p-3 rounded-lg bg-[#181818] hover:bg-[#1f1f1f] transition text-left cursor-pointer"
      >
        <div className="relative mb-2">
          {isLoading && (
            <div className="absolute inset-0 z-10 rounded-md bg-black/70 flex flex-col items-center justify-center gap-2">
              <div className="size-7 rounded-full border-2 border-white/20 border-t-[#1ed760] animate-spin" />
              <span className="text-[11px] text-white/80 text-center px-2">{libraryLoadStatus || "Memuat stem..."}</span>
            </div>
          )}
          {song.cover ? (
            <img src={`${apiBase}${song.cover}`} alt="" className="aspect-square w-full rounded-md object-cover" loading="lazy" />
          ) : (
            <div className="aspect-square w-full rounded-md bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center">
              <IconBrandSpotify className="size-8 text-white/80" />
            </div>
          )}
          <div className="absolute bottom-1.5 right-1.5 size-9 rounded-full bg-[#1ed760] flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition shadow-lg">
            <IconPlayerPlayFilled className="size-[18px] text-black fill-black" />
          </div>
        </div>
        <div className={`text-sm font-semibold truncate ${active ? "text-[#1ed760]" : "text-white"}`}>{song.title}</div>
        <div className="text-xs text-[#a7a7a7] truncate">{song.artist}</div>
        <span
          role="button"
          title="Hapus dari pustaka"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteLibrary(song.id);
          }}
          className="absolute top-2 right-2 p-1 rounded bg-black/50 opacity-0 group-hover:opacity-100 text-[#a7a7a7] hover:text-red-400 transition cursor-pointer"
        >
          <IconTrash className="size-4" />
        </span>
      </button>
    );
  };

  const CompactCard = ({ song }: { song: LibrarySong }) => {
    const isLoading = loadingLibrarySongId === song.id;
    const active = currentTrack?.name === song.title;
    return (
      <button
        onClick={() => !isLoading && handleSelectLibrary(song)}
        disabled={isLoading}
        className="group relative aspect-square rounded-md overflow-hidden cursor-pointer"
        title={`${song.title} · ${song.artist}`}
      >
        {song.cover ? (
          <img src={`${apiBase}${song.cover}`} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center">
            <IconBrandSpotify className="size-6 text-white/80" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          {!isLoading && <IconPlayerPlayFilled className="size-5 text-white" />}
        </div>
        {active && <div className="absolute inset-0 ring-2 ring-inset ring-[#1ed760]" />}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteLibrary(song.id);
          }}
          className="absolute top-1 right-1 p-0.5 rounded bg-black/60 opacity-0 group-hover:opacity-100 text-white/80 hover:text-red-400 transition cursor-pointer"
        >
          <IconTrash className="size-3.5" />
        </span>
      </button>
    );
  };

  const ListRow = ({ song, index }: { song: LibrarySong; index: number }) => {
    const isLoading = loadingLibrarySongId === song.id;
    const active = currentTrack?.name === song.title;
    return (
      <button
        onClick={() => !isLoading && handleSelectLibrary(song)}
        disabled={isLoading}
        className={`group w-full flex items-center gap-3 px-3 py-2 hover:bg-[#1f1f1f] transition text-left cursor-pointer ${active ? "bg-[#1a1a1a]" : ""}`}
      >
        <span className="w-5 text-xs text-[#7a7a7a] text-right shrink-0 hidden sm:block">{index}</span>
        <span className="relative size-10 rounded overflow-hidden shrink-0">
          {song.cover ? (
            <img src={`${apiBase}${song.cover}`} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1db954] to-[#14803b] flex items-center justify-center">
              <IconMusic className="size-4 text-white/80" />
            </div>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold truncate ${active ? "text-[#1ed760]" : "text-white"}`}>{song.title}</span>
          <span className="block text-xs text-[#a7a7a7] truncate">{song.artist}</span>
        </span>
        <span className="hidden group-hover:block text-[#1ed760] shrink-0 w-5 text-center">
          {isLoading ? "..." : <IconPlayerPlayFilled className="size-4" />}
        </span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteLibrary(song.id);
          }}
          className="p-1 rounded opacity-0 group-hover:opacity-100 text-[#a7a7a7] hover:text-red-400 transition cursor-pointer"
        >
          <IconTrash className="size-4" />
        </span>
      </button>
    );
  };

  const hasSpotifyJob = Boolean(spotifyStatus) && !spotifyStatus.startsWith("Error") && !showSpotifyModal;

  useEffect(() => {
    const engine = new MultiTrackAudioEngine();
    engineRef.current = engine;
    engine.onTimeUpdate((time) => setCurrentTime(time));
    engine.onEnded(() => setIsPlaying(false));

    // Pustaka per-device: lagu dari server hanya tampil di browser yang memprosesnya
    fetchLibrary().then((rows) => {
        const mine = rows.filter((r) => getLocalHistory().has(r.url));
        setLibrary(mine);
        try { localStorage.setItem("riemann-library-cache", JSON.stringify(mine)); } catch { /* penuh = skip */ }
        // Pulihkan lagu terakhir yang dibuka (refresh tidak kembali ke beranda)
        const lastUrl = localStorage.getItem("riemann-last-track");
        const song = lastUrl ? rows.find((r) => r.url === lastUrl) : undefined;
        if (song) {
          setLoadingLibrarySongId(song.id);
          loadLibrarySong(song)
            .then((track) => {
              setCurrentTrack(track);
              setActiveStemKey("master");
              if (engineRef.current) engineRef.current.setTrack(track);
          })
            .catch(() => {})
            .finally(() => setLoadingLibrarySongId(null));
        }
      }).catch(() => {
        // Backend mati/blokir: tampilkan cache pustaka lokal biar tak kosong + tandai error
        setLibraryError(true);
        try {
          const cached = JSON.parse(localStorage.getItem("riemann-library-cache") || "[]") as typeof library;
          if (cached.length) setLibrary(cached);
        } catch { /* cache rusak = kosong */ }
      });

    return () => {
      engine.stop();
    };
  }, []);

  useEffect(() => {
    beatDetectorRef.current.setSensitivity(sensitivityC);
  }, [sensitivityC]);

  const activeSamples = useMemo(() => {
    if (!currentTrack) return null;
    return currentTrack.stems[activeStemKey] ?? currentTrack.stems.master;
  }, [currentTrack, activeStemKey]);

  const lastPerFrameRunRef = useRef<number>(-1);
  useEffect(() => {
    if (!currentTrack) return;
    // Jalankan analisis per-frame hanya jika waktu maju >= 40ms (hindari re-render ganda)
    if (Math.abs(currentTime - lastPerFrameRunRef.current) < 0.04) return;
    lastPerFrameRunRef.current = currentTime;
    const sampleRate = currentTrack.sampleRate;
    const curIdx = Math.floor(currentTime * sampleRate);

    const drumSamples = currentTrack.stems.drums;
    setBeatState(beatDetectorRef.current.analyzeFrame(drumSamples, curIdx));

    const M = 2205;
    const sIdx = Math.max(0, curIdx - Math.floor(M / 2));
    const eIdx = Math.min(drumSamples.length, sIdx + M);
    const dt = 1 / sampleRate;

    const calcStemEnergy = (samples: Float32Array) => {
      let sum = 0;
      for (let i = sIdx; i < eIdx; i += 4) sum += samples[i] * samples[i];
      return sum * (dt * 4);
    };

    setStemEnergies({
      drums: calcStemEnergy(currentTrack.stems.drums),
      bass: calcStemEnergy(currentTrack.stems.bass),
      vocals: calcStemEnergy(currentTrack.stems.vocals),
      other: calcStemEnergy(currentTrack.stems.other),
      guitar: currentTrack.stems.guitar ? calcStemEnergy(currentTrack.stems.guitar) : 0,
      piano: currentTrack.stems.piano ? calcStemEnergy(currentTrack.stems.piano) : 0,
      master: calcStemEnergy(currentTrack.stems.master),
    });
  }, [currentTime, currentTrack]);

  const currentMetrics: IntegrationMetrics = useMemo(() => {
    if (!activeSamples || !currentTrack) {
      return {
        deltaT: 1 / 44100,
        totalSamples: 1,
        partitionCount: partitionCount,
        leftRiemann: 0,
        rightRiemann: 0,
        midpointRiemann: 0,
        trapezoidal: 0,
        simpson: 0,
        errorLeftVsSimp: 0,
        peakPower: 0,
        averagePower: 0,
      };
    }

    const sampleRate = currentTrack.sampleRate;
    const totalWindowSamples = Math.floor(windowDurationSec * sampleRate);
    const startIdx = Math.max(0, Math.floor((currentTime - windowDurationSec / 2) * sampleRate));
    const endIdx = Math.min(activeSamples.length, startIdx + totalWindowSamples);

    return computeIntegrationMetrics(activeSamples, sampleRate, partitionCount, startIdx, endIdx);
  }, [activeSamples, currentTrack, currentTime, windowDurationSec, partitionCount]);

  const handlePlayPause = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.pause();
      setIsPlaying(false);
    } else {
      engineRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (secs: number) => {
    if (engineRef.current) {
      engineRef.current.seek(secs);
      setCurrentTime(secs);
    }
  };

  const handleRestart = () => {
    if (engineRef.current) {
      engineRef.current.seek(0);
      setCurrentTime(0);
    }
  };

  const handleVolumeChange = (key: StemKey, vol: number) => {
    if (engineRef.current) {
      engineRef.current.setVolume(key, vol);
      setTrackConfigsVersion((v) => v + 1);
    }
  };

  const handleToggleMute = (key: StemKey) => {
    if (engineRef.current) {
      engineRef.current.toggleMute(key);
      setTrackConfigsVersion((v) => v + 1);
    }
  };

  const handleToggleSolo = (key: StemKey) => {
    if (engineRef.current) {
      engineRef.current.toggleSolo(key);
      setTrackConfigsVersion((v) => v + 1);
    }
  };

  const handleMasterVolumeChange = (vol: number) => {
    setMasterVolume(vol);
    if (engineRef.current) engineRef.current.setVolume("master", vol);
  };

  const handleToggleMasterMute = () => {
    const nextMute = !isMasterMuted;
    setIsMasterMuted(nextMute);
    if (engineRef.current) engineRef.current.toggleMute("master");
  };

  const handleSelectLibrary = async (song: LibrarySong) => {
    setLoadingLibrarySongId(song.id);
    try {
      const track = await loadLibrarySong(song, (msg) => setLibraryLoadStatus(msg));
      localStorage.setItem("riemann-last-track", song.url);
      setCurrentTrack(track);
      setActiveStemKey("master");
      if (engineRef.current) {
        engineRef.current.setTrack(track);
        setIsPlaying(false);
        setCurrentTime(0);
      }
      beatDetectorRef.current.reset();
      setActiveView("studio");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal memuat lagu dari pustaka.");
    } finally {
      setLoadingLibrarySongId(null);
      setLibraryLoadStatus("");
    }
  };

  const handleDeleteLibrary = async (id: number) => {
    try {
      await deleteLibrarySong(id);
      setLibrary((prev) => prev.filter((x) => x.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Hapus gagal. Coba lagi.");
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const tempCtx = new AudioCtxClass();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);

      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

      const drums = new Float32Array(length);
      const bass = new Float32Array(length);
      const vocals = new Float32Array(length);
      const other = new Float32Array(length);
      const master = new Float32Array(length);

      const winSize = 64;
      let runningSum = 0;
      for (let i = 0; i < length; i++) {
        const mono = (left[i] + right[i]) * 0.5;
        master[i] = mono;
        runningSum += mono;
        if (i >= winSize) runningSum -= (left[i - winSize] + right[i - winSize]) * 0.5;
        const lowFreq = runningSum / winSize;
        bass[i] = lowFreq * 1.2;
        drums[i] = lowFreq * 1.4;
        const side = (left[i] - right[i]) * 0.5;
        vocals[i] = (mono - lowFreq) * 1.1;
        other[i] = side * 1.3 + (mono - lowFreq) * 0.4;
      }

      const customTrack: TrackStemData = {
        name: file.name.replace(/\.[^/.]+$/, ""),
        artist: "File Unggahan",
        genre: "UPLOAD",
        bpm: 120,
        duration: audioBuffer.duration,
        sampleRate,
        stems: { drums, bass, vocals, other, master },
      };

      setCurrentTrack(customTrack);
      if (engineRef.current) {
        engineRef.current.setTrack(customTrack);
        setIsPlaying(false);
        setCurrentTime(0);
      }
      setActiveView("studio");
    } catch (err) {
      console.error(err);
      alert("Gagal mendekode file audio: pastikan format MP3 atau WAV valid.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleYtSearch = async () => {
    const q = ytQuery.trim();
    if (!q || ytSearching) return;
    setYtSearching(true);
    setYtHits([]);
    try {
      setYtHits(await searchSongs(q));
    } catch (e) {
      setSpotifyStatus(`Error: ${(e as Error).message}`);
    } finally {
      setYtSearching(false);
    }
  };

  const handlePickHit = (hit: SearchHit) => {
    const url = `https://www.youtube.com/watch?v=${hit.id}`;
    setYtHits([]); // tutup daftar hasil saja; modal + progress tetap tampil
    setYtQuery("");
    setSpotifyUrl(url);
    void handleResolveSpotify(url);
  };

  const handleResolveSpotify = async (directUrl?: string) => {
    const url = (directUrl ?? spotifyUrl).trim();
    if (!url) return;
    if (/open\.spotify\.com/.test(url)) {
      setSpotifyStatus("Error: dukungan Spotify sudah dihapus — tempelkan link video YouTube.");
      return;
    }
    if (!/(youtube\.com\/watch\?v=|youtu\.be\/)/.test(url)) {
      setSpotifyStatus("Error: tempelkan link video YouTube (pastikan videonya audio asli lagunya).");
      return;
    }
    setSpotifyStatus("Diterima backend, memulai pipeline...");
    setSpotifyProgress(0);
    setSpotifyBusy(true);
    try {
      const track = await resolveSpotifyTrack(url, (msg, pct) => {
        setSpotifyStatus(msg);
        if (typeof pct === "number") setSpotifyProgress(pct);
      });
      setSpotifyStatus("Selesai.");
      setLocalLinks(getLocalHistory());
      localStorage.setItem("riemann-last-track", url);
      setCurrentTrack(track);
      if (engineRef.current) {
        engineRef.current.setTrack(track);
        setIsPlaying(false);
        setCurrentTime(0);
      }
      setShowSpotifyModal(false);
      setActiveView("studio");
      setSpotifyUrl("");
      fetchLibrary().then((rows) => {
        setLibrary(rows.filter((r) => getLocalHistory().has(r.url)));
      }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses link Spotify";
      setSpotifyStatus(`Error: ${msg}`);
    } finally {
      setSpotifyBusy(false);
      setSpotifyProgress((p) => (p < 99 ? 0 : 100));
    }
  };

  const closeSpotifyModal = () => {
    if (spotifyBusy) {
      setShowStopConfirm(true);
      return;
    }
    setShowSpotifyModal(false);
  };

  const confirmStopSpotify = async () => {
    setShowStopConfirm(false);
    await cancelSpotifyJob();
    setSpotifyStatus("");
    setSpotifyProgress(0);
    setSpotifyBusy(false);
    setShowSpotifyModal(false);
  };

  const trackConfigs = engineRef.current ? engineRef.current.getTrackConfigs() : new Map();
  const duration = currentTrack?.duration || 0;

  return (
    <div className="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      <div className="flex-1 flex gap-2 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            activeView={activeView}
            onSelectView={setActiveView}
            onFileUpload={handleFileUpload}
            isProcessing={isProcessing}
            onOpenSpotify={() => { setShowSpotifyModal(true); setSpotifyStatus(""); if (!spotifyBusy) setSpotifyUrl(""); }}
            hasSpotifyJob={hasSpotifyJob}
            spotifyError={spotifyStatus.startsWith("Error") ? spotifyStatus : null}
          />
        </div>

        <main className="relative flex-1 overflow-y-auto rounded-lg bg-gradient-to-b from-[#1f1f1f] via-[#121212] to-[#121212]">
          {/* Tombol menu mobile (desktop tanpa header) */}
          <div className="md:hidden sticky top-0 z-10 px-4 pt-3">
            <button
              onClick={() => setShowMobileNav(true)}
              className="size-8 rounded-full bg-[#282828] flex items-center justify-center cursor-pointer border border-white/10"
              title="Menu"
            >
              <IconMenu2 className="size-5 text-white" />
            </button>
          </div>

          {activeView === "home" ? (
            /* ---------- BERANDA ---------- */
            <div className="px-4 sm:px-6 pt-4 pb-36">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Selamat mendengarkan</h1>

              {/* Kartu lagu terakhir */}
              <button
                onClick={() => setActiveView("studio")}
                className="flex items-center gap-4 p-4 rounded-lg bg-[#181818] hover:bg-[#1f1f1f] transition text-left cursor-pointer group my-5 w-full sm:w-fit sm:pr-10"
              >
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt="" className="size-16 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="size-16 rounded-md bg-gradient-to-br from-[#1db954] to-[#191414] flex items-center justify-center shrink-0">
                    <IconMusic className="size-7 text-white/80" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#1ed760]">Belakangan dianalisis</span>
                  <div className="font-bold text-white truncate">{currentTrack?.name || "Belum ada lagu"}</div>
                  <p className="text-xs text-[#a7a7a7] truncate">
                    {currentTrack ? currentTrack.artist : "Unggah file atau tautkan video YouTube lewat Pustaka"}
                  </p>
                </div>
                <IconPlayerPlayFilled className="size-6 text-[#1ed760] opacity-0 group-hover:opacity-100 transition shrink-0" />
              </button>

              {/* Pustaka kamu: pencarian + grid */}
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Pustaka kamu ({localLibrary.length})</h2>
                {libraryError && (
                  <p className="text-xs text-[#f04a4a]">Pustaka server gagal dimuat — kemungkinan diblokir browser/shield. Coba muat ulang atau matikan shield.</p>
                )}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-72">
                    <IconSearch className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#a7a7a7]" />
                    <input
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      placeholder="Cari lagu atau artis..."
                      className="w-full rounded-full bg-[#242424] border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-[#7a7a7a] outline-none focus:border-[#1ed760]/60 transition"
                    />
                  </div>
                  <div className="flex rounded-full bg-[#242424] border border-white/10 p-0.5 shrink-0">
                    {([["grid", IconLayoutGrid, "Kotak"], ["compact", IconLayoutKanban, "Kecil"], ["list", IconListSearch, "List"]] as const).map(([mode, Ico, label]) => (
                      <button
                        key={mode}
                        title={`Tampilan ${label}`}
                        onClick={() => setLibraryView(mode)}
                        className={`p-1.5 rounded-full transition cursor-pointer ${libraryView === mode ? "bg-[#1ed760] text-black" : "text-[#a7a7a7] hover:text-white"}`}
                      >
                        <Ico className="size-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {localLibrary.length === 0 ? (
                <div className="p-6 rounded-lg bg-[#181818] text-sm text-[#a7a7a7]">
                  Belum ada lagu tersimpan. Tautkan video YouTube pertamamu — lagu yang sudah diproses muncul di sini.
                </div>
              ) : (
                (() => {
                  const q = libraryQuery.trim().toLowerCase();
                  const shown = (q ? localLibrary.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)) : localLibrary);
                  if (shown.length === 0)
                    return (
                      <div className="p-6 rounded-lg bg-[#181818] text-sm text-[#a7a7a7]">
                        Tidak ada hasil untuk "{libraryQuery}".
                      </div>
                    );
                  if (libraryView === "compact")
                    return (
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                        {shown.map((song) => (
                          <CompactCard key={song.id} song={song} />
                        ))}
                      </div>
                    );
                  if (libraryView === "list")
                    return (
                      <div className="divide-y divide-white/5 rounded-lg bg-[#181818]">
                        {shown.map((song, idx) => (
                          <ListRow key={song.id} song={song} index={idx + 1} />
                        ))}
                      </div>
                    );
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {shown.map((song) => (
                        <GridCard key={song.id} song={song} />
                      ))}
                    </div>
                  );
                })())}

              {/* Cara pakai: 3 langkah */}
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">Cara pakai</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    step: 1,
                    title: "Tautkan atau unggah lagu",
                    desc: "Tempel link video YouTube (pilih video yang audio-nya memang lagu aslinya) atau unggah MP3/WAV lokal lewat Pustaka di kiri.",
                  },
                  {
                    step: 2,
                    title: "Pilih lagu di pustaka",
                    desc: "Backend memisahkan audio jadi 6 stem (drums, bass, vokal, gitar, piano, instru lain). Proses 1-3 menit per lagu.",
                  },
                  {
                    step: 3,
                    title: "Lihat grafik analisis",
                    desc: "Studio menampilkan kurva daya Riemann, mixer 6 channel, dan tabel integrasi numerik real-time.",
                  },
                ].map((s) => (
                  <div key={s.step} className="p-5 rounded-lg bg-[#181818] hover:bg-[#1a1a1a] transition">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="size-9 rounded-full bg-[#1ed760] text-black font-bold flex items-center justify-center text-base">{s.step}</span>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
                    </div>
                    <div className="font-bold text-white mb-1">{s.title}</div>
                    <p className="text-sm text-[#a7a7a7] leading-relaxed">{s.desc}</p>
                  </div>
                ))}
                <button
                  onClick={() => setShowSpotifyModal(true)}
                  className="sm:col-span-3 inline-flex items-center justify-center gap-2 w-full sm:w-fit px-6 py-3 rounded-full bg-[#1ed760] text-black text-sm font-bold hover:scale-[1.03] active:scale-95 transition cursor-pointer"
                >
                  <IconBrandYoutube className="size-5" />
                  Cari lagu di YouTube
                </button>
              </div>

              <p className="mt-10 text-xs text-[#a7a7a7]/60 text-center max-w-2xl mx-auto leading-relaxed">
                Studio memisahkan lagu jadi 6 stem, menganalisis energi per balok Riemann dari daya P(t) = [f(t)]  (5 metode integrasi numerik),
                mendeteksi ketukan bass dengan window 50 ms dan ambang adaptif C x E_avg. Audio disintesis lokal di browser
                (Fs = 44.100 Hz) — tidak ada file yang diunggah ke server.
              </p>
            </div>
          ) : (
            /* ---------- STUDIO ANALISIS ---------- */
            <div className="px-4 sm:px-6 pt-4 pb-36">
              <div className="flex items-end gap-3 sm:gap-5 mb-4 sm:mb-6">
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt="" className="size-20 sm:size-28 shrink-0 rounded-lg object-cover shadow-xl" />
                ) : (
                  <div className="size-20 sm:size-28 shrink-0 rounded-lg bg-gradient-to-br from-[#1db954] to-[#191414] flex items-center justify-center shadow-xl">
                    <IconMusic className="size-8 sm:size-12 text-white/80" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#1ed760]">Track</span>
                  <h1 className="text-2xl sm:text-4xl font-bold tracking-tight truncate">{currentTrack?.name || "Tidak ada track"}</h1>
                  <p className="text-sm text-[#a7a7a7] mt-1">
                    {currentTrack?.artist} · Fs 44.100 Hz · {currentTrack?.genre}
                  </p>
                </div>
              </div>

              {/* Mixer inline di atas pill tab (ukuran menengah saja) */}
              <div className="hidden md:block xl:hidden mb-4">
                {currentTrack && (
                  <StemMixer
                    availableKeys={Object.keys(currentTrack.stems).filter((k) => k !== "master") as StemKey[]}
                    trackConfigs={trackConfigs}
                    activeStemKey={activeStemKey}
                    setActiveStemKey={setActiveStemKey}
                    onVolumeChange={handleVolumeChange}
                    onToggleMute={handleToggleMute}
                    onToggleSolo={handleToggleSolo}
                    stemEnergies={stemEnergies}
                  />
                )}
              </div>

              {/* Tab baru (mobile / tablet); desktop pakai tampilan 2 kolom di bawah */}
              <div className="xl:hidden mb-4 flex gap-2 overflow-x-auto pb-1">
                {([["visual", "Riemann"], ["beats", "Ketukan"], ["integrasi", "Integrasi"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setStudioTab(k)}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition cursor-pointer ${
                      studioTab === k ? "bg-white text-black" : "bg-[#282828] text-[#a7a7a7] hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 gap-y-6 items-start">
                <div className="xl:col-span-7 flex flex-col gap-4 gap-y-5">
                  <div className={studioTab === "visual" ? "block" : "hidden xl:block"}>
                    <RiemannVisualizer
                      samples={activeSamples}
                      sampleRate={currentTrack?.sampleRate || 44100}
                      currentTime={currentTime}
                      duration={duration}
                      partitionCount={partitionCount}
                      setPartitionCount={setPartitionCount}
                      windowDurationSec={windowDurationSec}
                      setWindowDurationSec={setWindowDurationSec}
                      isBeatHit={beatState.isBeat}
                      activeStemLabel={activeStemKey}
                    />
                  </div>
                  <div className={studioTab === "beats" ? "block" : "hidden xl:block"}>
                    <BeatDetectorPanel
                      beatState={beatState}
                      sensitivityC={sensitivityC}
                      setSensitivityC={setSensitivityC}
                    />
                  </div>
                  <div className={studioTab === "integrasi" ? "block" : "hidden xl:block"}>
                    <IntegrationMetricsTable metrics={currentMetrics} />
                  </div>
                </div>

                {/* Mixer inline: hanya desktop */}
                <div className="hidden xl:block xl:col-span-5">
                  <StemMixer
                    availableKeys={currentTrack ? (Object.keys(currentTrack.stems).filter((k) => k !== "master") as StemKey[]) : ["drums", "bass", "vocals", "other"]}
                    trackConfigs={trackConfigs}
                    activeStemKey={activeStemKey}
                    setActiveStemKey={setActiveStemKey}
                    onVolumeChange={handleVolumeChange}
                    onToggleMute={handleToggleMute}
                    onToggleSolo={handleToggleSolo}
                    stemEnergies={stemEnergies}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Tautkan Spotify */}
      {showSpotifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-[440px] max-w-[90vw] max-h-[88vh] overflow-y-auto rounded-lg bg-[#181818] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white">Cari lagu</h3>
            <p className="text-sm text-[#a7a7a7] mt-1 leading-relaxed">
              Ketik judul + artis lagu, pilih video yang audio-nya memang lagu aslinya. Server memisahkan 6 stem; durasi proses 1–5 menit.
            </p>
            {!spotifyBusy && (
              <>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={ytQuery}
                onChange={(e) => setYtQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleYtSearch(); }}
                placeholder="contoh: Jay Sean Down"
                className="flex-1 rounded-md bg-[#282828] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-[#535353] focus:outline-none focus:border-[#1ed760]"
              />
              <button
                onClick={() => void handleYtSearch()}
                disabled={!ytQuery.trim() || ytSearching}
                className="px-4 rounded-md bg-white/10 text-white text-sm font-bold hover:bg-white/20 disabled:opacity-40 cursor-pointer"
              >{ytSearching ? "..." : "Cari"}</button>
            </div>
            {ytHits.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-[#535353]">Pilih video yang benar</p>
                {ytHits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handlePickHit(h)}
                    className="w-full flex items-center gap-3 rounded-md hover:bg-white/5 p-2 text-left cursor-pointer"
                  >
                    {h.thumbnail
                      ? <img src={h.thumbnail} alt="" className="size-16 rounded object-cover flex-none" />
                      : <img src={`https://i.ytimg.com/vi/${h.id}/hqdefault.jpg`} alt="" className="size-16 rounded object-cover flex-none" />}
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{h.title}</p>
                      <p className="text-xs text-[#a7a7a7] truncate">
                        {h.channel}{h.duration ? ` · ${Math.floor(h.duration / 60)}:${String(h.duration % 60).padStart(2, "0")}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-[#535353]">Atau tempel link video YouTube langsung:</p>
            <input
              type="text"
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleResolveSpotify(); }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="mt-4 w-full rounded-md bg-[#282828] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-[#535353] focus:outline-none focus:border-[#1ed760]"
            />
              </>
            )}
            {spotifyStatus && !spotifyStatus.startsWith("Error") && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#b3b3b3]">{spotifyStatus}</span>
                  <span className="font-bold text-[#1ed760]">{Math.round(spotifyProgress)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#3a3a3a] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1ed760] transition-[width] duration-700 ease-out"
                    style={{ width: `${spotifyProgress}%` }}
                  />
                </div>
              </div>
            )}
            {spotifyStatus.startsWith("Error") && (
              <p className="mt-3 text-xs text-[#f04a4a]">{spotifyStatus}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={closeSpotifyModal}
                className="px-4 py-2 rounded-full bg-transparent text-sm font-bold text-[#a7a7a7] hover:text-white cursor-pointer"
              >
                {spotifyBusy ? "Tutup & Hentikan" : "Tutup"}
              </button>
              <button
                onClick={() => handleResolveSpotify()}
                disabled={!spotifyUrl.trim() || spotifyBusy || spotifyStatus.startsWith("Error")}
                className="px-5 py-2 rounded-full bg-[#1ed760] text-black text-sm font-bold hover:scale-105 transition cursor-pointer disabled:opacity-40 disabled:hover:scale-100"
              >
                {spotifyBusy ? "Memproses..." : "Proses Lagu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog konfirmasi hentikan proses */}
      {showStopConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="w-[400px] max-w-[92vw] rounded-xl bg-[#242424] border border-white/10 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f04a4a]/15">
                <IconAlertTriangle className="size-5 text-[#f04a4a]" />
              </div>
              <h3 className="text-lg font-bold text-white">Hentikan proses tautan?</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#a7a7a7]">
              Proses tautan sedang berjalan di server. Menutup sekarang akan{" "}
              <span className="font-semibold text-white">menghentikan proses</span> dan pekerjaan yang sedang dikerjakan dibatalkan.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="px-4 py-2 rounded-full bg-transparent text-sm font-bold text-[#a7a7a7] hover:text-white cursor-pointer"
              >
                Lanjutkan proses
              </button>
              <button
                onClick={confirmStopSpotify}
                className="px-5 py-2 rounded-full bg-[#f04a4a] text-white text-sm font-bold hover:scale-105 transition cursor-pointer"
              >
                Hentikan & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB buka mixer (mobile/tablet) */}
      {activeView === "studio" && currentTrack && (
        <button
          onClick={() => setShowMixerSheet(true)}
          className="md:hidden fixed right-4 bottom-24 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1ed760] text-black text-sm font-bold shadow-xl active:scale-95 transition cursor-pointer"
        >
          <IconAdjustmentsHorizontal className="size-5" />
          Mixer
        </button>
      )}

      {/* Bottom sheet mixer (mobile/tablet) */}
      {showMixerSheet && (
        <div className="md:hidden fixed inset-0 z-40 flex items-end bg-black/70" onClick={() => setShowMixerSheet(false)}>
          <div
            className="w-full rounded-t-2xl bg-[#121212] border-t border-white/10 p-4 pb-24 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#535353]" />
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-white">Stem Mixer</span>
              <button onClick={() => setShowMixerSheet(false)} className="text-xs font-bold text-[#a7a7a7] hover:text-white cursor-pointer">
                Tutup
              </button>
            </div>
            {currentTrack ? (
              <StemMixer
                availableKeys={currentTrack ? (Object.keys(currentTrack.stems).filter((k) => k !== "master") as StemKey[]) : ["drums", "bass", "vocals", "other"]}
                trackConfigs={trackConfigs}
                activeStemKey={activeStemKey}
                setActiveStemKey={setActiveStemKey}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                onToggleSolo={handleToggleSolo}
                stemEnergies={stemEnergies}
              />
            ) : (
              <p className="text-sm text-[#a7a7a7]">Pilih lagu dulu di Pustaka.</p>
            )}
          </div>
        </div>
      )}

      {/* Drawer sidebar (mobile/tablet) */}
      {showMobileNav && (
        <div className="md:hidden fixed inset-0 z-40 flex bg-black/70" onClick={() => setShowMobileNav(false)}>
          <div
            className="w-[300px] max-w-[85vw] h-full bg-[#121212] p-2 overflow-y-auto border-r border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-2 mb-1 md:hidden">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#a7a7a7]">Menu</span>
              <button onClick={() => setShowMobileNav(false)} className="size-8 rounded-full bg-[#282828] flex items-center justify-center cursor-pointer">
                <IconX className="size-4 text-white" />
              </button>
            </div>
            <Sidebar
              activeView={activeView}
              onSelectView={(v) => { setActiveView(v); setShowMobileNav(false); }}
              onFileUpload={(file) => { handleFileUpload(file); setShowMobileNav(false); }}
              isProcessing={isProcessing}
              onOpenSpotify={() => { setShowMobileNav(false); setShowSpotifyModal(true); setSpotifyStatus(""); if (!spotifyBusy) setSpotifyUrl(""); }}
              hasSpotifyJob={hasSpotifyJob}
              spotifyError={spotifyStatus.startsWith("Error") ? spotifyStatus : null}
            />
          </div>
        </div>
      )}

      <PlayerBar
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        trackName={currentTrack?.name || "Tidak ada track"}
        artist={currentTrack?.artist || "-"}
        cover={currentTrack?.cover}
        masterVolume={masterVolume}
        isMasterMuted={isMasterMuted}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onRestart={handleRestart}
        onMasterVolumeChange={handleMasterVolumeChange}
        onToggleMasterMute={handleToggleMasterMute}
      />
    </div>
  );
}

export default App;
