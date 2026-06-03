import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

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

  return [
    radius *
      (
        Math.sin(t * 0.31 + Math.sin(t * 0.17) * 0.8) * 0.68 +
        Math.sin(t * 0.83 + 1.4) * 0.24 +
        Math.sin(t * 0.11 + 2.8) * 0.08
      ),
    radius *
      0.58 *
      (
        Math.sin(t * 0.37 + 0.8) * 0.62 +
        Math.cos(t * 0.73 + 2.2) * 0.26 +
        Math.sin(t * 0.19 + 0.5) * 0.12
      ),
    radius *
      0.86 *
      (
        Math.cos(t * 0.29 + 0.5) * 0.64 +
        Math.sin(t * 0.67 + 2.2) * 0.26 +
        Math.cos(t * 0.13 + 1.1) * 0.1
      ),
  ];
};
