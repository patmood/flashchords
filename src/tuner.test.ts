import { describe, expect, it } from 'vitest';
import { TUNING, centsFrom, detectPitch, detectString, frequencyForMidi } from './tuner';

describe('single-string tuner', () => {
  for (const rate of [44100, 48000]) {
    for (const target of TUNING) {
      for (const cents of [-40, 0, 35]) {
        it(`measures ${target.note} at ${cents} cents, ${rate} Hz sample rate`, () => {
          const frequency = frequencyForMidi(target.midi) * 2 ** (cents / 1200);
          const waveform = Float32Array.from({ length: 8192 }, (_, i) => {
            const t = i / rate;
            return .15 * Math.exp(-t * 3) * (Math.sin(2 * Math.PI * frequency * t) + .5 * Math.sin(4 * Math.PI * frequency * t));
          });
          const detected = detectPitch(waveform, rate);
          expect(detected).not.toBeNull();
          expect(centsFrom(detected!, target.midi)).toBeCloseTo(cents, 0);
        });
      }
    }
  }
  it('ignores silence and unpitched noise', () => {
    expect(detectPitch(new Float32Array(8192), 48000)).toBeNull();
    let seed = 42;
    const noise = Float32Array.from({ length: 8192 }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32 - .5;
    });
    expect(detectPitch(noise, 48000)).toBeNull();
  });
});

describe('automatic string matching', () => {
  for (const target of TUNING) {
    for (const cents of [-40, 0, 35]) {
      it(`finds ${target.note} at ${cents} cents without a selection`, () => {
        const match = detectString(frequencyForMidi(target.midi) * 2 ** (cents / 1200));
        expect(match?.target.note).toBe(target.note);
        expect(match?.cents).toBeCloseTo(cents, 5);
      });
    }
  }
  it('ignores invalid and unrelated pitches', () => {
    for (const frequency of [0, -1, NaN, Infinity, 100, 600]) expect(detectString(frequency)).toBeNull();
  });
});
