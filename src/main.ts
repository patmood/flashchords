import './style.css';
import { CHORDS, diagram } from './chords';
import { ChordMicrophone } from './audio';
import { dayKey, emptyProgress, ensureSession, loadProgress, nextExtraChord, recordAttempt, STORAGE_KEY } from './scheduler';
import type { Progress } from './scheduler';
import { readStoredValue, WELCOME_KEY } from './storage';
import { ChordSound, SOUND_KEY } from './sounds';

const app = document.querySelector<HTMLDivElement>('#app')!;
const microphone = new ChordMicrophone();
const chordSound = new ChordSound();
let soundEnabled = true;
try { soundEnabled = localStorage.getItem(SOUND_KEY) !== 'false'; } catch { /* Use the default. */ }
let previewing = false;
let previewRequest = 0;
let appReady = false;
let progress: Progress;
let storageWarning = '';
let preserveStoredData = false;
try { progress = loadProgress(readStoredValue(STORAGE_KEY)); }
catch {
  progress = emptyProgress();
  preserveStoredData = true;
  storageWarning = 'Saved progress could not be read. It has not been overwritten. You can practice without saving, or reset it in settings.';
}
let view: 'practice' | 'complete' | 'progress' | 'settings' = 'practice';
let manual = false;
let modeSelected = false;
let starting = false;
let error = '';
let currentId = '';
let hinted = false;
let elapsed = 0;
let activeSince: number | null = null;
let paused = true;
let hasStarted = false;
let successful = false;
let successManual = false;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;
let practiceMode: 'daily' | 'extra' = 'daily';
let extraCount = 0;

const icons: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  chart: '<path d="M4 19h16M7 15v-4m5 4V5m5 10V8"/>',
  gear: '<path d="m9 3-.6 2-2 .9-2-.5-2 3.4 1.4 1.6v2.3l-1.4 1.6 2 3.4 2-.5 2 .9.6 2h4l.6-2 2-.9 2 .5 2-3.4-1.4-1.6v-2.3l1.4-1.6-2-3.4-2 .5-2-.9L13 3Z"/><circle cx="11" cy="11.5" r="3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  leaf: '<path d="M20 3C9 1 1 7 5 15c7 8 17 0 15-12ZM4 21 16 8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  book: '<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  speaker: '<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};
const icon = (name: string, cls = 'h-5 w-5') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function save() {
  if (preserveStoredData) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch { storageWarning = 'Your browser could not save progress. This session still works, but progress may be lost when you close the page.'; }
}

function shell(content: string): string {
  return `<div class="mx-auto max-w-5xl px-5 pb-[max(28px,env(safe-area-inset-bottom))] sm:px-10">
    <header class="flex h-20 items-center justify-between border-b border-ink/10">
      <button data-action="practice" aria-label="Flashchords practice" class="flex shrink-0 items-center gap-1.5 text-lg font-bold tracking-tight sm:gap-2.5 sm:text-xl"> <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage sm:h-10 sm:w-10"><img src="${import.meta.env.BASE_URL}favicon.svg" class="h-8 w-8 sm:h-9 sm:w-9" alt="" /></span>flashchords<span class="mb-3 hidden h-1.5 w-1.5 rounded-full bg-[#c39b55] sm:block"></span></button>
      <nav aria-label="Main navigation" class="flex gap-2 sm:gap-5">
        <button data-action="practice" class="nav-button ${view === 'practice' || view === 'complete' ? 'active' : ''}" ${view === 'practice' ? 'aria-current="page"' : ''}>${icon('sun')}<span class="hidden sm:inline">Practice</span><span class="sr-only sm:hidden">Practice</span></button>
        <button data-action="progress" class="nav-button ${view === 'progress' ? 'active' : ''}" ${view === 'progress' ? 'aria-current="page"' : ''}>${icon('chart')}<span class="hidden sm:inline">Progress</span><span class="sr-only sm:hidden">Progress</span></button>
        <button data-action="settings" class="icon-button self-center" aria-label="Settings">${icon('gear')}</button>
      </nav>
    </header>
    ${storageWarning ? `<div role="alert" class="mt-5 rounded-xl bg-[#f7e7cd] p-4 text-sm">${escapeHtml(storageWarning)}</div>` : ''}
    <main id="main-content">${content}</main>
  </div>`;
}

function showWelcome() {
  if (document.querySelector('#welcome-dialog')) return;
  try { if (readStoredValue(WELCOME_KEY) === 'true') return; }
  catch { /* A blocked preference store should not block practice. */ }
  const dialog = document.createElement('dialog');
  dialog.id = 'welcome-dialog';
  dialog.className = 'welcome-dialog panel';
  dialog.setAttribute('aria-labelledby', 'welcome-title');
  dialog.setAttribute('aria-describedby', 'welcome-description');
  dialog.innerHTML = `<div class="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-sage text-forest">${icon('leaf', 'h-6 w-6')}</div>
    <h2 id="welcome-title" class="font-serif text-3xl">Welcome to Flashchords.</h2>
    <div id="welcome-description" class="mt-4 space-y-3 text-sm leading-6 text-ink/70"><p>Play the chord on the card. A fingering hint appears after <strong>20 seconds</strong>, or whenever you ask.</p><p>Use a tuned <strong>high-G ukulele (G–C–E–A)</strong>. Enable your microphone to check strums, or practice manually with “I got it”. Audio stays on your device.</p><p>Short daily sessions and spaced repetition help the shapes stick. Your progress saves in this browser.</p></div>
    <label class="my-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input id="hide-welcome" type="checkbox" class="h-5 w-5 accent-forest" />Don’t show again</label>
    <button id="dismiss-welcome" class="primary" autofocus>Let’s play</button>`;
  const dismiss = () => {
    const hide = dialog.querySelector<HTMLInputElement>('#hide-welcome')!.checked;
    try {
      if (hide) localStorage.setItem(WELCOME_KEY, 'true');
    } catch {
      storageWarning = 'Your browser could not save the welcome preference. You can still practice.';
      render();
    }
    dialog.close();
    dialog.remove();
    void playPreview();
    document.querySelector<HTMLElement>('[data-action="enable-mic"], main button')?.focus();
  };
  dialog.querySelector('#dismiss-welcome')!.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  document.body.append(dialog);
  dialog.showModal();
}

function currentSeconds() { return elapsed + (activeSince !== null ? (performance.now() - activeSince) / 1000 : 0); }

function stopPreview(resumeTimer = false) {
  const resume = previewing && resumeTimer && hasStarted && !paused && !successful;
  previewRequest++;
  chordSound.stop();
  previewing = false;
  if (resume) activeSince = performance.now();
}

async function playPreview(force = false) {
  if (view !== 'practice' || successful || document.hidden || (!soundEnabled && !force)) return;
  stopPreview(true);
  const token = ++previewRequest;
  const chord = CHORDS.find(c => c.id === currentId)!;
  elapsed = currentSeconds();
  activeSince = null;
  previewing = true;
  render();
  await chordSound.play(chord);
  if (token !== previewRequest) return;
  previewing = false;
  microphone.arm();
  if (!paused && hasStarted) activeSince = performance.now();
  render();
}

function practice() {
  const chord = CHORDS.find(c => c.id === currentId)!;
  const daily = progress.daily!;
  const percent = daily.completed.length / daily.ids.length * 100;
  const listeningStatus = previewing ? 'Playing chord reference…' : !hasStarted ? 'Ready for your first strum?' : paused ? 'Practice paused' : manual ? 'Manual mode · self-assessed' : 'Let the strings go quiet, then strum.';
  const hintStatus = previewing ? 'Listen first. Your practice timer is paused.' : !hasStarted ? 'Choose a practice mode below to begin.' : hinted ? 'Finger numbers are shown inside the dots.' : `Fingering appears in ${Math.max(0, Math.ceil(20 - currentSeconds()))}s`;
  return `<section class="mx-auto max-w-lg py-6 sm:py-9">${practiceMode === 'extra'
    ? `<div class="mb-6 flex items-center justify-between text-xs text-ink/60"><span>Extra practice · no finish line</span><span>${extraCount} played</span></div>`
    : `<div class="mb-3 flex items-center justify-between text-xs text-ink/60"><span>Today’s session</span><span>${daily.completed.length} of ${daily.ids.length} complete</span></div><div class="mb-6 h-1.5 overflow-hidden rounded-full bg-ink/10"><div class="h-full rounded-full bg-[#7d9b75] transition-all" style="width:${percent}%"></div></div>`}
    <div class="panel relative overflow-hidden text-center ${successful ? 'success-card !border-[#a2bf97] !bg-[#edf3e6]' : ''}">
      <p class="eyebrow">${successful ? 'That’s the one!' : progress.cards[currentId] ? 'A familiar friend' : 'Meet your next chord'}</p>
      <h1 class="my-3 font-serif text-[88px] leading-none tracking-tight sm:text-[104px]">${chord.name}</h1><p class="text-sm text-ink/60">${chord.label}</p>
      ${successful ? `<div id="success-fingering" class="success-diagram mx-auto mt-4">${diagram(chord)}</div>` : `<div class="mt-2 flex items-center justify-center gap-4 text-xs text-forest"><button data-action="play-chord" class="flex min-h-11 items-center gap-2" aria-label="Play ${chord.label}" ${previewing ? 'disabled' : ''}>${icon('speaker', 'h-4 w-4')}Hear chord</button><button data-action="toggle-sound" class="min-h-11 text-ink/60 underline underline-offset-4" aria-label="Turn automatic chord sound ${soundEnabled ? 'off' : 'on'}" aria-pressed="${soundEnabled}">Auto sound ${soundEnabled ? 'on' : 'off'}</button></div>`}
      <div id="fingering" class="mt-5 ${hinted && !successful ? '' : 'hidden'}">${diagram(chord)}<p class="mx-auto mt-3 max-w-xs text-xs leading-6 text-ink/65">${chord.tip}</p></div>
      <div id="recall-space" class="${hinted || successful ? 'hidden' : 'flex'} min-h-24 flex-col items-center justify-center"><span class="mb-3 text-[#a2ae90]">${icon('leaf', 'h-8 w-8')}</span><p class="text-sm text-ink/60">Take a breath. Find the shape.</p></div>
      ${successful ? `<div class="my-5 flex items-center justify-center gap-2 font-bold text-forest">${icon('check')} ${successManual ? 'Self-assessed. Nice practice!' : 'Lovely strum!'}</div><div class="confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${Math.cos(i * 2.4) * 210}px;--y:${Math.sin(i * 2.4) * 190}px;--r:${i * 63}deg"></i>`).join('')}</div>` : `<div class="mt-4 border-t border-ink/10 pt-5"><div class="flex min-h-7 items-center justify-center gap-3"><div id="meter" class="${manual || paused || previewing ? 'hidden' : 'flex'} h-6 items-center gap-1" aria-hidden="true">${Array.from({ length: 7 }, () => '<i class="meter-bar h-1"></i>').join('')}</div><p id="listening-status" class="text-sm text-forest" role="status">${listeningStatus}</p></div><p id="hint-countdown" class="mt-3 text-xs text-ink/50">${hintStatus}</p></div>`}
    </div>
    <div class="mt-5" id="practice-controls">${successful ? '<p role="status" class="py-4 text-center text-sm text-forest">Progress saved for this session. On to the next…</p>' : !hasStarted ? `<button data-action="enable-mic" class="primary" ${starting ? 'disabled' : ''}>${icon('mic')} ${starting ? 'Waiting for microphone permission…' : 'Enable microphone & begin'}</button><button data-action="manual" class="mt-2 min-h-12 w-full text-sm font-bold underline decoration-ink/25 underline-offset-4">Practice without a microphone</button>` : paused ? `<button data-action="resume" class="primary" ${starting ? 'disabled' : ''}>${starting ? 'Reconnecting…' : 'Resume practice'}</button>` : `<div class="grid grid-cols-2 gap-3"><button data-action="hint" class="secondary" ${hinted || previewing ? 'disabled' : ''}>${icon('book')} ${hinted ? 'Fingering shown' : 'Show fingering'}</button><button data-action="got-it" class="secondary !border-forest/30 !text-forest" ${previewing ? 'disabled' : ''}>${icon('check')} I got it</button></div><p class="mt-3 text-center text-[11px] leading-5 text-ink/55">${manual ? 'Play the chord, then tap “I got it” when you’re happy with it.' : 'Not picking it up? “I got it” records a self-assessed attempt.'}</p>`}</div>
    ${error ? `<div role="alert" class="mt-4 rounded-xl bg-[#f7e7cd] p-4 text-sm">${escapeHtml(error)}${hasStarted ? '<button data-action="switch-manual" class="mt-3 block font-bold underline">Use manual mode</button>' : ''}</div>` : ''}
    ${practiceMode === 'extra' ? '<button data-action="finish-extra" class="mt-4 min-h-12 w-full text-sm text-ink/65 underline underline-offset-4">Finish extra practice</button><p class="text-center text-[11px] leading-5 text-ink/55">Due reviews first. A new chord after every 3 extra reviews when nothing is due. Stop whenever you like.</p>' : ''}
  </section>`;
}

function completion() {
  const today = progress.history.filter(a => dayKey(new Date(a.at)) === dayKey());
  return `<section class="mx-auto max-w-md py-12 text-center card-enter"><div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sage text-forest">${icon('check', 'h-9 w-9')}</div><p class="eyebrow">A little better than before</p><h1 class="mt-4 font-serif text-5xl leading-tight">Look at you grow.</h1><p class="mt-5 text-sm leading-7 text-ink/65">Your daily session is complete. That’s enough for today—or keep strumming for as long as you like.</p><div class="panel my-7 grid grid-cols-2 divide-x divide-ink/10"><div><p class="font-serif text-4xl">${today.length}</p><p class="mt-2 text-xs text-ink/60">strums practiced today</p></div><div><p class="font-serif text-4xl">${today.filter(a => !a.hinted).length}</p><p class="mt-2 text-xs text-ink/60">without a hint</p></div></div>${Object.keys(progress.cards).length ? `<button data-action="start-extra" class="primary">Keep practising ${icon('arrow')}</button><p class="mb-3 mt-2 text-xs leading-6 text-ink/55">More reviews, with new chords introduced gradually. Stop whenever you like.</p>` : ''}<button data-action="progress" class="secondary w-full">See your progress ${icon('chart')}</button></section>`;
}

function progressPage() {
  const learned = Object.keys(progress.cards).length;
  const counts = [learned, progress.history.length, progress.history.filter(a => !a.hinted).length];
  return `<section class="py-9"><p class="eyebrow">Every strum counts</p><h1 class="mt-3 font-serif text-4xl">Your growing chord garden.</h1><p class="mt-3 max-w-lg text-sm leading-7 text-ink/65">Explored doesn’t mean mastered. Each return helps the shape feel a little more like second nature.</p>
    <div class="my-7 grid grid-cols-3 gap-2 sm:gap-5">${['chords explored', 'total attempts', 'without hints'].map((label, i) => `<div class="panel !rounded-2xl !p-4"><p class="font-serif text-3xl sm:text-4xl">${counts[i]}</p><p class="mt-2 text-[11px] text-ink/60 sm:text-xs">${label}</p></div>`).join('')}</div>
    <h2 class="mb-4 text-sm font-bold">Your 20 starter chords</h2><div class="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3">${CHORDS.map(chord => {
      const card = progress.cards[chord.id];
      const due = card && card.due <= new Date();
      return `<div class="rounded-2xl border p-3 text-center ${card ? 'border-[#d5dfca] bg-sage/70' : 'border-ink/10 bg-white/30'}"><p class="font-serif text-2xl">${chord.name}</p><p class="mt-2 text-[10px] text-ink/60">${card ? due ? 'Due for a return' : `Next: ${card.due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Not yet planted'}</p></div>`;
    }).join('')}</div><div class="panel mt-7"><div class="flex items-center gap-2 text-sm font-bold">${icon('clock')} A smarter time to return</div><p class="mt-3 text-xs leading-6 text-ink/65">FSRS schedules reviews with a 90% target recall rate. Needing a fingering hint means “Again”; an unassisted answer is “Hard” after 12 seconds, “Good” from 5–12 seconds, and “Easy” within 5 seconds. Daily sessions include due reviews first, then up to 3 new chords, with 15 cards maximum.</p><p class="mt-2 text-xs leading-6 text-ink/65">Self-assessed attempts use the same timing rules. Hinted chords return in a later daily session. These automatic grades are useful estimates, not a measurement of musical ability.</p></div>
  </section>`;
}

function settings() {
  return `<section class="mx-auto max-w-xl py-9"><p class="eyebrow">Keep it simple</p><h1 class="mt-3 font-serif text-4xl">Your little setup.</h1><div class="panel mt-7 space-y-6"><div><h2 class="text-sm font-bold">Standard high-G ukulele</h2><p class="mt-2 text-sm leading-6 text-ink/65">G4 · C4 · E4 · A4. Soprano, concert, or tenor. Low-G and baritone tuning aren’t supported in this version.</p></div><div><h2 class="text-sm font-bold">Private by design</h2><p class="mt-2 text-sm leading-6 text-ink/65">Progress lives only in this browser’s local storage. Clearing site data clears it too. Audio is never recorded or sent anywhere. Use the same browser and device to keep learning.</p></div><div><h2 class="text-sm font-bold">A forgiving listening buddy</h2><p class="mt-2 text-sm leading-6 text-ink/65">Tune first, reduce background noise, and strum all four strings. Similar chords or noisy rooms can confuse recognition. You can always self-assess with “I got it”.</p></div></div><div class="panel mt-5"><h2 class="text-sm font-bold">Your progress</h2><p class="mb-4 mt-2 text-sm leading-6 text-ink/65">Keep a copy of your progress, or start fresh on this device.</p><button data-action="export" class="secondary w-full">Download progress backup</button><button data-action="reset" class="mt-3 min-h-12 w-full text-sm text-[#9a4937] underline underline-offset-4">Reset all progress</button></div></section>`;
}

function render(focus = false) {
  app.innerHTML = shell(view === 'practice' ? practice() : view === 'complete' ? completion() : view === 'progress' ? progressPage() : settings());
  if (focus) {
    const main = document.querySelector<HTMLElement>('main')!;
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function stopActivity() {
  stopPreview();
  requestId++;
  starting = false;
  microphone.stop();
  clearTimeout(transitionTimer);
  activeSince = null;
}

function navigate(next: typeof view) {
  stopActivity();
  error = '';
  view = next;
  render(true);
}

function openPractice() {
  stopActivity();
  practiceMode = 'daily';
  error = '';
  progress = ensureSession(progress);
  save();
  nextCard(false);
}

function nextCard(start = true) {
  stopPreview();
  const remaining = progress.daily!.ids.filter(id => !progress.daily!.completed.includes(id));
  const nextId = practiceMode === 'extra' ? nextExtraChord(progress, currentId) : remaining[0];
  if (!nextId) { navigate('complete'); return; }
  currentId = nextId;
  elapsed = 0;
  activeSince = start ? performance.now() : null;
  hinted = false;
  successful = false;
  paused = !start;
  hasStarted = start;
  microphone.arm();
  view = 'practice';
  render(true);
  if (appReady && !document.querySelector('#welcome-dialog')) void playPreview();
}

function revealHint() {
  if (hinted || successful || paused || previewing || view !== 'practice') return;
  hinted = true;
  render();
}

function succeed(selfAssessed: boolean) {
  if (view !== 'practice' || successful || paused || previewing) return;
  // The time threshold still counts as a hint if a tap beats the UI timer tick.
  if (currentSeconds() >= 20) hinted = true;
  progress = recordAttempt(progress, { chordId: currentId, hinted, manual: selfAssessed, seconds: currentSeconds(), extra: practiceMode === 'extra' });
  if (practiceMode === 'extra') extraCount++;
  save();
  activeSince = null;
  successManual = selfAssessed;
  successful = true;
  render();
  transitionTimer = setTimeout(() => nextCard(), 1400);
}

function onAudioFrame(d: { chordId: string | null; level: number; listening: boolean }) {
  if (view !== 'practice' || paused || successful || previewing) return;
  const status = document.querySelector('#listening-status');
  if (status) status.textContent = !d.listening ? 'Let the strings go quiet, then strum.' : d.level < .008 ? 'Listening for your strum…' : 'Listening… let all four strings ring.';
  document.querySelectorAll<HTMLElement>('.meter-bar').forEach((bar, i) => {
    bar.style.height = `${4 + Math.min(20, d.level * 300) * (.4 + .6 * Math.sin(i * 1.7) ** 2)}px`;
  });
  if (d.chordId === currentId) succeed(false);
}

function audioError(message: string) {
  if (view !== 'practice') return;
  elapsed = currentSeconds();
  activeSince = null;
  stopPreview();
  paused = true;
  error = message;
  render();
}

async function begin(useManual: boolean, resume = false) {
  if (starting && !useManual) return;
  if (starting) stopActivity();
  stopPreview();
  if (soundEnabled) void chordSound.unlock();
  manual = useManual;
  modeSelected = true;
  error = '';
  const token = ++requestId;
  if (!useManual) {
    starting = true;
    render();
    try { await microphone.start(onAudioFrame, audioError); }
    catch (e) {
      if (token !== requestId) return;
      starting = false;
      error = e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone access was not allowed. Enable it in your browser’s site settings, or practice manually below.' : e instanceof Error ? e.message : 'Could not start your microphone. Try manual practice.';
      render();
      return;
    }
    if (token !== requestId) return;
    starting = false;
  }
  if (resume || practiceMode === 'extra') {
    paused = false;
    hasStarted = true;
    activeSince = performance.now();
    render();
    void playPreview();
  } else {
    progress = ensureSession(progress);
    save();
    nextCard();
  }
}

app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'practice':
      if (view !== 'practice') openPractice();
      break;
    case 'progress': navigate('progress'); break;
    case 'settings': navigate('settings'); break;
    case 'enable-mic': void begin(false); break;
    case 'manual': void begin(true); break;
    case 'resume': void begin(manual, true); break;
    case 'switch-manual': microphone.stop(); void begin(true, true); break;
    case 'hint': revealHint(); break;
    case 'got-it': succeed(true); break;
    case 'play-chord': void playPreview(true); break;
    case 'toggle-sound':
      soundEnabled = !soundEnabled;
      try { localStorage.setItem(SOUND_KEY, String(soundEnabled)); }
      catch { storageWarning = 'Your browser could not save the sound preference.'; }
      if (soundEnabled) void playPreview();
      else { stopPreview(true); microphone.arm(); render(); }
      break;
    case 'start-extra':
      stopActivity();
      practiceMode = 'extra';
      extraCount = 0;
      nextCard(false);
      if (view === 'practice' && modeSelected) void begin(manual, true);
      break;
    case 'finish-extra': navigate('complete'); break;
    case 'export': {
      let data = JSON.stringify(progress, null, 2);
      if (preserveStoredData) { try { data = readStoredValue(STORAGE_KEY) || data; } catch { /* export current in-memory data */ } }
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `flashchords-${dayKey()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case 'reset':
      if (confirm('Reset all Flashchords progress on this device? This cannot be undone.')) {
        progress = emptyProgress(); preserveStoredData = false; storageWarning = ''; save(); openPractice();
      }
      break;
  }
});

setInterval(() => {
  if (view !== 'practice' || paused || successful || previewing) return;
  const seconds = currentSeconds();
  if (!hinted && seconds >= 20) revealHint();
  const countdown = document.querySelector('#hint-countdown');
  if (countdown && !hinted) countdown.textContent = `Fingering appears in ${Math.max(0, Math.ceil(20 - seconds))}s`;
}, 200);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (starting) {
    stopActivity();
    error = 'Setup paused when you left the app. Tap again to reconnect.';
    render();
  }
  if (view !== 'practice') return;
  const wasPreviewing = previewing;
  if (previewing) stopPreview();
  if (successful) {
    clearTimeout(transitionTimer);
    microphone.stop();
    if (practiceMode === 'extra') nextCard(false);
    else openPractice();
    return;
  }
  if (paused) {
    if (wasPreviewing) render();
    return;
  }
  elapsed = currentSeconds();
  activeSince = null;
  paused = true;
  microphone.stop();
  render();
});
window.addEventListener('pagehide', () => { microphone.stop(); chordSound.close(); });
openPractice();
showWelcome();
appReady = true;
if (!document.querySelector('#welcome-dialog')) void playPreview();
