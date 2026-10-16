import { describe, expect, it } from 'vitest';
import { CHORDS } from './chords';
import { chordSamples } from './sounds';

describe('synthesized chord previews', () => {
  for (const chord of CHORDS) {
    it(`creates a bounded plucked ${chord.name} with a quiet tail`, () => {
      const sampleRate = 44100;
      const samples = chordSamples(chord, sampleRate);
      expect(samples.length).toBe(Math.ceil(1.2 * sampleRate));
      let peak = 0;
      let finite = true;
      for (const value of samples) {
        finite &&= Number.isFinite(value);
        peak = Math.max(peak, Math.abs(value));
      }
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(.05);
      expect(peak).toBeLessThan(1);
      expect(samples.slice(Math.ceil(.95 * sampleRate)).every(x => x === 0)).toBe(true);
    });
  }

  it('produces different audio for different chords', () => {
    expect(chordSamples(CHORDS[0], 48000)).not.toEqual(chordSamples(CHORDS[1], 48000));
  });
});
