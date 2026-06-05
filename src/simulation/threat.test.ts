import { defaultSettings } from "../app/settings";
import {
  initialThreatState,
  nextThreatState,
  type ThreatState,
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
        settings: {
          ...defaultSettings,
          threatMode: "off",
          threatStrength: 0,
        },
      }).position,
    ).toBeNull();
  });

  it("enables the autonomous threat by default", () => {
    expect(
      nextThreatState(initialThreatState(), {
        ...baseInput,
        settings: defaultSettings,
        pointer: { active: false, position: [0, 0, 0] },
      }).position,
    ).not.toBeNull();
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

  it("keeps autonomous threat headings smooth while passing through the swarm", () => {
    const settings = {
      ...defaultSettings,
      threatMode: "autonomous",
      threatStrength: 1,
      threatSpeed: 1.85,
      threatAcceleration: 3.2,
      threatMomentum: 0.74,
    } as const;
    let state = initialThreatState();
    let previousDirection = state.velocity;
    let minimumCenterDistance = Number.POSITIVE_INFINITY;
    let minimumHeadingContinuity = 1;

    for (let frame = 0; frame < 360; frame += 1) {
      const result = nextThreatState(state, {
        ...baseInput,
        dt: 1 / 60,
        time: frame / 60,
        settings,
        pointer: { active: false, position: [0, 0, 0] },
      });
      const position = result.position ?? state.position;
      const velocity = result.velocity ?? state.velocity;
      const speed = Math.hypot(...velocity);
      const previousSpeed = Math.hypot(...previousDirection);
      const headingContinuity =
        speed > 0 && previousSpeed > 0
          ? (velocity[0] * previousDirection[0] +
              velocity[1] * previousDirection[1] +
              velocity[2] * previousDirection[2]) /
            (speed * previousSpeed)
          : 1;

      minimumCenterDistance = Math.min(
        minimumCenterDistance,
        Math.hypot(...position),
      );
      minimumHeadingContinuity = Math.min(
        minimumHeadingContinuity,
        headingContinuity,
      );
      previousDirection = velocity;
      state = result.state;
    }

    expect(minimumCenterDistance).toBeLessThan(0.28);
    expect(minimumHeadingContinuity).toBeGreaterThan(0.99);
  });

  it("keeps aiming at the center instead of committing to a wide pass", () => {
    const settings = {
      ...defaultSettings,
      threatMode: "autonomous",
      threatStrength: 1,
      threatSpeed: 1.85,
      threatAcceleration: 3.2,
      threatMomentum: 0.74,
    } as const;
    let state: ThreatState = {
      position: [1.6, 0.2, 0],
      velocity: [0, 0, -1.1],
      attackDirection: [0, 0, -1],
      turnAxis: [0, 1, 0],
      phase: "approach",
    };
    let minimumCenterDistance = Number.POSITIVE_INFINITY;
    let enteredEgress = false;

    for (let frame = 0; frame < 900; frame += 1) {
      const result = nextThreatState(state, {
        ...baseInput,
        dt: 1 / 60,
        time: frame / 60,
        settings,
        pointer: { active: false, position: [0, 0, 0] },
      });
      const position = result.position ?? state.position;

      minimumCenterDistance = Math.min(
        minimumCenterDistance,
        Math.hypot(...position),
      );
      enteredEgress = enteredEgress || result.state.phase === "egress";
      state = result.state;
    }

    expect(minimumCenterDistance).toBeLessThan(0.28);
    expect(enteredEgress).toBe(true);
  });
});
