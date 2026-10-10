# Sens Lab

A browser app that recommends exact Valorant settings from your starting inputs and repeated aim tests. Designed around a 1600 DPI mouse, wrist aiming, and limited mousepad space. All settings are editable.

## Use the app

The build produces **`dist/SensLab.html`** and **`downloads/SensLab.zip`**, containing the self-contained browser app and a quick-start guide. Extract the ZIP and open `SensLab.html` in a recent desktop Chrome or Edge browser. To update a previous download, replace its `SensLab.html` with the new one in the same folder. Some managed browsers block local HTML files; use the development server or static preview below in that case. Direct file opening could not be tested in this cloud because its browser policy blocks `file://` URLs. The standalone build was tested over local HTTP and worked offline after loading.

1. Set your mouse's actual hardware DPI to **1600** (or enter the DPI you use). The app cannot change your mouse's hardware DPI or Valorant's settings.
2. Start with **0.30** sensitivity if your current setting is unknown. This is a provisional test baseline, not a measured best setting. At 1600 DPI, it is 480 eDPI, approximately 27.2 cm/360°, or 13.6 cm/180°.
3. Estimate your comfortable **one-way** mouse travel before lifting the mouse. The initial 15 cm is an editable estimate, not a measurement of your pad.
4. Click **Start optimization**, warm up, then run the six 25-second trials. At the default inputs, the initial candidates are **0.255, 0.30, and 0.345**. Starting a trial opens the Control Room fullscreen and captures the mouse. The **Fullscreen** button also lets you expand the preview before starting. Move the mouse to place the center crosshair over each green target and left-click. **Esc** releases the mouse, cancels the trial, and exits the room. Switching tabs, losing window focus or capture, or exiting fullscreen cancels the trial; partial trials are excluded. Finished trials return to the page automatically.
5. After a balanced test set, the page shows **Apply these settings** with exact mouse DPI and Valorant sensitivity, your original-to-recommended change, accuracy, and score change versus this round's baseline. Apply those values yourself; the app keeps hardware DPI unchanged and chooses among tested sensitivities. Inconsistent scores or incompatible input modes prompt more testing instead of producing a result.
6. Optionally click **Refine result**. Six new trials test ±7.5% around the winner, then another optional round tests ±3.75%. Each round uses only its own trials. Your original inputs and earlier trials remain saved. Starting a new optimization never reuses results from an earlier run. Edited starting inputs are honored even when you click Run next trial directly.
7. Check the recommendation in Valorant's Range with the same weapon, Medium difficulty, and 30-bot shooting test. Record your score and whether you overshoot, undershoot, or run out of space. Then keep a comfortable setting for 1–2 weeks. Practice head-height crosshair placement, stopping before firing, and calm corrections.

Browser trials request unadjusted mouse input, falling back to adjusted input when unsupported. They approximate Valorant's look sensitivity; browser input, OS/display scaling, and hardware processing can differ. The trainer is not a scientific calibration instrument. Verify its candidate in-game. No game integration or background mouse capture is used.

While the Control Room is expanded, page scrolling is locked and mouse-wheel/touchpad scroll gestures are blocked. Scroll keys are blocked during a trial. If browser fullscreen is denied or unavailable, the room fills the browser window instead. Closing it restores the original page scroll position. The browser's Esc exit remains available.

Wrist aiming is a reasonable style. Small corrections can come from your wrist, with occasional lifting or repositioning for large turns. You do not need to force a professional player's arm movement. Use a relaxed grip and take breaks if you feel discomfort.

## What the comparison means

- eDPI = mouse DPI × in-game sensitivity.
- Estimated cm/360° = `360 × 2.54 / (eDPI × 0.07)`, assuming Valorant's standard 0.07° yaw coefficient per mouse count.
- The trainer uses a 103° horizontal field of view, fixed angular target sizes, and the same deterministic target sequence for each trial.
- Score = hits per minute × hit accuracy. Misses reduce the score. Average target time is recorded separately and is not an isolated measure of reaction speed.
- Every setting needs at least two completed trials, equal trial counts, and the same input mode before settings are recommended. If any setting's repeat-score range exceeds 35% of its mean, the app asks for more testing. Among scores within 5% of the best, it prefers a setting fitting your estimated travel, then the smallest change from this round's baseline. It retains the baseline only if its score is also within 5% of the best. A clear performance winner can still require mouse lifting; the result displays that limitation. These are practical heuristics, not a statistically established optimum.
- Results recommend an actually tested sensitivity, rather than an untested interpolated number. Score improvement compares with the current round's baseline; sensitivity change compares with your original input. Refinement is limited to two smaller rounds, and there is no promise of a global optimum or improved match performance.
- Mouse-space estimates describe turn travel, not comfort. A higher sensitivity may require less space while amplifying small hand movements. Hardware DPI can usually stay at 1600; tune in-game sensitivity first.
- Range notes remain separate from the browser score. Use those notes to make the final choice.

## Development

Requires **Node.js 22.13+** (Node 24 is used in this environment).

```sh
npm ci
npm run dev
```

In this cloud, keep npm's cache in the writable workspace:

```sh
cd /workspace/DPI
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev -- --port 5173 --strictPort
```

The server prints its local address. Cloud onboarding does not provide a public web preview. Use the saved startup instructions to restart development in later tasks; processes do not survive publication.

```sh
npm test          # calculation, scoring, scheduling, storage, and recommendation tests
npm run build    # TypeScript check, production build, standalone HTML and downloadable ZIP
npm run preview  # serve the production build, including /SensLab.html
npm run test:e2e # build, then browser interaction and layout checks
```

Browser tests use `/usr/bin/chromium` when available. On another machine, run `npx playwright install chromium` first, or set `CHROMIUM_PATH` to a Chromium executable. Playwright starts development on port 5173 and preview on 4173, reusing those servers outside CI. Tests include the full six-trial recommendation and refinement flow, fresh run isolation, edited starting inputs, clipboard fallback, real fullscreen and mouse capture, scroll prevention and restoration, fullscreen denial fallback, hit detection, cancellation, a real-time 25-second offline trial on the standalone build, raw-input fallback, storage failure, Range notes, JSON export, reload persistence, and layouts at 1440, 768, and 390 pixels.

## Data and files

Original settings, active test round, and up to 500 trials and 500 Range checks are stored in browser `localStorage`. Existing version 1 histories are retained when updating. A different browser, origin, or downloaded file location may have separate storage. Private browsing or browser restrictions can disable persistence; a visible notice explains when data lasts only for the session. Export creates a JSON backup including the current recommendation and all retained rounds. Clear results removes all trials and Range checks after confirmation and starts a fresh round at your original inputs. JSON import is not implemented.

- `src/core.ts`: calculations, balanced test scheduling, scoring, result validation.
- `src/trainer.ts`: mouse capture, camera projection, fixed-duration aim trials.
- `src/main.ts`: interface, local storage, Range notes, export.
- `src/style.css`: responsive styles, keyboard focus, reduced-motion support.
- `scripts/standalone.mjs`: packages the production assets into one HTML file and refreshes the HTML and ZIP in `downloads/` on every build.

No backend, credentials, analytics, external fonts, or runtime network access are required. Aim trials need a desktop mouse and pointer-lock support; the calculator and Range notes also work on mobile. Independent project; not affiliated with Riot Games.
