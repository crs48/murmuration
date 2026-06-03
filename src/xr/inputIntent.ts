import type { Vec3 } from "../math/vec3";

export type SwarmPilotIntent = Readonly<{
  thrust: number;
  yaw: number;
  pitch: number;
  roll: number;
  gather: number;
  scatter: number;
  zoom: number;
  mediumPulse: number;
  preferredHeading: Vec3 | null;
  leftHandPosition: Vec3 | null;
  rightHandPosition: Vec3 | null;
}>;

export type ControllerButtonLike = Readonly<{
  value: number;
}>;

export type ControllerGamepadLike = Readonly<{
  axes: readonly number[];
  buttons: readonly ControllerButtonLike[];
}>;

export type ControllerInputSourceLike = Readonly<{
  handedness?: XRHandedness;
  gamepad?: ControllerGamepadLike | null;
}>;

export const neutralSwarmPilotIntent: SwarmPilotIntent = {
  thrust: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  gather: 0,
  scatter: 0,
  zoom: 0,
  mediumPulse: 0,
  preferredHeading: null,
  leftHandPosition: null,
  rightHandPosition: null,
};

const axisValue = (
  gamepad: ControllerGamepadLike | null | undefined,
  index: number,
): number => gamepad?.axes[index] ?? 0;

const buttonValue = (
  gamepad: ControllerGamepadLike | null | undefined,
  index: number,
): number => gamepad?.buttons[index]?.value ?? 0;

export const combineSwarmPilotIntents = (
  left: SwarmPilotIntent,
  right: Partial<SwarmPilotIntent>,
): SwarmPilotIntent => ({
  ...left,
  ...right,
  thrust: left.thrust + (right.thrust ?? 0),
  yaw: left.yaw + (right.yaw ?? 0),
  pitch: left.pitch + (right.pitch ?? 0),
  roll: left.roll + (right.roll ?? 0),
  gather: Math.max(left.gather, right.gather ?? 0),
  scatter: Math.max(left.scatter, right.scatter ?? 0),
  zoom: left.zoom + (right.zoom ?? 0),
  mediumPulse: Math.max(left.mediumPulse, right.mediumPulse ?? 0),
  preferredHeading: right.preferredHeading ?? left.preferredHeading,
  leftHandPosition: right.leftHandPosition ?? left.leftHandPosition,
  rightHandPosition: right.rightHandPosition ?? left.rightHandPosition,
});

export const intentFromControllerSource = (
  source: ControllerInputSourceLike,
): Partial<SwarmPilotIntent> => {
  if (source.handedness === "right") {
    return {
      thrust: -axisValue(source.gamepad, 3),
      yaw: axisValue(source.gamepad, 2),
      gather: buttonValue(source.gamepad, 1),
      mediumPulse: buttonValue(source.gamepad, 0),
    };
  }

  if (source.handedness === "left") {
    return {
      zoom: -axisValue(source.gamepad, 3),
      roll: axisValue(source.gamepad, 2),
      scatter: buttonValue(source.gamepad, 1),
    };
  }

  return {};
};

export const readControllerIntent = (
  inputSources: Iterable<ControllerInputSourceLike>,
): SwarmPilotIntent =>
  Array.from(inputSources).reduce<SwarmPilotIntent>(
    (intent, source) =>
      combineSwarmPilotIntents(intent, intentFromControllerSource(source)),
    neutralSwarmPilotIntent,
  );
