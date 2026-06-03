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
        ({ opacity, pointScale, turbulence, drift, colorMix }) =>
          opacity >= 0 &&
          opacity <= 1 &&
          pointScale > 0 &&
          turbulence >= 0 &&
          turbulence <= 1 &&
          drift >= 0 &&
          drift <= 1 &&
          colorMix >= 0 &&
          colorMix <= 1,
      ),
    ).toBe(true);
  });

  it("falls back to off for unknown modes", () => {
    expect(mediumPresetByMode("missing" as never).mode).toBe("off");
  });
});
