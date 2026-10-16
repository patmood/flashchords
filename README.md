# Little Strum

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
npm run build        # Type-check + production bundle in dist/
npm run preview      # Preview the production build
npx playwright install chromium
npm run test:e2e     # Mobile-browser interaction tests
```

## Deploy to GitHub Pages

### Git hook

This repository includes a versioned pre-commit hook that runs `npm run build`.
A failed type-check or static build blocks the commit. Build output stays in
ignored `dist/`; GitHub Actions builds and deploys it separately.

Enable the hook after cloning (Git does not copy local hook configuration):

```sh
git config core.hooksPath .githooks
```

### Publish

1. Create a GitHub repository and push this project to its `main` branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. The included `.github/workflows/deploy.yml` tests, builds, and publishes the app on pushes to `main`. It can also be run manually from Actions.

Vite’s relative base supports both `username.github.io/repository/` and root/custom-domain hosting. No server-side routing configuration or environment secrets are needed. GitHub Pages supplies the HTTPS required by microphone APIs.

## Practice behavior

- Standard re-entrant **G4 C4 E4 A4** tuning only.
- 20 chords, ordered from easy, useful shapes to later challenges: C, Am, F, G, C7, A, G7, A7, Em, Dm, D, E7, D7, Am7, Em7, Cm, Gm, B♭, Bm, E.
- A daily queue contains oldest-due reviews first, then up to **3 new chords**, capped at **15 distinct chords**. It is fixed once practice starts and resumes after reload. Days use the device’s local calendar date.
- Each card initially shows only the requested chord. After **20 active seconds**, or an early hint request, it reveals a G–C–E–A chord diagram with fret and finger positions. The card remains until microphone recognition or self-assessed success.
- Success animates, saves the result, and advances after 1.4 seconds. Reduced-motion preferences are respected.
- Backgrounding the app pauses the attempt and releases the microphone. Resume explicitly to reconnect.
- Progress is stored under `little-strum.progress.v1` in this browser’s local storage. Private browsing, changing devices/browsers, or clearing site data may lose progress. Settings provide a JSON data export and a confirmed reset. Export is for retaining/inspecting data; this version has no import UI.
- Unreadable saved data is not overwritten. Storage failures are surfaced rather than silently claiming durable persistence.

## Spaced repetition

Uses the maintained `ts-fsrs` implementation of **FSRS**, with 90% desired retention and interval fuzzing. Grades are automatic:

| Attempt | FSRS rating |
| --- | --- |
| Needed fingering (automatic or requested) | Again |
| Unassisted, over 12 seconds | Hard |
| Unassisted, over 5 and up to 12 seconds | Good |
| Unassisted, up to 5 seconds | Easy |

Self-assessed attempts follow the same rules and are labeled in stored history. These time-based grades are a heuristic, not a validated assessment of musical skill. A hinted chord can become due shortly afterward, but is not repeated within the same daily queue; it is eligible for the next day’s session. This deliberately favors the agreed short daily format over in-session relearning loops. Due reviews not included in a capped session remain due.

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
