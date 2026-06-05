import { mediumPresetByMode, mediumPresets } from "./mediumPresets";

describe("medium presets", () => {
  it("defines the low-cost VR reference modes", () => {
    expect(mediumPresets.map(({ mode }) => mode)).toEqual([
      "off",
      "grid",
      "dust",
      "air",
      "starlight",
    ]);
  });

  it("keeps preset values in normalized ranges", () => {
    expect(
      mediumPresets.every(
        ({ opacity, pointScale, turbulence, drift, colorMix, density, jitter }) =>
          opacity >= 0 &&
          opacity <= 1 &&
          pointScale > 0 &&
          turbulence >= 0 &&
          turbulence <= 1 &&
          drift >= 0 &&
          drift <= 1 &&
          colorMix >= 0 &&
          colorMix <= 1 &&
          density >= 0 &&
          density <= 1 &&
          jitter >= 0 &&
          jitter <= 0.34,
      ),
    ).toBe(true);
  });

  it("falls back to off for unknown modes", () => {
    expect(mediumPresetByMode("missing" as never).mode).toBe("off");
  });

  it("keeps grid medium static in world space", () => {
    const grid = mediumPresetByMode("grid");

    expect(grid.turbulence).toBe(0);
    expect(grid.drift).toBe(0);
    expect(grid.jitter).toBe(0);
  });
});
