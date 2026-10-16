import { expect, test } from '@playwright/test';

test('mobile daily practice, hint timing, persistence, and completion', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your next chord/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Let’s practice' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByRole('heading', { name: 'C', exact: true })).toBeVisible();
  await expect(page.locator('#fingering')).toBeHidden();
  await page.clock.fastForward(19_000);
  await expect(page.locator('#fingering')).toBeHidden();
  await page.clock.fastForward(1_100);
  await expect(page.locator('#fingering')).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await expect(page.getByText('Self-assessed. Nice practice!')).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Continue practice' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await page.clock.fastForward(1_500);
  await expect(page.getByRole('heading', { name: 'F', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show fingering' }).click();
  await expect(page.getByRole('img', { name: /F major: G C E A/ })).toBeVisible();
  await page.getByRole('button', { name: 'I got it' }).click();
  await page.clock.fastForward(1_500);
  await expect(page.getByRole('heading', { name: 'Look at you grow.' })).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('little-strum.progress.v1')!));
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
  await page.getByRole('button', { name: 'Let’s practice' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was not allowed');
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await expect(page.getByText('Manual mode · self-assessed')).toBeVisible();
});

test('background time does not count toward the hint', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s practice' }).click();
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
  await page.clock.fastForward(9_000);
  await expect(page.locator('#fingering')).toBeHidden();
  await page.clock.fastForward(1_100);
  await expect(page.locator('#fingering')).toBeVisible();
});

test('home and practice fit narrow phones and desktop', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Let’s practice' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Show fingering' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('corrupt storage is not overwritten', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('little-strum.progress.v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('It has not been overwritten');
  await page.getByRole('button', { name: 'Let’s practice' }).click();
  await page.getByRole('button', { name: 'Practice without a microphone' }).click();
  await page.getByRole('button', { name: 'I got it' }).click();
  expect(await page.evaluate(() => localStorage.getItem('little-strum.progress.v1'))).toBe('{broken');
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
  await page.getByRole('button', { name: 'Let’s practice' }).click();
  await page.getByRole('button', { name: 'Enable microphone & begin' }).click();
  await expect(page.getByText('Listening for your strum…')).toBeVisible();
  await page.evaluate(() => (window as unknown as { strum: (n: number[]) => void }).strum([261.626, 329.628, 391.995, 523.251]));
  await expect(page.getByText('Lovely strum!')).toBeVisible();
  await page.evaluate(() => (window as unknown as { quiet: () => void }).quiet());
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await expect(page.getByText('Listening for your strum…')).toBeVisible();
  await page.evaluate(() => (window as unknown as { strum: (n: number[]) => void }).strum([261.626, 329.628, 391.995, 523.251]));
  await page.waitForTimeout(800);
  await expect(page.getByRole('heading', { name: 'Am', exact: true })).toBeVisible();
  await expect(page.getByText('Lovely strum!')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { strum: (n: number[]) => void }).strum([440, 261.626, 329.628, 440]));
  await expect(page.getByText('Lovely strum!')).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('little-strum.progress.v1')!).history);
  expect(history).toHaveLength(2);
  expect(history.every((a: { manual: boolean }) => !a.manual)).toBe(true);
});
