import { expect, test } from "@playwright/test";
import { targetAt } from "../../src/core.ts";

test("standalone build works offline and completes a real 25-second trial", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (request.url().startsWith("http")) requests.push(request.url());
  });
  await page.goto("http://127.0.0.1:4173/SensLab.html");
  expect(requests).toEqual(["http://127.0.0.1:4173/SensLab.html"]);
  await page.context().setOffline(true);
  await expect(page.locator("#edpi")).toHaveText("480");
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement?.id))
    .toBe("aim-canvas");
  await expect(page.locator("#trainer-status")).toContainText("mouse input");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe("control-room");
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
  }, targetAt(0));
  await expect(page.locator("#live-hits")).toHaveText("1");
  await expect(page.locator("#trainer-status")).toContainText(
    "trial saved: 1 hits",
    { timeout: 30_000 },
  );
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  await expect(page.locator("html")).not.toHaveClass(/room-open/);
  await page.context().setOffline(false);
  await page.reload();
  await expect(page.locator("#progress-count")).toHaveText("1 / 6");
  expect(errors).toEqual([]);
  expect(requests).toEqual([
    "http://127.0.0.1:4173/SensLab.html",
    "http://127.0.0.1:4173/SensLab.html",
  ]);
});

test("unsupported raw input falls back; denied capture stays usable", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const canvas = document.getElementById("aim-canvas") as HTMLCanvasElement;
    const original = canvas.requestPointerLock.bind(canvas);
    canvas.requestPointerLock = (options?: {
      unadjustedMovement?: boolean;
    }) => {
      if (options?.unadjustedMovement)
        return Promise.reject(
          new DOMException("Raw input unavailable", "NotSupportedError"),
        );
      return original();
    };
  });
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText(
    "Adjusted mouse input",
  );
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator("#start-trial")).toBeEnabled();
  await page.evaluate(() => {
    const canvas = document.getElementById("aim-canvas") as HTMLCanvasElement;
    canvas.requestPointerLock = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText(
    "Mouse capture was unavailable",
  );
  await expect(page.locator("#start-trial")).toBeEnabled();
  await expect(page.locator("#progress-count")).toHaveText("0 / 6");
});

test("blocked storage keeps the app working with a visible session-only notice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#save-state")).toContainText("Session only");
  await expect(page.locator("#notice")).toContainText("storage is unavailable");
  await page.locator("#range-bots").fill("20");
  await page.getByRole("button", { name: "Save Range check" }).click();
  await expect(page.locator("#range-history")).toContainText("20");
  await expect(page.locator("#export")).toBeEnabled();
});
