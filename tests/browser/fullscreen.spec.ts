import { expect, test } from "@playwright/test";

async function expectRoomFillsViewport(
  page: import("@playwright/test").Page,
): Promise<void> {
  const geometry = await page.evaluate(() => {
    const room = document
      .getElementById("control-room")!
      .getBoundingClientRect();
    const canvas = document
      .getElementById("aim-canvas")!
      .getBoundingClientRect();
    return {
      left: room.left,
      top: room.top,
      width: room.width,
      height: room.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      canvasHeight: canvas.height,
    };
  });
  expect(geometry.left).toBe(0);
  expect(geometry.top).toBe(0);
  expect(geometry.width).toBe(geometry.viewportWidth);
  expect(geometry.height).toBe(geometry.viewportHeight);
  expect(geometry.canvasHeight).toBeGreaterThan(geometry.viewportHeight * 0.65);
}

test("trial opens real fullscreen, prevents scrolling, and Escape restores the page", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.locator("#start-trial").scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText("mouse input");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe("control-room");
  await expectRoomFillsViewport(page);
  const capturedScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 1200);
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Space");
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(capturedScroll);
  await page.screenshot({ path: "test-results/control-room-fullscreen.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#trainer-status")).toContainText(
    "Trial cancelled",
  );
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
  await expect(page.locator("html")).not.toHaveClass(/room-open/);
  await expect(page.locator("#progress-count")).toHaveText("0 / 6");
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - before),
  ).toBeLessThanOrEqual(2);
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(before);
});

test("Fullscreen button expands the preview and Exit fullscreen restores it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe("control-room");
  await expect(page.locator("#fullscreen-room")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectRoomFillsViewport(page);
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  await expect(page.locator("html")).not.toHaveClass(/room-open/);
  await expect(page.locator("#fullscreen-room")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("fullscreen denial falls back to a viewport-sized room with wheel input blocked", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.evaluate(() => {
    document.getElementById("control-room")!.requestFullscreen = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText(
    "Expanded room ·",
  );
  await expectRoomFillsViewport(page);
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 1200);
  await page.keyboard.press("End");
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  const prevented = await page.evaluate(
    () =>
      !document.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 800,
          cancelable: true,
          bubbles: true,
        }),
      ),
  );
  expect(prevented).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#trainer-status")).toContainText(
    "Trial cancelled",
  );
  await expect(page.locator("html")).not.toHaveClass(/room-open/);
});

test("leaving fullscreen cancels the trial and releases mouse capture", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText("mouse input");
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator("#trainer-status")).toContainText(
    "Trial cancelled",
  );
  await expect(page.locator("#start-trial")).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
  await expect(page.locator("html")).not.toHaveClass(/room-open/);
  await expect(page.locator("#progress-count")).toHaveText("0 / 6");
});

test("denied mouse capture restores scrolling and exits the expanded room", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const canvas = document.getElementById("aim-canvas") as HTMLCanvasElement;
    canvas.requestPointerLock = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Run next trial" }).click();
  await expect(page.locator("#trainer-status")).toContainText(
    "Mouse capture was unavailable",
  );
  await expect(page.locator("html")).not.toHaveClass(/room-open/);
  await expect(page.locator("#control-room")).not.toHaveClass(/expanded-room/);
  await expect(page.locator("#fullscreen-room")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#start-trial")).toBeEnabled();
});
