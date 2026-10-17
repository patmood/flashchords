import { detectPitch } from './tuner';
import { CHORDS, chordMidi } from './chords';

export interface Detection { chordId: string | null; confidence: number; level: number; listening: boolean; frequency?: number | null }

/** Pitch-class evidence from local spectral peaks. Upper harmonics are discounted. */
export function spectrumChroma(db: Float32Array, sampleRate: number, fftSize: number): number[] {
  const chroma = Array<number>(12).fill(0);
  const binHz = sampleRate / fftSize;
  const peaks: { hz: number; power: number }[] = [];
  for (let i = Math.ceil(240 / binHz); i < Math.min(db.length - 1, 1600 / binHz); i++) {
    if (db[i] < -68 || db[i] <= db[i - 1] || db[i] < db[i + 1]) continue;
    const denom = db[i - 1] - 2 * db[i] + db[i + 1];
    const delta = denom ? Math.max(-.5, Math.min(.5, .5 * (db[i - 1] - db[i + 1]) / denom)) : 0;
    peaks.push({ hz: (i + delta) * binHz, power: 10 ** (db[i] / 20) });
  }
  for (const peak of peaks) {
    const midi = 69 + 12 * Math.log2(peak.hz / 440);
    if (Math.abs(midi - Math.round(midi)) > .38) continue;
    // A harmonic should not masquerade as another played string.
    const parent = peaks.find(p => p.hz < peak.hz * .7 && [2, 3, 4, 5].some(h => Math.abs(12 * Math.log2(peak.hz / (p.hz * h))) < .45));
    const weight = parent ? .12 : 1;
    chroma[(Math.round(midi) % 12 + 12) % 12] += peak.power * weight;
  }
  const max = Math.max(...chroma, 1e-9);
  return chroma.map(value => Math.sqrt(value / max));
}

export function classifyChroma(chroma: number[]): { chordId: string | null; confidence: number } {
  const total = chroma.reduce((sum, x) => sum + x * x, 0);
  if (total < .01) return { chordId: null, confidence: 0 };
  const ranked = CHORDS.map(chord => {
    const pcs = [...new Set(chordMidi(chord).map(n => n % 12))];
    const inside = pcs.reduce((sum, pc) => sum + chroma[pc], 0);
    const cosine = inside / Math.sqrt(pcs.length * total);
    const coverage = pcs.filter(pc => chroma[pc] > .24).length / pcs.length;
    return { chordId: chord.id, score: cosine * coverage };
  }).sort((a, b) => b.score - a.score);
  const first = ranked[0];
  return { chordId: first.score >= .8 && first.score - ranked[1].score >= .035 ? first.chordId : null, confidence: first.score };
}

export class ChordMicrophone {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private released = false;
  private quietFrames = 0;
  private lastMatch = '';
  private matchFrames = 0;

  arm() {
    this.released = false;
    this.quietFrames = 0;
    this.lastMatch = '';
    this.matchFrames = 0;
  }

  async start(onFrame: (d: Detection) => void, onError: (message: string) => void, tuning = false): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS and a supported browser. You can still practice manually.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    try {
      this.context = new AudioContext();
      await this.context.resume();
      if (generation !== this.generation) return;
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = .15;
      this.context.createMediaStreamSource(stream).connect(analyser);
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const waveform = new Float32Array(analyser.fftSize);
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation !== this.generation) return;
        this.stop();
        onError('Microphone disconnected. Reconnect it or use manual mode.');
      }));
      this.arm();
      this.interval = setInterval(() => {
        if (!this.context || this.context.state !== 'running') {
          onFrame({ chordId: null, confidence: 0, level: 0, listening: false });
          return;
        }
        analyser.getFloatTimeDomainData(waveform);
        const level = Math.sqrt(waveform.reduce((s, n) => s + n * n, 0) / waveform.length);
        if (tuning) {
          onFrame({ chordId: null, confidence: 0, level, listening: true, frequency: detectPitch(waveform, this.context.sampleRate) });
          return;
        }
        if (level < .008) {
          this.quietFrames++;
          if (this.quietFrames >= 2) this.released = true;
          this.matchFrames = 0;
          onFrame({ chordId: null, confidence: 0, level, listening: this.released });
          return;
        }
        this.quietFrames = 0;
        analyser.getFloatFrequencyData(spectrum);
        const result = classifyChroma(spectrumChroma(spectrum, this.context.sampleRate, analyser.fftSize));
        if (result.chordId && result.chordId === this.lastMatch) this.matchFrames++;
        else { this.lastMatch = result.chordId || ''; this.matchFrames = 1; }
        onFrame({ ...result, chordId: this.released && this.matchFrames >= 4 ? result.chordId : null, level, listening: this.released });
      }, 90);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop() {
    this.generation++;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
