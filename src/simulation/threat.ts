import type { MurmurationSettings } from "../app/settings";
import { clamp } from "../math/scalar";
import {
  add3,
  length3,
  limitLength3,
  normalize3,
  scale3,
  sub3,
  type Vec3,
} from "../math/vec3";

export type PointerThreat = {
  active: boolean;
  position: Vec3;
};

export type ThreatState = Readonly<{
  position: Vec3;
  velocity: Vec3;
}>;

export type ThreatStepInput = Readonly<{
  dt: number;
  time: number;
  settings: Pick<
    MurmurationSettings,
    | "threatMode"
    | "threatStrength"
    | "threatRadius"
    | "threatSpeed"
    | "threatAcceleration"
    | "threatMomentum"
  >;
  pointer: PointerThreat;
  swarmCenter: Vec3;
}>;

export type ThreatStepResult = Readonly<{
  state: ThreatState;
  position: Vec3 | null;
  velocity: Vec3 | null;
}>;

export const initialThreatState = (): ThreatState => ({
  position: [1.35, 0.34, 1.08],
  velocity: [-1.2, -0.08, -0.82],
});

const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const unitOr = (value: Vec3, fallback: Vec3): Vec3 => {
  const length = length3(value);

  return length > 0.0001 ? scale3(value, 1 / length) : fallback;
};

const predatorTarget = (
  state: ThreatState,
  input: ThreatStepInput,
): Vec3 => {
  const toCenter = sub3(input.swarmCenter, state.position);
  const diveDirection = unitOr(toCenter, normalize3(scale3(state.velocity, -1)));
  const worldUp: Vec3 =
    Math.abs(diveDirection[1]) > 0.88 ? [1, 0, 0] : [0, 1, 0];
  const side = unitOr(cross3(diveDirection, worldUp), [1, 0, 0]);
  const lift = unitOr(cross3(side, diveDirection), [0, 1, 0]);
  const modeAgitation = input.settings.threatMode === "orbit" ? 0.22 : 0.38;
  const lateralWeave = add3(
    scale3(side, Math.sin(input.time * 0.83) * modeAgitation),
    scale3(lift, Math.cos(input.time * 0.61 + 1.2) * modeAgitation * 0.74),
  );
  const passThroughDistance =
    0.66 +
    input.settings.threatRadius * 2.2 +
    input.settings.threatMomentum * 1.15;

  return add3(
    add3(input.swarmCenter, scale3(diveDirection, passThroughDistance)),
    lateralWeave,
  );
};

export const nextThreatState = (
  state: ThreatState,
  input: ThreatStepInput,
): ThreatStepResult => {
  if (
    input.settings.threatMode === "off" ||
    input.settings.threatStrength <= 0
  ) {
    return {
      state,
      position: null,
      velocity: null,
    };
  }

  if (input.settings.threatMode === "cursor") {
    return {
      state,
      position: input.pointer.active ? input.pointer.position : null,
      velocity: null,
    };
  }

  const dt = clamp(0, 1 / 20, input.dt);
  const target = predatorTarget(state, input);
  const desiredDirection = unitOr(
    sub3(target, state.position),
    normalize3(state.velocity),
  );
  const desiredVelocity = scale3(desiredDirection, input.settings.threatSpeed);
  const maxVelocityChange =
    input.settings.threatAcceleration *
    dt *
    (1 - input.settings.threatMomentum * 0.48);
  const steering = limitLength3(
    sub3(desiredVelocity, state.velocity),
    maxVelocityChange,
  );
  const steeredVelocity = add3(state.velocity, steering);
  const speed = length3(steeredVelocity);
  const minimumCruiseSpeed =
    input.settings.threatSpeed * (0.44 + input.settings.threatMomentum * 0.32);
  const velocity =
    speed < minimumCruiseSpeed
      ? scale3(
          unitOr(add3(steeredVelocity, desiredVelocity), desiredDirection),
          minimumCruiseSpeed,
        )
      : limitLength3(steeredVelocity, input.settings.threatSpeed);
  const position = add3(state.position, scale3(velocity, dt));
  const nextState = {
    position,
    velocity,
  };

  return {
    state: nextState,
    position,
    velocity,
  };
};
