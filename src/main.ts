import './style.css';
import { TUNING, detectString, frequencyForMidi } from './tuner';
import { CHORDS, diagram } from './chords';
import { ChordMicrophone } from './audio';
import { acceptIntroduction, dayKey, deferIntroduction, emptyProgress, ensureSession, loadProgress, needsIntroduction, nextExtraChord, nextFamiliarChord, recordAttempt, STORAGE_KEY } from './scheduler';
import type { Progress } from './scheduler';
import { readStoredValue, WELCOME_KEY } from './storage';
import { ChordSound, SOUND_KEY } from './sounds';

const HINT_SECONDS = 15;

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
let view: 'practice' | 'complete' | 'progress' | 'settings' | 'break' | 'tuning' = 'practice';
let introId = '';
let introResume = false;
let currentIsSpacer = false;
let micEnabled = false;
let micStarting = false;
let handsFreeWanted = false;
let micRequest = 0;
let micError = '';
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
  tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
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
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
};
const icon = (name: string, cls = 'h-5 w-5') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function mascot(className: string): string {
  return `<svg class="${className}" viewBox="0 0 100 110" fill="none" aria-hidden="true">
    <path d="m16 19 2.5 6 6 2.5-6 2.5-2.5 6-2.5-6L7 27.5l6.5-2.5Z" fill="#ffc94f"/>
    <path d="m81 48 3-6 7 2-3 7m-7-3c-6-3-10 4-5 6 4 1 6-2 5-6m7 3c-6-3-10 4-5 6 4 1 6-2 5-6" stroke="#27b9b0" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="50" cy="103" rx="25" ry="4" fill="#c6e8f5"/>
    <path d="m27 70-9-5m55 5 9-7M39 95l-4 6m26-6 4 6" stroke="#bf8a23" stroke-width="4" stroke-linecap="round"/>
    <path d="M39 45c-12 2-15 13-9 22-12 12-6 29 9 32 22 5 39-14 28-29 8-11 4-21-9-24V12H41Z" fill="#ffd66e" stroke="#eeb747" stroke-width="2.5"/>
    <rect x="40" y="7" width="20" height="21" rx="5" fill="#eda951"/>
    <path d="M43 27h14v27H43Z" fill="#dc9a49"/><path d="M44 33h12m-12 8h12m-12 8h12" stroke="#f8d199" stroke-width="2"/>
    <path d="M46 15v39m5-39v39m4-39v39" stroke="#fff2c6" stroke-width="1.2"/>
    <path d="M35 11h4m-4 9h4m22-9h4m-4 9h4" stroke="#bc8137" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="37" cy="76" rx="5" ry="3" fill="#ffa27f"/><ellipse cx="64" cy="76" rx="5" ry="3" fill="#ffa27f"/>
    <ellipse cx="40" cy="70" rx="2.7" ry="3.8" fill="#674d36"/><ellipse cx="61" cy="70" rx="2.7" ry="3.8" fill="#674d36"/>
    <path d="M45 80q6 7 12 0" stroke="#674d36" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M43 91h14" stroke="#bc8137" stroke-width="4" stroke-linecap="round"/>
    <path d="m77 15 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" fill="#a696ec"/>
  </svg>`;
}

function save() {
  if (preserveStoredData) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch { storageWarning = 'Your browser could not save progress. This session still works, but progress may be lost when you close the page.'; }
}

function shell(content: string): string {
  return `<div class="app-frame mx-auto max-w-5xl px-5 pb-[max(28px,env(safe-area-inset-bottom))] sm:px-10">
    <header class="app-header flex h-20 items-center justify-between">
      <button data-action="practice" aria-label="Flashchords practice" class="brand flex shrink-0 items-center gap-1.5 text-lg sm:gap-2.5 sm:text-xl"> <span class="brand-logo flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10"><img src="${import.meta.env.BASE_URL}favicon.svg" class="h-9 w-9 sm:h-10 sm:w-10" alt="" /></span>flashchords<span class="brand-dot mb-3 hidden h-1.5 w-1.5 rounded-full sm:block"></span></button>
      <nav aria-label="Main navigation" class="flex gap-2 sm:gap-5">
        <button data-action="practice" class="nav-button ${view === 'practice' || view === 'complete' ? 'active' : ''}" ${view === 'practice' ? 'aria-current="page"' : ''}>${icon('sun')}<span class="hidden sm:inline">Practice</span><span class="sr-only sm:hidden">Practice</span></button>
        <button data-action="progress" class="nav-button ${view === 'progress' ? 'active' : ''}" ${view === 'progress' ? 'aria-current="page"' : ''}>${icon('chart')}<span class="hidden sm:inline">Progress</span><span class="sr-only sm:hidden">Progress</span></button>
        <button data-action="tuning" class="nav-button ${view === 'tuning' ? 'active' : ''}" ${view === 'tuning' ? 'aria-current="page"' : ''} aria-label="Tuner">${icon('tune')}<span class="hidden sm:inline">Tune</span></button>
        <button data-action="settings" class="icon-button self-center" aria-label="Settings">${icon('gear')}</button>
      </nav>
    </header>
    <div class="handsfree-toolbar"><span class="handsfree-indicator ${micEnabled ? 'is-listening' : ''}">${micEnabled ? '● Microphone enabled' : 'Chord recognition'}</span><button data-action="hands-free" class="handsfree-toggle" ${micStarting ? 'disabled' : ''}>${micStarting ? 'Connecting…' : micEnabled ? 'Turn mic off' : 'Enable microphone'}</button></div>
    ${micError ? `<p role="alert" class="mb-3 rounded-xl bg-[#fff1d5] p-3 text-xs">${escapeHtml(micError)}</p>` : ''}
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
  dialog.innerHTML = `${mascot('welcome-mascot')}
    <h2 id="welcome-title" class="font-serif text-3xl">Welcome to Flashchords.</h2>
    <div id="welcome-description" class="mt-4 space-y-3 text-sm leading-6 text-ink/70"><p>Meet each new chord, then try it from memory. A fingering hint appears after <strong>15 seconds</strong>.</p><p>Use a tuned <strong>high-G ukulele (G–C–E–A)</strong>. Enable the microphone to recognize your playing. Play the chord shown in a new-chord introduction to continue. Audio stays on your device.</p><p>Not ready for a new chord? Play three familiar cards, then try again.</p></div>
    <label class="my-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input id="hide-welcome" type="checkbox" class="h-5 w-5 accent-forest" />Don’t show again</label>
    <button data-action="tuning" class="secondary mb-3 w-full">Tune your ukulele</button>
    <button id="dismiss-welcome" data-action="welcome-dismiss" class="primary" autofocus>Let’s play</button>
    <button data-action="hands-free" class="secondary mt-3 w-full">Enable hands-free</button><p class="dialog-listening mt-3 text-center text-xs" role="status"></p>`;
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
    if (!maybeShowIntroduction()) void playPreview();
    refreshMicrophoneStatus();
    document.querySelector<HTMLElement>('[data-action="enable-mic"], main button')?.focus();
  };
  dialog.querySelector('#dismiss-welcome')!.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  document.body.append(dialog);
  dialog.showModal();
  refreshMicrophoneStatus();
}

function refreshMicrophoneStatus() {
  document.querySelectorAll<HTMLElement>('.dialog-listening').forEach(el => {
    el.textContent = previewing ? 'Playing the reference. Listening resumes afterward.' : micStarting ? 'Connecting microphone…' : micError || (micEnabled ? introId ? `Play ${CHORDS.find(c => c.id === introId)!.label} to continue.` : 'Microphone ready for chord recognition.' : 'Tap Enable hands-free once, or use the buttons normally.');
  });
  document.querySelectorAll<HTMLButtonElement>('dialog [data-action="hands-free"]').forEach(button => {
    button.disabled = micStarting;
    const text = micEnabled ? 'Turn hands-free off' : 'Enable hands-free';
    if (button.firstChild?.nodeType === Node.TEXT_NODE) button.firstChild.textContent = text;
  });
}

function closeIntroduction() {
  document.querySelector<HTMLDialogElement>('#introduction-dialog')?.close();
  document.querySelector('#introduction-dialog')?.remove();
  introId = '';
  stopPreview();
  microphone.arm();
}

function maybeShowIntroduction(): boolean {
  if (view !== 'practice' || !needsIntroduction(progress, currentId)) return false;
  if (document.querySelector('#welcome-dialog')) return true;
  if (document.querySelector('#introduction-dialog')) return true;
  introId = currentId;
  introResume = hasStarted;
  elapsed = currentSeconds();
  activeSince = null;
  paused = true;
  const chord = CHORDS.find(c => c.id === introId)!;
  const dialog = document.createElement('dialog');
  dialog.id = 'introduction-dialog';
  dialog.className = 'welcome-dialog introduction-dialog panel';
  dialog.setAttribute('aria-labelledby', 'intro-title');
  dialog.innerHTML = `<p class="eyebrow text-center">A new chord to meet</p><h2 id="intro-title" class="mt-2">Meet ${chord.label}.</h2>
    <div class="intro-fingering my-3">${diagram(chord)}</div><p class="mb-3 text-center text-xs leading-5 text-ink/70">${chord.tip}</p>
    <button data-action="play-chord" class="secondary mx-auto mb-4" aria-label="Play ${chord.label}">${icon('speaker')}Hear chord</button>
    <div class="grid grid-cols-2 gap-3"><button data-action="intro-accept" class="primary intro-choice"><span>I’m ready</span></button><button data-action="intro-defer" class="secondary intro-choice"><span>I’m not ready</span></button></div>
    <p class="mt-3 text-center text-xs text-ink/70">Play ${chord.label} to continue, or choose “I’m not ready” for three familiar-card reviews before we ask again.</p><button data-action="hands-free" class="secondary mt-3 w-full">Enable hands-free</button><p class="dialog-listening mt-3 text-center text-xs" role="status"></p>`;
  dialog.addEventListener('cancel', event => { event.preventDefault(); deferCurrentIntroduction(); });
  document.body.append(dialog);
  dialog.showModal();
  microphone.arm();
  refreshMicrophoneStatus();
  void playPreview();
  return true;
}

function acceptCurrentIntroduction() {
  if (!introId) return;
  progress = acceptIntroduction(progress, introId);
  save();
  const resume = introResume;
  closeIntroduction();
  paused = !resume;
  hasStarted = resume;
  activeSince = resume ? performance.now() : null;
  render(true);
}

function deferCurrentIntroduction() {
  if (!introId) return;
  progress = deferIntroduction(progress, introId);
  save();
  const resume = introResume;
  closeIntroduction();
  nextCard(resume);
}

function breakPage() {
  return `<section class="mx-auto max-w-md py-9 text-center">${mascot('completion-mascot')}<h1 class="text-3xl">Take a breather.</h1><p class="my-5 text-sm leading-7 text-ink/70">There aren’t any familiar chords to review yet. No pressure—try the introduction again whenever you’re ready. Nothing has been marked learned or failed.</p><button data-action="retry-intro" class="primary">Try the new chord again</button><button data-action="progress" class="secondary mt-3 w-full">See your progress</button></section>`;
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
  const hintStatus = previewing ? 'Listen first. Your practice timer is paused.' : !hasStarted ? 'Choose a practice mode below to begin.' : hinted ? 'Finger numbers are shown inside the dots.' : `Fingering appears in ${Math.max(0, Math.ceil(HINT_SECONDS - currentSeconds()))}s`;
  return `<section class="mx-auto max-w-lg py-6 sm:py-9">${practiceMode === 'extra'
    ? `<div class="session-heading !mb-6"><span class="session-label">${icon('bolt', 'h-4 w-4')}<span>Extra practice · no finish line</span></span><span>${extraCount} played</span></div>`
    : `<div class="session-heading"><span class="session-label">${icon('bolt', 'h-4 w-4')}Today’s session</span><span>${daily.completed.length} of ${daily.ids.length} complete</span></div><div class="session-progress" role="progressbar" aria-label="Daily session" aria-valuenow="${daily.completed.length}" aria-valuemin="0" aria-valuemax="${daily.ids.length}"><div class="session-progress-fill" style="width:${percent}%"></div></div>`}
    <div class="card-deck"><div class="panel study-card relative overflow-hidden text-center ${successful ? 'success-card' : ''}">
      <div class="card-topline"><p class="eyebrow card-tag">${successful ? 'That’s the one!' : progress.cards[currentId] ? 'Memory boost' : 'New chord'}</p><span class="card-sparkle">${icon('star', 'h-5 w-5')}</span></div>
      <h1 class="chord-name">${chord.name}</h1><p class="chord-label">${chord.label}</p>
      ${successful ? `<div id="success-fingering" class="success-diagram mx-auto mt-4">${diagram(chord)}</div>` : `<div class="sound-controls"><button data-action="play-chord" class="flex min-h-11 items-center gap-2" aria-label="Play ${chord.label}" ${previewing ? 'disabled' : ''}>${icon('speaker', 'h-4 w-4')}Hear chord</button><button data-action="toggle-sound" class="min-h-11" aria-label="Turn automatic chord sound ${soundEnabled ? 'off' : 'on'}" aria-pressed="${soundEnabled}">Auto sound ${soundEnabled ? 'on' : 'off'}</button></div>`}
      <div id="fingering" class="mt-5 ${hinted && !successful ? '' : 'hidden'}">${diagram(chord)}<p class="mx-auto mt-3 max-w-xs text-xs leading-6 text-ink/65">${chord.tip}</p></div>
      <div id="recall-space" class="recall-area ${hinted || successful ? 'hidden' : 'flex'} min-h-24 flex-col items-center justify-center">${mascot('recall-buddy')}<p class="recall-copy">Your turn to make some music!</p></div>
      ${successful ? `<div class="success-message my-5 flex items-center justify-center gap-2 font-bold">${icon('check')} ${successManual ? 'Self-assessed. Nice practice!' : 'Lovely strum!'}</div><div class="confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${Math.cos(i * 2.4) * 210}px;--y:${Math.sin(i * 2.4) * 190}px;--r:${i * 63}deg"></i>`).join('')}</div>` : `<div class="listening-panel mt-4 pt-4"><div class="flex min-h-7 items-center justify-center gap-3"><div id="meter" class="${manual || paused || previewing ? 'hidden' : 'flex'} h-6 items-center gap-1" aria-hidden="true">${Array.from({ length: 7 }, () => '<i class="meter-bar h-1"></i>').join('')}</div><p id="listening-status" class="text-sm text-forest" role="status">${listeningStatus}</p></div><p id="hint-countdown" class="mt-2 text-xs text-ink/60">${hintStatus}</p></div>`}
    </div></div>
    <div class="mt-5" id="practice-controls">${successful ? '<p role="status" class="py-4 text-center text-sm font-bold text-forest">Progress saved for this session. On to the next…</p>' : !hasStarted ? `<button data-action="enable-mic" class="primary" ${starting ? 'disabled' : ''}>${icon('mic')} ${starting ? 'Waiting for microphone permission…' : 'Enable microphone & begin'}</button><button data-action="manual" class="manual-button mt-2 min-h-12 w-full text-sm font-bold">Practice without a microphone</button>` : paused ? `<button data-action="resume" class="primary" ${starting ? 'disabled' : ''}>${starting ? 'Reconnecting…' : 'Resume practice'}</button>` : `<div class="grid grid-cols-2 gap-3"><button data-action="hint" class="secondary" ${hinted || previewing ? 'disabled' : ''}>${icon('book')} ${hinted ? 'Fingering shown' : 'Show fingering'}</button><button data-action="got-it" class="secondary answer-button" ${previewing ? 'disabled' : ''}>${icon('check')} I got it</button></div><p class="mt-3 text-center text-[11px] leading-5 text-ink/65">${manual ? 'Play the chord, then tap “I got it” when you’re happy with it.' : 'Not picking it up? “I got it” records a self-assessed attempt.'}</p>`}</div>
    ${error ? `<div role="alert" class="mt-4 rounded-xl bg-[#f7e7cd] p-4 text-sm">${escapeHtml(error)}${hasStarted ? '<button data-action="switch-manual" class="mt-3 block font-bold underline">Use manual mode</button>' : ''}</div>` : ''}
    ${practiceMode === 'extra' ? '<button data-action="finish-extra" class="mt-4 min-h-12 w-full text-sm text-ink/65 underline underline-offset-4">Finish extra practice</button><p class="text-center text-[11px] leading-5 text-ink/55">Due reviews first. A new chord after every 3 extra reviews when nothing is due. Stop whenever you like.</p>' : ''}
  </section>`;
}

function completion() {
  const today = progress.history.filter(a => dayKey(new Date(a.at)) === dayKey());
  return `<section class="completion-page mx-auto max-w-md py-9 text-center card-enter">${mascot('completion-mascot')}<p class="eyebrow">Daily session? Nailed it.</p><h1 class="mt-3 font-serif text-5xl leading-tight">Look at you grow.</h1><p class="mt-4 text-sm leading-7 text-ink/70">Your daily session is complete. That’s enough for today—or keep strumming for as long as you like.</p><div class="panel my-6 grid grid-cols-2 divide-x-2 divide-ink/10"><div><p class="font-serif text-4xl text-forest">${today.length}</p><p class="mt-2 text-xs font-bold text-ink/65">strums practiced today</p></div><div><p class="font-serif text-4xl text-[#8460c9]">${today.filter(a => !a.hinted).length}</p><p class="mt-2 text-xs font-bold text-ink/65">without a hint</p></div></div>${Object.keys(progress.cards).length ? `<button data-action="start-extra" class="primary">Keep practising ${icon('arrow')}</button><p class="mb-3 mt-2 text-xs leading-6 text-ink/65">More reviews, with new chords introduced gradually. Stop whenever you like.</p>` : ''}<button data-action="progress" class="secondary w-full">See your progress ${icon('chart')}</button></section>`;
}

function progressPage() {
  const learned = Object.keys(progress.cards).length;
  const counts = [learned, progress.history.length, progress.history.filter(a => !a.hinted).length];
  const tileColors = [['#e5f4ff', '#bcdef5'], ['#fff5d5', '#eddca3'], ['#f0eaff', '#d8c9f6'], ['#e3f8f2', '#b7e4d6']];
  return `<section class="py-9"><p class="eyebrow">Every strum counts</p><h1 class="mt-3 font-serif text-4xl">Your growing chord garden.</h1><p class="mt-3 max-w-lg text-sm leading-7 text-ink/65">Explored doesn’t mean mastered. Each return helps the shape feel a little more like second nature.</p>
    <div class="my-7 grid grid-cols-3 gap-2 sm:gap-5">${['chords explored', 'total attempts', 'without hints'].map((label, i) => `<div class="panel stat-tile !rounded-2xl !p-4"><p class="font-serif text-3xl sm:text-4xl">${counts[i]}</p><p class="mt-2 text-[11px] font-bold text-ink/70 sm:text-xs">${label}</p></div>`).join('')}</div>
    <h2 class="mb-4 text-sm font-bold">Your 20 starter chords</h2><div class="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3">${CHORDS.map((chord, index) => {
      const card = progress.cards[chord.id];
      const due = card && card.due <= new Date();
      const [background, border] = tileColors[index % tileColors.length];
      return `<div class="collection-tile text-center ${card ? 'is-learned' : ''} ${due ? 'is-due' : ''}" style="--tile-bg:${background};--tile-border:${border}"><p class="font-serif text-2xl">${chord.name}</p><p class="mt-2 text-[10px] text-ink/70">${card ? due ? 'Due for a return' : `Next: ${card.due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Coming soon'}</p></div>`;
    }).join('')}</div><div class="panel mt-7"><div class="flex items-center gap-2 text-sm font-bold">${icon('clock')} A smarter time to return</div><p class="mt-3 text-xs leading-6 text-ink/65">FSRS schedules reviews with a 90% target recall rate. Needing a fingering hint means “Again”; an unassisted answer is “Hard” after 12 seconds, “Good” from 5–12 seconds, and “Easy” within 5 seconds. Daily sessions include due reviews first, then up to 3 new chords, with 15 cards maximum.</p><p class="mt-2 text-xs leading-6 text-ink/65">Self-assessed attempts use the same timing rules. Hinted chords return in a later daily session. These automatic grades are useful estimates, not a measurement of musical ability.</p></div>
  </section>`;
}

function tuningPage() {
  return `<section class="tuner-page mx-auto max-w-lg py-6 sm:py-9"><p class="eyebrow">A little tune-up</p><h1 class="mt-3 text-4xl">Tune your ukulele.</h1><p class="mt-3 text-sm leading-6 text-ink/70">Pluck any open string. We’ll find it for you.</p>
    <div class="tuner-display panel mt-5">
      <p class="eyebrow">${micEnabled ? 'Automatic string detection' : 'Standard high-G · G–C–E–A'}</p>
      <div id="tuning-note" class="tuner-note" aria-hidden="true">—</div>
      <p id="tuning-reading" class="tuner-reading" role="status">${micEnabled ? 'Pluck any open string.' : 'Enable the microphone to tune.'}</p>
      <p id="tuning-detail" class="tuner-detail">One string at a time, with no frets held.</p>
      <div class="tuning-track" aria-hidden="true"><span id="tuning-needle" hidden></span></div>
      <div class="tuner-scale"><span>Flat · tighten</span><span>In tune</span><span>Sharp · loosen</span></div>
    </div>
    <div class="tuner-strings" role="group" aria-label="Ukulele strings">${TUNING.map(target => `<div class="tuner-string" data-tuning-note="${target.note}">
      <div class="string-note">${target.note[0]}<small>${target.note[1]}</small></div>
      <div class="string-body"><div class="string-caption"><span>String ${target.string}</span><span class="string-state">${frequencyForMidi(target.midi).toFixed(2)} Hz</span></div><div class="string-wire" style="--string-width:${target.string === 3 ? 4 : target.string === 2 ? 3 : 2}px"></div></div>
      <button data-action="tuning-reference" data-string="${target.string}" class="string-play" aria-label="Hear ${target.note}">${icon('speaker', 'h-4 w-4')}</button>
    </div>`).join('')}</div>
    <p class="mt-3 text-center text-xs leading-5 text-ink/65">Tap a speaker to hear a reference note. Let it finish before plucking.</p>
    <button data-action="hands-free" class="primary mt-5" ${micStarting ? 'disabled' : ''}>${icon('mic')}${micStarting ? 'Connecting…' : micEnabled ? 'Turn microphone off' : 'Enable microphone'}</button><button data-action="practice" class="secondary mt-3 w-full">Back to practice</button></section>`;
}

function updateTuningReading(frequency: number | null) {
  const match = frequency === null ? null : detectString(frequency);
  const reading = document.querySelector<HTMLElement>('#tuning-reading');
  const note = document.querySelector<HTMLElement>('#tuning-note');
  const detail = document.querySelector<HTMLElement>('#tuning-detail');
  const needle = document.querySelector<HTMLElement>('#tuning-needle');
  if (!reading || !note || !detail || !needle) return;
  const inTune = match !== null && Math.abs(match.cents) <= 5;
  const direction = match ? inTune ? 'In tune' : match.cents < 0 ? 'Too flat · tighten' : 'Too sharp · loosen' : '';
  note.textContent = match ? match.target.note : '—';
  note.classList.toggle('is-tuned', inTune);
  reading.textContent = match ? `${match.target.note} · ${direction}` : 'Pluck any open string.';
  detail.textContent = match ? `${Math.round(match.cents) > 0 ? '+' : ''}${Math.round(match.cents)} cents · ${frequency!.toFixed(1)} Hz` : 'One string at a time, with no frets held.';
  needle.hidden = !match;
  needle.style.left = `${50 + Math.max(-50, Math.min(50, match?.cents ?? 0))}%`;
  needle.classList.toggle('is-tuned', inTune);
  document.querySelectorAll<HTMLElement>('[data-tuning-note]').forEach(row => {
    const active = row.dataset.tuningNote === match?.target.note;
    row.classList.toggle('is-active', active);
    row.classList.toggle('is-tuned', active && inTune);
    const target = TUNING.find(target => target.note === row.dataset.tuningNote)!;
    row.querySelector('.string-state')!.textContent = active ? direction : `${frequencyForMidi(target.midi).toFixed(2)} Hz`;
  });
}

async function playTuningReference(stringNumber: number) {
  const target = TUNING.find(target => target.string === stringNumber);
  if (!target) return;
  stopPreview();
  const token = ++previewRequest;
  previewing = true;
  updateTuningReading(null);
  document.querySelector('#tuning-note')!.textContent = target.note;
  document.querySelector('#tuning-reading')!.textContent = 'Playing reference…';
  document.querySelector('#tuning-detail')!.textContent = `Listen to ${target.note}, then try your string.`;
  await chordSound.playNote(frequencyForMidi(target.midi));
  if (token !== previewRequest) return;
  previewing = false;
  if (view === 'tuning') render();
}

function settings() {
  return `<section class="mx-auto max-w-xl py-9"><p class="eyebrow">Keep it simple</p><h1 class="mt-3 font-serif text-4xl">Your little setup.</h1><div class="panel mt-7 space-y-6"><div><h2 class="text-sm font-bold">Standard high-G ukulele</h2><p class="mt-2 text-sm leading-6 text-ink/65">G4 · C4 · E4 · A4. Soprano, concert, or tenor. Low-G and baritone tuning aren’t supported in this version.</p></div><div><h2 class="text-sm font-bold">Private by design</h2><p class="mt-2 text-sm leading-6 text-ink/65">Progress lives only in this browser’s local storage. Clearing site data clears it too. Audio is never recorded or sent anywhere. Use the same browser and device to keep learning.</p></div><div><h2 class="text-sm font-bold">A forgiving listening buddy</h2><p class="mt-2 text-sm leading-6 text-ink/65">Tune first, reduce background noise, and strum all four strings. Similar chords or noisy rooms can confuse recognition. You can always self-assess with “I got it”.</p></div></div><div class="panel mt-5"><h2 class="text-sm font-bold">Your progress</h2><p class="mb-4 mt-2 text-sm leading-6 text-ink/65">Keep a copy of your progress, or start fresh on this device.</p><button data-action="export" class="secondary w-full">Download progress backup</button><button data-action="reset" class="mt-3 min-h-12 w-full text-sm text-[#9a4937] underline underline-offset-4">Reset all progress</button></div></section>`;
}

function render(focus = false) {
  app.innerHTML = shell(view === 'practice' ? practice() : view === 'complete' ? completion() : view === 'progress' ? progressPage() : view === 'break' ? breakPage() : view === 'tuning' ? tuningPage() : settings());
  refreshMicrophoneStatus();
  if (focus) {
    const main = document.querySelector<HTMLElement>('main')!;
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function stopActivity() {
  closeIntroduction();
  stopPreview();
  requestId++;
  starting = false;
  microphone.arm();
  clearTimeout(transitionTimer);
  activeSince = null;
}

function navigate(next: typeof view) {
  stopActivity();
  if (view === 'practice') paused = true;
  if (view === 'tuning') disconnectMicrophone();
  error = '';
  view = next;
  render(true);
}

function openPractice() {
  if (view === 'tuning') disconnectMicrophone();
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
  const waiting = Object.values(progress.deferred || {}).some(count => count > progress.history.length);
  const readyDeferred = remaining.find(id => progress.deferred?.[id] !== undefined && progress.deferred[id] <= progress.history.length);
  let nextId: string | null = practiceMode === 'extra' ? nextExtraChord(progress, currentId) : readyDeferred || remaining[0] || null;
  currentIsSpacer = waiting && (!nextId || needsIntroduction(progress, nextId));
  if (currentIsSpacer) nextId = nextFamiliarChord(progress, currentId);
  if (!nextId && waiting) { navigate('break'); return; }
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
  if (appReady && !document.querySelector('#welcome-dialog') && !maybeShowIntroduction()) void playPreview();
}

function revealHint() {
  if (hinted || successful || paused || previewing || view !== 'practice') return;
  hinted = true;
  render();
}

function succeed(selfAssessed: boolean) {
  if (view !== 'practice' || successful || paused || previewing || introId) return;
  // The time threshold still counts as a hint if a tap beats the UI timer tick.
  if (currentSeconds() >= HINT_SECONDS) hinted = true;
  progress = recordAttempt(progress, { chordId: currentId, hinted, manual: selfAssessed, seconds: currentSeconds(), extra: practiceMode === 'extra' || currentIsSpacer });
  if (practiceMode === 'extra') extraCount++;
  save();
  activeSince = null;
  successManual = selfAssessed;
  successful = true;
  render();
  transitionTimer = setTimeout(() => nextCard(), 1400);
}

function onAudioFrame(d: { chordId: string | null; level: number; listening: boolean; frequency?: number | null }) {
  if (document.hidden || previewing || starting || micStarting) return;
  if (view === 'tuning') {
    updateTuningReading(d.frequency ?? null);
    return;
  }
  const modal = document.querySelector('dialog[open]');
  if (!modal && view === 'practice' && !paused && !successful && d.chordId === currentId) {
    succeed(false);
    return;
  }
  if (modal?.id === 'introduction-dialog' && introId && d.chordId === introId) {
    acceptCurrentIntroduction();
    return;
  }
  if (modal || view !== 'practice' || paused || successful) return;
  const status = document.querySelector('#listening-status');
  if (status) status.textContent = !d.listening ? 'Let the strings go quiet, then strum.' : d.level < .008 ? 'Listening for your strum…' : 'Listening… let all four strings ring.';
  document.querySelectorAll<HTMLElement>('.meter-bar').forEach((bar, i) => {
    bar.style.height = `${4 + Math.min(20, d.level * 300) * (.4 + .6 * Math.sin(i * 1.7) ** 2)}px`;
  });
}

function audioError(message: string) {
  micEnabled = false;
  micStarting = false;
  micError = message;
  if (view === 'practice') {
    elapsed = currentSeconds();
    activeSince = null;
    stopPreview();
    paused = true;
  }
  render();
}

function disconnectMicrophone(keepWanted = false) {
  micRequest++;
  micEnabled = false;
  micStarting = false;
  if (!keepWanted) handsFreeWanted = false;
  microphone.stop();
}

async function enableHandsFree(): Promise<boolean> {
  handsFreeWanted = true;
  if (soundEnabled) void chordSound.unlock();
  if (micEnabled) { microphone.arm(); return true; }
  if (micStarting) return false;
  const token = ++micRequest;
  micStarting = true;
  micError = '';
  render();
  try {
    await microphone.start(onAudioFrame, audioError, view === 'tuning');
    if (token !== micRequest || document.hidden) return false;
    micEnabled = true;
    manual = false;
    micStarting = false;
    microphone.arm();
    render();
    return true;
  } catch (e) {
    if (token !== micRequest) return false;
    micStarting = false;
    micEnabled = false;
    micError = e instanceof Error && e.name === 'NotAllowedError'
      ? 'Microphone access was not allowed. Enable it in your browser’s site settings, or use the buttons manually.'
      : e instanceof Error ? e.message : 'Could not start your microphone. Use the buttons manually.';
    render();
    return false;
  }
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
    const connected = await enableHandsFree();
    if (token !== requestId) return;
    starting = false;
    if (!connected) { render(); return; }
  } else {
    disconnectMicrophone();
    micError = '';
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

document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button || button.disabled) return;
  microphone.arm();
  switch (button.dataset.action) {
    case 'practice':
      if (view !== 'practice') openPractice();
      break;
    case 'tuning': {
      document.querySelector<HTMLDialogElement>('#welcome-dialog')?.remove();
      disconnectMicrophone();
      navigate('tuning');
      break;
    }
    case 'tuning-reference': void playTuningReference(Number(button.dataset.string)); break;
    case 'progress': navigate('progress'); break;
    case 'settings': navigate('settings'); break;
    case 'hands-free':
      if (micEnabled) { disconnectMicrophone(); render(); }
      else void enableHandsFree();
      break;
    case 'intro-accept': acceptCurrentIntroduction(); break;
    case 'intro-defer': deferCurrentIntroduction(); break;
    case 'retry-intro':
      progress = { ...progress, deferred: {} };
      save();
      nextCard(modeSelected);
      break;
    case 'enable-mic': void begin(false); break;
    case 'manual': void begin(true); break;
    case 'resume': void begin(manual, true); break;
    case 'switch-manual': disconnectMicrophone(); void begin(true, true); break;
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
  if (!hinted && seconds >= HINT_SECONDS) revealHint();
  const countdown = document.querySelector('#hint-countdown');
  if (countdown && !hinted) countdown.textContent = `Fingering appears in ${Math.max(0, Math.ceil(HINT_SECONDS - seconds))}s`;
}, 200);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (handsFreeWanted && !micEnabled && !micStarting) void enableHandsFree();
    return;
  }
  disconnectMicrophone(true);
  if (view === 'tuning') { stopPreview(); render(); }
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
    disconnectMicrophone(true);
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
  disconnectMicrophone(true);
  render();
});
window.addEventListener('pagehide', () => { disconnectMicrophone(true); chordSound.close(); });
openPractice();
showWelcome();
appReady = true;
if (!document.querySelector('#welcome-dialog') && !maybeShowIntroduction()) void playPreview();
