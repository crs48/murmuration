import type { SwarmPilotIntent } from "./inputIntent";

type HapticActuatorLike = Readonly<{
  pulse?: (value: number, duration: number) => Promise<boolean>;
}>;

type HapticGamepadLike = Gamepad & {
  hapticActuators?: readonly HapticActuatorLike[];
};

export type XrHapticsState = {
  lastPulse: number;
  previousMediumPulse: number;
  previousGather: number;
  previousScatter: number;
};

export const createXrHapticsState = (): XrHapticsState => ({
  lastPulse: 0,
  previousMediumPulse: 0,
  previousGather: 0,
  previousScatter: 0,
});

export const shouldPulseHaptics = (
  intent: SwarmPilotIntent,
  now: number,
  state: XrHapticsState,
): boolean => {
  const rising =
    (intent.mediumPulse > 0.6 && state.previousMediumPulse <= 0.6) ||
    (intent.gather > 0.75 && state.previousGather <= 0.75) ||
    (intent.scatter > 0.75 && state.previousScatter <= 0.75);

  state.previousMediumPulse = intent.mediumPulse;
  state.previousGather = intent.gather;
  state.previousScatter = intent.scatter;

  if (!rising || now - state.lastPulse < 160) {
    return false;
  }

  state.lastPulse = now;
  return true;
};

export const pulseXrInputSources = (
  inputSources: Iterable<XRInputSource>,
  value = 0.34,
  duration = 24,
): void => {
  for (const source of inputSources) {
    const gamepad = source.gamepad as HapticGamepadLike | null | undefined;
    const actuator = gamepad?.hapticActuators?.[0];

    if (!actuator?.pulse) {
      continue;
    }

    void actuator.pulse(value, duration).catch(() => undefined);
  }
};
