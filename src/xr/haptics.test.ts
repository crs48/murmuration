import { neutralSwarmPilotIntent } from "./inputIntent";
import {
  createXrHapticsState,
  shouldPulseHaptics,
} from "./haptics";

describe("shouldPulseHaptics", () => {
  it("pulses on rising medium and grip signals", () => {
    const state = createXrHapticsState();

    expect(
      shouldPulseHaptics(
        { ...neutralSwarmPilotIntent, mediumPulse: 0.7 },
        200,
        state,
      ),
    ).toBe(true);
    expect(
      shouldPulseHaptics(
        { ...neutralSwarmPilotIntent, mediumPulse: 0.9 },
        240,
        state,
      ),
    ).toBe(false);
    expect(
      shouldPulseHaptics(
        { ...neutralSwarmPilotIntent, gather: 0.9 },
        420,
        state,
      ),
    ).toBe(true);
  });

  it("does not pulse for low-level intent", () => {
    expect(
      shouldPulseHaptics(
        { ...neutralSwarmPilotIntent, mediumPulse: 0.2 },
        200,
        createXrHapticsState(),
      ),
    ).toBe(false);
  });
});
