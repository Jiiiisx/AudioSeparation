/**
 * Riemann Sum & Numerical Integration Engine for Audio Signal Calculus
 * Based on Syllabus Pertemuan 11: Pengantar Integral Tentu melalui Aproksimasi Luas Daerah
 */

export interface IntegrationMetrics {
  deltaT: number;             // Lebar balok alas (detik)
  totalSamples: number;       // Jumlah sampel asli
  partitionCount: number;     // Jumlah balok Riemann (N)
  leftRiemann: number;        // S_N Kiri (Joule / unit energi)
  rightRiemann: number;       // S_N Kanan (Joule)
  midpointRiemann: number;    // S_N Titik Tengah (Joule)
  trapezoidal: number;        // Aturan Trapesium (Joule)
  simpson: number;            // Aturan Simpson 1/3 (Joule)
  errorLeftVsSimp: number;    // Perbedaan relatif S_left vs Simpson (%)
  peakPower: number;          // P_max = [f(t)]^2 tertinggi
  averagePower: number;       // P_avg
}

/**
 * Menghitung kuadrat amplitudo (fungsi daya sinyal): P(t_k) = [f(t_k)]^2
 * Kurva daya selalu non-negatif (>= 0), mencerminkan energi akustik fisik.
 */
export function computePowerArray(samples: Float32Array): Float32Array {
  const len = samples.length;
  const power = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const s = samples[i];
    power[i] = s * s;
  }
  return power;
}

/**
 * Menghitung aproksimasi integral akumulasi energi menggunakan berbagai metode
 * pada segmen sampel tertentu dengan N partisi balok.
 * 
 * @param samples Raw PCM Float32Array sinyal f(t)
 * @param sampleRate Frekuensi sampling F_s (default 44100 Hz)
 * @param targetPartitions Jumlah partisi balok N yang diinginkan
 * @param startIndex Indeks awal selang waktu [a, b]
 * @param endIndex Indeks akhir selang waktu [a, b]
 */
export function computeIntegrationMetrics(
  samples: Float32Array,
  sampleRate: number = 44100,
  targetPartitions: number = 100,
  startIndex: number = 0,
  endIndex?: number
): IntegrationMetrics {
  const end = Math.min(samples.length, endIndex ?? samples.length);
  const start = Math.max(0, startIndex);
  const totalSamples = Math.max(1, end - start);

  // Lebar partisi waktu: Delta_t = (b - a) / N
  // Di mana durasi total T = totalSamples / sampleRate
  const durationSec = totalSamples / sampleRate;
  const N = Math.max(2, Math.min(targetPartitions, totalSamples));
  const step = totalSamples / N;
  const deltaT = durationSec / N;

  let leftSum = 0;
  let rightSum = 0;
  let midSum = 0;
  let peakPower = 0;
  let totalPowerSum = 0;

  // Sampling balok Riemann pada interval diskrit
  for (let k = 0; k < N; k++) {
    const idxLeft = Math.min(end - 1, Math.floor(start + k * step));
    const idxRight = Math.min(end - 1, Math.floor(start + (k + 1) * step));
    const idxMid = Math.min(end - 1, Math.floor(start + (k + 0.5) * step));

    const pLeft = samples[idxLeft] * samples[idxLeft];
    const pRight = samples[idxRight] * samples[idxRight];
    const pMid = samples[idxMid] * samples[idxMid];

    leftSum += pLeft;
    rightSum += pRight;
    midSum += pMid;

    if (pLeft > peakPower) peakPower = pLeft;
    if (pRight > peakPower) peakPower = pRight;
    totalPowerSum += pLeft;
  }

  const leftRiemann = leftSum * deltaT;
  const rightRiemann = rightSum * deltaT;
  const midpointRiemann = midSum * deltaT;

  // Aturan Trapesium: (Delta_t / 2) * [P_0 + 2*P_1 + ... + P_N]
  const p0 = samples[start] * samples[start];
  const pN = samples[end - 1] * samples[end - 1];
  let trapInnerSum = 0;
  for (let k = 1; k < N; k++) {
    const idx = Math.min(end - 1, Math.floor(start + k * step));
    trapInnerSum += samples[idx] * samples[idx];
  }
  const trapezoidal = (deltaT / 2) * (p0 + 2 * trapInnerSum + pN);

  // Aturan Simpson 1/3: mensyaratkan N genap
  const simpsonN = N % 2 === 0 ? N : N - 1;
  const simpsonDeltaT = durationSec / simpsonN;
  const simpsonStep = totalSamples / simpsonN;
  let simpsonOdd = 0;
  let simpsonEven = 0;

  for (let k = 1; k < simpsonN; k++) {
    const idx = Math.min(end - 1, Math.floor(start + k * simpsonStep));
    const pVal = samples[idx] * samples[idx];
    if (k % 2 === 1) {
      simpsonOdd += pVal;
    } else {
      simpsonEven += pVal;
    }
  }
  const simpson = (simpsonDeltaT / 3) * (p0 + 4 * simpsonOdd + 2 * simpsonEven + pN);

  const errorLeftVsSimp = simpson > 1e-12 
    ? (Math.abs(leftRiemann - simpson) / simpson) * 100 
    : 0;

  const averagePower = totalPowerSum / N;

  return {
    deltaT,
    totalSamples,
    partitionCount: N,
    leftRiemann,
    rightRiemann,
    midpointRiemann,
    trapezoidal,
    simpson,
    errorLeftVsSimp,
    peakPower,
    averagePower,
  };
}

/**
 * Ekstraksi data balok untuk keperluan visualisasi Canvas.
 * Mengembalikan array koordinat balok [x, y, width, height]
 */
export interface RiemannBarData {
  timeStart: number; // detik
  timeEnd: number;   // detik
  power: number;     // tinggi balok [f(t_k)]^2
  area: number;      // Luas balok = P(t_k) * Delta_t
}

export function extractRiemannBars(
  samples: Float32Array,
  sampleRate: number,
  startTimeSec: number,
  durationSec: number,
  partitionCount: number
): { bars: RiemannBarData[]; deltaT: number; totalEnergy: number } {
  const startIdx = Math.max(0, Math.floor(startTimeSec * sampleRate));
  const totalSamples = Math.floor(durationSec * sampleRate);
  const endIdx = Math.min(samples.length, startIdx + totalSamples);
  const actualDuration = (endIdx - startIdx) / sampleRate;

  const N = Math.max(2, partitionCount);
  const deltaT = actualDuration / N;
  const step = (endIdx - startIdx) / N;

  const bars: RiemannBarData[] = [];
  let totalEnergy = 0;

  for (let k = 0; k < N; k++) {
    const sIdx = Math.floor(startIdx + k * step);
    const eIdx = Math.min(endIdx - 1, Math.floor(startIdx + (k + 1) * step));
    
    // Ambil nilai daya rata-rata atau puncak pada balok tersebut
    let maxPowerInSubinterval = 0;
    const stride = Math.max(1, Math.floor((eIdx - sIdx) / 10));
    for (let i = sIdx; i < eIdx; i += stride) {
      const p = samples[i] * samples[i];
      if (p > maxPowerInSubinterval) maxPowerInSubinterval = p;
    }

    const tStart = startTimeSec + k * deltaT;
    const tEnd = tStart + deltaT;
    const area = maxPowerInSubinterval * deltaT;

    bars.push({
      timeStart: tStart,
      timeEnd: tEnd,
      power: maxPowerInSubinterval,
      area,
    });

    totalEnergy += area;
  }

  return { bars, deltaT, totalEnergy };
}
