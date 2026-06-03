import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

export type PointerThreat = {
  active: boolean;
  position: Vec3;
};

export const deriveThreatPosition = (
  settings: MurmurationSettings,
  time: number,
  pointer: PointerThreat,
): Vec3 | null => {
  if (settings.threatMode === "off" || settings.threatStrength <= 0) {
    return null;
  }

  if (settings.threatMode === "cursor") {
    return pointer.active ? pointer.position : null;
  }

  if (settings.threatMode === "orbit") {
    return [
      Math.cos(time * 0.42) * 0.62,
      Math.sin(time * 0.27) * 0.22,
      Math.sin(time * 0.38) * 0.48,
    ];
  }

  return [
    Math.sin(time * 0.31) * 0.72 + Math.cos(time * 0.11) * 0.2,
    Math.cos(time * 0.23) * 0.24,
    Math.sin(time * 0.19 + 1.4) * 0.62,
  ];
};
