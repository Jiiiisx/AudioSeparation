import { useState, useEffect, useRef, useMemo } from 'react';
import { MultiTrackAudioEngine } from './lib/audioEngine';
import type { StemKey } from './lib/audioEngine';
import { SlidingWindowBeatDetector } from './lib/beatDetector';
import type { BeatState } from './lib/beatDetector';
import { computeIntegrationMetrics } from './lib/riemann';
import type { IntegrationMetrics } from './lib/riemann';
import { generatePresetSong } from './lib/proceduralSongs';
import type { TrackStemData } from './lib/proceduralSongs';
import { TopNavbar } from './components/TopNavbar';
import { RiemannVisualizer } from './components/RiemannVisualizer';
import { BeatDetectorPanel } from './components/BeatDetectorPanel';
import { IntegrationMetricsTable } from './components/IntegrationMetricsTable';
import { StemMixer } from './components/StemMixer';
import { TransportBar } from './components/TransportBar';
import { BookOpen, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function App() {
  const engineRef = useRef<MultiTrackAudioEngine | null>(null);
  const beatDetectorRef = useRef<SlidingWindowBeatDetector>(new SlidingWindowBeatDetector());

  const [activePreset, setActivePreset] = useState<'edm' | 'pop' | 'rock'>('edm');
  const [currentTrack, setCurrentTrack] = useState<TrackStemData | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStemKey, setActiveStemKey] = useState<StemKey>('drums');

  // Kalkulus Settings
  const [partitionCount, setPartitionCount] = useState<number>(80);
  const [windowDurationSec, setWindowDurationSec] = useState<number>(0.25);
  const [sensitivityC, setSensitivityC] = useState<number>(1.35);

  // States
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
    drums: 0,
    bass: 0,
    vocals: 0,
    other: 0,
    master: 0,
  });

  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [, setTrackConfigsVersion] = useState<number>(0);
  const [isProcessingUrl, setIsProcessingUrl] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [showQnaModal, setShowQnaModal] = useState<boolean>(false);

  // Inisialisasi Audio Engine & Preset Default
  useEffect(() => {
    const engine = new MultiTrackAudioEngine();
    engineRef.current = engine;

    engine.onTimeUpdate((time) => {
      setCurrentTime(time);
    });

    const initialTrack = generatePresetSong('edm');
    setCurrentTrack(initialTrack);
    engine.setTrack(initialTrack);

    // Cek status server backend
    fetch('http://localhost:8000/api/health')
      .then((res) => {
        if (res.ok) setServerStatus('online');
        else setServerStatus('offline');
      })
      .catch(() => setServerStatus('offline'));

    return () => {
      engine.stop();
    };
  }, []);

  // Update sensitivitas beat detector
  useEffect(() => {
    beatDetectorRef.current.setSensitivity(sensitivityC);
  }, [sensitivityC]);

  // Handle pergantian preset lagu
  const handleSelectPreset = (genre: 'edm' | 'pop' | 'rock') => {
    setActivePreset(genre);
    const newTrack = generatePresetSong(genre);
    setCurrentTrack(newTrack);
    if (engineRef.current) {
      engineRef.current.setTrack(newTrack);
      setIsPlaying(false);
      setCurrentTime(0);
    }
    beatDetectorRef.current.reset();
  };

  // Switch Stem Analysis
  const activeSamples = useMemo(() => {
    if (!currentTrack) return null;
    return currentTrack.stems[activeStemKey];
  }, [currentTrack, activeStemKey]);

  // Real-time kalkulus frame analysis saat audio berjalan
  useEffect(() => {
    if (!currentTrack) return;

    const sampleRate = currentTrack.sampleRate;
    const curIdx = Math.floor(currentTime * sampleRate);

    // 1. Evaluasi Beat Detection pada stem Drums
    const drumSamples = currentTrack.stems.drums;
    const bs = beatDetectorRef.current.analyzeFrame(drumSamples, curIdx);
    setBeatState(bs);

    // 2. Evaluasi porsi energi sesaat masing-masing stem
    const M = 2205;
    const sIdx = Math.max(0, curIdx - Math.floor(M / 2));
    const eIdx = Math.min(drumSamples.length, sIdx + M);
    const dt = 1 / sampleRate;

    const calcStemEnergy = (samples: Float32Array) => {
      let sum = 0;
      for (let i = sIdx; i < eIdx; i += 4) {
        sum += samples[i] * samples[i];
      }
      return sum * (dt * 4);
    };

    setStemEnergies({
      drums: calcStemEnergy(currentTrack.stems.drums),
      bass: calcStemEnergy(currentTrack.stems.bass),
      vocals: calcStemEnergy(currentTrack.stems.vocals),
      other: calcStemEnergy(currentTrack.stems.other),
      master: calcStemEnergy(currentTrack.stems.master),
    });
  }, [currentTime, currentTrack]);

  // Hitung Metrik Integrasi Numerik (Riemann Kiri, Kanan, Midpoint, Trapesium, Simpson)
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

    return computeIntegrationMetrics(
      activeSamples,
      sampleRate,
      partitionCount,
      startIdx,
      endIdx
    );
  }, [activeSamples, currentTrack, currentTime, windowDurationSec, partitionCount]);

  // Kontrol Transport
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

  // Kontrol Mixer
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
    if (engineRef.current) {
      engineRef.current.setVolume('master', vol);
    }
  };

  const handleToggleMasterMute = () => {
    const nextMute = !isMasterMuted;
    setIsMasterMuted(nextMute);
    if (engineRef.current) {
      engineRef.current.toggleMute('master');
    }
  };

  // Client-Side DSP Separation untuk file upload lokal (.mp3, .wav)
  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessingUrl(true);
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
        if (i >= winSize) {
          runningSum -= (left[i - winSize] + right[i - winSize]) * 0.5;
        }
        const lowFreq = runningSum / winSize;
        bass[i] = lowFreq * 1.2;
        drums[i] = lowFreq * 1.4;

        const mid = mono;
        const side = (left[i] - right[i]) * 0.5;
        vocals[i] = (mid - lowFreq) * 1.1;
        other[i] = side * 1.3 + (mono - lowFreq) * 0.4;
      }

      const customTrack: TrackStemData = {
        name: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'Custom Upload (Client DSP Riemann Split)',
        genre: 'CUSTOM',
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
    } catch (err) {
      console.error(err);
      alert('Gagal mendecode file audio: pastikan format MP3 atau WAV valid.');
    } finally {
      setIsProcessingUrl(false);
    }
  };

  // Fetch Spotify URL via Backend
  const handleFetchSpotify = async (url: string) => {
    setIsProcessingUrl(true);
    try {
      const response = await fetch('http://localhost:8000/api/process-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Backend server offline atau gagal memproses link Spotify. Gunakan tombol Preset atau File Upload untuk demonstrasi instan.');
      }

      const data = await response.json();
      console.log('Stems ready:', data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Koneksi backend gagal';
      throw new Error(msg);
    } finally {
      setIsProcessingUrl(false);
    }
  };

  const trackConfigs = engineRef.current ? engineRef.current.getTrackConfigs() : new Map();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <TopNavbar
        onSelectPreset={handleSelectPreset}
        activePreset={activePreset}
        onFileUpload={handleFileUpload}
        onFetchSpotify={handleFetchSpotify}
        isProcessingUrl={isProcessingUrl}
        serverStatus={serverStatus}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Banner Penjelasan Akademis & Tombol Q&A Dosen */}
        <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-purple-950/40 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Kalkulus Terapan: Pembuktian Luas Daerah di Bawah Kurva Daya Musik
              </div>
              <div className="text-[11px] text-slate-400">
                Frekuensi sampling F_s = 44.100 Hz mempartisi 1 detik audio menjadi 44.100 balok diskrit (Δt ≈ 22,7 μs).
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowQnaModal(!showQnaModal)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition cursor-pointer shrink-0"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span>Kunci Q&A Dosen (3 Pertanyaan)</span>
            {showQnaModal ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Modal / Accordion Kunci Q&A Dosen dari Diktat */}
        {showQnaModal && (
          <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-4 space-y-3 font-mono text-xs shadow-2xl">
            <div className="text-cyan-400 font-bold uppercase tracking-wider text-[11px]">
              Kunci Jawaban Ujian Tanya Jawab Dosen (Panduan Pertemuan 11)
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="text-slate-200 font-bold mb-1">
                Q1: Mengapa menghitung kurva daya [f(t)]² dan bukan amplitudo f(t) secara langsung?
              </div>
              <div className="text-slate-400 text-[11px] leading-relaxed">
                Gelombang suara f(t) berosilasi naik-turun simetris di sekitar nol. Jika dihitung langsung, luas positif dan negatif akan saling meniadakan hingga mendekati nol. Dengan mengkuadratkan fungsi menjadi P(t) = [f(t)]², nilainya selalu non-negatif (≥ 0) dan merepresentasikan energi fisik suara sesungguhnya.
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="text-slate-200 font-bold mb-1">
                Q2: Apa kaitan langsung materi Jumlah Riemann dengan sampling rate 44.100 Hz?
              </div>
              <div className="text-slate-400 text-[11px] leading-relaxed">
                Sampling rate 44.100 Hz mempartisi waktu [0, 1] detik menjadi N = 44.100 partisi dengan lebar balok seragam Δt = 1/44.100 ≈ 22,7 mikrodetik. Komputasi audio digital pada hakikatnya adalah aproksimasi Jumlah Riemann dengan 44.100 balok per detik.
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="text-slate-200 font-bold mb-1">
                Q3: Bagaimana Jumlah Riemann mendeteksi ketukan bass secara akurat?
              </div>
              <div className="text-slate-400 text-[11px] leading-relaxed">
                Dentuman bass melepaskan amplitudo masif dalam durasi singkat. Melalui jendela geser 50 ms dan rumus E_window = ∑ [f(t_k)]² · Δt, luas balok melonjak tajam. Saat E_window &gt; C · E_avg, sistem secara instan mengenali dentuman beat.
              </div>
            </div>
          </div>
        )}

        {/* 2-Column Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Kolom Kiri: Laboratorium Kalkulus Riemann & Beat Detector (7/12) */}
          <div className="lg:col-span-7 space-y-6">
            <RiemannVisualizer
              samples={activeSamples}
              sampleRate={currentTrack?.sampleRate || 44100}
              currentTime={currentTime}
              duration={currentTrack?.duration || 1}
              partitionCount={partitionCount}
              setPartitionCount={setPartitionCount}
              windowDurationSec={windowDurationSec}
              setWindowDurationSec={setWindowDurationSec}
              isBeatHit={beatState.isBeat}
              activeStemLabel={activeStemKey.toUpperCase()}
            />

            <BeatDetectorPanel
              beatState={beatState}
              sensitivityC={sensitivityC}
              setSensitivityC={setSensitivityC}
            />

            <IntegrationMetricsTable metrics={currentMetrics} />
          </div>

          {/* Kolom Kanan: Multi-Track AI Stem Mixer (5/12) */}
          <div className="lg:col-span-5 space-y-6">
            <StemMixer
              trackConfigs={trackConfigs}
              activeStemKey={activeStemKey}
              setActiveStemKey={setActiveStemKey}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              stemEnergies={stemEnergies}
            />

            {/* Panel Ringkasan Karakter Musik */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl font-mono text-xs space-y-3">
              <div className="flex items-center justify-between text-slate-200 font-bold border-b border-slate-800 pb-2">
                <span>Informasi Audio Track Aktif</span>
                <span className="text-cyan-400">{currentTrack?.genre}</span>
              </div>
              <div className="space-y-1.5 text-slate-400 text-[11px]">
                <div className="flex justify-between">
                  <span>Judul Trek:</span>
                  <span className="text-slate-200 font-semibold">{currentTrack?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Artis / Style:</span>
                  <span className="text-slate-200">{currentTrack?.artist}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tempo (BPM):</span>
                  <span className="text-slate-200">{currentTrack?.bpm} BPM</span>
                </div>
                <div className="flex justify-between">
                  <span>Sampling Rate (F_s):</span>
                  <span className="text-slate-200">44.100 Hz (Standar CD)</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Balok Riemann per Detik:</span>
                  <span className="text-cyan-400 font-bold">44.100 balok</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Transport Player Bar */}
      <TransportBar
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={currentTrack?.duration || 0}
        trackName={currentTrack?.name || 'No Track'}
        artist={currentTrack?.artist || ''}
        genre={currentTrack?.genre || ''}
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
