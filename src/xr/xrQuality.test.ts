import { cloneSettings } from "../app/settings";
import { quest2XrQualityPatch } from "./xrQuality";

describe("quest2XrQualityPatch", () => {
  it("does nothing outside immersive presentation", () => {
    const settings = cloneSettings();
    settings.count = 50_000;

    expect(quest2XrQualityPatch(settings, false)).toEqual({});
  });

  it("caps high-risk Quest 2 VR settings", () => {
    const settings = cloneSettings();
    settings.count = 20_000;
    settings.pixelRatioCap = 1.5;
    settings.targetFps = 60;
    settings.trailMode = "velocity";

    expect(quest2XrQualityPatch(settings, true)).toEqual({
      count: 8000,
      pixelRatioCap: 1,
      targetFps: 72,
      trailMode: "off",
    });
  });
});
