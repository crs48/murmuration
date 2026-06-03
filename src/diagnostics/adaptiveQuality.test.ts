import { cloneSettings } from "../app/settings";
import {
  adaptiveQualityPatch,
  createAdaptiveQualityState,
} from "./adaptiveQuality";

describe("adaptiveQualityPatch", () => {
  it("does nothing when the frame rate is healthy", () => {
    expect(
      adaptiveQualityPatch(
        cloneSettings(),
        { fps: 60, frameMs: 16.6, averageFrameMs: 16.6 },
        3000,
        createAdaptiveQualityState(),
      ),
    ).toEqual({});
  });

  it("removes trails before lowering resolution or count", () => {
    const settings = cloneSettings();
    settings.trailMode = "velocity";
    settings.trailOpacity = 0.2;

    expect(
      adaptiveQualityPatch(
        settings,
        { fps: 20, frameMs: 50, averageFrameMs: 50 },
        3000,
        createAdaptiveQualityState(),
      ),
    ).toEqual({
      trailMode: "off",
      trailOpacity: 0,
    });
  });

  it("lowers particle count after cheaper quality levers are exhausted", () => {
    const settings = cloneSettings();
    settings.trailMode = "off";
    settings.pixelRatioCap = 0.75;
    settings.count = 1000;

    expect(
      adaptiveQualityPatch(
        settings,
        { fps: 10, frameMs: 100, averageFrameMs: 100 },
        3000,
        createAdaptiveQualityState(),
      ),
    ).toEqual({ count: 820 });
  });
});

