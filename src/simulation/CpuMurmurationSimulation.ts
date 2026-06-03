import type { MurmurationSettings } from "../app/settings";
import { randomSigned, mulberry32 } from "../math/random";
import { clamp, lerp } from "../math/scalar";
import {
  add3,
  fromBuffer3,
  isFinite3,
  scale3,
  writeBuffer3,
  type Vec3,
} from "../math/vec3";
import {
  buildSpatialHash,
  candidateIndices,
  nearestTopologicalNeighbors,
} from "./cpuSpatialHash";
import { murmurationForce, speedClampedVelocity } from "./rules";
import type {
  ParticleBuffers,
  SimulationAdapter,
  SimulationStepInput,
} from "./types";

export type CpuSimulationOptions = Readonly<{
  seed?: number;
  initialCount?: number;
}>;

const initialPosition = (random: () => number, index: number, count: number): Vec3 => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const t = count <= 1 ? 0 : index / (count - 1);
  const y = 1 - 2 * t;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * index;
  const jitter = 0.055;

  return [
    Math.cos(theta) * radius * 0.9 + randomSigned(random) * jitter,
    y * 0.42 + randomSigned(random) * jitter,
    Math.sin(theta) * radius * 0.9 + randomSigned(random) * jitter,
  ];
};

const initialVelocity = (random: () => number, position: Vec3): Vec3 => {
  const tangent: Vec3 = [-position[2], randomSigned(random) * 0.18, position[0]];
  return [
    tangent[0] * 0.7 + randomSigned(random) * 0.08,
    tangent[1] + randomSigned(random) * 0.08,
    tangent[2] * 0.7 + randomSigned(random) * 0.08,
  ];
};

export class CpuMurmurationSimulation implements SimulationAdapter {
  private random = mulberry32(17);

  private buffers: ParticleBuffers = {
    positions: new Float32Array(0),
    previousPositions: new Float32Array(0),
    velocities: new Float32Array(0),
    speeds: new Float32Array(0),
    seeds: new Float32Array(0),
    count: 0,
  };

  public constructor(options: CpuSimulationOptions = {}) {
    this.random = mulberry32(options.seed ?? 17);
    this.resize(options.initialCount ?? 0);
  }

  public resize = (count: number): void => {
    const safeCount = Math.max(0, Math.floor(count));
    const positions = new Float32Array(safeCount * 3);
    const previousPositions = new Float32Array(safeCount * 3);
    const velocities = new Float32Array(safeCount * 3);
    const speeds = new Float32Array(safeCount);
    const seeds = new Float32Array(safeCount);

    const copyCount = Math.min(this.buffers.count, safeCount);
    positions.set(this.buffers.positions.subarray(0, copyCount * 3));
    previousPositions.set(this.buffers.previousPositions.subarray(0, copyCount * 3));
    velocities.set(this.buffers.velocities.subarray(0, copyCount * 3));
    speeds.set(this.buffers.speeds.subarray(0, copyCount));
    seeds.set(this.buffers.seeds.subarray(0, copyCount));

    for (let index = copyCount; index < safeCount; index += 1) {
      const position = initialPosition(this.random, index, safeCount);
      const velocity = initialVelocity(this.random, position);
      writeBuffer3(positions, index, position);
      writeBuffer3(previousPositions, index, position);
      writeBuffer3(velocities, index, velocity);
      speeds[index] = Math.hypot(velocity[0], velocity[1], velocity[2]);
      seeds[index] = this.random();
    }

    this.buffers = {
      positions,
      previousPositions,
      velocities,
      speeds,
      seeds,
      count: safeCount,
    };
  };

  public step = (input: SimulationStepInput): ParticleBuffers => {
    const { settings } = input;
    const dt = clamp(0, 1 / 20, input.dt);

    if (settings.count !== this.buffers.count) {
      this.resize(settings.count);
    }

    const { count, positions, previousPositions, velocities, speeds, seeds } =
      this.buffers;
    const nextPositions = new Float32Array(positions.length);
    const nextVelocities = new Float32Array(velocities.length);
    const hash = buildSpatialHash(positions, count, settings.neighborRadius);

    previousPositions.set(positions);

    for (let index = 0; index < count; index += 1) {
      const position = fromBuffer3(positions, index);
      const velocity = fromBuffer3(velocities, index);
      const neighbors = nearestTopologicalNeighbors(
        positions,
        index,
        candidateIndices(hash, position),
        settings.neighborRadius,
        settings.neighborCount,
      );
      const force = murmurationForce({
        index,
        positions,
        velocities,
        seeds,
        neighbors,
        settings,
        time: input.time,
        threatPosition: input.threatPosition,
      });
      const accelerated = add3(velocity, scale3(force, dt * settings.speed));
      const clampedVelocity = speedClampedVelocity(accelerated, settings);
      const inertialVelocity = [
        lerp(accelerated[0], clampedVelocity[0], settings.inertia),
        lerp(accelerated[1], clampedVelocity[1], settings.inertia),
        lerp(accelerated[2], clampedVelocity[2], settings.inertia),
      ] as const satisfies Vec3;
      const nextVelocity = speedClampedVelocity(inertialVelocity, settings);
      const nextPosition = add3(
        position,
        scale3(nextVelocity, dt * settings.speed),
      );

      writeBuffer3(nextPositions, index, isFinite3(nextPosition) ? nextPosition : position);
      writeBuffer3(
        nextVelocities,
        index,
        isFinite3(nextVelocity) ? nextVelocity : velocity,
      );
      speeds[index] = Math.hypot(
        nextVelocities[index * 3],
        nextVelocities[index * 3 + 1],
        nextVelocities[index * 3 + 2],
      );
    }

    positions.set(nextPositions);
    velocities.set(nextVelocities);

    return this.buffers;
  };

  public snapshot = (): ParticleBuffers => this.buffers;

  public dispose = (): void => {
    this.buffers = {
      positions: new Float32Array(0),
      previousPositions: new Float32Array(0),
      velocities: new Float32Array(0),
      speeds: new Float32Array(0),
      seeds: new Float32Array(0),
      count: 0,
    };
  };
}
