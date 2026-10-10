import "./style.css";
import {
  accuracy,
  average,
  candidates,
  cm360,
  compare,
  currentTrials,
  edpi,
  equivalentSensitivity,
  matchesSettings,
  nextCandidate,
  parseSavedData,
  recommendation,
  score,
  TRIAL_MS,
  validateSettings,
  type Candidate,
  type RangeCheck,
  type SavedData,
  type Variant,
} from "./core.ts";
import { Trainer } from "./trainer.ts";

const storageKey = "sens-lab:v1";
let storageAvailable = true;
let saved: string | null = null;
try {
  saved = localStorage.getItem(storageKey);
} catch {
  storageAvailable = false;
}
const data: SavedData = parseSavedData(saved);
const labels: Record<Variant, string> = {
  lower: "Lower",
  current: "Baseline",
  higher: "Higher",
};
const feelLabels: Record<RangeCheck["feel"], string> = {
  steady: "Comfortable & controlled",
  overshooting: "Overshooting",
  undershooting: "Undershooting",
  space: "Running out of mouse space",
};
const fmt = (n: number, digits = 4): string =>
  Number(n.toFixed(digits)).toString();
const icon = (
  name: "target" | "arrow" | "check" | "download" | "mouse" | "chart",
): string => {
  const paths = {
    target:
      '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>',
    mouse:
      '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7"/>',
    chart: '<path d="M4 20V4m0 16h16M8 16v-4m5 4V8m5 8V5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#top" aria-label="Sens Lab home"><span class="brand-icon">${icon("target")}</span><span>SENS<span class="brand-light">LAB</span><span class="brand-dot">.</span></span></a>
    <nav aria-label="Main navigation"><a class="active" href="#calibrate">Calibration</a><a href="#results">Your results</a><a href="#routine">Practice plan</a></nav>
    <span id="save-state" class="save-state"><span class="status-dot"></span>Saved on this device</span>
  </header>
  <main id="top">
    <section class="hero" aria-labelledby="hero-heading">
      <div class="hero-copy">
        <div class="eyebrow"><span class="small-line"></span> YOUR PERSONAL VALORANT AIM WORKSHOP</div>
        <div class="profile-tag">${icon("mouse")} WRIST AIM <span> / </span> SMALL MOUSEPAD</div>
        <h1 id="hero-heading">Your aim.<br>Your <em>sweet spot.</em></h1>
        <p class="hero-description">A sensitivity that fits <strong>your hand and your space.</strong> Compare small changes, find your feel, and build consistency.</p>
        <a class="text-link" href="#calibrate">Let's dial it in ${icon("arrow")}</a>
        <div class="hero-bottom"><span class="tiny-reticle">+</span><span>NO PRO SETTINGS TO COPY. JUST YOUR OWN DATA.</span></div>
        <div class="hero-orbit" aria-hidden="true"><span></span><i></i></div>
      </div>
      <section class="setup-card" aria-labelledby="setup-heading">
        <div class="card-topline"><span class="eyebrow">YOUR STARTING POINT</span><span class="step-index">01 / 03</span></div>
        <h2 id="setup-heading">Built around you.</h2>
        <p class="card-description">Keep your mouse at the DPI entered below. Apply a candidate's sensitivity in Valorant when you check it in the Range.</p>
        <form id="settings-form">
          <fieldset id="profile-fields">
            <div class="input-pair">
              <label for="dpi">Mouse DPI<span class="input-wrap"><input id="dpi" name="dpi" type="number" min="100" max="32000" step="1" required /><span>DPI</span></span></label>
              <label for="sensitivity">Baseline sensitivity<span class="input-wrap"><input id="sensitivity" name="sensitivity" type="number" min="0.01" max="10" step="0.0001" required /><span>IN-GAME</span></span></label>
            </div>
            <p class="field-help">Don't know your current sens? <strong>0.30 is a test starting point</strong> at 1600 DPI, not a measured recommendation.</p>
            <label class="swipe-label" for="swipe">Comfortable one-way mouse travel <span id="swipe-value">15 cm</span></label>
            <input id="swipe" name="swipe" class="range-input" type="range" min="3" max="50" step="1" aria-describedby="swipe-help" />
            <div class="range-labels"><span>3 cm · compact</span><span>50 cm · roomy</span></div>
            <p class="field-help" id="swipe-help">Estimate how far you can move from your usual position in one direction before lifting. This is not your full pad width.</p>
            <button type="submit" class="button primary full">Update test settings ${icon("arrow")}</button>
          </fieldset>
          <p id="settings-error" class="form-error" role="alert"></p>
        </form>
        <div class="privacy-note"><span class="status-dot"></span> No account. Results stay in your browser.</div>
      </section>
    </section>
    <div id="notice" class="notice" role="status" hidden></div>
    <section class="metrics-strip" aria-label="Your sensitivity calculations">
      <div><span class="metric-label">EFFECTIVE SENSITIVITY</span><p><strong id="edpi">480</strong><span>eDPI</span></p><small>DPI × in-game sensitivity</small></div>
      <div><span class="metric-label">FULL TURN DISTANCE</span><p><strong id="cm360">27.2</strong><span>cm / 360°</span></p><small>Estimated physical mouse travel</small></div>
      <div><span class="metric-label">YOUR MOUSE SPACE</span><p><strong id="turn-space">13.6</strong><span>cm / 180°</span><span id="fit-pill" class="fit-pill">Fits your swipe</span></p><small id="space-description">Based on your estimated comfortable travel</small></div>
    </section>

    <section id="calibrate" class="calibration" aria-labelledby="calibration-heading">
      <div class="section-heading"><div><div class="eyebrow">01 / COMPARE YOUR FEEL</div><h2 id="calibration-heading">Three settings. One fair test.</h2></div><p>25 seconds per trial. Two trials per setting.<br>Same targets. Alternating order. Your own results.</p></div>
      <div id="candidate-cards" class="candidate-grid"></div>
      <div class="workshop-grid">
        <section class="trainer-card" aria-labelledby="trainer-heading">
          <div class="trainer-header"><div class="trainer-title"><span class="status-dot"></span><h3 id="trainer-heading">The control room</h3></div><span class="mono" id="next-setting">BASELINE / 0.30</span></div>
          <div class="canvas-wrap">
            <canvas id="aim-canvas" tabindex="0" aria-label="Aim trial: move your mouse to aim the center crosshair at the green target and left-click. Escape cancels."></canvas>
            <div id="trainer-overlay" class="trainer-overlay"><span class="preview-tag">AIM TRIAL / 25 SECONDS</span><h3>A small change.<br>A clear comparison.</h3><p>Use the center crosshair to hit green targets.<br>Mouse capture starts when you run a trial.</p><span class="keyboard-hint"><kbd>ESC</kbd> releases your mouse</span></div>
            <div class="live-hud" id="live-hud" hidden><span><b id="time-left">25</b><small>SECONDS</small></span><span><b id="live-hits">0</b><small>HITS</small></span><span><b id="live-accuracy">—</b><small>ACCURACY</small></span></div>
          </div>
          <div class="trainer-footer"><p id="trainer-status" role="status">Desktop mouse required. Close distractions and get comfortable.</p><button id="start-trial" class="button primary">Run next trial ${icon("arrow")}</button></div>
          <p class="trainer-caveat">Browser input approximates Valorant's look sensitivity. Raw input is requested when supported; display scaling and input processing can still differ. Confirm your choice in-game.</p>
        </section>
        <aside class="test-plan" aria-labelledby="plan-heading">
          <div class="eyebrow">A LITTLE STRUCTURE GOES A LONG WAY</div><h3 id="plan-heading">Trust the process.</h3>
          <ol class="plan-steps"><li><span>1</span><div><strong>Warm up first</strong><p>Spend a few minutes aiming normally. Relax your grip and rest your forearm.</p></div></li><li><span>2</span><div><strong>Test all three settings</strong><p>Aim for clean hits, not frantic clicks. Take a short break between trials.</p></div></li><li><span>3</span><div><strong>Check the winner in Valorant</strong><p>Browser scores are a clue. Comfort, controlled corrections, and room to turn matter too.</p></div></li></ol>
          <div class="progress-heading"><span>YOUR TEST SET</span><strong id="progress-count">0 / 6</strong></div><div class="progress-track"><span id="progress-bar"></span></div><p class="progress-help" id="progress-help">Two trials for each setting unlock a comparison.</p>
          <div class="wrist-note">${icon("mouse")}<p><strong>Wrist aiming is valid.</strong> Use small wrist corrections and lift or reposition your mouse for bigger turns. Don't force an uncomfortable movement.</p></div>
        </aside>
      </div>
    </section>

    <section id="results" class="results-section" aria-labelledby="results-heading">
      <div class="section-heading"><div><div class="eyebrow">02 / FOLLOW YOUR DATA</div><h2 id="results-heading">Less guessing. More consistency.</h2></div><div class="results-actions"><button id="export" class="button secondary">${icon("download")} Export results</button><button id="clear-results" class="plain-button">Clear results</button></div></div>
      <div class="results-grid"><div class="comparison-card"><h3>Your browser comparison</h3><p class="muted">Score = hits per minute × accuracy. Only finished trials count.</p><div id="comparison"></div><p class="score-note">The same target sequence is used each time. Repeated trials and alternating settings reduce—but cannot remove—practice effects.</p></div><div class="recommendation-card"><span class="eyebrow">YOUR NEXT STEP</span><div class="recommendation-icon">${icon("chart")}</div><h3 id="recommendation-title">Your feel comes first.</h3><p id="recommendation-reason">Complete two trials per setting to compare all three fairly.</p><div id="recommended-values" hidden></div><span class="recommendation-footnote">A candidate to verify, not a guaranteed best sensitivity.</span></div></div>
      <details class="history-panel"><summary>Trial history <span id="history-count">0 trials</span></summary><div class="table-scroll"><table><thead><tr><th>Setting</th><th>Sensitivity</th><th>Hits / shots</th><th>Accuracy</th><th>Score</th><th>Avg. target time</th><th>Input</th></tr></thead><tbody id="history-body"></tbody></table></div></details>
    </section>

    <section class="range-section" aria-labelledby="range-heading">
      <div class="range-copy"><div class="eyebrow">THE REAL-WORLD CHECK</div><h2 id="range-heading">Take it to the Range.</h2><p>Set Valorant's sensitivity to the candidate you are checking. Keep your mouse DPI unchanged. Use <strong>Practice → Shooting Test → Medium, 30 bots</strong>, with the same weapon and position each time.</p><p>Do two runs per setting. Record your score and how it felt. Prioritize control and comfort when scores are close.</p><div class="range-tags"><span>Same weapon</span><span>Same difficulty</span><span>Short breaks</span></div></div>
      <div class="range-form-card"><form id="range-form"><div class="input-pair"><label for="range-candidate">Test setting<select id="range-candidate"></select></label><label for="range-bots">Bots hit out of 30<input type="number" id="range-bots" min="0" max="30" step="1" placeholder="e.g. 18" required /></label></div><label for="range-feel">How did it feel?<select id="range-feel"><option value="steady">Comfortable & controlled</option><option value="overshooting">I kept overshooting</option><option value="undershooting">I kept undershooting</option><option value="space">I ran out of mouse space</option></select></label><button type="submit" class="button secondary full">Save Range check ${icon("check")}</button><p id="range-status" role="status" class="field-help">Your in-game notes stay with your results.</p></form><div id="range-history"></div></div>
    </section>

    <section class="converter" aria-labelledby="converter-heading"><div>${icon("mouse")}<div><h3 id="converter-heading">Changing mouse DPI?</h3><p>Keep the same eDPI to preserve your estimated turn distance.</p></div></div><label for="new-dpi">New DPI<input type="number" id="new-dpi" value="800" min="100" max="32000" step="1" /></label><div class="converter-result"><span>Equivalent in-game sens</span><strong id="converted-sens">0.6</strong></div></section>

    <section id="routine" class="routine-section" aria-labelledby="routine-heading"><div class="section-heading"><div><div class="eyebrow">03 / BUILD THE HABIT</div><h2 id="routine-heading">Good aim is more than a number.</h2></div><p>Pick a comfortable setting. Give it 1–2 weeks.<br>Keep the routine short and repeatable.</p></div><div class="routine-grid"><article><span class="routine-time">03 MIN</span><h3>Find the head line.</h3><p>Practice keeping your crosshair at head height. Pre-aim likely angles so your wrist has less work to do.</p><span class="routine-number">01</span></article><article><span class="routine-time">05 MIN</span><h3>Stop. Then shoot.</h3><p>In the Range, stop moving before firing. Use controlled taps or short bursts and reset between shots.</p><span class="routine-number">02</span></article><article><span class="routine-time">01 MATCH</span><h3>Play with one focus.</h3><p>Use Deathmatch to work on crosshair placement and calm corrections. Track the habit, not just the score.</p><span class="routine-number">03</span></article></div></section>
    <footer><a class="brand footer-brand" href="#top">${icon("target")} SENS LAB.</a><p>Made for your setup. Independent project; not affiliated with Riot Games.</p><span>CONTROL OVER CHAOS.</span></footer>
  </main>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const settingsForm = element<HTMLFormElement>("settings-form");
element<HTMLInputElement>("dpi").value = String(data.settings.dpi);
element<HTMLInputElement>("sensitivity").value = String(
  data.settings.sensitivity,
);
element<HTMLInputElement>("swipe").value = String(data.swipeCm);

function persist(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  element("save-state").innerHTML =
    `<span class="status-dot ${storageAvailable ? "" : "warning"}"></span>${storageAvailable ? "Saved on this device" : "Session only · export to keep"}`;
  if (!storageAvailable) {
    element("notice").hidden = false;
    element("notice").textContent =
      "Browser storage is unavailable. Your results work for this session; export them before closing the tab.";
  }
}
function candidateMarkup(c: Candidate): string {
  const count = currentTrials(data.trials, data.settings).filter(
    (t) => t.variant === c.variant,
  ).length;
  const next = nextCandidate(data.settings, data.trials).variant === c.variant;
  const fits = cm360(c) / 2 <= data.swipeCm;
  const change = (c.sensitivity / data.settings.sensitivity - 1) * 100;
  return `<article class="candidate-card ${c.variant === "current" ? "baseline" : ""} ${next ? "next" : ""}"><div class="candidate-top"><span>${labels[c.variant]}</span><span class="candidate-change">${c.variant === "current" ? "TEST BASELINE" : `${change > 0 ? "+" : ""}${Math.round(change)}%`}</span></div><div class="candidate-value">${fmt(c.sensitivity)}<span>sens</span></div><div class="candidate-details"><span>${fmt(edpi(c), 1)} eDPI</span><span>${fmt(cm360(c) / 2, 1)} cm / 180°</span></div><div class="candidate-bottom"><span class="candidate-fit ${fits ? "" : "warning"}">${fits ? "Within your swipe" : "May need a mouse lift"}</span><span>${count} / 2 trials ${next ? '<b class="next-badge">NEXT</b>' : ""}</span></div></article>`;
}
function updateUI(): void {
  const matching = currentTrials(data.trials, data.settings);
  const next = nextCandidate(data.settings, data.trials);
  element("edpi").textContent = fmt(edpi(data.settings), 1);
  element("cm360").textContent = fmt(cm360(data.settings), 1);
  element("turn-space").textContent = fmt(cm360(data.settings) / 2, 1);
  const fits = cm360(data.settings) / 2 <= data.swipeCm;
  element("fit-pill").textContent = fits
    ? "Fits your swipe"
    : "May need a lift";
  element("fit-pill").classList.toggle("warning", !fits);
  element("space-description").textContent =
    `${fmt(data.swipeCm, 1)} cm one-way swipe ≈ ${Math.round((data.swipeCm / cm360(data.settings)) * 360)}° turn. Estimates, not a comfort measurement.`;
  element("swipe-value").textContent = `${data.swipeCm} cm`;
  element("candidate-cards").innerHTML = candidates(data.settings)
    .map(candidateMarkup)
    .join("");
  element("next-setting").textContent =
    `NEXT: ${labels[next.variant].toUpperCase()} / ${fmt(next.sensitivity)}`;
  const complete = compare(data.trials, data.settings).reduce(
    (sum, c) => sum + Math.min(2, c.count),
    0,
  );
  element("progress-count").textContent = `${complete} / 6`;
  element("progress-bar").style.width = `${(complete / 6) * 100}%`;
  element("progress-help").textContent =
    complete < 6
      ? "Two trials for each setting unlock a comparison."
      : "Test set complete. Repeat if scores vary; verify your candidate in-game.";
  const comparison = compare(data.trials, data.settings);
  const max = Math.max(1, ...comparison.map((c) => c.score));
  element("comparison").innerHTML = comparison
    .map(
      (c) =>
        `<div class="comparison-row"><div><strong>${labels[c.variant]}</strong><span>${c.count} ${c.count === 1 ? "trial" : "trials"} · ${c.count ? `${Math.round(c.accuracy * 100)}% accuracy` : "No data yet"}</span></div><div class="bar-track"><span style="width:${(c.score / max) * 100}%" class="${c.variant === "current" ? "baseline-bar" : ""}"></span></div><b>${c.count ? fmt(c.score, 1) : "—"}</b></div>`,
    )
    .join("");
  const rec = recommendation(data.trials, data.settings);
  const recommended = candidates(data.settings).find(
    (c) => c.variant === rec.variant,
  );
  element("recommendation-title").textContent = recommended
    ? `Try ${fmt(recommended.sensitivity)} in the Range.`
    : complete === 6
      ? "A little more testing."
      : "Your feel comes first.";
  element("recommendation-reason").textContent = rec.reason;
  element("recommended-values").hidden = !recommended;
  if (recommended)
    element("recommended-values").textContent =
      `${recommended.dpi} DPI · ${fmt(edpi(recommended), 1)} eDPI · ${fmt(cm360(recommended) / 2, 1)} cm / 180°`;
  element("history-count").textContent =
    `${matching.length} ${matching.length === 1 ? "trial" : "trials"}`;
  element("history-body").innerHTML = matching.length
    ? [...matching]
        .reverse()
        .map(
          (t) =>
            `<tr><td>${labels[t.variant]}</td><td>${fmt(t.sensitivity)}</td><td>${t.hits} / ${t.shots}</td><td>${Math.round(accuracy(t) * 100)}%</td><td>${fmt(score(t), 1)}</td><td>${t.hits ? `${Math.round(average(t.reactionMs))} ms` : "—"}</td><td>${t.inputMode === "raw" ? "Raw" : "Adjusted"}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="7" class="empty-table">Your completed trials will appear here. No sample scores, just your data.</td></tr>';
  const select = element<HTMLSelectElement>("range-candidate");
  const previous = select.value;
  select.innerHTML = candidates(data.settings)
    .map(
      (c) =>
        `<option value="${c.variant}">${labels[c.variant]} · ${fmt(c.sensitivity)}</option>`,
    )
    .join("");
  select.value = previous || recommended?.variant || "current";
  const rangeChecks = data.rangeChecks.filter((r) =>
    matchesSettings(r, data.settings),
  );
  element("range-history").innerHTML = rangeChecks.length
    ? `<div class="range-log-heading">YOUR RANGE NOTES · ${rangeChecks.length} RUNS</div>${[
        ...rangeChecks,
      ]
        .reverse()
        .slice(0, 6)
        .map(
          (r) =>
            `<div class="range-log"><div><strong>${labels[r.variant]} · ${fmt(r.sensitivity)}</strong><span>${feelLabels[r.feel]}</span></div><b>${r.bots}<small> / 30</small></b></div>`,
        )
        .join("")}`
    : "";
  element<HTMLButtonElement>("export").disabled =
    !data.trials.length && !data.rangeChecks.length;
  element<HTMLButtonElement>("clear-results").disabled =
    !data.trials.length && !data.rangeChecks.length;
  updateConverter();
}
function updateConverter(): void {
  const input = element<HTMLInputElement>("new-dpi");
  const dpi = Number(input.value);
  element("converted-sens").textContent =
    input.value && Number.isInteger(dpi) && dpi >= 100 && dpi <= 32000
      ? fmt(equivalentSensitivity(data.settings, dpi), 6)
      : "—";
}

const trainer = new Trainer(element<HTMLCanvasElement>("aim-canvas"), {
  onStatus: (message) => {
    element("trainer-status").textContent = message;
  },
  onTick: (remaining, hits, shots) => {
    element("time-left").textContent = String(remaining);
    element("live-hits").textContent = String(hits);
    element("live-accuracy").textContent = shots
      ? `${Math.round((hits / shots) * 100)}%`
      : "—";
  },
  onRunning: (running) => {
    element<HTMLButtonElement>("start-trial").disabled = running;
    element<HTMLFieldSetElement>("profile-fields").disabled = running;
    element<HTMLButtonElement>("clear-results").disabled =
      running || (!data.trials.length && !data.rangeChecks.length);
    element("trainer-overlay").hidden = running;
    element("live-hud").hidden = !running;
    element("aim-canvas").classList.toggle("captured", running);
  },
  onComplete: (trial) => {
    data.trials.push(trial);
    data.trials = data.trials.slice(-500);
    persist();
    updateUI();
    element("trainer-status").textContent =
      `${labels[trial.variant]} trial saved: ${trial.hits} hits, ${Math.round(accuracy(trial) * 100)}% accuracy, score ${fmt(score(trial), 1)}. Rest briefly before the next trial.`;
    element<HTMLButtonElement>("start-trial").focus({ preventScroll: true });
  },
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (trainer.isRunning) return;
  const dpi = Number(element<HTMLInputElement>("dpi").value),
    sensitivity = Number(element<HTMLInputElement>("sensitivity").value);
  const error = validateSettings(dpi, sensitivity);
  element("settings-error").textContent = error || "";
  if (error) return;
  data.settings = { dpi, sensitivity };
  data.swipeCm = Number(element<HTMLInputElement>("swipe").value);
  persist();
  updateUI();
  element("notice").hidden = false;
  element("notice").textContent = storageAvailable
    ? "Test settings updated. Comparisons show results for this DPI and baseline. Earlier settings remain in your exported history."
    : "Settings updated for this session. Export results before closing the tab.";
});
element("swipe").addEventListener("input", () => {
  element("swipe-value").textContent =
    `${element<HTMLInputElement>("swipe").value} cm`;
});
element("start-trial").addEventListener("click", () => {
  element("aim-canvas").scrollIntoView({
    block: "center",
    behavior: "instant",
  });
  void trainer.start(
    nextCandidate(data.settings, data.trials),
    data.settings.sensitivity,
  );
});
element("new-dpi").addEventListener("input", updateConverter);
element<HTMLFormElement>("range-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const bots = Number(element<HTMLInputElement>("range-bots").value);
  const candidate = candidates(data.settings).find(
    (c) => c.variant === element<HTMLSelectElement>("range-candidate").value,
  );
  const feel = element<HTMLSelectElement>("range-feel")
    .value as RangeCheck["feel"];
  if (
    !candidate ||
    !Number.isInteger(bots) ||
    bots < 0 ||
    bots > 30 ||
    !Object.hasOwn(feelLabels, feel)
  )
    return;
  data.rangeChecks.push({
    ...candidate,
    id: crypto.randomUUID(),
    baseline: data.settings.sensitivity,
    bots,
    feel,
    completedAt: new Date().toISOString(),
  });
  data.rangeChecks = data.rangeChecks.slice(-500);
  persist();
  updateUI();
  element("range-status").textContent =
    `${labels[candidate.variant]} check saved: ${bots}/30 · ${feelLabels[feel]}.`;
  element<HTMLInputElement>("range-bots").value = "";
});
element("export").addEventListener("click", () => {
  const exportData = {
    ...data,
    exportedAt: new Date().toISOString(),
    scoring: "hits per minute multiplied by hit accuracy",
    trialDurationSeconds: TRIAL_MS / 1000,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `sens-lab-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element("clear-results").addEventListener("click", () => {
  if (
    trainer.isRunning ||
    !window.confirm(
      "Clear all browser trials and Range checks on this device? Export first if you want to keep them. Your setup settings will stay.",
    )
  )
    return;
  data.trials = [];
  data.rangeChecks = [];
  persist();
  updateUI();
  element("trainer-status").textContent =
    "Results cleared. Ready for a fresh test set.";
  element("range-status").textContent =
    "Your in-game notes stay with your results.";
});
window.addEventListener("pagehide", () => trainer.cancel());
if (import.meta.hot) import.meta.hot.dispose(() => trainer.dispose());
persist();
updateUI();
