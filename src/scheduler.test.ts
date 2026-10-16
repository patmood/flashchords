import { describe, expect, it } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import { CHORDS } from './chords';
import { acceptIntroduction, dayKey, deferIntroduction, emptyProgress, ensureSession, gradeAttempt, loadProgress, needsIntroduction, nextExtraChord, nextFamiliarChord, Rating, recordAttempt } from './scheduler';

const now = new Date(2026, 9, 16, 12);

describe('new-chord introductions', () => {
  it('remembers acceptance without recording a successful practice attempt', () => {
    let progress = emptyProgress();
    expect(needsIntroduction(progress, 'c')).toBe(true);
    progress = acceptIntroduction(progress, 'c');
    expect(needsIntroduction(loadProgress(JSON.stringify(progress)), 'c')).toBe(false);
    expect(progress.history).toHaveLength(0);
    expect(progress.cards).toEqual({});
  });

  it('defers for three real review attempts and does not flood the learner with other new chords', () => {
    let progress = dailyDone();
    progress = deferIntroduction(progress, 'g');
    const threshold = progress.deferred!.g;
    for (let i = 0; i < 3; i++) {
      const at = new Date(now.getTime() + 4000 + i * 2000);
      const id = nextExtraChord(progress, '', at)!;
      expect(['c', 'am', 'f']).toContain(id);
      progress = recordAttempt(progress, { chordId: id, seconds: 4, hinted: false, manual: true, extra: true }, at);
    }
    expect(progress.history.length).toBe(threshold);
    expect(nextExtraChord(loadProgress(JSON.stringify(progress)), '', new Date(now.getTime() + 10000))).toBe('g');
    progress = acceptIntroduction(progress, 'g');
    expect(progress.deferred!.g).toBeUndefined();
  });

  it('offers only familiar chords as spacer cards', () => {
    expect(nextFamiliarChord(emptyProgress())).toBeNull();
    expect(['c', 'am', 'f']).toContain(nextFamiliarChord(dailyDone(), 'f', new Date(now.getTime() + 5000)));
  });
});

function dailyDone() {
  let progress = ensureSession(emptyProgress(), now);
  for (const [i, chordId] of ['c', 'am', 'f'].entries()) {
    progress = recordAttempt(progress, { chordId, seconds: 3, hinted: false, manual: true }, new Date(now.getTime() + i * 1000));
  }
  return progress;
}

describe('optional endless practice', () => {
  it('reviews introduced chords first, without immediately repeating the previous chord', () => {
    const progress = dailyDone();
    expect(nextExtraChord(progress, 'f', new Date(now.getTime() + 4000))).toBe('c');
    expect(nextExtraChord(emptyProgress())).toBe('c');
  });

  it('introduces a new chord after three extra reviews and keeps daily completion unchanged', () => {
    let progress = dailyDone();
    const daily = progress.daily;
    let previous = 'f';
    for (let i = 0; i < 3; i++) {
      const at = new Date(now.getTime() + 4000 + i * 2000);
      const chordId = nextExtraChord(progress, previous, at)!;
      expect(['c', 'am', 'f']).toContain(chordId);
      progress = recordAttempt(progress, { chordId, seconds: 3, hinted: false, manual: true, extra: true }, at);
      previous = chordId;
    }
    expect(nextExtraChord(progress, previous, new Date(now.getTime() + 11000))).toBe('g');
    progress = recordAttempt(progress, { chordId: 'g', seconds: 3, hinted: false, manual: true, extra: true }, new Date(now.getTime() + 12000));
    expect(progress.cards.g.reps).toBe(1);
    expect(progress.daily).toEqual(daily);
    expect(loadProgress(JSON.stringify(progress)).daily).toEqual(daily);
    expect(nextExtraChord(progress, 'g', new Date(now.getTime() + 13000))).not.toBe('c7');
  });

  it('preserves the new-chord interval across reloads and prioritizes due reviews', () => {
    let progress = dailyDone();
    for (let i = 0; i < 3; i++) {
      progress = recordAttempt(progress, { chordId: 'c', seconds: 3, hinted: false, manual: true, extra: true }, new Date(now.getTime() + 4000 + i * 2000));
    }
    progress = loadProgress(JSON.stringify(progress));
    const later = new Date(now.getTime() + 11000);
    expect(nextExtraChord(progress, 'c', later)).toBe('g');
    progress.cards.am.due = new Date(now.getTime() - 1000);
    expect(nextExtraChord(progress, 'c', later)).toBe('am');
  });

  it('continues reviewing when all 20 chords are introduced', () => {
    const progress = emptyProgress();
    CHORDS.forEach(chord => { progress.cards[chord.id] = createEmptyCard(new Date(now.getTime() + 86400000)); });
    for (let i = 0; i < 30; i++) {
      const chordId = nextExtraChord(progress, '', now)!;
      expect(chordId).toBeTruthy();
      progress.cards[chordId].last_review = new Date(now.getTime() + i * 1000);
    }
    expect(Object.keys(progress.cards)).toHaveLength(20);
  });
});

describe('daily scheduling and persistence', () => {
  it('starts with three approachable chords', () => {
    expect(ensureSession(emptyProgress(), now).daily?.ids).toEqual(['c', 'am', 'f']);
  });
  it('keeps an existing daily queue stable', () => {
    const p = ensureSession(emptyProgress(), now);
    expect(ensureSession(p, now)).toBe(p);
  });
  it('prioritizes overdue cards and caps at 15', () => {
    const p = emptyProgress();
    CHORDS.slice(0, 17).forEach((chord, i) => { p.cards[chord.id] = createEmptyCard(new Date(now.getTime() - (i + 1) * 86400000)); });
    const ids = ensureSession(p, now).daily!.ids;
    expect(ids).toHaveLength(15);
    expect(ids[0]).toBe(CHORDS[16].id);
    expect(ids.every(id => id in p.cards)).toBe(true);
  });
  it('only fills remaining space with up to three new chords', () => {
    const p = emptyProgress();
    CHORDS.slice(0, 14).forEach(chord => { p.cards[chord.id] = createEmptyCard(now); });
    expect(ensureSession(p, now).daily!.ids).toHaveLength(15);
  });
  it('records a successful attempt and restores actual dates', () => {
    const p = recordAttempt(ensureSession(emptyProgress(), now), { chordId: 'c', seconds: 8, hinted: false, manual: true }, now);
    expect(p.cards.c.reps).toBe(1);
    expect(p.history[0].rating).toBe(Rating.Good);
    expect(p.daily?.completed).toEqual(['c']);
    const restored = loadProgress(JSON.stringify(p));
    expect(restored.cards.c.due).toBeInstanceOf(Date);
    expect(restored.cards.c.last_review).toBeInstanceOf(Date);
    expect(restored.history[0].manual).toBe(true);
    expect(ensureSession(restored, new Date(2026, 9, 17, 12)).daily?.date).toBe('2026-10-17');
  });
  it('grades assistance and response time consistently', () => {
    expect(gradeAttempt(3, true)).toBe(Rating.Again);
    expect(gradeAttempt(5, false)).toBe(Rating.Easy);
    expect(gradeAttempt(6, false)).toBe(Rating.Good);
    expect(gradeAttempt(13, false)).toBe(Rating.Hard);
  });
  it('uses local calendar dates', () => {
    expect(dayKey(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });
  it('does not silently accept corrupt data', () => {
    expect(() => loadProgress('{broken')).toThrow();
    expect(() => loadProgress('{"version":2}')).toThrow();
    expect(loadProgress(null)).toEqual(emptyProgress());
  });
});
