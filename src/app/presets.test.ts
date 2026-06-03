import { presets, presetNames, presetByName } from "./presets";

describe("presets", () => {
  it("defines the expected aesthetic preset set", () => {
    expect(presetNames).toEqual([
      "Quiet Roost",
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

  it("retrieves presets by name", () => {
    expect(presetByName("Predator Ripple").settings.threatMode).toBe("orbit");
  });
});

