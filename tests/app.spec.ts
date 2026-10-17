import { expect, test } from '@playwright/test';
import { CHORDS } from '../src/chords';
import { installInstrument, strum } from './instrument';

test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith('introductions')) {
    await page.addInitScript(ids => {
      if (!localStorage.getItem('flashchords.progress.v1')) {
        localStorage.setItem('flashchords.progress.v1', JSON.stringify({ version: 1, cards: {}, history: [], daily: null, introduced: ids }));
      }
    }, CHORDS.map(c => c.id));
  }
  // Timing tests use a virtual clock; real Web Audio playback is tested separately.
  if (!info.title.startsWith('chord previews') && !info.title.startsWith('introductions ignore reference playback')) {
    await page.addInitScript(() => localStorage.setItem('flashchords.chord-sounds.v1', 'false'));
  }
});

test('introductions continue with the displayed chord and defer for three familiar reviews', async ({ page }) => {
  test.setTimeout(60_000);
  await installInstrument(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enable hands-free', exact: true }).click();
  await expect(page.locator('#welcome-dialog .dialog-listening')).toHaveText('Microphone ready for chord recognition.');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  await expect(page.locator('.intro-fingering').getByRole('img', { name: /C major/ })).toBeVisible();
  await strum(page, 'c');
  await expect(page.locator('#introduction-dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeVisible();
  await strum(page, 'c');
  await expect(page.getByText('Lovely strum!')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Meet A minor.' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m not ready', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('heading', { name: 'C', exact: true })).toBeVisible();
    await expect(page.locator('#introduction-dialog')).toHaveCount(0);
    await strum(page, 'c');
    await expect(page.getByText('Lovely strum!')).toBeVisible();
    if (i < 2) {
      await expect(page.getByRole('button', { name: 'I got it' })).toBeVisible();
    }
  }
  await expect(page.getByRole('dialog', { name: 'Meet A minor.' })).toBeVisible();
  await strum(page, 'c');
  await page.waitForTimeout(700);
  await expect(page.getByRole('dialog', { name: 'Meet A minor.' })).toBeVisible();
  await strum(page, 'am');
  await expect(page.locator('#introduction-dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your growing chord garden.' })).toBeVisible();
  await expect(page.locator('[data-shortcut-chord], .shortcut-badge')).toHaveCount(0);
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your little setup.' })).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!));
  expect(data.history).toHaveLength(4);
  expect(data.daily.completed).toEqual(['c']);
  expect(data.introduced).toContain('am');
  expect(data.deferred.am).toBeUndefined();
});

test('introductions can be deferred before any chords are learned, without false progress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m not ready', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Take a breather.' })).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!));
  expect(data.history).toHaveLength(0);
  expect(data.cards).toEqual({});
  await page.getByRole('button', { name: 'Try the new chord again' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m ready', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Practice without a microphone' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.locator('#introduction-dialog')).toHaveCount(0);
});

test('introductions ignore reference playback and accept a fresh matching strum', async ({ page }) => {
  await installInstrument(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enable hands-free', exact: true }).click();
  await expect(page.locator('#welcome-dialog .dialog-listening')).toHaveText('Microphone ready for chord recognition.');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  await expect(page.locator('#introduction-dialog .dialog-listening')).toContainText('Playing the reference');
  await expect(page.locator('#introduction-dialog .dialog-listening')).toHaveText('Play C major to continue.');
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
  await strum(page, 'c');
  await expect(page.locator('#introduction-dialog')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
});

test('introductions keep both decisions visible on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  for (const name of ['I’m ready', 'I’m not ready']) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('chord previews play on new cards, support replay and mute, and show success fingerings', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { previewStarts: 0 });
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      (window as unknown as { previewStarts: number }).previewStarts++;
      original.call(this, when, offset, duration);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeDisabled();
  await expect(page.getByText('Listen first. Your practice timer is paused.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeEnabled();
  await expect(page.locator('#fingering')).toBeHidden();
  await page.getByRole('button', { name: 'I got it' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history[0].seconds)).toBeLessThan(1);
  await expect(page.locator('#success-fingering').getByRole('img', { name: /C major/ })).toBeVisible();
  expect(await page.locator('#success-fingering svg').evaluate(el => getComputedStyle(el).width)).toBe('112px');
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play A minor' })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { previewStarts: number }).previewStarts)).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Play A minor' }).click();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await page.getByRole('button', { name: 'Turn automatic chord sound off' }).click();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeEnabled();
  const count = await page.evaluate(() => (window as unknown as { previewStarts: number }).previewStarts);
  await page.getByRole('button', { name: 'I got it' }).click();
  await expect(page.getByRole('heading', { name: 'F', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { previewStarts: number }).previewStarts)).toBe(count);
  await page.reload();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('button', { name: 'Turn automatic chord sound on' })).toBeVisible();
});

test('chord previews never count their own playback as a microphone answer', async ({ page }) => {
  await page.addInitScript(() => {
    let micContext: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    navigator.mediaDevices.getUserMedia = async () => {
      micContext = new AudioContext();
      await micContext.resume();
      destination = micContext.createMediaStreamDestination();
      return destination.stream;
    };
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      // Deliberately feed the reference audio back into the "microphone".
      if (micContext && destination && this.context !== micContext && this.buffer) {
        const echo = micContext.createBufferSource();
        echo.buffer = this.buffer;
        echo.connect(destination);
        original.call(echo, 0, offset, duration);
      }
      original.call(this, when, offset, duration);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeDisabled();
  await expect(page.getByText('Listening for your strum…')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'C', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
  await page.getByRole('button', { name: 'Play C major' }).click();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await expect(page.getByText('Listening for your strum…')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
  await page.getByRole('button', { name: 'I got it' }).click();
  await expect(page.locator('#success-fingering')).toBeVisible();
});

test('chord previews stop cleanly when backgrounded or leaving practice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play C major' })).toBeEnabled();
  await expect(page.getByText('Playing chord reference…')).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: false }));
  await page.getByRole('button', { name: 'Play C major' }).click();
  await expect(page.getByText('Playing chord reference…')).toBeVisible();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.waitForTimeout(1_400);
  await expect(page.getByRole('heading', { name: 'Your growing chord garden.' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
});

test('opens on the chord and waits to start, with no landing or setup page', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    Object.assign(window, { microphoneRequests: 0 });
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { microphoneRequests: number }).microphoneRequests++;
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to Flashchords.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Let’s play' })).toBeFocused();
  await page.clock.fastForward(30_000);
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('heading', { name: 'C', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable microphone & begin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Your next chord|Ready when you are/ })).toHaveCount(0);
  await page.clock.fastForward(30_000);
  await expect(page.locator('#fingering')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { microphoneRequests: number }).microphoneRequests)).toBe(0);
});

test('welcome returns unless Don’t show again is checked on dismissal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Don’t show again' }).check();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  expect(await page.evaluate(() => localStorage.getItem('flashchords.hide-welcome.v1'))).toBe('true');
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'C', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable microphone & begin' })).toBeVisible();
});

test('Escape dismisses the welcome and respects its checkbox', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Don’t show again' }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('renaming preserves old progress and welcome preferences', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await page.getByRole('button', { name: 'I got it' }).click();
  await page.evaluate(() => {
    const progress = localStorage.getItem('flashchords.progress.v1')!;
    localStorage.setItem('little-strum.progress.v1', progress);
    localStorage.setItem('little-strum.hide-welcome.v1', 'true');
    localStorage.removeItem('flashchords.progress.v1');
    localStorage.removeItem('flashchords.hide-welcome.v1');
  });
  await page.reload();
  await expect(page).toHaveTitle('Flashchords · Ukulele practice');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(1);
});

test('mobile daily practice, hint timing, persistence, and completion', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to Flashchords.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByRole('heading', { name: 'C', exact: true })).toBeVisible();
  await expect(page.locator('#fingering')).toBeHidden();
  await page.clock.fastForward(14_000);
  await expect(page.locator('#fingering')).toBeHidden();
  await page.clock.fastForward(1_100);
  await expect(page.locator('#fingering')).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await expect(page.getByText('Self-assessed. Nice practice!')).toBeVisible();
  await expect(page.locator('#success-fingering').getByRole('img', { name: /C major/ })).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await page.clock.fastForward(1_500);
  await expect(page.getByRole('heading', { name: 'F', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show fingering' }).click();
  await expect(page.getByRole('img', { name: /F major: G C E A/ })).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await expect(page.locator('#success-fingering').getByRole('img', { name: /F major/ })).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(page.getByRole('heading', { name: 'Look at you grow.' })).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!));
  expect(data.history).toHaveLength(3);
  expect(data.history[0].rating).toBe(1);
  expect(data.history.every((a: { manual: boolean }) => a.manual)).toBe(true);
  await page.getByRole('button', { name: 'See your progress' }).click();
  await expect(page.getByRole('heading', { name: 'Your growing chord garden.' })).toBeVisible();
});

test('microphone denial has an actionable manual fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was not allowed');
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByText('Manual mode · self-assessed')).toBeVisible();
});

test('daily session ends, but extra practice introduces new chords gradually and can stop anytime', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Don’t show again' }).check();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'I got it' }).click();
    await page.clock.fastForward(1_500);
  }
  await expect(page.getByRole('heading', { name: 'Look at you grow.' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep practising' }).click();
  await expect(page.getByText('Extra practice · no finish line')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('heading', { name: 'G', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'I got it' }).click();
    await page.clock.fastForward(1_500);
  }
  await expect(page.getByRole('heading', { name: 'G', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await page.getByRole('button', { name: 'Finish extra practice' }).click();
  await page.clock.fastForward(2_000);
  await expect(page.getByRole('heading', { name: 'Look at you grow.' })).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!));
  expect(data.daily.ids).toEqual(['c', 'am', 'f']);
  expect(data.daily.completed).toEqual(['c', 'am', 'f']);
  expect(data.history).toHaveLength(7);
  expect(data.history.filter((a: { extra?: boolean }) => a.extra)).toHaveLength(4);
  expect(Object.keys(data.cards)).toHaveLength(4);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Look at you grow.' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep practising' }).click();
  await expect(page.getByText('Extra practice · no finish line')).toBeVisible();
  // A reload needs an explicit microphone choice; manual remains available.
  const nextChord = await page.locator('main h1').innerText();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByRole('heading', { name: nextChord, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish extra practice' })).toBeVisible();
});

test('background time does not count toward the hint', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await page.clock.fastForward(10_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60_000);
  await expect(page.getByText('Practice paused')).toBeVisible();
  await expect(page.locator('#fingering')).toBeHidden();
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: false }));
  await page.getByRole('button', { name: 'Resume practice' }).click();
  await page.clock.fastForward(4_000);
  await expect(page.locator('#fingering')).toBeHidden();
  await page.clock.fastForward(1_100);
  await expect(page.locator('#fingering')).toBeVisible();
});

test('welcome and practice fit narrow phones and desktop', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Show fingering' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('corrupt storage is not overwritten', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('flashchords.progress.v1', '{broken'));
  await page.reload();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('alert')).toContainText('It has not been overwritten');
  await page.getByRole('button', { name: 'I’m ready', exact: true }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await page.getByRole('button', { name: 'I got it' }).click();
  expect(await page.evaluate(() => localStorage.getItem('flashchords.progress.v1'))).toBe('{broken');
});

test('microphone recognizes a synthetic strum and rejects a wrong chord', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(destination);
      const oscillators = [261.626, 329.628, 391.995, 523.251].map(hz => {
        const oscillator = context.createOscillator();
        oscillator.frequency.value = hz;
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });
      Object.assign(window, {
        strum: (notes: number[]) => {
          oscillators.forEach((oscillator, i) => { oscillator.frequency.value = notes[i]; });
          gain.gain.value = .08;
        },
        quiet: () => { gain.gain.value = 0; },
      });
      return destination.stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByText('Listening for your strum…')).toBeVisible();
  await page.evaluate(() => (window as unknown as { strum: (n: number[]) => void }).strum([261.626, 329.628, 391.995, 523.251]));
  await expect(page.getByText('Lovely strum!')).toBeVisible();
  await page.evaluate(() => (window as unknown as { quiet: () => void }).quiet());
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await expect(page.getByText('Listening for your strum…')).toBeVisible();
  // A wrong chord must not trigger any action.
  await page.evaluate(() => (window as unknown as { strum: (n: number[]) => void }).strum([493.883, 329.628, 415.305, 493.883]));
  await page.waitForTimeout(800);
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await expect(page.getByText('Lovely strum!')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { strum: (n: number[]) => void }).strum([440, 261.626, 329.628, 440]));
  await expect(page.getByText('Lovely strum!')).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history);
  expect(history).toHaveLength(2);
  expect(history.every((a: { manual: boolean }) => !a.manual)).toBe(true);
});

test('tuner opens from welcome and header, plays notes, and fits narrow phones', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tune your ukulele', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tune your ukulele.' })).toBeVisible();
  await expect(page.locator('[data-tuning-note]')).toHaveCount(4);
  await expect(page.locator('[data-action="tuning-string"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hear C4' }).click();
  await expect(page.locator('#tuning-reading')).toHaveText('Playing reference…');
  await expect(page.locator('#tuning-reading')).toHaveText('Enable the microphone to tune.');
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Back to practice' }).click();
  await page.getByRole('button', { name: 'Tuner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tune your ukulele.' })).toBeVisible();
});

test('tuner measures a single string, handles silence, and releases the microphone on exit', async ({ page }) => {
  await installInstrument(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Tune your ukulele', exact: true }).click();
  await page.getByRole('button', { name: 'Enable microphone', exact: true }).last().click();
  await expect(page.locator('#tuning-reading')).toHaveText('Pluck any open string.');
  await strum(page, 'c');
  await page.evaluate(() => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay([391.995, 391.995, 391.995, 391.995]));
  await expect(page.locator('#tuning-reading')).toContainText('In tune');
  await page.evaluate(() => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay([380, 380, 380, 380]));
  await expect(page.locator('#tuning-reading')).toContainText('Too flat');
  await page.evaluate(() => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay([405, 405, 405, 405]));
  await expect(page.locator('#tuning-reading')).toContainText('Too sharp');
  for (const [note, frequency] of [['C4', 261.626], ['E4', 329.628], ['A4', 440], ['G4', 391.995]] as const) {
    await page.evaluate(hz => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay([hz, hz, hz, hz]), frequency);
    await expect(page.locator('#tuning-reading')).toHaveText(`${note} · In tune`);
    await expect(page.locator('.tuner-string.is-active')).toHaveAttribute('data-tuning-note', note);
    await expect(page.locator('.tuner-string.is-tuned')).toHaveCount(1);
  }
  await page.evaluate(() => (window as unknown as { instrumentQuiet: () => void }).instrumentQuiet());
  await expect(page.locator('#tuning-reading')).toHaveText('Pluck any open string.');
  await expect(page.locator('.tuner-string.is-active')).toHaveCount(0);
  await expect(page.locator('#tuning-needle')).toBeHidden();
  await page.getByRole('button', { name: 'Back to practice' }).click();
  await expect(page.getByText('● Microphone enabled')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
});
