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

export type ThreatPhase = "approach" | "egress";

export type ThreatState = Readonly<{
  position: Vec3;
  velocity: Vec3;
  attackDirection: Vec3;
  turnAxis: Vec3;
  phase: ThreatPhase;
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

const initialVelocity: Vec3 = [-1.2, -0.08, -0.82];

export const initialThreatState = (): ThreatState => ({
  position: [1.35, 0.34, 1.08],
  velocity: initialVelocity,
  attackDirection: normalize3(initialVelocity),
  turnAxis: normalize3([0.24, 0.96, -0.18]),
  phase: "approach",
});

const dot3 = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const unitOr = (value: Vec3, fallback: Vec3): Vec3 => {
  const length = length3(value);

  return length > 0.0001 ? scale3(value, 1 / length) : fallback;
};

const directionFor = (value: Vec3 | undefined, fallback: Vec3): Vec3 =>
  value ? unitOr(value, fallback) : fallback;

const rotateAroundAxis = (value: Vec3, axis: Vec3, angle: number): Vec3 => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const axisCrossValue = cross3(axis, value);
  const axisProjection = scale3(axis, dot3(axis, value) * (1 - cos));

  return unitOr(
    add3(
      add3(scale3(value, cos), scale3(axisCrossValue, sin)),
      axisProjection,
    ),
    value,
  );
};

const rotateToward = (
  from: Vec3,
  to: Vec3,
  maxAngle: number,
  fallbackAxis: Vec3,
): Vec3 => {
  const cosine = clamp(-1, 1, dot3(from, to));
  const angle = Math.acos(cosine);

  if (angle <= maxAngle || angle < 0.0001) {
    return to;
  }

  const rawAxis = cross3(from, to);
  const axis = unitOr(rawAxis, fallbackAxis);

  return rotateAroundAxis(from, axis, maxAngle);
};

const smoothAxis = (
  previousAxis: Vec3,
  desiredAxis: Vec3,
  amount: number,
): Vec3 => {
  const alignedAxis =
    dot3(previousAxis, desiredAxis) < 0
      ? scale3(desiredAxis, -1)
      : desiredAxis;

  return unitOr(
    add3(scale3(previousAxis, 1 - amount), scale3(alignedAxis, amount)),
    previousAxis,
  );
};

const threatPassDistance = (
  settings: Pick<MurmurationSettings, "threatRadius" | "threatMomentum">,
): number =>
  0.92 + settings.threatRadius * 2.6 + settings.threatMomentum * 1.32;

const centerCaptureRadius = (
  settings: Pick<MurmurationSettings, "threatRadius">,
): number => Math.max(0.18, settings.threatRadius * 0.72);

type PredatorCourse = Readonly<{
  target: Vec3;
  attackDirection: Vec3;
  turnAxis: Vec3;
  phase: ThreatPhase;
}>;

const predatorCourse = (
  state: ThreatState,
  input: ThreatStepInput,
  dt: number,
): PredatorCourse => {
  const fallbackDirection = normalize3(initialVelocity);
  const previousAttackDirection = directionFor(
    state.attackDirection,
    unitOr(state.velocity, fallbackDirection),
  );
  const currentDirection = unitOr(state.velocity, previousAttackDirection);
  const previousTurnAxis = directionFor(state.turnAxis, [0, 1, 0]);
  const toCenter = sub3(input.swarmCenter, state.position);
  const distanceToCenter = length3(toCenter);
  const centerDirection = unitOr(
    toCenter,
    scale3(previousAttackDirection, -1),
  );
  const passThroughDistance = threatPassDistance(input.settings);
  const movingTowardCenter = dot3(currentDirection, centerDirection);
  const clearDistance =
    passThroughDistance * (0.72 + input.settings.threatMomentum * 0.16);
  const shouldEnterEgress =
    state.phase === "approach" &&
    distanceToCenter <= centerCaptureRadius(input.settings);
  const shouldResumeApproach =
    state.phase === "egress" &&
    distanceToCenter > clearDistance &&
    movingTowardCenter < -0.12;
  const phase = shouldEnterEgress
    ? "egress"
    : shouldResumeApproach
      ? "approach"
      : state.phase;
  const desiredAttackDirection =
    phase === "approach" ? centerDirection : previousAttackDirection;
  const turnRate =
    input.settings.threatMode === "orbit"
      ? 0.42
      : 0.54 + input.settings.threatAcceleration * 0.025;
  const attackDirection =
    shouldEnterEgress
      ? currentDirection
      : rotateToward(
          previousAttackDirection,
          desiredAttackDirection,
          dt * turnRate * (1 - input.settings.threatMomentum * 0.24),
          previousTurnAxis,
        );
  const rawTurnAxis = unitOr(
    cross3(currentDirection, centerDirection),
    previousTurnAxis,
  );
  const turnAxis = smoothAxis(
    previousTurnAxis,
    rawTurnAxis,
    clamp(0, 1, dt * (input.settings.threatMode === "orbit" ? 0.28 : 0.2)),
  );
  const arcSide = unitOr(cross3(turnAxis, attackDirection), [1, 0, 0]);
  const broadArc =
    input.settings.threatMode === "orbit"
      ? input.settings.threatRadius * 0.24
      : input.settings.threatRadius * 0.36;
  const slowLift = Math.sin(input.time * 0.18 + 0.7) * broadArc;
  const slowDrift = Math.cos(input.time * 0.13 + 1.4) * broadArc * 0.72;
  const arcOffset =
    phase === "egress"
      ? add3(scale3(turnAxis, slowLift), scale3(arcSide, slowDrift))
      : ([0, 0, 0] as const);

  return {
    target:
      phase === "approach"
        ? input.swarmCenter
        : add3(
            add3(input.swarmCenter, scale3(attackDirection, passThroughDistance)),
            arcOffset,
          ),
    attackDirection,
    turnAxis,
    phase,
  };
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
  const course = predatorCourse(state, input, dt);
  const desiredDirection = unitOr(
    sub3(course.target, state.position),
    course.attackDirection,
  );
  const desiredVelocity = scale3(desiredDirection, input.settings.threatSpeed);
  const steeringResponse =
    course.phase === "approach"
      ? 1.86 + (1 - input.settings.threatMomentum) * 0.48
      : 0.34 + (1 - input.settings.threatMomentum) * 0.44;
  const maxVelocityChange =
    input.settings.threatAcceleration *
    dt *
    steeringResponse;
  const steering = limitLength3(
    sub3(desiredVelocity, state.velocity),
    maxVelocityChange,
  );
  const steeredVelocity = add3(state.velocity, steering);
  const speed = length3(steeredVelocity);
  const minimumCruiseSpeed =
    input.settings.threatSpeed *
    (course.phase === "approach"
      ? 0.34 + input.settings.threatMomentum * 0.18
      : 0.44 + input.settings.threatMomentum * 0.32);
  const currentDirection = unitOr(state.velocity, course.attackDirection);
  const cruiseDirection = rotateToward(
    currentDirection,
    desiredDirection,
    maxVelocityChange / Math.max(0.001, minimumCruiseSpeed),
    course.turnAxis,
  );
  const velocity =
    speed < minimumCruiseSpeed
      ? scale3(cruiseDirection, minimumCruiseSpeed)
      : limitLength3(steeredVelocity, input.settings.threatSpeed);
  const position = add3(state.position, scale3(velocity, dt));
  const nextState = {
    position,
    velocity,
    attackDirection: course.attackDirection,
    turnAxis: course.turnAxis,
    phase: course.phase,
  };

  return {
    state: nextState,
    position,
    velocity,
  };
};
