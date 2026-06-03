import {
  clampSettings,
  defaultSettings,
  particleTexturePlan,
} from "./settings";

describe("settings", () => {
  it("plans square GPU textures with inactive capacity", () => {
    expect(particleTexturePlan(10)).toEqual({
      requestedCount: 10,
      textureSide: 4,
      capacity: 16,
      inactiveSlots: 6,
    });
  });

  it("clamps high-risk simulation values to supported ranges", () => {
    const clamped = clampSettings({
      ...defaultSettings,
      count: 1_000_000,
      speed: -3,
      neighborCount: 99,
      chaseStrength: 8,
      attractorSpeed: 9,
      attractorRadius: 9,
      particleOpacity: 9,
      depthScale: 9,
      wanderRadius: 8,
      wanderSpeed: 0,
      pixelRatioCap: 8,
      fov: 12,
    });

    expect(clamped.count).toBe(100000);
    expect(clamped.speed).toBe(0.1);
    expect(clamped.neighborCount).toBe(12);
    expect(clamped.chaseStrength).toBe(1);
    expect(clamped.attractorSpeed).toBe(3);
    expect(clamped.attractorRadius).toBe(2.4);
    expect(clamped.particleOpacity).toBe(1);
    expect(clamped.depthScale).toBe(2);
    expect(clamped.wanderRadius).toBe(1);
    expect(clamped.wanderSpeed).toBe(0.05);
    expect(clamped.pixelRatioCap).toBe(2);
    expect(clamped.fov).toBe(25);
  });
});
