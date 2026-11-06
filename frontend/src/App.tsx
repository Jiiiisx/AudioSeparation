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
} from "@tabler/icons-react";
import { Sidebar } from "./components/Sidebar";
import { fetchLibrary, deleteLibrarySong, loadLibrarySong, resolveSpotifyTrack, isPlaylistUrl, resolvePlaylist, cancelBatch, batchControl } from "./lib/songApi";
import type { BatchTrack } from "./lib/songApi";
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
  const [library, setLibrary] = useState<LibrarySong[]>([]);
  const [loadingLibrarySongId, setLoadingLibrarySongId] = useState<number | null>(null);
  const [batchTracks, setBatchTracks] = useState<BatchTrack[] | null>(null);
  const [showMobileNav, setShowMobileNav] = useState<boolean>(false);
  const [showMixerSheet, setShowMixerSheet] = useState<boolean>(false);
  const [studioTab, setStudioTab] = useState<"visual" | "beats" | "integrasi">("visual");
  const [batchRunning, setBatchRunning] = useState<boolean>(false);

  const hasSpotifyJob = Boolean(spotifyStatus) && !spotifyStatus.startsWith("Error") && !showSpotifyModal;

  useEffect(() => {
    const engine = new MultiTrackAudioEngine();
    engineRef.current = engine;
    engine.onTimeUpdate((time) => setCurrentTime(time));

    fetchLibrary().then(setLibrary).catch(() => {}); // backend mati = pustaka kosong, bukan error

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
      const track = await loadLibrarySong(song);
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
    }
  };

  const handleDeleteLibrary = async (id: number) => {
    await deleteLibrarySong(id);
    setLibrary((prev) => prev.filter((x) => x.id !== id));
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

  const handleResolveSpotify = async () => {
    const url = spotifyUrl.trim();
    if (!url) return;
    if (isPlaylistUrl(url)) {
      setSpotifyStatus("Membaca playlist...");
      setBatchTracks([]);
      setBatchRunning(true);
      batchControl.cancelRequested = false;
      try {
        const batch = await resolvePlaylist(url, (tracks, done, total) => {
          setBatchTracks(tracks);
          setSpotifyStatus(`Playlist: ${done}/${total} lagu selesai (gagal otomatis dilewati).`);
          if (done > 0) fetchLibrary().then(setLibrary).catch(() => {});
        });
        setSpotifyStatus(`Selesai: ${batch.done}/${batch.total} lagu berhasil. Pustaka diperbarui.`);
        fetchLibrary().then(setLibrary).catch(() => {});
      } catch (err: unknown) {
        setSpotifyStatus(err instanceof Error ? `Error: ${err.message}` : "Error memproses playlist.");
      } finally {
        setBatchTracks(null);
        setBatchRunning(false);
        batchControl.id = null;
      }
      return;
    }
    setSpotifyStatus("Diterima backend, memulai pipeline...");
    try {
      const track = await resolveSpotifyTrack(url, (msg) => setSpotifyStatus(msg));
      setSpotifyStatus("Selesai.");
      setCurrentTrack(track);
      if (engineRef.current) {
        engineRef.current.setTrack(track);
        setIsPlaying(false);
        setCurrentTime(0);
      }
      setShowSpotifyModal(false);
      setActiveView("studio");
      fetchLibrary().then(setLibrary).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses link Spotify";
      setSpotifyStatus(`Error: ${msg}`);
    }
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
            currentTrack={currentTrack}
            library={library}
            onSelectLibrary={handleSelectLibrary}
            onDeleteLibrary={handleDeleteLibrary}
            loadingLibrarySong={loadingLibrarySongId}
            onFileUpload={handleFileUpload}
            isProcessing={isProcessing}
            onOpenSpotify={() => { setShowSpotifyModal(true); setSpotifyStatus(""); }}
            hasSpotifyJob={hasSpotifyJob}
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

              {/* Kartu lagu terakhir + statistik */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
                <button
                  onClick={() => setActiveView("studio")}
                  className="flex items-center gap-4 p-4 rounded-lg bg-[#181818] hover:bg-[#1f1f1f] transition text-left cursor-pointer group"
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
                      {currentTrack ? currentTrack.artist : "Unggah file atau tautkan Spotify lewat Pustaka"}
                    </p>
                  </div>
                  <button className="ml-auto size-10 shrink-0 rounded-full bg-[#1ed760] flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer" title="Buka Studio">
                    <IconPlayerPlayFilled className="size-5 text-black fill-black" />
                  </button>
                </button>

                <div className="p-4 rounded-lg bg-[#181818]">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold text-white">{library.length}</span>
                    <span className="text-sm text-[#a7a7a7]">lagu di pustaka</span>
                  </div>
                  <p className="text-xs leading-relaxed text-[#a7a7a7]">
                    Semua lagu Spotify yang pernah diproses tersimpan dan bisa diputar ulang tanpa memproses ulang.
                  </p>
                </div>
              </div>

              {/* Cara pakai: 3 langkah */}
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">Cara pakai</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    step: 1,
                    title: "Tautkan atau unggah lagu",
                    desc: "Tempel link Spotify (track atau playlist) atau unggah MP3/WAV lokal lewat Pustaka di kiri.",
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
                  <IconBrandSpotify className="size-5" />
                  Mulai dari link Spotify
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
                <div className="size-20 sm:size-28 shrink-0 rounded-lg bg-gradient-to-br from-[#1db954] to-[#191414] flex items-center justify-center shadow-xl">
                  <IconMusic className="size-8 sm:size-12 text-white/80" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#1ed760]">Track</span>
                  <h1 className="text-2xl sm:text-4xl font-bold tracking-tight truncate">{currentTrack?.name || "Tidak ada track"}</h1>
                  <p className="text-sm text-[#a7a7a7] mt-1">
                    {currentTrack?.artist} · {currentTrack?.bpm} BPM · Fs 44.100 Hz · {currentTrack?.genre}
                  </p>
                </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowSpotifyModal(false)}>
          <div className="w-[440px] max-w-[90vw] rounded-lg bg-[#181818] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white">Tautkan lagu Spotify</h3>
            <p className="text-sm text-[#a7a7a7] mt-1 leading-relaxed">
              Tempel link lagu atau playlist dari Spotify (Share → Copy Link). Playlist diproses berurutan, yang selesai langsung masuk Pustaka.
              Server akan meminjam audio via resolver lalu memisahkan 6 stem.
              Berlangsung 1–5 menit tergantung durasi lagu.
            </p>
            <input
              type="text"
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleResolveSpotify(); }}
              placeholder="https://open.spotify.com/track/... atau /playlist/..."
              className="mt-4 w-full rounded-md bg-[#282828] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-[#535353] focus:outline-none focus:border-[#1ed760]"
            />
            {spotifyStatus && (
              <p className="mt-3 text-xs text-[#1ed760]">{spotifyStatus}</p>
            )}
            {batchRunning && (
              <button
                onClick={async () => { await cancelBatch(); setSpotifyStatus("Menghentikan antrian..."); }}
                className="mt-3 w-full rounded-md bg-[#f04a4a]/90 px-3 py-2 text-sm font-bold text-white hover:bg-[#f04a4a] cursor-pointer"
              >
                Hentikan pemrosesan playlist
              </button>
            )}
            {batchTracks && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-md bg-[#181818] border border-white/10">
                {batchTracks.map((t) => (
                  <div key={t.job_id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className={t.status === "error" ? "text-[#f04a4a]" : t.status === "done" ? "text-[#1ed760]" : "text-[#a7a7a7]"}>
                      {t.status === "done" ? "[selesai]" : t.status === "error" ? "[dilewati]" : "[proses]"}
                    </span>
                    <span className="truncate text-white/90">{t.title}</span>
                    <span className="ml-auto shrink-0 text-[#535353]">{t.artist}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowSpotifyModal(false)}
                className="px-4 py-2 rounded-full bg-transparent text-sm font-bold text-[#a7a7a7] hover:text-white cursor-pointer"
              >
                Tutup
              </button>
              <button
                onClick={handleResolveSpotify}
                disabled={!spotifyUrl.trim() || spotifyStatus.includes("Error") === false && spotifyStatus !== ""}
                className="px-5 py-2 rounded-full bg-[#1ed760] text-black text-sm font-bold hover:scale-105 transition cursor-pointer disabled:opacity-40 disabled:hover:scale-100"
              >
                Proses Lagu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast global: playlist diproses sementara modal ditutup */}
      {batchRunning && !showSpotifyModal && (
        <div className="fixed top-3 right-3 md:right-4 z-30 flex items-center gap-3 rounded-full bg-[#181818] border border-white/10 px-4 py-2 shadow-xl text-sm">
          <span className="flex size-2 rounded-full bg-[#1ed760] animate-pulse" />
          <span className="text-[#d8d8d8]">Playlist diproses di latar belakang</span>
          <button onClick={() => { setShowSpotifyModal(true); }} className="text-xs font-bold text-[#1ed760] hover:underline cursor-pointer">
            Buka
          </button>
        </div>
      )}

      {/* FAB buka mixer (mobile/tablet) */}
      {activeView === "studio" && currentTrack && (
        <button
          onClick={() => setShowMixerSheet(true)}
          className="xl:hidden fixed right-4 bottom-24 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1ed760] text-black text-sm font-bold shadow-xl active:scale-95 transition cursor-pointer"
        >
          <IconAdjustmentsHorizontal className="size-5" />
          Mixer
        </button>
      )}

      {/* Bottom sheet mixer (mobile/tablet) */}
      {showMixerSheet && (
        <div className="xl:hidden fixed inset-0 z-40 flex items-end bg-black/70" onClick={() => setShowMixerSheet(false)}>
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
              currentTrack={currentTrack}
              library={library}
              onSelectLibrary={(song) => { handleSelectLibrary(song); setShowMobileNav(false); }}
              onDeleteLibrary={handleDeleteLibrary}
              loadingLibrarySong={loadingLibrarySongId}
              onFileUpload={(file) => { handleFileUpload(file); setShowMobileNav(false); }}
              isProcessing={isProcessing}
              onOpenSpotify={() => { setShowMobileNav(false); setShowSpotifyModal(true); setSpotifyStatus(""); }}
              hasSpotifyJob={hasSpotifyJob}
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
