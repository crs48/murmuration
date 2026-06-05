import { defaultSettings } from "../app/settings";
import {
  classifyPerformanceBottleneck,
  performanceBottleneckLabel,
} from "./performanceProfile";

const slowStats = {
  fps: 20,
  frameMs: 50,
  averageFrameMs: 50,
};

describe("performance profile", () => {
  it("classifies healthy frames", () => {
    expect(
      classifyPerformanceBottleneck({
        settings: defaultSettings,
        stats: { fps: 72, frameMs: 13.8, averageFrameMs: 13.8 },
        backend: "webgl-gpgpu",
        isXrPresenting: true,
      }),
    ).toBe("healthy");
  });

  it("distinguishes CPU-bound risk", () => {
    expect(
      classifyPerformanceBottleneck({
        settings: {
          ...defaultSettings,
          count: 2000,
          pixelRatioCap: 0.9,
          particleScale: 0.7,
          mediumIntensity: 0.2,
          trailMode: "off",
        },
        stats: slowStats,
        backend: "cpu-grid",
        isXrPresenting: true,
      }),
    ).toBe("likely-cpu");
  });

  it("distinguishes vertex-bound risk", () => {
    expect(
      classifyPerformanceBottleneck({
        settings: {
          ...defaultSettings,
          count: 24_000,
          pixelRatioCap: 0.9,
          particleScale: 0.7,
          mediumIntensity: 0.2,
          trailMode: "off",
        },
        stats: slowStats,
        backend: "webgl-gpgpu",
        isXrPresenting: true,
      }),
    ).toBe("likely-vertex");
  });

  it("distinguishes fragment-bound risk", () => {
    expect(
      classifyPerformanceBottleneck({
        settings: {
          ...defaultSettings,
          count: 4000,
          pixelRatioCap: 1.4,
          particleScale: 1.5,
          mediumIntensity: 0.9,
        },
        stats: slowStats,
        backend: "webgl-gpgpu",
        isXrPresenting: true,
      }),
    ).toBe("likely-fragment");
  });

  it("formats HUD labels", () => {
    expect(performanceBottleneckLabel("likely-vertex")).toBe("profile vertex");
  });
});
