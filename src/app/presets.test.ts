import { presets, presetNames, presetByName } from "./presets";

describe("presets", () => {
  it("defines the expected aesthetic preset set", () => {
    expect(presetNames).toEqual([
      "Quiet Roost",
      "Lava Lamp",
      "Ink Cloud",
      "Predator Ripple",
      "Vacuole",
      "Silk Sheet",
      "Storm Turn",
    ]);
  });

  it("keeps every preset at a practical topological neighbor count", () => {
    expect(
      presets.every(({ settings }) => settings.neighborCount >= 6 && settings.neighborCount <= 8),
    ).toBe(true);
  });

  it("keeps every preset chase mix in the supported range", () => {
    expect(
      presets.every(({ settings }) => settings.chaseStrength >= 0 && settings.chaseStrength <= 1),
    ).toBe(true);
  });

  it("keeps every preset attractor path controllable", () => {
    expect(
      presets.every(
        ({ settings }) =>
          settings.attractorRadius >= 0 &&
          settings.attractorRadius <= 2.4 &&
          settings.attractorSpeed >= 0.05 &&
          settings.attractorSpeed <= 3,
      ),
    ).toBe(true);
  });

  it("retrieves presets by name", () => {
    expect(presetByName("Predator Ripple").settings.threatMode).toBe("orbit");
  });
});
