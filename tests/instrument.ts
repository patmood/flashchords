import type { Page } from '@playwright/test';
import { CHORDS, chordMidi } from '../src/chords';

export async function installInstrument(page: Page, feedback = false) {
  await page.addInitScript(feedback => {
    let micContext: AudioContext | null = null;
    let micDestination: MediaStreamAudioDestinationNode | null = null;
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      micContext = context;
      micDestination = destination;
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(destination);
      const oscillators = Array.from({ length: 4 }, () => {
        const oscillator = context.createOscillator();
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });
      Object.assign(window, {
        instrumentPlay: (notes: number[]) => {
          oscillators.forEach((oscillator, i) => { oscillator.frequency.value = notes[i]; });
          gain.gain.value = .08;
        },
        instrumentQuiet: () => { gain.gain.value = 0; },
      });
      return destination.stream;
    };
    if (feedback) {
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
        if (micContext && micDestination && this.context !== micContext && this.buffer) {
          const echo = micContext.createBufferSource();
          echo.buffer = this.buffer;
          echo.connect(micDestination);
          original.call(echo, 0, offset, duration);
        }
        original.call(this, when, offset, duration);
      };
    }
  }, feedback);
}

export async function strum(page: Page, chordId: string) {
  const notes = chordMidi(CHORDS.find(c => c.id === chordId)!).map(note => 440 * 2 ** ((note - 69) / 12));
  await page.evaluate(() => (window as unknown as { instrumentQuiet: () => void }).instrumentQuiet());
  await page.waitForTimeout(600);
  await page.evaluate(notes => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay(notes), notes);
}
