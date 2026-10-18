import { describe, expect, it } from 'vitest';
import { TUNING, TunerTracker, centsFrom, detectPitch, detectString, frequencyForMidi, measurePitch } from './tuner';

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
  it('measures the latest audio and reports its signal quality', () => {
    const waveform = Float32Array.from({ length: 8192 }, (_, i) =>
      .1 * Math.sin(2 * Math.PI * (i < 4096 ? 380 : 405) * i / 48000));
    const pitch = measurePitch(waveform, 48000);
    expect(pitch.frequency).toBeCloseTo(405, 1);
    expect(pitch.clarity).toBeGreaterThan(.99);
    expect(pitch.level).toBeCloseTo(.1 / Math.sqrt(2), 2);
  });
  it('ignores incomplete audio buffers', () => {
    expect(detectPitch(new Float32Array(100), 48000)).toBeNull();
    expect(detectPitch(new Float32Array(), 48000)).toBeNull();
  });
});

describe('held tuning readings', () => {
  const hz = (cents: number, midi = 67) => frequencyForMidi(midi) * 2 ** (cents / 1200);
  const feed = (tracker: TunerTracker, cents: number, level = .1, clarity = .999, midi = 67) =>
    tracker.update({ frequency: hz(cents, midi), clarity, level });
  const settle = (tracker: TunerTracker, cents: number, level = .1, midi = 67) => {
    for (let i = 0; i < 3; i++) feed(tracker, cents, level, .999, midi);
    return tracker.frequency;
  };

  it('waits for a stable pitch and rejects an isolated attack or pitch spike', () => {
    const tracker = new TunerTracker();
    expect(feed(tracker, 70, .6)).toBeNull();
    expect(feed(tracker, -35)).toBeNull();
    expect(feed(tracker, -35)).toBe(hz(-35));
    expect(feed(tracker, 80)).toBe(hz(-35));
    expect(feed(tracker, -35)).toBe(hz(-35));
    expect(feed(tracker, -35)).toBe(hz(-35));
  });

  for (const cents of [-35, 35]) {
    it(`holds ${cents} cents through a weak, drifting tail and indefinite silence`, () => {
      const tracker = new TunerTracker();
      const held = settle(tracker, cents);
      for (const level of [.018, .015, .01]) {
        expect(feed(tracker, 0, level)).toBe(held);
      }
      for (let i = 0; i < 100; i++) {
        expect(tracker.update({ frequency: null, clarity: 0, level: 0 })).toBe(held);
      }
    });
  }

  it('holds through uncertain pitch estimates, noise and unrelated sounds', () => {
    const tracker = new TunerTracker();
    const held = settle(tracker, 35);
    for (let i = 0; i < 5; i++) {
      expect(feed(tracker, 0, .08, .94)).toBe(held);
      expect(tracker.update({ frequency: null, clarity: 0, level: .08 })).toBe(held);
      expect(tracker.update({ frequency: 600, clarity: .999, level: .08 })).toBe(held);
    }
    expect(settle(tracker, -20, .08)).toBe(hz(-20));
  });

  it('follows peg adjustments throughout a ringing note, including away from in tune', () => {
    const tracker = new TunerTracker();
    settle(tracker, -40);
    for (let cents = -35; cents <= 40; cents += 5) {
      const reading = feed(tracker, cents, .1 - (cents + 40) * .0007);
      expect(centsFrom(reading!, 67)).toBeCloseTo(cents - 5, 5);
    }
    expect(settle(tracker, 40, .04)).toBe(hz(40));
  });

  it('replaces a held reading with a quieter pluck of the same or another string', () => {
    const tracker = new TunerTracker();
    settle(tracker, -35, .3);
    for (let i = 0; i < 5; i++) feed(tracker, 0, .012);
    // Still audible: the renewed attack must reset the previous pluck's level gate.
    expect(settle(tracker, 25, .03)).toBe(hz(25));
    for (let i = 0; i < 2; i++) tracker.update({ frequency: null, clarity: 0, level: 0 });
    expect(settle(tracker, -25, .015, 60)).toBe(hz(-25, 60));
  });

  it('does not blend different strings or carry a reading into a fresh session', () => {
    const tracker = new TunerTracker();
    const held = settle(tracker, 30);
    expect(feed(tracker, -20, .1, .999, 60)).toBe(held);
    expect(feed(tracker, -20, .1, .999, 60)).toBe(hz(-20, 60));
    tracker.reset();
    expect(tracker.frequency).toBeNull();
    expect(tracker.update({ frequency: null, clarity: 0, level: 0 })).toBeNull();
    expect(settle(tracker, 10, .015)).toBe(hz(10));
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
