import { expect, test } from "@playwright/test";
import { targetAt } from "../../src/core.ts";

test("calculator, pad fit, conversion, and settings survive reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#edpi")).toHaveText("480");
  await expect(page.locator("#cm360")).toHaveText("27.2");
  await expect(page.locator("#converted-sens")).toHaveText("0.6");
  await page.locator("#swipe").fill("5");
  await page.getByRole("button", { name: "Update test settings" }).click();
  await expect(page.locator("#fit-pill")).toHaveText("May need a lift");
  await page.locator("#sensitivity").fill("0.25");
  await page.getByRole("button", { name: "Update test settings" }).click();
  await expect(page.locator("#edpi")).toHaveText("400");
  await expect(page.locator("#converted-sens")).toHaveText("0.5");
  await page.reload();
  await expect(page.locator("#sensitivity")).toHaveValue("0.25");
  await expect(page.locator("#swipe")).toHaveValue("5");
  await expect(page.locator("#export")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Range checks persist and export; clear removes results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#range-candidate").selectOption("higher");
  await page.locator("#range-bots").fill("18");
  await page.locator("#range-feel").selectOption("overshooting");
  await page.getByRole("button", { name: "Save Range check" }).click();
  await expect(page.locator("#range-history")).toContainText("Higher · 0.345");
  await page.reload();
  await expect(page.locator("#range-history")).toContainText("Overshooting");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export results" }).click();
  const result = await download;
  expect(result.suggestedFilename()).toMatch(/sens-lab-.*\.json$/);
  const fs = await import("node:fs/promises");
  const exported = JSON.parse(
    await fs.readFile((await result.path())!, "utf8"),
  );
  expect(exported.rangeChecks[0].bots).toBe(18);
  expect(exported.settings.dpi).toBe(1600);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear results" }).click();
  await expect(page.locator("#export")).toBeDisabled();
  await expect(page.locator("#range-history")).toBeEmpty();
});

test("pointer capture, target hit, timed completion, and cancellation work", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement?.id))
    .toBe("aim-canvas");
  await expect(page.locator("#start-trial")).toBeDisabled();
  const target = targetAt(0);
  // Inject known relative mouse counts after real pointer capture to test the look-to-hit path.
  await page.evaluate(({ yaw, pitch }) => {
    const movement = new MouseEvent("mousemove");
    Object.defineProperties(movement, {
      movementX: { value: yaw / (0.3 * 0.07) },
      movementY: { value: -pitch / (0.3 * 0.07) },
    });
    document.dispatchEvent(movement);
    document
      .getElementById("aim-canvas")!
      .dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
  }, target);
  await expect(page.locator("#live-hits")).toHaveText("1");
  await expect(page.locator("#live-accuracy")).toHaveText("100%");
  await page.clock.fastForward(25_000);
  await expect(page.locator("#trainer-status")).toContainText(
    "trial saved: 1 hits",
  );
  await expect(page.locator("#progress-count")).toHaveText("1 / 6");
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement?.id))
    .toBe("aim-canvas");
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator("#trainer-status")).toContainText(
    "Trial cancelled",
  );
  await expect(page.locator("#progress-count")).toHaveText("1 / 6");
  await page.reload();
  await expect(page.locator("#progress-count")).toHaveText("1 / 6");
});

test("desktop and mobile layouts have no horizontal overflow", async ({
  page,
}) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Your aim. Your sweet spot." }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/sens-lab-${width}.png`,
      fullPage: true,
    });
  }
});
