/**
 * Sliding Window Riemann Beat Detector
 * Berdasarkan Bab 3 Panduan Lengkap:
 * - Window geser pendek Delta_T = 50 ms (M = F_s * 0.05 = 2205 balok)
 * - Akumulasi energi: E_window = sum([f(t_k)]^2 * Delta_t)
 * - Ambang batas: E_window > C * E_avg (C default 1.3 - 1.5)
 */

export interface BeatState {
  isBeat: boolean;
  currentEnergy: number;       // E_window
  averageEnergy: number;       // E_avg (latar belakang)
  threshold: number;           // C * E_avg
  ratio: number;               // E_window / E_avg
  windowDurationMs: number;    // 50 ms
  sampleCountM: number;        // M balok
}

export class SlidingWindowBeatDetector {
    private windowDurationMs: number;
  private historySize: number; // Jumlah window sebelumnya untuk E_avg (~1 detik)
  private energyHistory: number[] = [];
  private sensitivityC: number;
  private sampleCountM: number;
  private deltaT: number;
  private minEnergyThreshold: number = 0.0005; // Menghindari deteksi pada noise senyap

  constructor(
    sampleRate: number = 44100,
    windowDurationMs: number = 50,
    sensitivityC: number = 1.35,
    historyDurationSec: number = 0.8
  ) {
    this.windowDurationMs = windowDurationMs;
    this.sensitivityC = sensitivityC;
    this.sampleCountM = Math.floor((windowDurationMs / 1000) * sampleRate);
    this.deltaT = 1 / sampleRate;
    this.historySize = Math.max(10, Math.floor((historyDurationSec * 1000) / windowDurationMs));
  }

  public setSensitivity(c: number) {
    this.sensitivityC = Math.max(1.0, Math.min(2.5, c));
  }

  public getSensitivity(): number {
    return this.sensitivityC;
  }

  /**
   * Evaluasi jendela waktu sesaat di sekitar index audio tertentu
   */
  public analyzeFrame(samples: Float32Array, currentIndex: number): BeatState {
    const M = this.sampleCountM;
    const start = Math.max(0, currentIndex - Math.floor(M / 2));
    const end = Math.min(samples.length, start + M);

    // Hitung E_window murni menggunakan Jumlah Riemann
    let powerSum = 0;
    for (let i = start; i < end; i++) {
      const s = samples[i];
      powerSum += s * s;
    }
    const eWindow = powerSum * this.deltaT;

    // Masukkan ke riwayat energi jendela geser
    this.energyHistory.push(eWindow);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    // Hitung rata-rata energi lokal: E_avg
    let histSum = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
      histSum += this.energyHistory[i];
    }
    const eAvg = this.energyHistory.length > 0 ? histSum / this.energyHistory.length : 1e-6;

    // Logika ambang batas: E_window > C * E_avg
    const threshold = this.sensitivityC * eAvg;
    const isBeat = eWindow > threshold && eWindow > this.minEnergyThreshold;
    const ratio = eAvg > 1e-9 ? eWindow / eAvg : 1;

    return {
      isBeat,
      currentEnergy: eWindow,
      averageEnergy: eAvg,
      threshold,
      ratio,
      windowDurationMs: this.windowDurationMs,
      sampleCountM: M,
    };
  }

  public reset() {
    this.energyHistory = [];
  }
}
