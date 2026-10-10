export const YAW_DEGREES_PER_COUNT = 0.07;
export const HORIZONTAL_FOV = 103;
export const TRIAL_MS = 25_000;
export const VARIANTS = ["lower", "current", "higher"] as const;
export type Variant = (typeof VARIANTS)[number];
export type InputMode = "raw" | "adjusted";

export interface Settings {
  dpi: number;
  sensitivity: number;
}
export interface Candidate extends Settings {
  variant: Variant;
}
export interface Trial extends Candidate {
  id: string;
  baseline: number;
  hits: number;
  shots: number;
  elapsedMs: number;
  reactionMs: number[];
  inputMode: InputMode;
  completedAt: string;
}
export interface RangeCheck extends Candidate {
  id: string;
  baseline: number;
  bots: number;
  feel: "steady" | "overshooting" | "undershooting" | "space";
  completedAt: string;
}
export interface SavedData {
  version: 1;
  settings: Settings;
  swipeCm: number;
  trials: Trial[];
  rangeChecks: RangeCheck[];
}
export const DEFAULT_SETTINGS: Settings = { dpi: 1600, sensitivity: 0.3 };

export function validateSettings(
  dpi: number,
  sensitivity: number,
): string | null {
  if (
    !Number.isFinite(dpi) ||
    !Number.isInteger(dpi) ||
    dpi < 100 ||
    dpi > 32000
  )
    return "Enter a whole-number DPI from 100 to 32,000.";
  if (!Number.isFinite(sensitivity) || sensitivity < 0.01 || sensitivity > 10)
    return "Enter a Valorant sensitivity from 0.01 to 10.";
  return null;
}
export const edpi = (settings: Settings): number =>
  settings.dpi * settings.sensitivity;
export const cm360 = (settings: Settings): number =>
  (360 * 2.54) / (edpi(settings) * YAW_DEGREES_PER_COUNT);
export const equivalentSensitivity = (
  settings: Settings,
  newDpi: number,
): number => edpi(settings) / newDpi;
export function candidates(settings: Settings): Candidate[] {
  return VARIANTS.map((variant, i) => ({
    dpi: settings.dpi,
    sensitivity: Math.max(
      0.01,
      Math.min(
        10,
        Math.round(settings.sensitivity * [0.85, 1, 1.15][i] * 10000) / 10000,
      ),
    ),
    variant,
  }));
}
export function matchesSettings(
  entry: Trial | RangeCheck,
  settings: Settings,
): boolean {
  return (
    entry.dpi === settings.dpi &&
    entry.baseline === settings.sensitivity &&
    candidates(settings).some(
      (c) => c.variant === entry.variant && c.sensitivity === entry.sensitivity,
    )
  );
}
export const accuracy = (trial: Trial): number =>
  trial.shots ? trial.hits / trial.shots : 0;
export const score = (trial: Trial): number =>
  ((trial.hits * 60000) / trial.elapsedMs) * accuracy(trial);
export function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
export function currentTrials(trials: Trial[], settings: Settings): Trial[] {
  return trials.filter((t) => matchesSettings(t, settings));
}
export function nextCandidate(settings: Settings, trials: Trial[]): Candidate {
  const matching = currentTrials(trials, settings);
  const counts = Object.fromEntries(
    VARIANTS.map((v) => [v, matching.filter((t) => t.variant === v).length]),
  ) as Record<Variant, number>;
  const least = Math.min(...Object.values(counts));
  const order: Variant[] =
    least % 2 === 0
      ? ["current", "lower", "higher"]
      : ["higher", "lower", "current"];
  return candidates(settings).find(
    (c) => c.variant === order.find((v) => counts[v] === least),
  )!;
}
export interface Comparison {
  variant: Variant;
  count: number;
  score: number;
  accuracy: number;
  spread: number;
}
export function compare(trials: Trial[], settings: Settings): Comparison[] {
  return VARIANTS.map((variant) => {
    const subset = currentTrials(trials, settings).filter(
      (t) => t.variant === variant,
    );
    const scores = subset.map(score);
    return {
      variant,
      count: subset.length,
      score: average(scores),
      accuracy: average(subset.map(accuracy)),
      spread: scores.length ? Math.max(...scores) - Math.min(...scores) : 0,
    };
  });
}
export function recommendation(
  trials: Trial[],
  settings: Settings,
): { variant: Variant | null; reason: string } {
  const matching = currentTrials(trials, settings);
  const comparison = compare(matching, settings);
  if (comparison.some((c) => c.count < 2))
    return {
      variant: null,
      reason: "Complete two trials per setting to compare all three fairly.",
    };
  if (new Set(comparison.map((c) => c.count)).size !== 1)
    return {
      variant: null,
      reason:
        "Finish this repeat set so every setting has the same number of trials before comparing.",
    };
  if (new Set(matching.map((t) => t.inputMode)).size !== 1)
    return {
      variant: null,
      reason:
        "These trials used different mouse input modes. Clear the results and repeat with one mode for a fair comparison.",
    };
  const sorted = [...comparison].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best.score)
    return {
      variant: null,
      reason: "No targets were hit yet. Warm up, then repeat the test set.",
    };
  if (best.score < sorted[1].score * 1.05)
    return {
      variant: "current",
      reason:
        "The top scores are within 5%. There is no clear winner; keep your current setting and verify it in the Range.",
    };
  if (comparison.some((c) => c.spread > c.score * 0.35))
    return {
      variant: null,
      reason:
        "Your repeat scores vary a lot. Take a break, then repeat each setting before deciding.",
    };
  return {
    variant: best.variant,
    reason:
      "This setting scored highest in your browser trials. Treat it as a candidate and confirm comfort and control in Valorant.",
  };
}

export interface Target {
  yaw: number;
  pitch: number;
  radius: number;
}
export function targetAt(index: number): Target {
  // The same seeded angular sequence for every trial keeps target difficulty comparable.
  let seed = 0x5f3759df;
  let target: Target = { yaw: 0, pitch: 0, radius: 1.5 };
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i <= index; i++) {
    let yaw: number, pitch: number;
    do {
      yaw = (random() - 0.5) * 46;
      pitch = (random() - 0.5) * 22;
    } while (Math.hypot(yaw - target.yaw, pitch - target.pitch) < 9);
    target = { yaw, pitch, radius: 1.5 };
  }
  return target;
}
export function aimDelta(counts: number, sensitivity: number): number {
  return counts * sensitivity * YAW_DEGREES_PER_COUNT;
}
export function hitsTarget(
  yaw: number,
  pitch: number,
  target: Target,
): boolean {
  const radians = Math.PI / 180;
  const dot =
    Math.sin(pitch * radians) * Math.sin(target.pitch * radians) +
    Math.cos(pitch * radians) *
      Math.cos(target.pitch * radians) *
      Math.cos((yaw - target.yaw) * radians);
  return Math.acos(Math.min(1, Math.max(-1, dot))) / radians <= target.radius;
}

function validTrial(value: unknown): value is Trial {
  if (!value || typeof value !== "object") return false;
  const t = value as Trial;
  return (
    !validateSettings(t.dpi, t.sensitivity) &&
    !validateSettings(t.dpi, t.baseline) &&
    VARIANTS.includes(t.variant) &&
    typeof t.id === "string" &&
    t.id.length < 100 &&
    (t.inputMode === "raw" || t.inputMode === "adjusted") &&
    Number.isInteger(t.hits) &&
    t.hits >= 0 &&
    Number.isInteger(t.shots) &&
    t.shots >= t.hits &&
    t.shots <= 100000 &&
    t.elapsedMs === TRIAL_MS &&
    Array.isArray(t.reactionMs) &&
    t.reactionMs.length === t.hits &&
    t.reactionMs.every((v) => Number.isFinite(v) && v >= 0 && v <= TRIAL_MS) &&
    typeof t.completedAt === "string" &&
    Number.isFinite(Date.parse(t.completedAt))
  );
}
function validRange(value: unknown): value is RangeCheck {
  if (!value || typeof value !== "object") return false;
  const r = value as RangeCheck;
  return (
    !validateSettings(r.dpi, r.sensitivity) &&
    !validateSettings(r.dpi, r.baseline) &&
    VARIANTS.includes(r.variant) &&
    typeof r.id === "string" &&
    r.id.length < 100 &&
    Number.isInteger(r.bots) &&
    r.bots >= 0 &&
    r.bots <= 30 &&
    ["steady", "overshooting", "undershooting", "space"].includes(r.feel) &&
    typeof r.completedAt === "string" &&
    Number.isFinite(Date.parse(r.completedAt))
  );
}
export function parseSavedData(raw: string | null): SavedData {
  const fresh = (): SavedData => ({
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    swipeCm: 15,
    trials: [],
    rangeChecks: [],
  });
  if (!raw) return fresh();
  try {
    const data = JSON.parse(raw) as SavedData;
    if (
      data.version !== 1 ||
      !data.settings ||
      validateSettings(data.settings.dpi, data.settings.sensitivity)
    )
      return fresh();
    return {
      version: 1,
      settings: {
        dpi: data.settings.dpi,
        sensitivity: data.settings.sensitivity,
      },
      swipeCm:
        Number.isFinite(data.swipeCm) &&
        data.swipeCm >= 3 &&
        data.swipeCm <= 100
          ? data.swipeCm
          : 15,
      trials: Array.isArray(data.trials)
        ? data.trials.filter(validTrial).slice(-500)
        : [],
      rangeChecks: Array.isArray(data.rangeChecks)
        ? data.rangeChecks.filter(validRange).slice(-500)
        : [],
    };
  } catch {
    return fresh();
  }
}
