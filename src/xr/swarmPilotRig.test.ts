import {
  initialSwarmPilotState,
  nextSwarmPilotState,
} from "./swarmPilotRig";

describe("nextSwarmPilotState", () => {
  it("moves the swarm core along the preferred heading under thrust", () => {
    const next = nextSwarmPilotState(initialSwarmPilotState(), {
      dt: 1 / 20,
      intent: {
        thrust: 1,
        yaw: 0,
        pitch: 0,
        roll: 0,
        gather: 0,
        scatter: 0,
        zoom: 0,
        mediumPulse: 0,
        preferredHeading: [1, 0, 0],
        leftHandPosition: null,
        rightHandPosition: null,
      },
    });

    expect(next.corePosition[0]).toBeGreaterThan(0);
    expect(Math.abs(next.corePosition[2])).toBeLessThan(0.02);
    expect(next.heading[0]).toBeGreaterThan(0.2);
  });

  it("gathers and scatters the swarm radius with clamping", () => {
    const gathered = nextSwarmPilotState(
      { ...initialSwarmPilotState(), radius: 0.45 },
      {
        dt: 1,
        intent: {
          thrust: 0,
          yaw: 0,
          pitch: 0,
          roll: 0,
          gather: 1,
          scatter: 0,
          zoom: 0,
          mediumPulse: 0,
          preferredHeading: null,
          leftHandPosition: null,
          rightHandPosition: null,
        },
      },
    );
    const scattered = nextSwarmPilotState(
      { ...initialSwarmPilotState(), radius: 2.18 },
      {
        dt: 1,
        intent: {
          thrust: 0,
          yaw: 0,
          pitch: 0,
          roll: 0,
          gather: 0,
          scatter: 1,
          zoom: 0,
          mediumPulse: 0,
          preferredHeading: null,
          leftHandPosition: null,
          rightHandPosition: null,
        },
      },
    );

    expect(gathered.radius).toBe(0.42);
    expect(scattered.radius).toBe(2.2);
  });

  it("decays medium pulses over time", () => {
    const next = nextSwarmPilotState(
      { ...initialSwarmPilotState(), mediumPulse: 0.8 },
      { dt: 0.25 },
    );

    expect(next.mediumPulse).toBeCloseTo(0.71);
  });
});
