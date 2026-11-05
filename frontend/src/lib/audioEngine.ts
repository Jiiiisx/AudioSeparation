/**
 * Web Audio API Synchronized Multi-Track Stem Player
 * Mengelola 4 channel instrumen (Drums, Bass, Vocals, Other) + Master Mix
 * dengan fader volume, tombol Solo, Mute, dan akses PCM Float32Array real-time.
 */

import type { TrackStemData } from './proceduralSongs';

export type StemKey = 'drums' | 'bass' | 'vocals' | 'other' | 'master';

export interface StemTrackConfig {
  key: StemKey;
  label: string;
  volume: number; // 0.0 - 1.0
  isMuted: boolean;
  isSolo: boolean;
}

export class MultiTrackAudioEngine {
  private ctx: AudioContext | null = null;
  private currentTrack: TrackStemData | null = null;
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pauseOffset: number = 0;

  // Web Audio Nodes
  private sourceNodes: Map<StemKey, AudioBufferSourceNode> = new Map();
  private gainNodes: Map<StemKey, GainNode> = new Map();
  private masterGainNode: GainNode | null = null;
  private audioBuffers: Map<StemKey, AudioBuffer> = new Map();

  // Track configs
  private trackConfigs: Map<StemKey, StemTrackConfig> = new Map([
    ['drums', { key: 'drums', label: 'Drums / Kick', volume: 0.9, isMuted: false, isSolo: false }],
    ['bass', { key: 'bass', label: 'Bass Guitar / Sub', volume: 0.85, isMuted: false, isSolo: false }],
    ['vocals', { key: 'vocals', label: 'Vocals', volume: 0.85, isMuted: false, isSolo: false }],
    ['other', { key: 'other', label: 'Melody / Synth / Chords', volume: 0.75, isMuted: false, isSolo: false }],
    ['master', { key: 'master', label: 'Master Output', volume: 1.0, isMuted: false, isSolo: false }],
  ]);

  private onTimeUpdateCallback: ((time: number, duration: number) => void) | null = null;
  private animFrameId: number | null = null;

  constructor() {
    // Lazy init pada interaksi pengguna pertama
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass({ sampleRate: 44100 });
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setTrack(trackData: TrackStemData) {
    this.stop();
    this.initContext();
    this.currentTrack = trackData;
    this.pauseOffset = 0;

    if (!this.ctx) return;

    // Convert Float32Array PCM menjadi AudioBuffer native Web Audio
    const keys: StemKey[] = ['drums', 'bass', 'vocals', 'other'];
    const totalSamples = trackData.stems.drums.length;

    for (const key of keys) {
      const buf = this.ctx.createBuffer(1, totalSamples, trackData.sampleRate);
      const chData = buf.getChannelData(0);
      chData.set(trackData.stems[key]);
      this.audioBuffers.set(key, buf);
    }
  }

  public play() {
    this.initContext();
    if (!this.ctx || !this.currentTrack || this.isPlaying) return;

    const duration = this.currentTrack.duration;
    const offset = this.pauseOffset % duration;
    this.startTime = this.ctx.currentTime - offset;

    // Buat AudioBufferSourceNode baru untuk setiap stem
    const keys: StemKey[] = ['drums', 'bass', 'vocals', 'other'];

    for (const key of keys) {
      const buffer = this.audioBuffers.get(key);
      if (!buffer) continue;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      let gainNode = this.gainNodes.get(key);
      if (!gainNode) {
        gainNode = this.ctx.createGain();
        gainNode.connect(this.masterGainNode!);
        this.gainNodes.set(key, gainNode);
      }

      source.connect(gainNode);
      source.start(0, offset);
      this.sourceNodes.set(key, source);
    }

    this.applyTrackGains();
    this.isPlaying = true;
    this.startTicker();
  }

  public pause() {
    if (!this.isPlaying || !this.ctx) return;
    this.pauseOffset = this.getCurrentTime();
    this.cleanupSources();
    this.isPlaying = false;
    this.stopTicker();
  }

  public stop() {
    this.cleanupSources();
    this.isPlaying = false;
    this.pauseOffset = 0;
    this.stopTicker();
    if (this.onTimeUpdateCallback && this.currentTrack) {
      this.onTimeUpdateCallback(0, this.currentTrack.duration);
    }
  }

  public seek(timeInSeconds: number) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.pauseOffset = Math.max(0, Math.min(this.getDuration(), timeInSeconds));
    if (wasPlaying) {
      this.play();
    } else if (this.onTimeUpdateCallback && this.currentTrack) {
      this.onTimeUpdateCallback(this.pauseOffset, this.currentTrack.duration);
    }
  }

  public getCurrentTime(): number {
    if (!this.ctx || !this.currentTrack) return this.pauseOffset;
    if (!this.isPlaying) return this.pauseOffset;
    const elapsed = this.ctx.currentTime - this.startTime;
    return elapsed % this.currentTrack.duration;
  }

  public getDuration(): number {
    return this.currentTrack ? this.currentTrack.duration : 0;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTrack(): TrackStemData | null {
    return this.currentTrack;
  }

  public setVolume(key: StemKey, vol: number) {
    const cfg = this.trackConfigs.get(key);
    if (cfg) {
      cfg.volume = Math.max(0, Math.min(1, vol));
      this.applyTrackGains();
    }
  }

  public toggleMute(key: StemKey) {
    const cfg = this.trackConfigs.get(key);
    if (cfg) {
      cfg.isMuted = !cfg.isMuted;
      this.applyTrackGains();
    }
  }

  public toggleSolo(key: StemKey) {
    const cfg = this.trackConfigs.get(key);
    if (!cfg) return;

    const nextSolo = !cfg.isSolo;
    cfg.isSolo = nextSolo;

    // Jika solo dinyalakan, matikan solo pada channel lain
    if (nextSolo) {
      this.trackConfigs.forEach((c, k) => {
        if (k !== key && k !== 'master') {
          c.isSolo = false;
        }
      });
    }

    this.applyTrackGains();
  }

  public getTrackConfigs(): Map<StemKey, StemTrackConfig> {
    return this.trackConfigs;
  }

  public onTimeUpdate(cb: (time: number, duration: number) => void) {
    this.onTimeUpdateCallback = cb;
  }

  private applyTrackGains() {
    if (!this.ctx) return;

    // Cek apakah ada channel yang sedang solo
    let hasSolo = false;
    this.trackConfigs.forEach((cfg, key) => {
      if (key !== 'master' && cfg.isSolo) hasSolo = true;
    });

    const keys: StemKey[] = ['drums', 'bass', 'vocals', 'other'];
    keys.forEach((key) => {
      const cfg = this.trackConfigs.get(key);
      const gainNode = this.gainNodes.get(key);
      if (!cfg || !gainNode) return;

      let targetGain = cfg.volume;
      if (cfg.isMuted) {
        targetGain = 0;
      } else if (hasSolo && !cfg.isSolo) {
        targetGain = 0;
      }

      gainNode.gain.setValueAtTime(targetGain, this.ctx!.currentTime);
    });

    // Master gain
    const masterCfg = this.trackConfigs.get('master');
    if (masterCfg && this.masterGainNode) {
      const masterGain = masterCfg.isMuted ? 0 : masterCfg.volume;
      this.masterGainNode.gain.setValueAtTime(masterGain, this.ctx.currentTime);
    }
  }

  private cleanupSources() {
    this.sourceNodes.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Abaikan jika sudah stopped
      }
    });
    this.sourceNodes.clear();
  }

  private startTicker() {
    const tick = () => {
      if (this.isPlaying && this.currentTrack && this.onTimeUpdateCallback) {
        const t = this.getCurrentTime();
        this.onTimeUpdateCallback(t, this.currentTrack.duration);
      }
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopTicker() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}
