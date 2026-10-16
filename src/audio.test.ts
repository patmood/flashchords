import { describe, expect, it } from 'vitest';
import { CHORDS, chordMidi } from './chords';
import { classifyChroma, spectrumChroma } from './audio';

function syntheticSpectrum(notes: number[], cents = 0): Float32Array {
  const spectrum = new Float32Array(4096).fill(-100);
  const amplitudes = new Float64Array(4096);
  for (const note of notes) {
    const hz = 440 * 2 ** ((note - 69 + cents / 100) / 12);
    for (let h = 1; h <= 5; h++) {
      const bin = hz * h / (48000 / 8192);
      for (let i = Math.max(0, Math.floor(bin) - 3); i < Math.min(4096, bin + 4); i++) {
        amplitudes[i] += .1 / h ** 1.5 * Math.exp(-((i - bin) ** 2) / .7);
      }
    }
  }
  for (let i = 0; i < spectrum.length; i++) spectrum[i] = 20 * Math.log10(amplitudes[i] + .00001);
  return spectrum;
}

describe('chord recognition', () => {
  for (const chord of CHORDS) {
    it(`recognizes ideal ${chord.name} pitch classes`, () => {
      const chroma = Array(12).fill(0);
      chordMidi(chord).forEach(note => { chroma[note % 12] = 1; });
      expect(classifyChroma(chroma).chordId).toBe(chord.id);
    });
    it(`recognizes harmonic ${chord.name} spectra`, () => {
      const chroma = spectrumChroma(syntheticSpectrum(chordMidi(chord)), 48000, 8192);
      expect(classifyChroma(chroma).chordId).toBe(chord.id);
    });
  }
  it('allows a little tuning deviation', () => {
    const chroma = spectrumChroma(syntheticSpectrum(chordMidi(CHORDS[0]), 15), 48000, 8192);
    expect(classifyChroma(chroma).chordId).toBe('c');
  });
  it('rejects silence, noise, and a single note', () => {
    expect(classifyChroma(Array(12).fill(0)).chordId).toBeNull();
    expect(classifyChroma(Array(12).fill(1)).chordId).toBeNull();
    const single = Array(12).fill(0); single[0] = 1;
    expect(classifyChroma(single).chordId).toBeNull();
  });
});
