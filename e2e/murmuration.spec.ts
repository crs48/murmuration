import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const screenshotPath = (name: string): string =>
  `output/playwright/${name}.png`;

const waitForScene = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("hud")).toContainText("particles");
  await expect(page.getByTestId("settings-panel")).toContainText("Murmuration");
  await page.waitForTimeout(1_200);
};

const applySettings = async (
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> => {
  await page.evaluate((nextPatch) => {
    window.__murmuration?.applySettings(nextPatch);
  }, patch);
};

const debugHudText = async (page: Page): Promise<string> =>
  page.evaluate(() => window.__murmuration?.snapshot().hudText ?? "");

const expectScreenshotHasInk = async (
  page: Page,
  path: string,
  thresholds: { dark: number; bright: number } = {
    dark: 400,
    bright: 10_000,
  },
): Promise<void> => {
  mkdirSync("output/playwright", { recursive: true });
  const viewport = page.viewportSize() ?? { width: 900, height: 520 };
  const buffer = await page.screenshot({
    path,
    clip: {
      x: 0,
      y: 0,
      width: Math.min(900, viewport.width),
      height: Math.min(520, viewport.height),
    },
  });
  const image = PNG.sync.read(buffer);
  let darkPixels = 0;
  let brightPixels = 0;

  for (let index = 0; index < image.data.length; index += 4) {
    const r = image.data[index];
    const g = image.data[index + 1];
    const b = image.data[index + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (luminance < 80) {
      darkPixels += 1;
    }

    if (luminance > 220) {
      brightPixels += 1;
    }
  }

  expect(darkPixels).toBeGreaterThan(thresholds.dark);
  expect(brightPixels).toBeGreaterThan(thresholds.bright);
};

test("renders a nonblank desktop murmuration scene", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  await expect(page.getByTestId("settings-panel")).toContainText("Preset IO");
  await expect(page.getByTestId("settings-panel")).toContainText("Accumulation");
  await expectScreenshotHasInk(page, screenshotPath("desktop-scene"));
});

test("keeps the control panel usable on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await waitForScene(page);
  const panel = page.getByTestId("settings-panel");
  const box = await panel.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeLessThanOrEqual(430);
  expect(box?.height ?? 0).toBeLessThanOrEqual(430);
  await expect(panel).toContainText("Preset");
  await expectScreenshotHasInk(page, screenshotPath("mobile-scene"), {
    dark: 200,
    bright: 4_000,
  });
  const overflowCount = await panel.evaluate((element) => {
    const panelBox = element.getBoundingClientRect();

    return Array.from(element.querySelectorAll("*")).filter((child) => {
      const box = child.getBoundingClientRect();
      const visible = box.width > 0 && box.height > 0;

      return visible && (box.right > panelBox.right + 1 || box.left < panelBox.left - 1);
    }).length;
  });

  expect(overflowCount).toBe(0);
});

test("switches into WebGL GPGPU mode when supported", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  const hud = page.getByTestId("hud");
  const gpgpuReady = (await hud.textContent())?.includes("gpgpu ready");
  const modeSelect = page.getByRole("combobox").nth(4);

  await modeSelect.selectOption({ label: "WebGL GPGPU" });
  await page.waitForTimeout(1_200);

  if (gpgpuReady) {
    await expect(hud).toContainText("webgl-gpgpu");
  } else {
    await expect(hud).toContainText(/cpu-(field|grid)/);
  }
});

test("falls back gracefully when WebGPU is unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      get: () => undefined,
    });
  });
  await waitForScene(page);
  await expect(page.getByTestId("hud")).toContainText("webgpu unavailable");

  const modeSelect = page.getByRole("combobox").nth(4);
  await modeSelect.selectOption({ label: "WebGPU" });
  await page.waitForTimeout(1_200);
  await expect(page.getByTestId("hud")).toContainText(/(webgpu->webgl-gpgpu|cpu-field|cpu-grid)/);
});

test("renders inverse theme with visible contrast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  const themeSelect = page.getByRole("combobox").nth(1);

  await themeSelect.selectOption({ label: "Inverse" });
  await page.waitForTimeout(800);
  await expectScreenshotHasInk(page, screenshotPath("inverse-scene"), {
    dark: 10_000,
    bright: 400,
  });
});

test("renders predator ripple behavior without losing flock cohesion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  const presetSelect = page.getByRole("combobox").nth(0);

  await presetSelect.selectOption({ label: "Predator Ripple" });
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("hud")).toContainText("12,000 particles");
  await expectScreenshotHasInk(page, screenshotPath("predator-ripple"), {
    dark: 400,
    bright: 8_000,
  });
});


test("keeps the scene responsive during camera movement", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  await page.mouse.move(360, 320);
  await page.mouse.down();
  await page.mouse.move(620, 390);
  await page.mouse.up();
  await page.mouse.down({ button: "right" });
  await page.mouse.move(680, 410);
  await page.mouse.up({ button: "right" });
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(800);
  await expect(page.getByTestId("hud")).toContainText("particles");
  await expectScreenshotHasInk(page, screenshotPath("camera-interaction"));
});

test("accepts mobile pinch zoom input", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await waitForScene(page);
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Input.synthesizePinchGesture", {
    x: 196,
    y: 360,
    scaleFactor: 1.4,
    relativeSpeed: 800,
    gestureSourceType: "touch",
  });
  await page.waitForTimeout(800);
  await expect(page.getByTestId("hud")).toContainText("particles");
  await expectScreenshotHasInk(page, screenshotPath("mobile-pinch"), {
    dark: 200,
    bright: 4_000,
  });
});

test("applies every preset and resizes the particle buffers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  const presetSelect = page.getByRole("combobox").nth(0);
  const presets = [
    ["Quiet Roost", "3,000 particles"],
    ["Ink Cloud", "18,000 particles"],
    ["Predator Ripple", "12,000 particles"],
    ["Vacuole", "10,000 particles"],
    ["Silk Sheet", "14,000 particles"],
    ["Storm Turn", "16,000 particles"],
  ] as const;

  for (const [label, count] of presets) {
    await presetSelect.selectOption({ label });
    await expect(page.getByTestId("hud")).toContainText(count);
  }
});

test("records a high-count WebGL GPGPU performance matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  const ready = (await page.getByTestId("hud").textContent())?.includes("gpgpu ready");

  test.skip(!ready, "WebGL GPGPU is unavailable in this browser");
  await applySettings(page, {
    adaptiveQuality: false,
    pixelRatioCap: 1,
    simulationMode: "webgl-gpgpu",
    trailMode: "off",
  });

  const counts = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
  const samples: Array<{ count: number; fps: number; hudText: string }> = [];

  for (const count of counts) {
    await applySettings(page, { count });
    await page.waitForTimeout(1_200);
    const hudText = await debugHudText(page);
    const fps = Number(hudText.match(/(\d+) fps/)?.[1] ?? 0);

    samples.push({ count, fps, hudText });
    expect(hudText).toContain(`${count.toLocaleString()} particles`);

    if (count === 10_000) {
      expect(fps).toBeGreaterThanOrEqual(45);
    }

    if (count === 50_000) {
      expect(fps).toBeGreaterThanOrEqual(18);
    }
  }

  mkdirSync("output/playwright", { recursive: true });
  writeFileSync(
    "output/playwright/performance-matrix.json",
    `${JSON.stringify(samples, null, 2)}\n`,
  );
});
