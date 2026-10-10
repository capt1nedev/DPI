import { expect, test, type Page } from "@playwright/test";
import { nextCandidate, targetAt, type Variant } from "../../src/core.ts";

async function runTrial(
  page: Page,
  hits: Record<Variant, number>,
): Promise<void> {
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText("mouse input");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sens-lab:v1")!),
  );
  const candidate = nextCandidate(stored.settings, stored.trials);
  const targets = Array.from({ length: hits[candidate.variant] }, (_, i) =>
    targetAt(i),
  );
  await page.evaluate(
    ({ targets, sensitivity }) => {
      let yaw = 0,
        pitch = 0;
      for (const target of targets) {
        const movement = new MouseEvent("mousemove");
        Object.defineProperties(movement, {
          movementX: { value: (target.yaw - yaw) / (sensitivity * 0.07) },
          movementY: { value: -(target.pitch - pitch) / (sensitivity * 0.07) },
        });
        document.dispatchEvent(movement);
        document
          .getElementById("aim-canvas")!
          .dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
        yaw = target.yaw;
        pitch = target.pitch;
      }
    },
    { targets, sensitivity: candidate.sensitivity },
  );
  await expect(page.locator("#live-hits")).toHaveText(
    String(hits[candidate.variant]),
  );
  await page.clock.fastForward(25_000);
  await expect(page.locator("#start-trial")).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
}

test("starting settings and real trial results produce exact recommendations, refinements, and a fresh run", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Cloud Chromium lacks raw input. Reject that option before the native call so
  // accelerated trials do not double capture requests and hit its rate limit.
  await page.addInitScript(() => {
    const request = HTMLCanvasElement.prototype.requestPointerLock;
    HTMLCanvasElement.prototype.requestPointerLock = function (options) {
      if (options?.unadjustedMovement)
        return Promise.reject(
          new DOMException("Raw input unavailable", "NotSupportedError"),
        );
      return request.call(this);
    };
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Start optimization" }).click();
  await expect(page.locator("#recommended-values")).toBeHidden();
  for (let i = 0; i < 6; i++)
    await runTrial(page, { lower: 8, current: 10, higher: 15 });
  await expect(page.locator("#progress-count")).toHaveText("6 / 6");
  await expect(page.locator("#recommendation-title")).toHaveText(
    "Apply these settings.",
  );
  await expect(page.locator("#recommendation-title")).toBeFocused();
  await expect(page.locator("#recommended-dpi")).toHaveText("1600");
  await expect(page.locator("#recommended-sensitivity")).toHaveText("0.345");
  await expect(page.locator("#recommended-values")).toContainText(
    "0.3 → 0.345 (+15%)",
  );
  await expect(page.locator("#recommended-values")).toContainText("+50%");
  await expect(page.locator("#converted-sens")).toHaveText("0.69");
  // Local file browsers can deny clipboard access; the selected text remains copyable.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("Unavailable")) },
      configurable: true,
    });
  });
  await page
    .getByRole("button", { name: "Copy settings", exact: true })
    .click();
  await expect(page.locator("#settings-copy")).toHaveValue(
    "Mouse DPI: 1600\nValorant sensitivity: 0.345\neDPI: 552",
  );
  await page.screenshot({
    path: "test-results/personalized-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Refine result" }).click();
  await expect(page.locator("#test-stage")).toContainText(
    "REFINEMENT 1 · ±7.5%",
  );
  await expect(page.locator("#candidate-cards")).toContainText("0.3191");
  await expect(page.locator("#candidate-cards")).toContainText("0.3709");
  await expect(page.locator("#progress-count")).toHaveText("0 / 6");
  await expect(page.locator("#sensitivity")).toHaveValue("0.3");
  await page.reload();
  await expect(page.locator("#test-stage")).toContainText("REFINEMENT 1");
  await expect(page.locator("#sensitivity")).toHaveValue("0.3");
  for (let i = 0; i < 6; i++)
    await runTrial(page, { lower: 18, current: 12, higher: 10 });
  await expect(page.locator("#recommended-sensitivity")).toHaveText("0.3191");
  await expect(page.locator("#recommended-values")).toContainText(
    "0.3 → 0.3191 (+6.4%)",
  );
  await expect(page.locator("#recommended-values")).toContainText("+50%");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export results" }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const exported = JSON.parse(await fs.readFile((await file.path())!, "utf8"));
  expect(exported.initialSettings).toEqual({ dpi: 1600, sensitivity: 0.3 });
  expect(exported.trials).toHaveLength(12);
  expect(exported.recommendation.settings).toEqual({
    dpi: 1600,
    sensitivity: 0.3191,
  });
  const previousId = exported.settings.runId;
  await page.getByRole("button", { name: "Refine result" }).click();
  await expect(page.locator("#test-stage")).toContainText(
    "REFINEMENT 2 · ±3.75%",
  );
  await expect(page.locator("#progress-count")).toHaveText("0 / 6");
  await expect(page.locator("#candidate-cards")).toContainText("0.3071");
  await expect(page.locator("#sensitivity")).toHaveValue("0.3");
  await page.getByRole("button", { name: "Start optimization" }).click();
  await expect(page.locator("#progress-count")).toHaveText("0 / 6");
  await expect(page.locator("#recommended-values")).toBeHidden();
  const fresh = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sens-lab:v1")!),
  );
  expect(fresh.settings.runId).not.toBe(previousId);
  expect(fresh.trials).toHaveLength(12);
  expect(errors).toEqual([]);
});

test("Run next trial honors edited starting inputs without a separate save", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.locator("#dpi").fill("800");
  await page.locator("#sensitivity").fill("0.5");
  await runTrial(page, { lower: 5, current: 5, higher: 5 });
  await expect(page.locator("#edpi")).toHaveText("400");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sens-lab:v1")!),
  );
  expect(stored.initialSettings).toEqual({ dpi: 800, sensitivity: 0.5 });
  expect(stored.trials[0].dpi).toBe(800);
  expect(stored.trials[0].sensitivity).toBe(0.5);
  await page.locator("#sensitivity").fill("0");
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#live-hud")).toBeHidden();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
});
