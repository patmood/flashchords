import './style.css';
import { CHORDS, diagram } from './chords';
import { ChordMicrophone } from './audio';
import { dayKey, emptyProgress, ensureSession, loadProgress, recordAttempt, STORAGE_KEY } from './scheduler';
import type { Progress } from './scheduler';

const app = document.querySelector<HTMLDivElement>('#app')!;
const microphone = new ChordMicrophone();
let progress: Progress;
let storageWarning = '';
let preserveStoredData = false;
try { progress = loadProgress(localStorage.getItem(STORAGE_KEY)); }
catch {
  progress = emptyProgress();
  preserveStoredData = true;
  storageWarning = 'Saved progress could not be read. It has not been overwritten. You can practice without saving, or reset it in settings.';
}
let view: 'home' | 'setup' | 'practice' | 'complete' | 'progress' | 'settings' = 'home';
let manual = false;
let starting = false;
let error = '';
let currentId = '';
let hinted = false;
let elapsed = 0;
let activeSince: number | null = null;
let paused = false;
let successful = false;
let successManual = false;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

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
};
const icon = (name: string, cls = 'h-5 w-5') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function save() {
  if (preserveStoredData) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch { storageWarning = 'Your browser could not save progress. This session still works, but progress may be lost when you close the page.'; }
}

function ukuleleArt(): string {
  return `<svg viewBox="0 0 360 330" class="h-full w-full" role="img" aria-label="A sunny little ukulele with a sprig of leaves">
    <path d="M57 254c-3-40 4-66 27-86m-27 51c-20-3-28-16-24-29 18 1 29 12 24 29m12-27c-8-18-3-32 10-37 8 15 5 29-10 37" fill="#a6b299"/>
    <ellipse cx="184" cy="295" rx="94" ry="12" fill="#d2d9c2" opacity=".6"/>
    <g transform="rotate(24 180 170)">
      <path d="M156 164c-32-1-50 21-40 46-34 24-20 75 22 83 47 8 86-32 62-70 24-18 15-47-9-54l-2-87-30-1Z" fill="#d7a354" stroke="#684f36" stroke-width="3"/>
      <path d="M155 170c-27-2-43 17-33 40-34 24-17 65 19 72 38 7 72-26 51-61 24-18 13-42-9-45" fill="#eac582"/>
      <path d="M160 83V39q14-11 29 0v44" fill="#c38c4d" stroke="#684f36" stroke-width="3"/>
      <path d="M160 84h28v113h-28Z" fill="#6d573d"/>
      <g stroke="#bdad8b" stroke-width="2"><path d="M160 100h28m-28 17h28m-28 17h28m-28 17h28m-28 17h28m-28 17h28"/></g>
      <circle cx="174" cy="219" r="22" fill="#b07c3c"/><circle cx="174" cy="219" r="17" fill="#544b34"/>
      <rect x="151" y="257" width="46" height="9" rx="3" fill="#695037"/>
      <g stroke="#f9e7bd" stroke-width="1"><path d="M165 48v214m6-214v214m6-214v214m6-214v214"/></g>
      <g fill="#f5e4bf" stroke="#684f36" stroke-width="2"><rect x="151" y="44" width="9" height="8" rx="3"/><rect x="151" y="63" width="9" height="8" rx="3"/><rect x="189" y="44" width="9" height="8" rx="3"/><rect x="189" y="63" width="9" height="8" rx="3"/></g>
    </g>
    <g fill="none" stroke="#769174" stroke-width="2.5" stroke-linecap="round"><path d="m268 99 8-16 12 5-8 16m-12-5c-8-5-13 5-7 7 5 2 8-1 7-7m12 5c-8-5-13 5-7 7 5 2 8-1 7-7"/><path d="M87 87v14m-7-7h14M288 209v10m-5-5h10"/></g>
    <g fill="#d4a357"><circle cx="68" cy="133" r="3"/><circle cx="281" cy="159" r="3"/><path d="m253 57 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></g>
  </svg>`;
}

function shell(content: string): string {
  const practicing = view === 'practice';
  return `<div class="mx-auto max-w-5xl px-5 pb-[max(28px,env(safe-area-inset-bottom))] sm:px-10">
    <header class="flex h-24 items-center justify-between border-b border-ink/10 sm:h-28">
      <button data-action="home" aria-label="Little Strum home" class="flex shrink-0 items-center gap-1.5 text-lg font-bold tracking-tight sm:gap-2.5 sm:text-xl"> <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage sm:h-10 sm:w-10"><img src="${import.meta.env.BASE_URL}favicon.svg" class="h-8 w-8 sm:h-9 sm:w-9" alt="" /></span>little strum<span class="mb-3 hidden h-1.5 w-1.5 rounded-full bg-[#c39b55] sm:block"></span></button>
      ${practicing ? `<button data-action="exit" class="secondary !min-h-10 !px-3 !py-2">Save & exit</button>` : `<nav aria-label="Main navigation" class="flex gap-2 sm:gap-5">
        <button data-action="home" class="nav-button ${view === 'home' || view === 'setup' || view === 'complete' ? 'active' : ''}" ${view === 'home' ? 'aria-current="page"' : ''}>${icon('sun')}<span class="hidden sm:inline">Practice</span><span class="sr-only sm:hidden">Practice</span></button>
        <button data-action="progress" class="nav-button ${view === 'progress' ? 'active' : ''}" ${view === 'progress' ? 'aria-current="page"' : ''}>${icon('chart')}<span class="hidden sm:inline">Progress</span><span class="sr-only sm:hidden">Progress</span></button>
        <button data-action="settings" class="icon-button self-center" aria-label="Settings">${icon('gear')}</button>
      </nav>`}
    </header>
    ${storageWarning ? `<div role="alert" class="mt-5 rounded-xl bg-[#f7e7cd] p-4 text-sm">${escapeHtml(storageWarning)}</div>` : ''}
    <main id="main-content">${content}</main>
    ${practicing ? '' : `<footer class="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-ink/10 pt-6 text-xs text-ink/55"><span>A little practice. A little progress.</span><span class="flex items-center gap-1.5">${icon('leaf', 'h-3.5 w-3.5')} Made for your own pace.</span></footer>`}
  </div>`;
}

function home() {
  const session = ensureSession(progress);
  const daily = session.daily!;
  const remaining = daily.ids.filter(id => !daily.completed.includes(id));
  const newCount = remaining.filter(id => !progress.cards[id]).length;
  const reviews = remaining.length - newCount;
  const learned = Object.keys(progress.cards).length;
  const finished = remaining.length === 0;
  return `<section class="grid items-center gap-1 pb-7 pt-8 sm:grid-cols-[1.2fr_1fr] sm:gap-8 sm:pb-10 sm:pt-12">
    <div class="order-2 sm:order-1"><p class="eyebrow mb-4 flex items-center gap-2"><span class="h-1.5 w-1.5 rounded-full bg-forest"></span>Small steps, happy strums</p>
      <h1 class="font-serif text-[44px] leading-[1.07] tracking-tight sm:text-[60px]">Your next chord<br/>starts here.</h1>
      <p class="mt-5 max-w-sm text-[15px] leading-7 text-ink/65">A few chords. A few minutes. A little more music in your day. Grab your ukulele and let’s make it stick.</p>
      <div class="mt-5 flex flex-wrap gap-2"><span class="rounded-full bg-sage px-3 py-1.5 text-xs text-forest">Standard high-G · G C E A</span><span class="rounded-full border border-ink/10 px-3 py-1.5 text-xs text-ink/65">No account. Just you.</span></div>
    </div><div class="hero-art order-1 mx-auto -mt-5 h-52 w-64 sm:order-2 sm:mt-0 sm:h-80 sm:w-full">${ukuleleArt()}</div>
  </section>
  <section class="grid gap-5 sm:grid-cols-[1.6fr_1fr]">
    <div class="panel !border-[#dce4d3] !bg-[#eaf0e2] sm:!p-7">
      <div class="flex items-start justify-between"><div><p class="eyebrow">Your daily little session</p><h2 class="mt-2 font-serif text-3xl">${finished ? 'All strummed out. Nicely done.' : daily.completed.length ? 'Pick up where you left off.' : 'Make a little music.'}</h2></div><span class="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/60 text-forest">${icon(finished ? 'check' : 'sun')}</span></div>
      <p class="mb-6 mt-3 text-sm leading-6 text-ink/65">${finished ? 'Your chords are saved. Come back tomorrow for your next little session.' : `${reviews ? `${reviews} review${reviews === 1 ? '' : 's'}` : 'A fresh start'}${newCount ? ` · ${newCount} new chord${newCount === 1 ? '' : 's'}` : ''} · about ${Math.max(2, Math.ceil(remaining.length / 3))} minutes`}</p>
      <button data-action="${finished ? 'progress' : 'start'}" class="primary">${finished ? 'See your progress' : daily.completed.length ? 'Continue practice' : 'Let’s practice'} ${icon('arrow')}</button>
      <p class="mt-3 text-center text-[11px] text-ink/60">${finished ? 'Little by little is how it happens.' : 'Your mic listens for chords. Audio never leaves your device.'}</p>
    </div>
    <div class="panel flex flex-col justify-between"><div class="flex items-center gap-2 text-sm font-bold">${icon('leaf')} Growing at your pace</div><div class="my-5 flex items-end gap-1"><span class="font-serif text-5xl">${learned}</span><span class="mb-1 text-sm text-ink/55">/ 20 chords explored</span></div><div class="h-2 overflow-hidden rounded-full bg-ink/5"><div class="h-full rounded-full bg-[#8da480]" style="width:${learned / 20 * 100}%"></div></div><p class="mt-3 text-xs leading-5 text-ink/55">${learned ? 'Every return helps it stick. You’re building something good.' : 'No rush. We’ll start with a few friendly shapes.'}</p></div>
  </section>
  <section class="mt-9"><div class="mb-5 flex items-center gap-3"><h2 class="eyebrow !text-ink/55">A simple rhythm</h2><div class="h-px grow bg-ink/10"></div></div><div class="grid gap-5 sm:grid-cols-3">${[
    ['01', 'See the chord', 'Try to remember the shape. Need a hand? A hint appears after 20 seconds.'],
    ['02', 'Give it a strum', 'Play all four strings. Your microphone listens, or you can check it yourself.'],
    ['03', 'Let it sink in', 'Spaced repetition brings each chord back when you need it.'],
  ].map(([n, title, text]) => `<div class="flex gap-3"><span class="pt-1 font-serif text-lg text-[#a6ad94]">${n}</span><div><h3 class="text-sm font-bold">${title}</h3><p class="mt-1 text-xs leading-6 text-ink/60">${text}</p></div></div>`).join('')}</div></section>`;
}

function setup() {
  return `<section class="mx-auto max-w-md py-10 text-center card-enter"><div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage text-forest">${icon('mic', 'h-7 w-7')}</div><p class="eyebrow">A quick sound check</p><h1 class="mt-3 font-serif text-4xl">Ready when you are.</h1><p class="mt-4 text-sm leading-7 text-ink/65">Tune your ukulele to <strong>G–C–E–A (high G)</strong>, find a quiet spot, and keep your phone nearby. Strum all four strings evenly, then let them ring.</p><div class="panel my-6 text-left"><p class="text-sm font-bold">Your music stays yours.</p><p class="mt-2 text-xs leading-6 text-ink/65">Audio is analyzed live on this device. Nothing is recorded, stored, or uploaded. Chord checking is a helpful guide, not a perfect judge.</p></div>
    ${error ? `<p role="alert" class="mb-5 rounded-xl bg-[#f7e7cd] p-4 text-left text-sm leading-6">${escapeHtml(error)}</p>` : ''}
    <button data-action="enable-mic" class="primary" ${starting ? 'disabled' : ''}>${icon('mic')} ${starting ? 'Waiting for microphone permission…' : 'Enable microphone & begin'}</button><button data-action="manual" class="mt-3 min-h-12 w-full text-sm font-bold underline decoration-ink/25 underline-offset-4">Practice without a microphone</button><p class="mt-2 text-xs text-ink/55">Manual mode uses your own assessment.</p></section>`;
}

function currentSeconds() { return elapsed + (activeSince !== null ? (performance.now() - activeSince) / 1000 : 0); }

function practice() {
  const chord = CHORDS.find(c => c.id === currentId)!;
  const daily = progress.daily!;
  const percent = daily.completed.length / daily.ids.length * 100;
  return `<section class="mx-auto max-w-lg py-6 sm:py-9"><div class="mb-3 flex items-center justify-between text-xs text-ink/60"><span>Today’s little session</span><span>${daily.completed.length} of ${daily.ids.length} complete</span></div><div class="mb-6 h-1.5 overflow-hidden rounded-full bg-ink/10"><div class="h-full rounded-full bg-[#7d9b75] transition-all" style="width:${percent}%"></div></div>
    <div class="panel card-enter relative overflow-hidden text-center ${successful ? 'success-card !border-[#a2bf97] !bg-[#edf3e6]' : ''}">
      <p class="eyebrow">${successful ? 'That’s the one!' : progress.cards[currentId] ? 'A familiar friend' : 'Meet your next chord'}</p>
      <h1 class="my-3 font-serif text-[88px] leading-none tracking-tight sm:text-[104px]">${chord.name}</h1><p class="text-sm text-ink/60">${chord.label}</p>
      <div id="fingering" class="mt-5 ${hinted ? '' : 'hidden'}">${diagram(chord)}<p class="mx-auto mt-3 max-w-xs text-xs leading-6 text-ink/65">${chord.tip}</p></div>
      <div id="recall-space" class="${hinted ? 'hidden' : 'flex'} min-h-36 flex-col items-center justify-center"><span class="mb-3 text-[#a2ae90]">${icon('leaf', 'h-8 w-8')}</span><p class="text-sm text-ink/60">Take a breath. Find the shape.</p></div>
      ${successful ? `<div class="my-5 flex items-center justify-center gap-2 font-bold text-forest">${icon('check')} ${successManual ? 'Self-assessed. Nice practice!' : 'Lovely strum!'}</div><div class="confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${Math.cos(i * 2.4) * 210}px;--y:${Math.sin(i * 2.4) * 190}px;--r:${i * 63}deg"></i>`).join('')}</div>` : `<div class="mt-4 border-t border-ink/10 pt-5"><div class="flex min-h-7 items-center justify-center gap-3"><div id="meter" class="${manual ? 'hidden' : 'flex'} h-6 items-center gap-1" aria-hidden="true">${Array.from({ length: 7 }, () => '<i class="meter-bar h-1"></i>').join('')}</div><p id="listening-status" class="text-sm text-forest" role="status">${paused ? 'Practice paused' : manual ? 'Manual mode · self-assessed' : 'Let the strings go quiet, then strum.'}</p></div><p id="hint-countdown" class="mt-3 text-xs text-ink/50">${hinted ? 'Finger numbers are shown inside the dots.' : `Fingering appears in ${Math.max(0, Math.ceil(20 - currentSeconds()))}s`}</p></div>`}
    </div>
    <div class="mt-5" id="practice-controls">${successful ? '<p role="status" class="py-4 text-center text-sm text-forest">Progress saved for this session. On to the next…</p>' : paused ? `<button data-action="resume" class="primary" ${starting ? 'disabled' : ''}>${starting ? 'Reconnecting…' : 'Resume practice'}</button>` : `<div class="grid grid-cols-2 gap-3"><button data-action="hint" class="secondary" ${hinted ? 'disabled' : ''}>${icon('book')} ${hinted ? 'Fingering shown' : 'Show fingering'}</button><button data-action="got-it" class="secondary !border-forest/30 !text-forest">${icon('check')} I got it</button></div><p class="mt-3 text-center text-[11px] leading-5 text-ink/55">${manual ? 'Play the chord, then tap “I got it” when you’re happy with it.' : 'Not picking it up? “I got it” records a self-assessed attempt.'}</p>`}</div>
    ${error ? `<div role="alert" class="mt-4 rounded-xl bg-[#f7e7cd] p-4 text-sm">${escapeHtml(error)}<button data-action="switch-manual" class="mt-3 block font-bold underline">Use manual mode</button></div>` : ''}
  </section>`;
}

function completion() {
  const today = progress.history.filter(a => dayKey(new Date(a.at)) === dayKey());
  return `<section class="mx-auto max-w-md py-12 text-center card-enter"><div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sage text-forest">${icon('check', 'h-9 w-9')}</div><p class="eyebrow">A little better than before</p><h1 class="mt-4 font-serif text-5xl leading-tight">Look at you grow.</h1><p class="mt-5 text-sm leading-7 text-ink/65">Today’s practice is done. Your next session will bring back the chords that need a little love.</p><div class="panel my-7 grid grid-cols-2 divide-x divide-ink/10"><div><p class="font-serif text-4xl">${today.length}</p><p class="mt-2 text-xs text-ink/60">chords practiced</p></div><div><p class="font-serif text-4xl">${today.filter(a => !a.hinted).length}</p><p class="mt-2 text-xs text-ink/60">without a hint</p></div></div><button data-action="progress" class="primary">See your progress ${icon('arrow')}</button><button data-action="home" class="mt-3 min-h-12 text-sm text-ink/60">Back to your little home</button></section>`;
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
  app.innerHTML = shell(view === 'home' ? home() : view === 'setup' ? setup() : view === 'practice' ? practice() : view === 'complete' ? completion() : view === 'progress' ? progressPage() : settings());
  if (focus) {
    const main = document.querySelector<HTMLElement>('main')!;
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function stopActivity() {
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

function nextCard() {
  const remaining = progress.daily!.ids.filter(id => !progress.daily!.completed.includes(id));
  if (!remaining.length) { navigate('complete'); return; }
  currentId = remaining[0];
  elapsed = 0;
  activeSince = performance.now();
  hinted = false;
  successful = false;
  paused = false;
  microphone.arm();
  view = 'practice';
  render(true);
}

function revealHint() {
  if (hinted || successful || paused || view !== 'practice') return;
  hinted = true;
  render();
}

function succeed(selfAssessed: boolean) {
  if (view !== 'practice' || successful || paused) return;
  // The time threshold still counts as a hint if a tap beats the UI timer tick.
  if (currentSeconds() >= 20) hinted = true;
  progress = recordAttempt(progress, { chordId: currentId, hinted, manual: selfAssessed, seconds: currentSeconds() });
  save();
  activeSince = null;
  successManual = selfAssessed;
  successful = true;
  render();
  transitionTimer = setTimeout(nextCard, 1400);
}

function onAudioFrame(d: { chordId: string | null; level: number; listening: boolean }) {
  if (view !== 'practice' || paused || successful) return;
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
  paused = true;
  error = message;
  render();
}

async function begin(useManual: boolean, resume = false) {
  if (starting && !useManual) return;
  if (starting) stopActivity();
  manual = useManual;
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
  if (resume) {
    paused = false;
    activeSince = performance.now();
    render();
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
    case 'home': case 'exit': navigate('home'); break;
    case 'progress': navigate('progress'); break;
    case 'settings': navigate('settings'); break;
    case 'start': navigate('setup'); break;
    case 'enable-mic': void begin(false); break;
    case 'manual': void begin(true); break;
    case 'resume': void begin(manual, true); break;
    case 'switch-manual': microphone.stop(); void begin(true, true); break;
    case 'hint': revealHint(); break;
    case 'got-it': succeed(true); break;
    case 'export': {
      let data = JSON.stringify(progress, null, 2);
      if (preserveStoredData) { try { data = localStorage.getItem(STORAGE_KEY) || data; } catch { /* export current in-memory data */ } }
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `little-strum-${dayKey()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case 'reset':
      if (confirm('Reset all Little Strum progress on this device? This cannot be undone.')) {
        progress = emptyProgress(); preserveStoredData = false; storageWarning = ''; save(); render();
      }
      break;
  }
});

setInterval(() => {
  if (view !== 'practice' || paused || successful) return;
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
  if (successful) {
    clearTimeout(transitionTimer);
    microphone.stop();
    view = 'home';
    render();
    return;
  }
  if (paused) return;
  elapsed = currentSeconds();
  activeSince = null;
  paused = true;
  microphone.stop();
  render();
});
window.addEventListener('pagehide', () => microphone.stop());
render();
