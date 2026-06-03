import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

const boundedUnitTravel = (t: number): Vec3 => {
  const raw: Vec3 = [
    Math.sin(t * 0.47 + Math.sin(t * 0.19) * 1.15) * 0.82 +
      Math.sin(t * 1.07 + 1.4) * 0.38 +
      Math.cos(t * 0.23 + 2.1) * 0.22,
    Math.cos(t * 0.43 + 0.6 + Math.sin(t * 0.13) * 0.9) * 0.78 +
      Math.sin(t * 0.91 + 2.8) * 0.42 +
      Math.cos(t * 0.29 + 0.4) * 0.24,
    Math.sin(t * 0.39 + 1.1 + Math.cos(t * 0.17) * 1.05) * 0.8 +
      Math.cos(t * 0.97 + 0.2) * 0.4 +
      Math.sin(t * 0.21 + 2.6) * 0.22,
  ];
  const length = Math.hypot(...raw);
  const radialPulse =
    0.72 +
    0.28 * (0.5 + 0.5 * Math.sin(t * 0.41 + Math.cos(t * 0.17)));
  const scale = radialPulse / Math.max(1, length);

  return [raw[0] * scale, raw[1] * scale, raw[2] * scale];
};

export const flockWanderCenter = (
  settings: Pick<
    MurmurationSettings,
    | "attractorRadius"
    | "attractorSpeed"
    | "wanderRadius"
    | "wanderSpeed"
  >,
  time: number,
): Vec3 => {
  const t = time * settings.attractorSpeed * settings.wanderSpeed;
  const scale = settings.wanderRadius;

  const radius = settings.attractorRadius * scale;

  if (radius === 0) {
    return [0, 0, 0];
  }

  const travel = boundedUnitTravel(t);

  return [travel[0] * radius, travel[1] * radius, travel[2] * radius];
};
