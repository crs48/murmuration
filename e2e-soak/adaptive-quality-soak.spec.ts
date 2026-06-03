import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("runs adaptive quality for 10 minutes without losing the scene", async ({ page }) => {
  const runtimeErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
  });

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.evaluate(() => {
    window.__murmuration?.applySettings({
      adaptiveQuality: true,
      count: 50_000,
      pixelRatioCap: 1.5,
      simulationMode: "webgl-gpgpu",
      targetFps: 60,
      trailMode: "accumulation",
      trailLength: 0.8,
      trailOpacity: 0.22,
    });
  });

  const samples: Array<{ elapsedMs: number; hudText: string; fps: number }> = [];
  const startedAt = Date.now();
  const durationMs = 10 * 60_000;
  const intervalMs = 30_000;

  while (Date.now() - startedAt < durationMs) {
    await page.waitForTimeout(intervalMs);
    const hudText = await page.evaluate(
      () => window.__murmuration?.snapshot().hudText ?? "",
    );
    const fps = Number(hudText.match(/(\d+) fps/)?.[1] ?? 0);
    samples.push({
      elapsedMs: Date.now() - startedAt,
      hudText,
      fps,
    });

    await expect(page.locator("canvas")).toBeVisible();
    expect(hudText).toContain("particles");
    expect(fps).toBeGreaterThan(5);
  }

  expect(runtimeErrors).toEqual([]);
  mkdirSync("output/playwright", { recursive: true });
  writeFileSync(
    "output/playwright/adaptive-quality-soak.json",
    `${JSON.stringify(samples, null, 2)}\n`,
  );
});
