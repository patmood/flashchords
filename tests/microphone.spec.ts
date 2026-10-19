import { expect, test } from '@playwright/test';
import { CHORDS } from '../src/chords';
import { installInstrument, strum } from './instrument';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(ids => {
    localStorage.setItem('flashchords.chord-sounds.v1', 'false');
    localStorage.setItem('flashchords.progress.v1', JSON.stringify({ version: 1, cards: {}, history: [], daily: null, introduced: ids }));
  }, CHORDS.map(chord => chord.id));
});

test('microphone is the first welcome CTA and permission denial stays inside welcome', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  const welcome = page.locator('#welcome-dialog');
  const enable = welcome.getByRole('button', { name: 'Enable microphone', exact: true });
  await expect(welcome.getByRole('button').first()).toHaveText('Enable microphone');
  await expect(enable).toHaveClass(/primary/);
  await expect(enable).toBeFocused();
  for (const button of await welcome.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
  }
  await enable.click();
  await expect(welcome.locator('.dialog-listening')).toContainText('Microphone access was not allowed');
  await expect(page.locator('#microphone-dialog')).toHaveCount(0);
  await welcome.getByRole('button', { name: 'Let’s play' }).click();
  const prompt = page.getByRole('dialog', { name: 'Enable your microphone.' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('browser’s site settings');
  await expect(prompt.getByRole('button', { name: 'Try microphone again' })).toBeFocused();
  await prompt.getByRole('button', { name: 'Continue without microphone' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await page.getByRole('button', { name: 'I got it' }).click();
  await expect(page.locator('#microphone-dialog')).toHaveCount(0);
});

test('a returning user sees a microphone prompt even when welcome is hidden', async ({ page }) => {
  await installInstrument(page);
  await page.addInitScript(() => localStorage.setItem('flashchords.hide-welcome.v1', 'true'));
  await page.goto('/');
  await expect(page.locator('#welcome-dialog')).toHaveCount(0);
  const prompt = page.getByRole('dialog', { name: 'Enable your microphone.' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
});

test('permission revocation pauses practice and retry restores microphone practice', async ({ page }) => {
  await installInstrument(page);
  await page.addInitScript(() => {
    const permission = Object.assign(new EventTarget(), { state: 'granted' as PermissionState });
    navigator.permissions.query = async () => permission as PermissionStatus;
    Object.assign(window, {
      revokeMicrophone: () => { permission.state = 'denied'; permission.dispatchEvent(new Event('change')); },
    });
  });
  await page.goto('/');
  await page.locator('#welcome-dialog').getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByRole('button', { name: 'I got it' })).toBeVisible();
  await page.evaluate(() => (window as unknown as { revokeMicrophone: () => void }).revokeMicrophone());
  const prompt = page.getByRole('dialog', { name: 'Enable your microphone.' });
  await expect(prompt).toContainText('site settings');
  await expect(page.getByText('Practice paused', { exact: true })).toBeVisible();
  await prompt.getByRole('button', { name: 'Try microphone again' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'I got it' })).toBeVisible();
  await strum(page, 'c');
  await expect(page.getByText('Lovely strum!')).toBeVisible();
});

test('disconnection prompts without Permissions API support and recovers in the tuner', async ({ page }) => {
  await installInstrument(page);
  await page.addInitScript(() => {
    navigator.permissions.query = async () => { throw new TypeError('Unsupported permission'); };
  });
  await page.goto('/');
  await page.locator('#welcome-dialog').getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Tune your ukulele', exact: true }).click();
  await expect(page.locator('#microphone-dialog')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { instrumentDisconnect: () => void }).instrumentDisconnect());
  const prompt = page.getByRole('dialog', { name: 'Enable your microphone.' });
  await expect(prompt).toContainText('Microphone disconnected');
  await prompt.getByRole('button', { name: 'Try microphone again' }).click();
  await expect(prompt).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay([440, 440, 440, 440]));
  await expect(page.locator('#tuning-reading')).toHaveText('A4 · In tune');
});

test('navigation keeps one microphone stream and switches between tuner and chord recognition', async ({ page }) => {
  await installInstrument(page);
  await page.goto('/');
  await page.locator('#welcome-dialog').getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Tune your ukulele', exact: true }).click();
  await page.evaluate(() => (window as unknown as { instrumentPlay: (notes: number[]) => void }).instrumentPlay([440, 440, 440, 440]));
  await expect(page.locator('#tuning-reading')).toHaveText('A4 · In tune');
  await page.getByRole('button', { name: 'Back to practice' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await strum(page, 'c');
  await expect(page.getByText('Lovely strum!')).toBeVisible();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { instrumentRequests: number }).instrumentRequests)).toBe(1);
  await expect(page.locator('#microphone-dialog')).toHaveCount(0);
});

test('interrupted microphone audio prompts instead of silently appearing connected', async ({ page }) => {
  await installInstrument(page);
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (stream) {
      Object.assign(window, { interruptMicrophone: () => this.suspend() });
      return original.call(this, stream);
    };
  });
  await page.goto('/');
  await page.locator('#welcome-dialog').getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.evaluate(() => (window as unknown as { interruptMicrophone: () => Promise<void> }).interruptMicrophone());
  await expect(page.getByRole('dialog', { name: 'Enable your microphone.' })).toContainText('audio was interrupted');
});

test('a failed reconnect after returning to the app shows the microphone modal', async ({ page }) => {
  await installInstrument(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let requests = 0;
    navigator.mediaDevices.getUserMedia = constraints => {
      if (requests++ > 0) return Promise.reject(new DOMException('Permission expired', 'NotAllowedError'));
      return original(constraints);
    };
  });
  await page.goto('/');
  await page.locator('#welcome-dialog').getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('dialog', { name: 'Enable your microphone.' })).toContainText('Microphone access was not allowed');
  await expect(page.getByText('● Microphone enabled')).toHaveCount(0);
});

test('microphone recovery temporarily replaces an introduction without losing it', async ({ page }) => {
  await installInstrument(page);
  await page.addInitScript(() => localStorage.removeItem('flashchords.progress.v1'));
  await page.goto('/');
  await page.locator('#welcome-dialog').getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByText('● Microphone enabled')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  await page.evaluate(() => (window as unknown as { instrumentDisconnect: () => void }).instrumentDisconnect());
  await expect(page.getByRole('dialog', { name: 'Enable your microphone.' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue without microphone' }).click();
  await expect(page.getByRole('dialog', { name: 'Meet C major.' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flashchords.progress.v1')!).history)).toHaveLength(0);
});
