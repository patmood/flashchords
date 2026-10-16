# Flashchords

A mobile-first ukulele practice app. TypeScript, Tailwind CSS, and Vite; no backend, accounts, remote fonts, or audio uploads.

## Run locally

Use Node **22.12+**, 24+, or 26+.

```sh
npm ci
npm run dev
```

Microphone access works on `localhost` or HTTPS. Opening the dev server’s plain HTTP LAN address on a phone will generally **not** allow microphone access; use an HTTPS tunnel or deploy to GitHub Pages. Manual mode works without a microphone.

```sh
npm test             # Scheduling, persistence, and synthetic audio tests
npm run build        # Type-check + production bundle in docs/
npm run preview      # Preview the production build
npx playwright install chromium
npm run test:e2e     # Mobile-browser interaction tests
```

## Deploy to GitHub Pages

### Git hook

This repository includes a versioned pre-commit hook that runs `npm run build`.
A failed type-check or static build blocks the commit. After a successful build,
the hook stages `docs/` automatically so each commit includes the current static
site for GitHub Pages. Avoid committing unrelated changes while app edits are
unfinished: the hook builds the current working tree, including unstaged edits.

Enable the hook after cloning (Git does not copy local hook configuration):

```sh
git config core.hooksPath .githooks
```

### Publish

1. Create a GitHub repository and push this project to its `main` branch.
2. In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**.
3. Select the **main** branch and **/docs** folder, then save.

Repository: https://github.com/patmood/flashchords

Live site: https://patmood.github.io/flashchords/

The committed `docs/` directory is the production site. The `public/` directory
contains source assets that Vite copies into `docs/`; it is not the build output.
The included `.github/workflows/ci.yml` runs tests and verifies the build, but does
not deploy a separate Pages artifact. A `.nojekyll` file disables Jekyll processing.

Vite’s relative base supports both `username.github.io/repository/` and root/custom-domain hosting. No server-side routing configuration or environment secrets are needed. GitHub Pages supplies the HTTPS required by microphone APIs.

## Practice behavior

- Opens directly on the current chord, without a landing or setup page. A welcome
  modal explains practice; checking **Don’t show again** when dismissing saves that
  preference in this browser. The microphone and hint timer start only after you
  choose microphone or manual practice below the card.
- New chords first appear in an introduction modal with their fingering and sound.
  **I’m ready** (play C) accepts the introduction without marking the chord learned.
  **I’m not ready** (play Am) defers it for **3 successful familiar-card reviews**,
  then offers it again. Deferrals and accepted introductions survive reloads. If
  there are no familiar chords yet, a no-pressure break screen offers an explicit
  retry instead; declining never creates a practice success or failure.
- Standard re-entrant **G4 C4 E4 A4** tuning only.
- 20 chords, ordered from easy, useful shapes to later challenges: C, Am, F, G, C7, A, G7, A7, Em, Dm, D, E7, D7, Am7, Em7, Cm, Gm, B♭, Bm, E.
- A daily queue contains oldest-due reviews first, then up to **3 new chords**, capped at **15 distinct chords**. It is fixed once practice starts and resumes after reload. Days use the device’s local calendar date.
- The daily completion screen is a natural stopping point, not a lockout. **Keep
  practising** starts optional endless practice, with a **Finish extra practice**
  button available at any time. Due reviews come first; when nothing is due, one
  new chord is introduced after every **3 extra reviews**, in the deck’s learning
  order. This interval is preserved in saved history across extra sessions and
  reloads. After all 20 chords are introduced, reviews continue indefinitely.
  Extra attempts update FSRS and history without changing the daily queue or its
  completion. New extra-practice chords also receive normal FSRS schedules.
- After accepting an introduction, practice shows the requested chord from memory.
  After **15 active seconds**, or an early hint request, it reveals a G–C–E–A chord
  diagram with fret and finger positions. It keeps listening after the reveal and
  stays on the card until microphone recognition or self-assessed success.
- Success animates, saves the result, and advances after 1.4 seconds. Reduced-motion preferences are respected.
- Success cards include a compact fingering diagram, even for unassisted attempts.
- A synthesized, ukulele-like strum previews each card using its actual high-G
  voicing. **Hear chord** replays it, and **Auto sound** toggles automatic previews
  (saved on this device). Microphone checking and the 15-second practice timer are
  suspended during playback, including a short quiet tail, so the app cannot answer
  its own card. Playback stops when leaving practice or backgrounding the app.
  Browsers may block the first automatic sound until a tap; dismissing the welcome,
  choosing a practice mode, or tapping **Hear chord** unlocks audio. No external
  samples, network requests, or recordings are used.
- Backgrounding the app pauses the attempt and releases the microphone. Hands-free
  controls reconnect on return when the browser permits; resume practice explicitly.
  Some mobile browsers require another tap to reactivate audio.
- Buttons throughout the app show **♫ chord** shortcuts. After a one-time tap to
  grant microphone access, listening continues across practice, introductions,
  welcome, completion, progress, and settings screens while they are foregrounded.
  Only enabled buttons actually on screen can be triggered, and an open modal
  takes precedence. Let the strings go quiet between commands. The current
  practice chord is reserved for a verified answer, not another button action.
  Playback cannot press its own buttons. Manual mode turns the microphone off;
  enable hands-free again to resume chord controls. Reset remains tap-only, with
  confirmation, to avoid accidental data loss.
- Progress is stored under `flashchords.progress.v1` in this browser’s local storage; the welcome preference uses `flashchords.hide-welcome.v1`. Existing keys from the previous app name are migrated automatically on the same origin, without deleting the original data. Private browsing, changing devices/browsers, or clearing site data may lose progress. Settings provide a JSON data export and a confirmed reset. Export is for retaining/inspecting data; this version has no import UI.
- Unreadable saved data is not overwritten. Storage failures are surfaced rather than silently claiming durable persistence.

## Spaced repetition

Uses the maintained `ts-fsrs` implementation of **FSRS**, with 90% desired retention and interval fuzzing. Grades are automatic:

| Attempt | FSRS rating |
| --- | --- |
| Needed fingering (automatic or requested) | Again |
| Unassisted, over 12 seconds | Hard |
| Unassisted, over 5 and up to 12 seconds | Good |
| Unassisted, up to 5 seconds | Easy |

Self-assessed attempts follow the same rules and are labeled in stored history. These time-based grades are a heuristic, not a validated assessment of musical skill. A hinted chord can become due shortly afterward, but is not repeated within the same daily queue; it is eligible for optional extra practice or the next day’s session. Due reviews not included in a capped session remain due. Extra practice picks due cards first, otherwise the least recently reviewed introduced chord, and avoids immediate repeats when another introduced chord is available. The three-review interval for introducing more chords is a pacing heuristic separate from FSRS, which schedules reviews of introduced chords.

## Microphone recognition and limitations

Audio is processed entirely on-device using Web Audio. The analyzer extracts pitch-class evidence from an 8192-point FFT, discounts likely upper harmonics, and compares it against all deck chords. It requires coverage of the chord’s distinct notes, a confidence margin over competing chords, and multiple consistent frames. A short quiet gap is required between cards to prevent a previous chord’s ringing strings from answering the next one.

Tune first, use a quiet room, place the phone nearby, strum all four strings, and let the chord ring. Detection is intentionally forgiving but **not guaranteed**: real ukuleles, microphones, overtones, room noise, tuning, and browser processing vary. The algorithm recognizes chord pitch classes, not correct fingering or individual-string technique. It cannot verify voicings or discriminate identical pitch-class sets. No claim is made that a synthetic-spectrum test proves real-instrument accuracy.

Use **I got it** when recognition struggles. This is always recorded as self-assessed, not microphone-verified. If permission is denied or a microphone disconnects, manual practice remains available. Test real audio on target iOS Safari and Android Chrome devices before relying on the checker for teaching or assessment.

## Project map

- `src/chords.ts`: curated shapes, fingerings, and SVG diagrams
- `src/audio.ts`: microphone lifecycle, spectral features, and classification
- `src/scheduler.ts`: FSRS, daily queues, serialization, and history
- `src/main.ts`: small framework-free UI and practice state
- `src/style.css`: Tailwind theme and animations
- `tests/app.spec.ts`: mobile-browser integration tests
