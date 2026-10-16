import { describe, expect, it } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import { CHORDS } from './chords';
import { dayKey, emptyProgress, ensureSession, gradeAttempt, loadProgress, Rating, recordAttempt } from './scheduler';

const now = new Date(2026, 9, 16, 12);
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
