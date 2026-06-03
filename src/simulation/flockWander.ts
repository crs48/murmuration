import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

export const flockWanderCenter = (
  settings: Pick<MurmurationSettings, "wanderRadius" | "wanderSpeed">,
  time: number,
): Vec3 => {
  const t = time * settings.wanderSpeed;
  const radius = settings.wanderRadius;

  if (radius === 0) {
    return [0, 0, 0];
  }

  return [
    radius * (Math.sin(t * 0.37) * 0.62 + Math.sin(t * 0.91 + 1.4) * 0.22),
    radius * (Math.sin(t * 0.43 + 0.8) * 0.38 + Math.cos(t * 0.77 + 2.2) * 0.16),
    radius * (Math.cos(t * 0.31 + 0.5) * 0.34 + Math.sin(t * 0.69 + 2.2) * 0.18),
  ];
};
