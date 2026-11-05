/**
 * Procedural Multi-Stem Audio Synthesizer
 * Menghasilkan 4-stem audio instan (Drums, Bass, Vocals, Other) murni di browser
 * tanpa butuh koneksi internet atau download file eksternal untuk demo presentasi.
 */

export interface TrackStemData {
  name: string;
  artist: string;
  genre: string;
  bpm: number;
  duration: number;
  sampleRate: number;
  stems: {
    drums: Float32Array;
    bass: Float32Array;
    vocals: Float32Array;
    other: Float32Array;
    master: Float32Array;
  };
}

export function generatePresetSong(genre: 'edm' | 'pop' | 'rock'): TrackStemData {
  const sampleRate = 44100;
  const duration = 16.0;
  const totalSamples = Math.floor(sampleRate * duration);

  const drums = new Float32Array(totalSamples);
  const bass = new Float32Array(totalSamples);
  const vocals = new Float32Array(totalSamples);
  const other = new Float32Array(totalSamples);
  const master = new Float32Array(totalSamples);

  let name = '';
  let artist = '';
  let bpm = 128;

  if (genre === 'edm') {
    name = 'Neon Cyber Drop';
    artist = 'Riemann Waves & Alan Walker Style';
    bpm = 128;
    synthesizeEDM(drums, bass, vocals, other, totalSamples, sampleRate, bpm);
  } else if (genre === 'pop') {
    name = 'Midnight Groove';
    artist = 'The Weeknd & Bruno Style';
    bpm = 112;
    synthesizePop(drums, bass, vocals, other, totalSamples, sampleRate, bpm);
  } else {
    name = 'Overdrive Ignition';
    artist = 'Linkin Park & Muse Style';
    bpm = 140;
    synthesizeRock(drums, bass, vocals, other, totalSamples, sampleRate, bpm);
  }

  for (let i = 0; i < totalSamples; i++) {
    const sum = (drums[i] * 0.9) + (bass[i] * 0.8) + (vocals[i] * 0.8) + (other[i] * 0.7);
    master[i] = Math.tanh(sum * 0.85);
  }

  return {
    name,
    artist,
    genre: genre.toUpperCase(),
    bpm,
    duration,
    sampleRate,
    stems: { drums, bass, vocals, other, master }
  };
}

function synthesizeEDM(
  drums: Float32Array,
  bass: Float32Array,
  vocals: Float32Array,
  other: Float32Array,
  totalSamples: number,
  sampleRate: number,
  bpm: number
) {
  const beatSec = 60 / bpm;
  const beatSamples = Math.floor(beatSec * sampleRate);

  for (let t = 0; t < totalSamples; t++) {
    const timeInBeat = (t % beatSamples) / sampleRate;
    const beatIndex = Math.floor(t / beatSamples);

    if (timeInBeat < 0.28) {
      const freq = 140 * Math.exp(-timeInBeat * 28) + 45;
      const env = Math.exp(-timeInBeat * 14);
      drums[t] += Math.sin(2 * Math.PI * freq * timeInBeat) * env * 1.1;
    }

    if (beatIndex % 2 === 1 && timeInBeat < 0.18) {
      const noise = (Math.random() * 2 - 1) * Math.exp(-timeInBeat * 25);
      drums[t] += noise * 0.55;
    }

    const sixteenthSamples = beatSamples / 4;
    const timeInSixteenth = (t % sixteenthSamples) / sampleRate;
    if (timeInSixteenth < 0.04) {
      const hatNoise = (Math.random() * 2 - 1) * Math.exp(-timeInSixteenth * 90);
      drums[t] += hatNoise * 0.25;
    }
  }

  const bassNotes = [43.65, 43.65, 38.89, 48.99];
  for (let t = 0; t < totalSamples; t++) {
    const barIndex = Math.floor(t / (beatSamples * 4));
    const rootFreq = bassNotes[barIndex % bassNotes.length];
    const timeInBeat = (t % beatSamples) / sampleRate;
    const sidechain = Math.min(1.0, Math.max(0.0, (timeInBeat - 0.05) * 5.0));

    const phase = (t * rootFreq / sampleRate) % 1.0;
    const saw = (2 * phase - 1) * 0.4;
    const sub = Math.sin(2 * Math.PI * rootFreq * (t / sampleRate)) * 0.6;
    bass[t] = (saw + sub) * sidechain * 0.75;
  }

  const vocalPitches = [349.23, 392.00, 440.00, 523.25];
  for (let t = 0; t < totalSamples; t++) {
    const chopIndex = Math.floor(t / (beatSamples / 2));
    const targetFreq = vocalPitches[chopIndex % vocalPitches.length];
    const timeInChop = (t % (beatSamples / 2)) / sampleRate;
    if (timeInChop < 0.22) {
      const env = Math.sin(Math.PI * (timeInChop / 0.22));
      const f1 = Math.sin(2 * Math.PI * targetFreq * (t / sampleRate));
      const f2 = Math.sin(2 * Math.PI * (targetFreq * 2.05) * (t / sampleRate)) * 0.5;
      vocals[t] = (f1 + f2) * env * 0.45;
    }
  }

  const chords = [
    [174.61, 220.00, 261.63],
    [155.56, 196.00, 233.08],
    [130.81, 164.81, 196.00],
    [146.83, 174.61, 220.00]
  ];
  for (let t = 0; t < totalSamples; t++) {
    const barIdx = Math.floor(t / (beatSamples * 4));
    const chord = chords[barIdx % chords.length];
    let chordVal = 0;
    const sec = t / sampleRate;

    for (const f of chord) {
      chordVal += Math.sin(2 * Math.PI * f * sec);
      chordVal += Math.sin(2 * Math.PI * (f * 1.008) * sec) * 0.7;
      chordVal += Math.sin(2 * Math.PI * (f * 0.992) * sec) * 0.7;
    }
    other[t] = (chordVal / 7) * 0.4;
  }
}

function synthesizePop(
  drums: Float32Array,
  bass: Float32Array,
  vocals: Float32Array,
  other: Float32Array,
  totalSamples: number,
  sampleRate: number,
  bpm: number
) {
  const beatSec = 60 / bpm;
  const beatSamples = Math.floor(beatSec * sampleRate);

  for (let t = 0; t < totalSamples; t++) {
    const timeInBar = (t % (beatSamples * 4)) / sampleRate;
    const beatInBar = timeInBar / beatSec;

    const isKick1 = beatInBar >= 0 && beatInBar < 0.25;
    const isKick2 = beatInBar >= 2.5 && beatInBar < 2.75;
    if (isKick1 || isKick2) {
      const dt = (isKick1 ? beatInBar : beatInBar - 2.5) * beatSec;
      const freq = 120 * Math.exp(-dt * 30) + 50;
      drums[t] += Math.sin(2 * Math.PI * freq * dt) * Math.exp(-dt * 15) * 0.9;
    }

    const isSnare1 = beatInBar >= 1.0 && beatInBar < 1.25;
    const isSnare2 = beatInBar >= 3.0 && beatInBar < 3.25;
    if (isSnare1 || isSnare2) {
      const dt = (isSnare1 ? beatInBar - 1.0 : beatInBar - 3.0) * beatSec;
      const tone = Math.sin(2 * Math.PI * 180 * dt) * Math.exp(-dt * 20) * 0.4;
      const noise = (Math.random() * 2 - 1) * Math.exp(-dt * 30) * 0.4;
      drums[t] += tone + noise;
    }
  }

  const funkFreqs = [55.0, 73.42, 82.41, 65.41];
  for (let t = 0; t < totalSamples; t++) {
    const beatIndex = Math.floor(t / beatSamples);
    const timeInBeat = (t % beatSamples) / sampleRate;
    const freq = funkFreqs[beatIndex % funkFreqs.length];

    if (timeInBeat < 0.35) {
      const env = Math.exp(-timeInBeat * 8);
      const tone = Math.sin(2 * Math.PI * freq * (t / sampleRate)) * 0.7;
      const pluck = Math.sin(2 * Math.PI * (freq * 3) * (t / sampleRate)) * 0.3 * Math.exp(-timeInBeat * 30);
      bass[t] = (tone + pluck) * env * 0.75;
    }
  }

  const vocalMelody = [220.0, 261.63, 293.66, 329.63, 392.0];
  for (let t = 0; t < totalSamples; t++) {
    const phraseIdx = Math.floor(t / (beatSamples * 2));
    const timeInPhrase = (t % (beatSamples * 2)) / sampleRate;
    const f0 = vocalMelody[phraseIdx % vocalMelody.length];

    if (timeInPhrase < 0.7) {
      const env = Math.sin(Math.PI * (timeInPhrase / 0.7));
      const vibrato = 1 + 0.015 * Math.sin(2 * Math.PI * 5.5 * timeInPhrase);
      const f = f0 * vibrato;
      const sine = Math.sin(2 * Math.PI * f * (t / sampleRate));
      const harm = Math.sin(2 * Math.PI * (f * 2) * (t / sampleRate)) * 0.25;
      vocals[t] = (sine + harm) * env * 0.4;
    }
  }

  for (let t = 0; t < totalSamples; t++) {
    const timeInBar = (t % (beatSamples * 4)) / sampleRate;
    if (timeInBar < 1.6) {
      const env = Math.exp(-timeInBar * 1.5);
      const c1 = Math.sin(2 * Math.PI * 220 * (t / sampleRate));
      const c2 = Math.sin(2 * Math.PI * 277.18 * (t / sampleRate));
      const c3 = Math.sin(2 * Math.PI * 329.63 * (t / sampleRate));
      other[t] = ((c1 + c2 + c3) / 3) * env * 0.35;
    }
  }
}

function synthesizeRock(
  drums: Float32Array,
  bass: Float32Array,
  vocals: Float32Array,
  other: Float32Array,
  totalSamples: number,
  sampleRate: number,
  bpm: number
) {
  const beatSec = 60 / bpm;
  const beatSamples = Math.floor(beatSec * sampleRate);

  for (let t = 0; t < totalSamples; t++) {
    const timeInBar = (t % (beatSamples * 4)) / sampleRate;
    const beatInBar = timeInBar / beatSec;

    const isKick = (beatInBar < 0.2) || (beatInBar >= 0.75 && beatInBar < 0.95) || (beatInBar >= 2.0 && beatInBar < 2.2);
    if (isKick) {
      const localDt = (t % Math.floor(beatSamples * 0.75)) / sampleRate;
      const freq = 160 * Math.exp(-localDt * 35) + 55;
      drums[t] += Math.sin(2 * Math.PI * freq * localDt) * Math.exp(-localDt * 16) * 1.0;
    }

    const isSnare = (beatInBar >= 1.0 && beatInBar < 1.25) || (beatInBar >= 3.0 && beatInBar < 3.25);
    if (isSnare) {
      const dt = ((beatInBar >= 3.0 ? beatInBar - 3.0 : beatInBar - 1.0)) * beatSec;
      const punch = Math.sin(2 * Math.PI * 210 * dt) * Math.exp(-dt * 25) * 0.6;
      const crack = (Math.random() * 2 - 1) * Math.exp(-dt * 35) * 0.6;
      drums[t] += punch + crack;
    }
  }

  const rockNotes = [41.2, 41.2, 49.0, 46.25];
  for (let t = 0; t < totalSamples; t++) {
    const barIdx = Math.floor(t / (beatSamples * 4));
    const f0 = rockNotes[barIdx % rockNotes.length];
    const raw = Math.sin(2 * Math.PI * f0 * (t / sampleRate)) * 1.8;
    bass[t] = Math.tanh(raw) * 0.65;
  }

  for (let t = 0; t < totalSamples; t++) {
    const timeInBar = (t % (beatSamples * 4)) / sampleRate;
    if (timeInBar < 2.5) {
      const env = Math.sin(Math.PI * (timeInBar / 2.5));
      const f = 293.66;
      const tone = Math.sin(2 * Math.PI * f * (t / sampleRate));
      const grit = (Math.random() * 0.15 - 0.075);
      vocals[t] = (tone + grit) * env * 0.45;
    }
  }

  for (let t = 0; t < totalSamples; t++) {
    const eighthSamples = beatSamples / 2;
    const timeInEighth = (t % eighthSamples) / sampleRate;
    const env = Math.exp(-timeInEighth * 12);
    const f1 = 82.41;
    const f2 = 123.47;
    const f3 = 164.81;
    const chord = (Math.sin(2 * Math.PI * f1 * (t / sampleRate)) +
                   Math.sin(2 * Math.PI * f2 * (t / sampleRate)) +
                   Math.sin(2 * Math.PI * f3 * (t / sampleRate))) * 1.2;
    other[t] = Math.tanh(chord * 2.2) * env * 0.45;
  }
}
