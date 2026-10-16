import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';
import { CHORDS } from './chords';

export { Rating };
export interface Attempt {
  chordId: string;
  at: string;
  rating: number;
  hinted: boolean;
  manual: boolean;
  seconds: number;
  extra?: boolean;
}
export interface Progress {
  version: 1;
  cards: Record<string, Card>;
  history: Attempt[];
  daily: { date: string; ids: string[]; completed: string[] } | null;
}
export { STORAGE_KEY } from './storage';
const engine = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));
export const emptyProgress = (): Progress => ({ version: 1, cards: {}, history: [], daily: null });

export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function loadProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !parsed.cards || !Array.isArray(parsed.history)) throw new Error('Invalid progress');
  const cards: Record<string, Card> = {};
  for (const [id, value] of Object.entries(parsed.cards)) {
    if (!CHORDS.some(c => c.id === id)) continue;
    const c = value as Card;
    const due = new Date(c.due);
    if (!Number.isFinite(due.getTime()) || !Number.isFinite(c.stability) || !Number.isFinite(c.difficulty)
      || !Number.isFinite(c.reps) || !Number.isFinite(c.lapses) || ![0, 1, 2, 3].includes(c.state)) throw new Error('Invalid card');
    cards[id] = { ...c, due, ...(c.last_review ? { last_review: new Date(c.last_review) } : {}) };
  }
  const history = parsed.history.filter((a: Attempt) => CHORDS.some(c => c.id === a.chordId)
    && Number.isFinite(new Date(a.at).getTime()) && [1, 2, 3, 4].includes(a.rating));
  let daily = parsed.daily;
  if (daily && (typeof daily.date !== 'string' || !Array.isArray(daily.ids) || !Array.isArray(daily.completed)
    || daily.ids.some((id: string) => !CHORDS.some(c => c.id === id))
    || daily.completed.some((id: string) => !daily.ids.includes(id)))) throw new Error('Invalid session');
  return { version: 1, cards, history, daily: daily || null };
}

export function ensureSession(progress: Progress, now = new Date()): Progress {
  if (progress.daily?.date === dayKey(now)) return progress;
  const due = CHORDS.filter(c => progress.cards[c.id] && progress.cards[c.id].due <= now)
    .sort((a, b) => progress.cards[a.id].due.getTime() - progress.cards[b.id].due.getTime())
    .map(c => c.id).slice(0, 15);
  const fresh = CHORDS.filter(c => !progress.cards[c.id]).slice(0, Math.min(3, 15 - due.length)).map(c => c.id);
  return { ...progress, daily: { date: dayKey(now), ids: [...due, ...fresh], completed: [] } };
}

export function gradeAttempt(seconds: number, hinted: boolean): Rating {
  if (hinted) return Rating.Again;
  if (seconds > 12) return Rating.Hard;
  if (seconds <= 5) return Rating.Easy;
  return Rating.Good;
}

export function nextExtraChord(progress: Progress, previousId = '', now = new Date()): string | null {
  const introduced = CHORDS.filter(chord => progress.cards[chord.id]);
  const candidates = introduced.length > 1 ? introduced.filter(chord => chord.id !== previousId) : introduced;
  candidates.sort((a, b) => {
    const first = progress.cards[a.id];
    const second = progress.cards[b.id];
    const firstDue = first.due <= now;
    const secondDue = second.due <= now;
    if (firstDue !== secondDue) return firstDue ? -1 : 1;
    if (firstDue) return first.due.getTime() - second.due.getTime();
    return (first.last_review?.getTime() ?? 0) - (second.last_review?.getTime() ?? 0);
  });
  // Keep new material gradual, even across reloads or separate extra sessions.
  const seen = new Set<string>();
  let extraReviewsSinceNew = 0;
  for (const attempt of progress.history) {
    if (!seen.has(attempt.chordId)) {
      seen.add(attempt.chordId);
      extraReviewsSinceNew = 0;
    } else if (attempt.extra) extraReviewsSinceNew++;
  }
  const fresh = CHORDS.find(chord => !progress.cards[chord.id]);
  if (fresh && (!introduced.length || (extraReviewsSinceNew >= 3 && !introduced.some(chord => progress.cards[chord.id].due <= now)))) {
    return fresh.id;
  }
  return candidates[0]?.id ?? null;
}

export function recordAttempt(progress: Progress, attempt: Omit<Attempt, 'at' | 'rating'>, now = new Date()): Progress {
  const rating = gradeAttempt(attempt.seconds, attempt.hinted);
  const card = progress.cards[attempt.chordId] || createEmptyCard(now);
  const next = engine.next(card, now, rating as 1 | 2 | 3 | 4).card;
  return {
    ...progress,
    cards: { ...progress.cards, [attempt.chordId]: next },
    history: [...progress.history, { ...attempt, at: now.toISOString(), rating }],
    daily: progress.daily && !attempt.extra && progress.daily.ids.includes(attempt.chordId)
      ? { ...progress.daily, completed: [...new Set([...progress.daily.completed, attempt.chordId])] }
      : progress.daily,
  };
}
