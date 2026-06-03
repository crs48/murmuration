import { randomSigned } from "../math/random";
import type { Vec3 } from "../math/vec3";

const initialBlobCenters: readonly Vec3[] = [
  [-0.48, 0.18, 0.12],
  [0.36, -0.2, -0.28],
  [0.12, 0.34, 0.42],
  [-0.16, -0.3, 0.34],
  [0.48, 0.16, 0.18],
];

export const initialParticlePosition = (
  random: () => number,
  index: number,
  _count: number,
): Vec3 => {
  const center = initialBlobCenters[index % initialBlobCenters.length];
  const theta = random() * Math.PI * 2;
  const y = randomSigned(random);
  const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
  const radius = Math.cbrt(random()) * (0.22 + random() * 0.28);
  const jitter = 0.045;

  return [
    center[0] + Math.cos(theta) * ringRadius * radius + randomSigned(random) * jitter,
    center[1] + y * radius + randomSigned(random) * jitter,
    center[2] + Math.sin(theta) * ringRadius * radius + randomSigned(random) * jitter,
  ];
};

export const initialParticleVelocity = (
  random: () => number,
  position: Vec3,
): Vec3 => {
  const tangent: Vec3 = [
    -position[2] + randomSigned(random) * 0.25,
    randomSigned(random) * 0.55,
    position[0] + randomSigned(random) * 0.25,
  ];

  return [
    tangent[0] * 0.62 + randomSigned(random) * 0.14,
    tangent[1] * 0.62 + randomSigned(random) * 0.14,
    tangent[2] * 0.62 + randomSigned(random) * 0.14,
  ];
};
