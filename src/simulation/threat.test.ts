import { defaultSettings } from "../app/settings";
import { deriveThreatPosition } from "./threat";

describe("deriveThreatPosition", () => {
  const pointer = { active: true, position: [0.1, 0.2, 0.3] as const };

  it("returns no threat when disabled", () => {
    expect(deriveThreatPosition(defaultSettings, 1, pointer)).toBeNull();
  });

  it("uses pointer position for cursor threat mode", () => {
    expect(
      deriveThreatPosition(
        {
          ...defaultSettings,
          threatMode: "cursor",
          threatStrength: 0.5,
        },
        1,
        pointer,
      ),
    ).toEqual([0.1, 0.2, 0.3]);
  });

  it("generates bounded autonomous positions", () => {
    const threat = deriveThreatPosition(
      {
        ...defaultSettings,
        threatMode: "autonomous",
        threatStrength: 0.5,
      },
      4,
      { active: false, position: [0, 0, 0] },
    );

    expect(threat?.every((component) => Math.abs(component) < 1)).toBe(true);
  });
});

