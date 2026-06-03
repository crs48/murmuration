import type { MurmurationSettings } from "../app/settings";
import { randomSigned, mulberry32 } from "../math/random";
import { clamp, lerp } from "../math/scalar";
import {
  writeBuffer3,
  type Vec3,
} from "../math/vec3";
import { buildSpatialHash } from "./cpuSpatialHash";
import type {
  ParticleBuffers,
  SimulationAdapter,
  SimulationStepInput,
} from "./types";

export const gridSimulationLimit = 1200;

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

  private nextPositions = new Float32Array(0);

  private nextVelocities = new Float32Array(0);

  private topIndices = new Int32Array(12);

  private topDistances = new Float32Array(12);

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
    this.nextPositions = new Float32Array(safeCount * 3);
    this.nextVelocities = new Float32Array(safeCount * 3);
  };

  public step = (input: SimulationStepInput): ParticleBuffers => {
    const { settings } = input;
    const dt = clamp(0, 1 / 20, input.dt);

    if (settings.count !== this.buffers.count) {
      this.resize(settings.count);
    }

    if (settings.simulationMode === "auto" && settings.count > gridSimulationLimit) {
      return this.stepField(input, dt);
    }

    const { count, positions, previousPositions, velocities, speeds, seeds } = this.buffers;
    const { nextPositions, nextVelocities } = this;
    const hash = buildSpatialHash(positions, count, settings.neighborRadius);
    const cellSize = settings.neighborRadius;
    const maxDistanceSq = settings.neighborRadius * settings.neighborRadius;
    const neighborCount = Math.min(settings.neighborCount, this.topIndices.length);
    const minSpeed = Math.min(settings.minSpeed, settings.maxSpeed);

    previousPositions.set(positions);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const px = positions[offset];
      const py = positions[offset + 1];
      const pz = positions[offset + 2];
      const vx = velocities[offset];
      const vy = velocities[offset + 1];
      const vz = velocities[offset + 2];
      const cx = Math.floor(px / cellSize);
      const cy = Math.floor(py / cellSize);
      const cz = Math.floor(pz / cellSize);
      let found = 0;

      this.topIndices.fill(-1, 0, neighborCount);
      this.topDistances.fill(Number.POSITIVE_INFINITY, 0, neighborCount);

      for (let z = cz - 1; z <= cz + 1; z += 1) {
        for (let y = cy - 1; y <= cy + 1; y += 1) {
          for (let x = cx - 1; x <= cx + 1; x += 1) {
            const cell = hash.cells.get(`${x},${y},${z}`);

            if (!cell) {
              continue;
            }

            for (const candidate of cell) {
              if (candidate === index) {
                continue;
              }

              const candidateOffset = candidate * 3;
              const dx = positions[candidateOffset] - px;
              const dy = positions[candidateOffset + 1] - py;
              const dz = positions[candidateOffset + 2] - pz;
              const distanceSq = dx * dx + dy * dy + dz * dz;

              if (distanceSq <= 0 || distanceSq > maxDistanceSq) {
                continue;
              }

              let worstSlot = 0;
              let worstDistance = this.topDistances[0];

              for (let slot = 1; slot < neighborCount; slot += 1) {
                if (this.topDistances[slot] > worstDistance) {
                  worstDistance = this.topDistances[slot];
                  worstSlot = slot;
                }
              }

              if (distanceSq < worstDistance) {
                if (this.topIndices[worstSlot] === -1) {
                  found += 1;
                }

                this.topIndices[worstSlot] = candidate;
                this.topDistances[worstSlot] = distanceSq;
              }
            }
          }
        }
      }

      let sepX = 0;
      let sepY = 0;
      let sepZ = 0;
      let alignX = 0;
      let alignY = 0;
      let alignZ = 0;
      let centerX = 0;
      let centerY = 0;
      let centerZ = 0;

      for (let slot = 0; slot < neighborCount; slot += 1) {
        const neighbor = this.topIndices[slot];

        if (neighbor === -1) {
          continue;
        }

        const neighborOffset = neighbor * 3;
        const nx = positions[neighborOffset];
        const ny = positions[neighborOffset + 1];
        const nz = positions[neighborOffset + 2];
        const inverseDistance = 1 / Math.max(0.0001, this.topDistances[slot]);
        sepX += (px - nx) * inverseDistance;
        sepY += (py - ny) * inverseDistance;
        sepZ += (pz - nz) * inverseDistance;
        alignX += velocities[neighborOffset];
        alignY += velocities[neighborOffset + 1];
        alignZ += velocities[neighborOffset + 2];
        centerX += nx;
        centerY += ny;
        centerZ += nz;
      }

      const foundInv = found > 0 ? 1 / found : 0;
      centerX = centerX * foundInv - px;
      centerY = centerY * foundInv - py;
      centerZ = centerZ * foundInv - pz;
      alignX = alignX * foundInv - vx;
      alignY = alignY * foundInv - vy;
      alignZ = alignZ * foundInv - vz;

      let threatProximity = 0;
      let threatX = 0;
      let threatY = 0;
      let threatZ = 0;

      if (input.threatPosition && settings.threatStrength > 0) {
        const awayX = px - input.threatPosition[0];
        const awayY = py - input.threatPosition[1];
        const awayZ = pz - input.threatPosition[2];
        const threatDistance = Math.hypot(awayX, awayY, awayZ);

        if (threatDistance > 0 && threatDistance < settings.threatRadius) {
          threatProximity = 1 - threatDistance / settings.threatRadius;
          const inverseThreatDistance = 1 / threatDistance;
          threatX +=
            awayX *
            inverseThreatDistance *
            settings.threatStrength *
            (1.1 + settings.vacuoleStrength) *
            threatProximity;
          threatY +=
            awayY *
            inverseThreatDistance *
            settings.threatStrength *
            (1.1 + settings.vacuoleStrength) *
            threatProximity;
          threatZ +=
            awayZ *
            inverseThreatDistance *
            settings.threatStrength *
            (1.1 + settings.vacuoleStrength) *
            threatProximity;
          threatX += -awayZ * inverseThreatDistance * settings.splitGain * threatProximity;
          threatZ += awayX * inverseThreatDistance * settings.splitGain * threatProximity;
          threatX += vx * settings.waveGain * threatProximity * 0.12;
          threatY += vy * settings.waveGain * threatProximity * 0.12;
          threatZ += vz * settings.waveGain * threatProximity * 0.12;
        }
      }

      const seed = seeds[index] * 1000;
      const t = input.time * 0.24 + seed;
      const flowX = Math.sin(py * 2.8 + t) + Math.cos(pz * 2.1 - t * 0.7);
      const flowY = Math.sin(pz * 2.3 + t * 0.8) - Math.cos(px * 1.9 + t);
      const flowZ = Math.sin(px * 2.6 - t * 0.6) + Math.cos(py * 2.2 + t);
      const noiseT = input.time * 1.7;
      const noiseX = Math.sin(seed + noiseT * 1.17);
      const noiseY = Math.sin(seed * 1.31 + noiseT * 1.41);
      const noiseZ = Math.cos(seed * 0.73 - noiseT * 1.23);
      const distanceFromCenter = Math.hypot(px, py, pz);
      const boundaryAmount = Math.max(0, distanceFromCenter - 1.45) * 1.6;
      const blackening = 1 + settings.blackeningGain * threatProximity * 0.85;
      let ax =
        sepX * settings.separation * (2 - blackening) * foundInv +
        alignX * settings.alignment * foundInv +
        centerX * settings.cohesion * blackening +
        flowX * settings.flow * 0.08 +
        noiseX * settings.noise * 0.18 +
        threatX;
      let ay =
        sepY * settings.separation * (2 - blackening) * foundInv +
        alignY * settings.alignment * foundInv +
        centerY * settings.cohesion * blackening +
        flowY * settings.flow * 0.08 +
        noiseY * settings.noise * 0.18 +
        threatY;
      let az =
        sepZ * settings.separation * (2 - blackening) * foundInv +
        alignZ * settings.alignment * foundInv +
        centerZ * settings.cohesion * blackening +
        flowZ * settings.flow * 0.08 +
        noiseZ * settings.noise * 0.18 +
        threatZ;

      if (boundaryAmount > 0 && distanceFromCenter > 0) {
        ax += (-px / distanceFromCenter) * boundaryAmount;
        ay += (-py / distanceFromCenter) * boundaryAmount;
        az += (-pz / distanceFromCenter) * boundaryAmount;
      }

      const acceleratedX = vx + ax * dt * settings.speed;
      const acceleratedY = vy + ay * dt * settings.speed;
      const acceleratedZ = vz + az * dt * settings.speed;
      const acceleratedSpeed = Math.hypot(acceleratedX, acceleratedY, acceleratedZ);
      const clampedSpeed = clamp(minSpeed, settings.maxSpeed, acceleratedSpeed);
      const speedScale =
        acceleratedSpeed === 0 ? 1 : clampedSpeed / acceleratedSpeed;
      const inertialX = lerp(acceleratedX, acceleratedX * speedScale, settings.inertia);
      const inertialY = lerp(acceleratedY, acceleratedY * speedScale, settings.inertia);
      const inertialZ = lerp(acceleratedZ, acceleratedZ * speedScale, settings.inertia);
      const inertialSpeed = Math.hypot(inertialX, inertialY, inertialZ);
      const finalSpeed = clamp(minSpeed, settings.maxSpeed, inertialSpeed);
      const finalScale = inertialSpeed === 0 ? 1 : finalSpeed / inertialSpeed;
      const finalVx = Number.isFinite(inertialX) ? inertialX * finalScale : vx;
      const finalVy = Number.isFinite(inertialY) ? inertialY * finalScale : vy;
      const finalVz = Number.isFinite(inertialZ) ? inertialZ * finalScale : vz;
      const nextPx = px + finalVx * dt * settings.speed;
      const nextPy = py + finalVy * dt * settings.speed;
      const nextPz = pz + finalVz * dt * settings.speed;

      nextPositions[offset] = Number.isFinite(nextPx) ? nextPx : px;
      nextPositions[offset + 1] = Number.isFinite(nextPy) ? nextPy : py;
      nextPositions[offset + 2] = Number.isFinite(nextPz) ? nextPz : pz;
      nextVelocities[offset] = finalVx;
      nextVelocities[offset + 1] = finalVy;
      nextVelocities[offset + 2] = finalVz;
      speeds[index] = Math.hypot(finalVx, finalVy, finalVz);
    }

    positions.set(nextPositions);
    velocities.set(nextVelocities);

    return this.buffers;
  };

  private stepField = (
    input: SimulationStepInput,
    dt: number,
  ): ParticleBuffers => {
    const { settings } = input;
    const { count, positions, previousPositions, velocities, speeds, seeds } = this.buffers;
    const { nextPositions, nextVelocities } = this;
    const minSpeed = Math.min(settings.minSpeed, settings.maxSpeed);

    previousPositions.set(positions);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const px = positions[offset];
      const py = positions[offset + 1];
      const pz = positions[offset + 2];
      const vx = velocities[offset];
      const vy = velocities[offset + 1];
      const vz = velocities[offset + 2];
      const seed = seeds[index] * 1000;
      const distance = Math.max(0.0001, Math.hypot(px, py, pz));
      const sheet = Math.sin(seed + input.time * 0.32) * 0.18;
      const swirlX = -pz / distance;
      const swirlY = (Math.sin(input.time * 0.26 + seed) * 0.3 - py) * 0.35;
      const swirlZ = px / distance;
      const foldX = Math.sin(py * 3.1 + input.time * 0.7 + seed) * settings.flow;
      const foldY = Math.cos((px + pz) * 2.2 - input.time * 0.5 + seed) * settings.flow;
      const foldZ = Math.sin(px * 2.7 - input.time * 0.6 + seed) * settings.flow;
      const desiredRadius = 0.78 + sheet + settings.cohesion * 0.06;
      const radialError = distance - desiredRadius;
      let ax =
        swirlX * settings.alignment * 0.42 -
        (px / distance) * radialError * settings.cohesion * 0.85 +
        foldX * 0.11 +
        Math.sin(seed + input.time * 1.7) * settings.noise * 0.18;
      let ay =
        swirlY * settings.alignment * 0.42 -
        py * settings.cohesion * 0.65 +
        foldY * 0.08 +
        Math.cos(seed * 1.31 + input.time * 1.4) * settings.noise * 0.18;
      let az =
        swirlZ * settings.alignment * 0.42 -
        (pz / distance) * radialError * settings.cohesion * 0.85 +
        foldZ * 0.11 +
        Math.cos(seed * 0.73 - input.time * 1.2) * settings.noise * 0.18;

      if (distance < 0.34) {
        const expansion = (0.34 - distance) * settings.separation * 1.5;
        ax += (px / distance) * expansion;
        ay += (py / distance) * expansion;
        az += (pz / distance) * expansion;
      }

      if (input.threatPosition && settings.threatStrength > 0) {
        const awayX = px - input.threatPosition[0];
        const awayY = py - input.threatPosition[1];
        const awayZ = pz - input.threatPosition[2];
        const threatDistance = Math.hypot(awayX, awayY, awayZ);

        if (threatDistance > 0 && threatDistance < settings.threatRadius) {
          const proximity = 1 - threatDistance / settings.threatRadius;
          const inverseThreatDistance = 1 / threatDistance;
          const push =
            settings.threatStrength *
            (1.1 + settings.vacuoleStrength) *
            proximity;
          ax += awayX * inverseThreatDistance * push;
          ay += awayY * inverseThreatDistance * push;
          az += awayZ * inverseThreatDistance * push;
          ax += -awayZ * inverseThreatDistance * settings.splitGain * proximity;
          az += awayX * inverseThreatDistance * settings.splitGain * proximity;
          ax += vx * settings.waveGain * proximity * 0.12;
          ay += vy * settings.waveGain * proximity * 0.12;
          az += vz * settings.waveGain * proximity * 0.12;
        }
      }

      const boundaryAmount = Math.max(0, distance - 1.55) * 1.8;

      if (boundaryAmount > 0) {
        ax += (-px / distance) * boundaryAmount;
        ay += (-py / distance) * boundaryAmount;
        az += (-pz / distance) * boundaryAmount;
      }

      const acceleratedX = vx + ax * dt * settings.speed;
      const acceleratedY = vy + ay * dt * settings.speed;
      const acceleratedZ = vz + az * dt * settings.speed;
      const acceleratedSpeed = Math.hypot(acceleratedX, acceleratedY, acceleratedZ);
      const clampedSpeed = clamp(minSpeed, settings.maxSpeed, acceleratedSpeed);
      const speedScale =
        acceleratedSpeed === 0 ? 1 : clampedSpeed / acceleratedSpeed;
      const inertialX = lerp(acceleratedX, acceleratedX * speedScale, settings.inertia);
      const inertialY = lerp(acceleratedY, acceleratedY * speedScale, settings.inertia);
      const inertialZ = lerp(acceleratedZ, acceleratedZ * speedScale, settings.inertia);
      const inertialSpeed = Math.hypot(inertialX, inertialY, inertialZ);
      const finalSpeed = clamp(minSpeed, settings.maxSpeed, inertialSpeed);
      const finalScale = inertialSpeed === 0 ? 1 : finalSpeed / inertialSpeed;
      const finalVx = Number.isFinite(inertialX) ? inertialX * finalScale : vx;
      const finalVy = Number.isFinite(inertialY) ? inertialY * finalScale : vy;
      const finalVz = Number.isFinite(inertialZ) ? inertialZ * finalScale : vz;

      nextPositions[offset] = px + finalVx * dt * settings.speed;
      nextPositions[offset + 1] = py + finalVy * dt * settings.speed;
      nextPositions[offset + 2] = pz + finalVz * dt * settings.speed;
      nextVelocities[offset] = finalVx;
      nextVelocities[offset + 1] = finalVy;
      nextVelocities[offset + 2] = finalVz;
      speeds[index] = Math.hypot(finalVx, finalVy, finalVz);
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
