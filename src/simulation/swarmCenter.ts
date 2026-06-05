import {
  add3,
  isFinite3,
  scale3,
  type Vec3,
} from "../math/vec3";
import type { ParticleBuffers } from "./types";

export const particleCentroid = (
  buffers: Pick<ParticleBuffers, "positions" | "count">,
): Vec3 | null => {
  if (buffers.count <= 0) {
    return null;
  }

  let x = 0;
  let y = 0;
  let z = 0;

  for (let index = 0; index < buffers.count; index += 1) {
    const offset = index * 3;
    x += buffers.positions[offset];
    y += buffers.positions[offset + 1];
    z += buffers.positions[offset + 2];
  }

  const center: Vec3 = [
    x / buffers.count,
    y / buffers.count,
    z / buffers.count,
  ];

  return isFinite3(center) ? center : null;
};

export const blendSwarmCenter = (
  current: Vec3 | null,
  target: Vec3,
  amount: number,
): Vec3 =>
  current
    ? add3(scale3(current, 1 - amount), scale3(target, amount))
    : target;
