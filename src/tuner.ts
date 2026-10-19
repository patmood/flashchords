export const TUNING = [
  { note: 'G4', midi: 67, string: 4 },
  { note: 'C4', midi: 60, string: 3 },
  { note: 'E4', midi: 64, string: 2 },
  { note: 'A4', midi: 69, string: 1 },
];
export const frequencyForMidi = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const centsFrom = (frequency: number, midi: number) => 1200 * Math.log2(frequency / frequencyForMidi(midi));

export function detectString(frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const matches = TUNING.map(target => ({ target, cents: centsFrom(frequency, target.midi) }));
  const nearest = matches.sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents))[0];
  return Math.abs(nearest.cents) <= 150 ? nearest : null;
}

export interface PitchEstimate { frequency: number | null; clarity: number; level: number }

const TRACKING_LEVEL = .003;
const ACQUISITION_LEVEL = .008;

/** Normalized autocorrelation for one open high-G ukulele string. */
export function measurePitch(samples: Float32Array, sampleRate: number): PitchEstimate {
  const first = Math.floor(sampleRate / 600);
  const last = Math.ceil(sampleRate / 200);
  const size = Math.min(2048, samples.length - last - 1);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || size <= 0) return { frequency: null, clarity: 0, level: 0 };
  // Use the newest complete window so peg adjustments aren't delayed by old audio.
  const start = samples.length - size - last - 1;
  let energy = 0;
  for (let i = 0; i < size; i++) energy += samples[start + i] ** 2;
  const level = Math.sqrt(energy / size);
  if (level < TRACKING_LEVEL) return { frequency: null, clarity: 0, level };
  const correlations: number[] = [];
  for (let lag = first; lag <= last + 1; lag++) {
    let product = 0, shiftedEnergy = 0;
    for (let i = 0; i < size; i++) {
      product += samples[start + i] * samples[start + i + lag];
      shiftedEnergy += samples[start + i + lag] ** 2;
    }
    correlations[lag] = shiftedEnergy > 0 ? product / Math.sqrt(energy * shiftedEnergy) : 0;
    if (lag > first + 1 && correlations[lag - 1] > .9 && correlations[lag - 1] > correlations[lag - 2] && correlations[lag - 1] >= correlations[lag]) {
      const left = correlations[lag - 2], peak = correlations[lag - 1], right = correlations[lag];
      const offset = .5 * (left - right) / (left - 2 * peak + right);
      return { frequency: sampleRate / (lag - 1 + offset), clarity: peak, level };
    }
  }
  return { frequency: null, clarity: 0, level };
}

export function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  return measurePitch(samples, sampleRate).frequency;
}

/** Holds the latest reliable pitch, while following sustained tuning changes. */
export class TunerTracker {
  frequency: number | null = null;
  private recent: number[] = [];
  private peakLevel = 0;
  private previousLevel = 0;
  private quietFrames = 0;

  reset() {
    this.frequency = null;
    this.recent = [];
    this.peakLevel = 0;
    this.previousLevel = 0;
    this.quietFrames = 0;
  }

  update({ frequency, clarity, level }: PitchEstimate): number | null {
    if (level < TRACKING_LEVEL) {
      this.quietFrames++;
      if (this.quietFrames >= 2) this.peakLevel = 0;
    } else {
      // A fresh pluck can be quieter than the previous one, even without silence.
      if (level > this.previousLevel * 2) {
        this.peakLevel = 0;
        this.recent = [];
      }
      this.quietFrames = 0;
    }
    this.previousLevel = level;

    const match = frequency === null ? null : detectString(frequency);
    const previous = this.recent.at(-1);
    // Once acquired, follow a clear, continuous pitch even as the string fades.
    // A weak jump to another pitch must still pass the stronger acquisition gate.
    const continuous = this.frequency !== null && match && previous !== undefined
      && detectString(previous)?.target.midi === match.target.midi
      && Math.abs(1200 * Math.log2(frequency! / previous)) <= 15;
    const minimumLevel = continuous ? TRACKING_LEVEL : Math.max(ACQUISITION_LEVEL, this.peakLevel * .2);
    if (!match || !Number.isFinite(level) || !(clarity >= .97) || level < minimumLevel) {
      this.recent = [];
      return this.frequency;
    }
    this.recent.push(frequency!);
    if (this.recent.length > 3) this.recent.shift();
    if (this.recent.length < 3) return this.frequency;

    // A median rejects isolated attack/noise spikes without averaging between strings.
    const [low, middle, high] = [...this.recent].sort((a, b) => a - b);
    const agreement = Math.min(1200 * Math.log2(middle / low), 1200 * Math.log2(high / middle));
    if (agreement <= 15) {
      this.frequency = middle;
      // Only stable readings establish the level gate; a loud attack must not lock it out.
      this.peakLevel = Math.max(this.peakLevel, level);
    }
    return this.frequency;
  }
}
