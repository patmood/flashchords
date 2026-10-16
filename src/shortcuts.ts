import { CHORDS } from './chords';

export function shortcutSurface(): HTMLElement {
  return document.querySelector<HTMLDialogElement>('dialog[open]') ?? document.querySelector<HTMLElement>('#app')!;
}

export function assignShortcuts(targetChord = '') {
  const root = shortcutSurface();
  root.querySelectorAll('.shortcut-badge').forEach(el => el.remove());
  const used = new Map<string, string>();
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[data-action]')]
    .filter(button => button.getClientRects().length > 0);
  // Give the simplest shapes to the main decisions, not secondary navigation.
  const primaryActions = ['hint', 'got-it', 'resume', 'finish-extra', 'retry-intro'];
  const priority = (button: HTMLButtonElement) => {
    if (button.dataset.fixedChord) return 0;
    if (!button.closest('dialog, main')) return 3;
    return button.classList.contains('primary') || primaryActions.includes(button.dataset.action!) ? 1 : 2;
  };
  buttons.sort((a, b) => priority(a) - priority(b));
  const reserved = new Set(buttons.map(b => b.dataset.fixedChord).filter(Boolean));
  if (targetChord) reserved.add(targetChord);
  for (const button of buttons) {
    delete button.dataset.shortcutChord;
    if (button.dataset.action === 'reset') continue; // Destructive actions remain tap-only.
    const action = button.dataset.action!;
    const fixed = button.dataset.fixedChord || (action === 'got-it' ? targetChord : '');
    const id = fixed || used.get(action) || CHORDS.find(c => !reserved.has(c.id))?.id;
    if (!id) continue;
    reserved.add(id);
    used.set(action, id);
    button.dataset.shortcutChord = id;
    const chord = CHORDS.find(c => c.id === id)!;
    const badge = document.createElement('span');
    badge.className = 'shortcut-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = `♫ ${chord.name}`;
    button.append(badge);
    button.setAttribute('aria-description', `Hands-free: play ${chord.label}. G C E A frets ${chord.frets.join(', ')}. A quiet gap is required between commands.`);
  }
}

export function findShortcut(chordId: string): HTMLButtonElement | undefined {
  return [...shortcutSurface().querySelectorAll<HTMLButtonElement>('button[data-shortcut-chord]')]
    .find(button => {
      const rect = button.getBoundingClientRect();
      return button.dataset.shortcutChord === chordId && !button.disabled && rect.width > 0
        && rect.bottom > 0 && rect.top < innerHeight;
    });
}
