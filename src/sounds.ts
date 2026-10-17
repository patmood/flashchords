import { chordMidi } from './chords';
import type { Chord } from './chords';

export const SOUND_KEY = 'flashchords.chord-sounds.v1';
const STRUM_SECONDS = .95;
// Keep recognition gated briefly after the audible tail, including room decay.
const QUIET_SECONDS = .25;

export function chordSamples(chord: Chord, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.ceil((STRUM_SECONDS + QUIET_SECONDS) * sampleRate));
  chordMidi(chord).forEach((midi, string) => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const start = Math.round(string * .028 * sampleRate);
    for (let i = start; i < STRUM_SECONDS * sampleRate; i++) {
      const t = (i - start) / sampleRate;
      const attack = Math.min(1, t / .004);
      const tail = Math.min(1, (STRUM_SECONDS - i / sampleRate) / .1);
      let pluck = 0;
      for (let harmonic = 1; harmonic <= 7 && frequency * harmonic < sampleRate / 2; harmonic++) {
        pluck += Math.sin(2 * Math.PI * frequency * harmonic * t)
          * Math.exp(-t * (3.5 + harmonic * .55)) / harmonic ** 1.6;
      }
      samples[i] += pluck * attack * tail * .14;
    }
  });
  return samples;
}

export class ChordSound {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private settle: ((played: boolean) => void) | null = null;

  async unlock(): Promise<boolean> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.context.addEventListener('statechange', () => {
          if (this.context?.state !== 'running') this.stop();
        });
      }
      if (this.context.state === 'running') return true;
      if (!navigator.userActivation?.isActive) return false;
      await this.context.resume();
      return this.isRunning();
    } catch { return false; }
  }

  private isRunning(): boolean { return this.context?.state === 'running'; }

  async play(chord: Chord): Promise<boolean> {
    return this.playSamples(rate => chordSamples(chord, rate));
  }

  async playNote(frequency: number): Promise<boolean> {
    return this.playSamples(rate => {
      const samples = new Float32Array(Math.ceil(1.2 * rate));
      for (let i = 0; i < rate; i++) {
        const t = i / rate;
        samples[i] = Math.sin(2 * Math.PI * frequency * t) * .25 * Math.min(1, t / .01) * Math.min(1, (1 - t) / .1);
      }
      return samples;
    });
  }

  private async playSamples(makeSamples: (rate: number) => Float32Array): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    if (!await this.unlock() || generation !== this.generation || !this.context) return false;
    try {
      const context = this.context;
      const samples = makeSamples(context.sampleRate);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      this.source = source;
      return await new Promise<boolean>(resolve => {
        this.settle = resolve;
        source.onended = () => {
          source.disconnect();
          if (this.source !== source) return;
          this.source = null;
          this.settle = null;
          resolve(true);
        };
        source.start();
      });
    } catch {
      this.stop();
      return false;
    }
  }

  stop() {
    this.generation++;
    const source = this.source;
    this.source = null;
    if (source) {
      try { source.stop(); } catch { /* It may already have ended. */ }
      source.disconnect();
    }
    this.settle?.(false);
    this.settle = null;
  }

  close() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
