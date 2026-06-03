import {
  neutralSwarmPilotIntent,
  readControllerIntent,
  type ControllerInputSourceLike,
} from "./inputIntent";

const source = (
  handedness: XRHandedness,
  axes: readonly number[],
  buttons: readonly number[],
): ControllerInputSourceLike => ({
  handedness,
  gamepad: {
    axes,
    buttons: buttons.map((value) => ({ value })),
  },
});

describe("readControllerIntent", () => {
  it("returns neutral intent without controller sources", () => {
    expect(readControllerIntent([])).toEqual(neutralSwarmPilotIntent);
  });

  it("maps right controller stick and buttons to thrust, yaw, gather, and pulse", () => {
    expect(
      readControllerIntent([
        source("right", [0, 0, 0.35, -0.7], [0.42, 0.8]),
      ]),
    ).toEqual({
      ...neutralSwarmPilotIntent,
      thrust: 0.7,
      yaw: 0.35,
      gather: 0.8,
      mediumPulse: 0.42,
    });
  });

  it("maps left controller stick and grip to zoom, roll, and scatter", () => {
    expect(
      readControllerIntent([
        source("left", [0, 0, -0.25, 0.5], [0, 0.6]),
      ]),
    ).toEqual({
      ...neutralSwarmPilotIntent,
      zoom: -0.5,
      roll: -0.25,
      scatter: 0.6,
    });
  });

  it("combines both hands into one semantic control state", () => {
    const intent = readControllerIntent([
      source("left", [0, 0, 0.2, -0.25], [0, 0.3]),
      source("right", [0, 0, -0.4, -0.75], [0.9, 0.2]),
    ]);

    expect(intent.thrust).toBe(0.75);
    expect(intent.yaw).toBe(-0.4);
    expect(intent.roll).toBe(0.2);
    expect(intent.zoom).toBe(0.25);
    expect(intent.gather).toBe(0.2);
    expect(intent.scatter).toBe(0.3);
    expect(intent.mediumPulse).toBe(0.9);
  });
});
