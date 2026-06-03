import type { MurmurationSettings } from "../app/settings";
import { clamp, safeDivide } from "../math/scalar";
import {
  add3,
  fromBuffer3,
  length3,
  lengthSq3,
  limitLength3,
  normalize3,
  scale3,
  sub3,
  type Vec3,
  zero3,
} from "../math/vec3";
import type { Neighbor } from "./cpuSpatialHash";

export type ForceContext = Readonly<{
  index: number;
  positions: Float32Array;
  velocities: Float32Array;
  seeds: Float32Array;
  neighbors: readonly Neighbor[];
  settings: MurmurationSettings;
  time: number;
  threatPosition: Vec3 | null;
  pilot: ForcePilot | null;
}>;

export type ForceTerm = (context: ForceContext) => Vec3;

export type ForcePilot = Readonly<{
  corePosition: Vec3;
  heading: Vec3;
  radius: number;
}>;

export const composeForces =
  (terms: readonly ForceTerm[]): ForceTerm =>
  (context) =>
    terms.reduce<Vec3>((acc, term) => add3(acc, term(context)), zero3);

const averageNeighborPosition = (context: ForceContext): Vec3 => {
  const { neighbors, positions } = context;
  const total = neighbors.reduce<Vec3>(
    (acc, { index }) => add3(acc, fromBuffer3(positions, index)),
    zero3,
  );

  return scale3(total, safeDivide(1, neighbors.length));
};

const averageNeighborVelocity = (context: ForceContext): Vec3 => {
  const { neighbors, velocities } = context;
  const total = neighbors.reduce<Vec3>(
    (acc, { index }) => add3(acc, fromBuffer3(velocities, index)),
    zero3,
  );

  return scale3(total, safeDivide(1, neighbors.length));
};

export const separationForce: ForceTerm = (context) => {
  if (context.neighbors.length === 0) {
    return zero3;
  }

  const self = fromBuffer3(context.positions, context.index);
  const total = context.neighbors.reduce<Vec3>((acc, { index, distanceSq }) => {
    const away = sub3(self, fromBuffer3(context.positions, index));
    return add3(acc, scale3(away, safeDivide(1, distanceSq)));
  }, zero3);

  return scale3(
    limitLength3(total, 1),
    context.settings.separation * safeDivide(1, Math.max(1, context.neighbors.length)),
  );
};

export const alignmentForce: ForceTerm = (context) => {
  if (context.neighbors.length === 0) {
    return zero3;
  }

  const averageVelocity = averageNeighborVelocity(context);
  const currentVelocity = fromBuffer3(context.velocities, context.index);

  return scale3(
    sub3(normalize3(averageVelocity), normalize3(currentVelocity)),
    context.settings.alignment,
  );
};

export const cohesionForce: ForceTerm = (context) => {
  if (context.neighbors.length === 0) {
    return zero3;
  }

  const self = fromBuffer3(context.positions, context.index);
  const center = averageNeighborPosition(context);

  return scale3(
    limitLength3(sub3(center, self), 1),
    context.settings.cohesion,
  );
};

export const flowFieldForce: ForceTerm = (context) => {
  const position = fromBuffer3(context.positions, context.index);
  const seed = context.seeds[context.index] * 1000;
  const t = context.time * 0.24 + seed;
  const flow: Vec3 = [
    Math.sin(position[1] * 2.8 + t) + Math.cos(position[2] * 2.1 - t * 0.7),
    Math.sin(position[2] * 2.3 + t * 0.8) - Math.cos(position[0] * 1.9 + t),
    Math.sin(position[0] * 2.6 - t * 0.6) + Math.cos(position[1] * 2.2 + t),
  ];

  return scale3(normalize3(flow), context.settings.flow * 0.22);
};

export const noiseForce: ForceTerm = (context) => {
  const seed = context.seeds[context.index] * 1000;
  const t = context.time * 1.7;
  const noise: Vec3 = [
    Math.sin(seed + t * 1.17),
    Math.sin(seed * 1.31 + t * 1.41),
    Math.cos(seed * 0.73 - t * 1.23),
  ];

  return scale3(noise, context.settings.noise * 0.18);
};

export const boundaryForce: ForceTerm = (context) => {
  const position = fromBuffer3(context.positions, context.index);
  const distanceSq = lengthSq3(position);
  const radius = 1.45;

  if (distanceSq < radius * radius) {
    return zero3;
  }

  return scale3(normalize3(scale3(position, -1)), (Math.sqrt(distanceSq) - radius) * 1.6);
};

export const threatForce: ForceTerm = (context) => {
  if (!context.threatPosition || context.settings.threatStrength <= 0) {
    return zero3;
  }

  const position = fromBuffer3(context.positions, context.index);
  const away = sub3(position, context.threatPosition);
  const distance = length3(away);
  const radius = context.settings.threatRadius;

  if (distance >= radius || distance === 0) {
    return zero3;
  }

  const proximity = 1 - distance / radius;
  const push = scale3(
    normalize3(away),
    context.settings.threatStrength *
      (1.1 + context.settings.vacuoleStrength) *
      proximity,
  );
  const tangent: Vec3 = normalize3([-away[2], away[1] * 0.3, away[0]]);
  const split = scale3(tangent, context.settings.splitGain * proximity);
  const wave = scale3(
    normalize3(fromBuffer3(context.velocities, context.index)),
    context.settings.waveGain * proximity * 0.24,
  );

  return add3(add3(push, split), wave);
};

export const pilotForce: ForceTerm = (context) => {
  if (!context.pilot) {
    return zero3;
  }

  const position = fromBuffer3(context.positions, context.index);
  const toCore = sub3(context.pilot.corePosition, position);
  const distance = length3(toCore);
  const shellRadius = Math.max(0.42, context.pilot.radius);
  const shellError = distance - shellRadius;
  const shellPull =
    distance === 0 ? zero3 : scale3(normalize3(toCore), shellError * 0.42);
  const headingPull = scale3(
    normalize3(context.pilot.heading),
    context.settings.alignment * 0.12,
  );

  return add3(
    scale3(shellPull, context.settings.cohesion),
    headingPull,
  );
};

export const murmurationForce = composeForces([
  separationForce,
  alignmentForce,
  cohesionForce,
  flowFieldForce,
  noiseForce,
  pilotForce,
  threatForce,
  boundaryForce,
]);

export const speedClampedVelocity = (
  velocity: Vec3,
  settings: MurmurationSettings,
): Vec3 => {
  const speed = length3(velocity);
  const minSpeed = Math.min(settings.minSpeed, settings.maxSpeed);
  const targetSpeed = clamp(minSpeed, settings.maxSpeed, speed);

  return speed === 0 ? [targetSpeed, 0, 0] : scale3(velocity, targetSpeed / speed);
};
