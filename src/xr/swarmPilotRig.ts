import { clamp, lerp } from "../math/scalar";
import {
  add3,
  length3,
  limitLength3,
  normalize3,
  scale3,
  type Vec3,
} from "../math/vec3";
import {
  neutralSwarmPilotIntent,
  type SwarmPilotIntent,
} from "./inputIntent";

export type SwarmPilotState = Readonly<{
  corePosition: Vec3;
  coreVelocity: Vec3;
  heading: Vec3;
  radius: number;
  roll: number;
  mediumPulse: number;
}>;

export type SwarmPilotRig = Readonly<{
  step: (input: SwarmPilotStepInput) => SwarmPilotState;
  snapshot: () => SwarmPilotState;
  reset: () => void;
}>;

export type SwarmPilotStepInput = Readonly<{
  dt: number;
  intent?: SwarmPilotIntent;
}>;

export const initialSwarmPilotState = (): SwarmPilotState => ({
  corePosition: [0, 0, 0],
  coreVelocity: [0, 0, 0],
  heading: [0, 0, -1],
  radius: 1,
  roll: 0,
  mediumPulse: 0,
});

const blendVec3 = (from: Vec3, to: Vec3, amount: number): Vec3 =>
  normalize3([
    lerp(from[0], to[0], amount),
    lerp(from[1], to[1], amount),
    lerp(from[2], to[2], amount),
  ]);

export const nextSwarmPilotState = (
  state: SwarmPilotState,
  stepInput: SwarmPilotStepInput,
): SwarmPilotState => {
  const intent = stepInput.intent ?? neutralSwarmPilotIntent;
  const dt = clamp(0, 1 / 20, stepInput.dt);
  const preferredHeading =
    intent.preferredHeading && length3(intent.preferredHeading) > 0
      ? normalize3(intent.preferredHeading)
      : state.heading;
  const stickHeading = normalize3([
    preferredHeading[0] + intent.yaw * 0.28,
    preferredHeading[1] + intent.pitch * 0.22,
    preferredHeading[2],
  ]);
  const heading = blendVec3(state.heading, stickHeading, 1 - Math.pow(0.001, dt));
  const thrust = clamp(-1, 1, intent.thrust);
  const targetVelocity = scale3(heading, thrust * 1.25);
  const coreVelocity = limitLength3(
    [
      lerp(state.coreVelocity[0], targetVelocity[0], 1 - Math.pow(0.02, dt)),
      lerp(state.coreVelocity[1], targetVelocity[1], 1 - Math.pow(0.02, dt)),
      lerp(state.coreVelocity[2], targetVelocity[2], 1 - Math.pow(0.02, dt)),
    ],
    1.4,
  );
  const radiusIntent = intent.scatter - intent.gather + intent.zoom * 0.48;
  const radius = clamp(0.42, 2.2, state.radius + radiusIntent * dt * 1.35);
  const roll = clamp(-1, 1, lerp(state.roll, intent.roll, 1 - Math.pow(0.01, dt)));
  const mediumPulse = clamp(
    0,
    1,
    Math.max(intent.mediumPulse, state.mediumPulse - dt * 1.8),
  );

  return {
    corePosition: add3(state.corePosition, scale3(coreVelocity, dt)),
    coreVelocity,
    heading,
    radius,
    roll,
    mediumPulse,
  };
};

export const createSwarmPilotRig = (): SwarmPilotRig => {
  let state = initialSwarmPilotState();

  return {
    step: (input) => {
      state = nextSwarmPilotState(state, input);
      return state;
    },
    snapshot: () => state,
    reset: () => {
      state = initialSwarmPilotState();
    },
  };
};
