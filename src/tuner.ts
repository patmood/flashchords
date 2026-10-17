export const TUNING = [
  { note: 'G4', midi: 67, string: 4 },
  { note: 'C4', midi: 60, string: 3 },
  { note: 'E4', midi: 64, string: 2 },
  { note: 'A4', midi: 69, string: 1 },
];
export const frequencyForMidi = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const centsFrom = (frequency: number, midi: number) => 1200 * Math.log2(frequency / frequencyForMidi(midi));

/** Normalized autocorrelation for one open high-G ukulele string. */
export function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  const size = Math.min(2048, Math.floor(samples.length / 2));
  let energy = 0;
  for (let i = 0; i < size; i++) energy += samples[i] ** 2;
  if (energy / size < .000064) return null;
  const correlations: number[] = [];
  const first = Math.floor(sampleRate / 600);
  const last = Math.ceil(sampleRate / 200);
  for (let lag = first; lag <= last + 1; lag++) {
    let product = 0, shiftedEnergy = 0;
    for (let i = 0; i < size; i++) {
      product += samples[i] * samples[i + lag];
      shiftedEnergy += samples[i + lag] ** 2;
    }
    correlations[lag] = product / Math.sqrt(energy * shiftedEnergy);
    if (lag > first + 1 && correlations[lag - 1] > .9 && correlations[lag - 1] > correlations[lag - 2] && correlations[lag - 1] >= correlations[lag]) {
      const left = correlations[lag - 2], peak = correlations[lag - 1], right = correlations[lag];
      const offset = .5 * (left - right) / (left - 2 * peak + right);
      return sampleRate / (lag - 1 + offset);
    }
  }
  return null;
}
