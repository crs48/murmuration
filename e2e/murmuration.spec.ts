import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
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

test("keeps the scene responsive during camera movement", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await waitForScene(page);
  await page.mouse.move(360, 320);
  await page.mouse.down();
  await page.mouse.move(620, 390);
  await page.mouse.up();
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(800);
  await expect(page.getByTestId("hud")).toContainText("particles");
  await expectScreenshotHasInk(page, screenshotPath("camera-interaction"));
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
