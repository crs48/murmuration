import { defaultSettings } from "../app/settings";
import {
  initialThreatState,
  nextThreatState,
} from "./threat";

describe("nextThreatState", () => {
  const pointer = { active: true, position: [0.1, 0.2, 0.3] as const };
  const baseInput = {
    dt: 1 / 20,
    time: 1,
    pointer,
    swarmCenter: [0, 0, 0] as const,
  };

  it("returns no threat when disabled", () => {
    expect(
      nextThreatState(initialThreatState(), {
        ...baseInput,
        settings: defaultSettings,
      }).position,
    ).toBeNull();
  });

  it("uses pointer position for cursor threat mode", () => {
    expect(
      nextThreatState(initialThreatState(), {
        ...baseInput,
        settings: {
          ...defaultSettings,
          threatMode: "cursor",
          threatStrength: 0.5,
        },
      }).position,
    ).toEqual([0.1, 0.2, 0.3]);
  });

  it("accelerates autonomous threats toward and through the swarm center", () => {
    const first = nextThreatState(initialThreatState(), {
      ...baseInput,
      time: 4,
      settings: {
        ...defaultSettings,
        threatMode: "autonomous",
        threatStrength: 1,
      },
      pointer: { active: false, position: [0, 0, 0] },
    });

    expect(first.position).not.toBeNull();
    expect(first.velocity).not.toBeNull();
    expect(first.position?.[0]).toBeLessThan(initialThreatState().position[0]);
    expect(first.position?.[2]).toBeLessThan(initialThreatState().position[2]);
    expect(Math.hypot(...(first.velocity ?? [0, 0, 0]))).toBeGreaterThan(0.5);
  });
});
