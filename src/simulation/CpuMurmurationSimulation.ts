import type { MurmurationSettings } from "../app/settings";
import { mulberry32 } from "../math/random";
import { clamp, lerp } from "../math/scalar";
import {
  writeBuffer3,
} from "../math/vec3";
import { buildSpatialHash } from "./cpuSpatialHash";
import { flockWanderCenter } from "./flockWander";
import {
  initialParticlePosition,
  initialParticleVelocity,
} from "./particleInitialization";
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

const cyclicWeight = (value: number, center: number): number => {
  const distanceToCenter = Math.abs(value - center);
  const wrappedDistance = Math.min(distanceToCenter, 1 - distanceToCenter);
  const weight = Math.max(0, 1 - wrappedDistance * 7.5);

  return weight * weight;
};

const fract = (value: number): number => value - Math.floor(value);

const shaderHash = (seed: number): number =>
  fract(Math.sin(seed * 12.9898) * 43758.5453);

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp(0, 1, (value - edge0) / (edge1 - edge0));

  return t * t * (3 - 2 * t);
};

const leaderAnchor = (
  centerX: number,
  centerY: number,
  centerZ: number,
  time: number,
  groupSeed: number,
): readonly [number, number, number] => {
  const phase = groupSeed * Math.PI * 2;

  return [
    centerX +
      Math.cos(phase + time * 0.21) * 0.5 +
      Math.sin(time * 0.13 + phase * 2.3) * 0.16,
    centerY +
      Math.sin(phase * 1.7 + time * 0.19) * 0.34 +
      Math.cos(time * 0.11 + phase) * 0.12,
    centerZ +
      Math.sin(phase + time * 0.16) * 0.46 +
      Math.cos(time * 0.23 + phase * 1.4) * 0.14,
  ];
};

const stratifiedOffset = (
  slot: number,
  groupSeed: number,
  time: number,
  chaseStrength: number,
  separation: number,
): readonly [number, number, number] => {
  const goldenAngle = 2.39996323;
  const y = 1 - 2 * fract((slot + 0.5) * 0.61803398875 + groupSeed * 0.13);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = slot * goldenAngle + groupSeed * Math.PI * 2;
  const shell = Math.cbrt(fract((slot + 1) * 0.754877666));
  const radius =
    (0.16 + shell * 0.34) *
    (0.68 + chaseStrength * 0.34) *
    (0.92 + separation * 0.045);
  const laminarBreath = 1 + Math.sin(time * 0.13 + groupSeed * 12) * 0.035;

  return [
    Math.cos(theta) * ring * radius * laminarBreath,
    y * radius * laminarBreath,
    Math.sin(theta) * ring * radius * laminarBreath,
  ];
};

const rippleEnvelope = (localTime: number): number =>
  smoothstep(0.6, 1.7, localTime) *
  (1 - smoothstep(6.2, 8.8, localTime));

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

const rippleVector = (
  px: number,
  py: number,
  pz: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  time: number,
  offset: number,
): readonly [number, number, number, number] => {
  const localTime = positiveModulo(time + offset, 28);
  const envelope = rippleEnvelope(localTime);
  const t = time + offset;
  const originX = centerX + Math.sin(t * 0.17 + offset) * 0.46;
  const originY = centerY + Math.cos(t * 0.13 + offset * 1.7) * 0.25;
  const originZ = centerZ + Math.cos(t * 0.19 + offset * 0.6) * 0.42;
  const awayX = px - originX;
  const awayY = py - originY;
  const awayZ = pz - originZ;
  const distanceFromRipple = Math.max(
    0.0001,
    Math.hypot(awayX, awayY, awayZ),
  );
  const radius = 0.16 + localTime * 0.16;
  const width = 0.11 + localTime * 0.012;
  const delta = Math.abs(distanceFromRipple - radius) / width;
  const amount = Math.exp(-delta * delta) * envelope;

  return [
    (awayX / distanceFromRipple) * amount,
    (awayY / distanceFromRipple) * amount,
    (awayZ / distanceFromRipple) * amount,
    amount,
  ];
};

const slotRepulsion = (
  positions: Float32Array,
  count: number,
  index: number,
  slotOffset: number,
  px: number,
  py: number,
  pz: number,
  minimumDistance: number,
): readonly [number, number, number] => {
  const otherIndex = positiveModulo(index + slotOffset, count);
  const otherOffset = otherIndex * 3;
  const awayX = px - positions[otherOffset];
  const awayY = py - positions[otherOffset + 1];
  const awayZ = pz - positions[otherOffset + 2];
  const distanceToOther = Math.hypot(awayX, awayY, awayZ);
  const proximity = Math.max(0, minimumDistance - distanceToOther) / minimumDistance;

  if (distanceToOther <= 0.0001 || proximity <= 0) {
    return [0, 0, 0];
  }

  const scale = (proximity * proximity) / distanceToOther;

  return [awayX * scale, awayY * scale, awayZ * scale];
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
      const position = initialParticlePosition(this.random, index, safeCount);
      const velocity = initialParticleVelocity(this.random, position);
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

    if (settings.simulationMode !== "cpu" && settings.count > gridSimulationLimit) {
      return this.stepField(input, dt);
    }

    const { count, positions, previousPositions, velocities, speeds, seeds } = this.buffers;
    const { nextPositions, nextVelocities } = this;
    const hash = buildSpatialHash(positions, count, settings.neighborRadius);
    const cellSize = settings.neighborRadius;
    const maxDistanceSq = settings.neighborRadius * settings.neighborRadius;
    const neighborCount = Math.min(settings.neighborCount, this.topIndices.length);
    const minSpeed = Math.min(settings.minSpeed, settings.maxSpeed);
    const pilot = input.pilot ?? null;
    const autoFlockCenter = flockWanderCenter(settings, input.time);
    const nextAutoFlockCenter = flockWanderCenter(settings, input.time + 0.75);
    const autoHeadingX = nextAutoFlockCenter[0] - autoFlockCenter[0];
    const autoHeadingY = nextAutoFlockCenter[1] - autoFlockCenter[1];
    const autoHeadingZ = nextAutoFlockCenter[2] - autoFlockCenter[2];
    const autoHeadingDistance = Math.hypot(
      autoHeadingX,
      autoHeadingY,
      autoHeadingZ,
    );
    const inverseAutoHeadingDistance =
      autoHeadingDistance > 0.0001 ? 1 / autoHeadingDistance : 0;
    const hasAutoAttractor =
      settings.attractorRadius > 0 && settings.wanderRadius > 0;
    const hasCore = Boolean(pilot) || hasAutoAttractor;
    const pilotX = pilot?.corePosition[0] ?? autoFlockCenter[0];
    const pilotY = pilot?.corePosition[1] ?? autoFlockCenter[1];
    const pilotZ = pilot?.corePosition[2] ?? autoFlockCenter[2];
    const pilotHeadingX =
      pilot?.heading[0] ?? autoHeadingX * inverseAutoHeadingDistance;
    const pilotHeadingY =
      pilot?.heading[1] ?? autoHeadingY * inverseAutoHeadingDistance;
    const pilotHeadingZ =
      pilot?.heading[2] ?? autoHeadingZ * inverseAutoHeadingDistance;
    const pilotRadius = pilot?.radius ?? 1;
    const coreFollow = pilot ? 0.22 : settings.chaseStrength * 0.16;
    const headingFollow = pilot ? 0.16 : settings.chaseStrength * 0.1;
    const threatVelocityX = input.threatVelocity?.[0] ?? 0;
    const threatVelocityY = input.threatVelocity?.[1] ?? 0;
    const threatVelocityZ = input.threatVelocity?.[2] ?? 0;
    const threatVelocitySpeed = Math.hypot(
      threatVelocityX,
      threatVelocityY,
      threatVelocityZ,
    );
    const inverseThreatVelocitySpeed =
      threatVelocitySpeed > 0.0001 ? 1 / threatVelocitySpeed : 0;
    const threatDirectionX = threatVelocityX * inverseThreatVelocitySpeed;
    const threatDirectionY = threatVelocityY * inverseThreatVelocitySpeed;
    const threatDirectionZ = threatVelocityZ * inverseThreatVelocitySpeed;

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
          const broadProximity = Math.sqrt(threatProximity);
          const inverseThreatDistance = 1 / threatDistance;
          const push =
            settings.threatStrength *
            (2.5 + settings.vacuoleStrength * 1.7) *
            broadProximity;
          const wake =
            Math.min(1.8, threatVelocitySpeed) *
            settings.threatStrength *
            broadProximity *
            0.42;
          threatX +=
            awayX * inverseThreatDistance * push +
            (awayX * inverseThreatDistance - threatDirectionX * 0.35) * wake;
          threatY +=
            awayY * inverseThreatDistance * push +
            (awayY * inverseThreatDistance - threatDirectionY * 0.35) * wake;
          threatZ +=
            awayZ * inverseThreatDistance * push +
            (awayZ * inverseThreatDistance - threatDirectionZ * 0.35) * wake;
          threatX +=
            -awayZ * inverseThreatDistance * settings.splitGain * broadProximity * 1.45;
          threatY +=
            awayY * inverseThreatDistance * settings.splitGain * broadProximity * 0.28;
          threatZ +=
            awayX * inverseThreatDistance * settings.splitGain * broadProximity * 1.45;
          threatX += vx * settings.waveGain * broadProximity * 0.22;
          threatY += vy * settings.waveGain * broadProximity * 0.22;
          threatZ += vz * settings.waveGain * broadProximity * 0.22;
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
      const fromPilotX = px - pilotX;
      const fromPilotY = py - pilotY;
      const fromPilotZ = pz - pilotZ;
      const distanceFromCenter = Math.hypot(fromPilotX, fromPilotY, fromPilotZ);
      const boundaryAmount = Math.max(0, distanceFromCenter - 1.45 * pilotRadius) * 1.6;
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

      if (hasCore) {
        ax +=
          (pilotX - px) * settings.cohesion * coreFollow +
          pilotHeadingX * settings.alignment * headingFollow;
        ay +=
          (pilotY - py) * settings.cohesion * coreFollow +
          pilotHeadingY * settings.alignment * headingFollow;
        az +=
          (pilotZ - pz) * settings.cohesion * coreFollow +
          pilotHeadingZ * settings.alignment * headingFollow;
      }

      if (boundaryAmount > 0 && distanceFromCenter > 0) {
        ax += (-fromPilotX / distanceFromCenter) * boundaryAmount;
        ay += (-fromPilotY / distanceFromCenter) * boundaryAmount;
        az += (-fromPilotZ / distanceFromCenter) * boundaryAmount;
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
    const autoFlockCenter = flockWanderCenter(
      settings,
      input.time,
    );
    const pilot = input.pilot ?? null;
    const flockCenterX = pilot?.corePosition[0] ?? autoFlockCenter[0];
    const flockCenterY = pilot?.corePosition[1] ?? autoFlockCenter[1];
    const flockCenterZ = pilot?.corePosition[2] ?? autoFlockCenter[2];
    const pilotRadius = pilot?.radius ?? 1;
    const threatVelocityX = input.threatVelocity?.[0] ?? 0;
    const threatVelocityY = input.threatVelocity?.[1] ?? 0;
    const threatVelocityZ = input.threatVelocity?.[2] ?? 0;
    const threatVelocitySpeed = Math.hypot(
      threatVelocityX,
      threatVelocityY,
      threatVelocityZ,
    );
    const inverseThreatVelocitySpeed =
      threatVelocitySpeed > 0.0001 ? 1 / threatVelocitySpeed : 0;
    const threatDirectionX = threatVelocityX * inverseThreatVelocitySpeed;
    const threatDirectionY = threatVelocityY * inverseThreatVelocitySpeed;
    const threatDirectionZ = threatVelocityZ * inverseThreatVelocitySpeed;

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
      const unitSeed = seeds[index];
      const fromCenterX = px - flockCenterX;
      const fromCenterY = py - flockCenterY;
      const fromCenterZ = pz - flockCenterZ;
      const distance = Math.max(
        0.0001,
        Math.hypot(fromCenterX, fromCenterY, fromCenterZ),
      );
      const blobA = [
        flockCenterX + Math.sin(input.time * 0.19) * 0.74,
        flockCenterY + Math.sin(input.time * 0.31 + 0.8) * 0.48,
        flockCenterZ + Math.cos(input.time * 0.23) * 0.62,
      ];
      const blobB = [
        flockCenterX + Math.cos(input.time * 0.17 + 1.6) * 0.68,
        flockCenterY + Math.sin(input.time * 0.37 + 2.1) * 0.54,
        flockCenterZ + Math.sin(input.time * 0.29 + 0.4) * 0.72,
      ];
      const blobC = [
        flockCenterX + Math.sin(input.time * 0.27 + 2.7) * 0.58,
        flockCenterY + Math.cos(input.time * 0.21 + 1.2) * 0.42,
        flockCenterZ + Math.cos(input.time * 0.33 + 2.5) * 0.68,
      ];
      const blobD = [
        flockCenterX + Math.cos(input.time * 0.24 + 3.4) * 0.7,
        flockCenterY + Math.sin(input.time * 0.33 + 0.6) * 0.5,
        flockCenterZ + Math.sin(input.time * 0.18 + 1.4) * 0.58,
      ];
      const blobE = [
        flockCenterX + Math.sin(input.time * 0.14 + 4.4) * 0.48,
        flockCenterY + Math.sin(input.time * 0.47 + 2.3) * 0.62,
        flockCenterZ + Math.cos(input.time * 0.26 + 4.0) * 0.7,
      ];
      const phase =
        (unitSeed * 3.71 +
          input.time * 0.022 +
          Math.sin(unitSeed * 19 + input.time * 0.11) * 0.09 +
          1) %
        1;
      const weightA = cyclicWeight(phase, 0);
      const weightB = cyclicWeight(phase, 0.2);
      const weightC = cyclicWeight(phase, 0.4);
      const weightD = cyclicWeight(phase, 0.6);
      const weightE = cyclicWeight(phase, 0.8);
      const weightTotal = Math.max(
        0.0001,
        weightA + weightB + weightC + weightD + weightE,
      );
      const legacyTargetX =
        (blobA[0] * weightA +
          blobB[0] * weightB +
          blobC[0] * weightC +
          blobD[0] * weightD +
          blobE[0] * weightE) /
        weightTotal;
      const legacyTargetY =
        (blobA[1] * weightA +
          blobB[1] * weightB +
          blobC[1] * weightC +
          blobD[1] * weightD +
          blobE[1] * weightE) /
        weightTotal;
      const legacyTargetZ =
        (blobA[2] * weightA +
          blobB[2] * weightB +
          blobC[2] * weightC +
          blobD[2] * weightD +
          blobE[2] * weightE) /
        weightTotal;
      const driftX = pilot?.heading[0] ?? 0.72 + Math.sin(input.time * 0.09) * 0.16;
      const driftY = pilot?.heading[1] ?? Math.sin(input.time * 0.13 + 0.7) * 0.22;
      const driftZ = pilot?.heading[2] ?? 0.08 + Math.cos(input.time * 0.11 + 1.2) * 0.18;
      const driftLength = Math.max(0.0001, Math.hypot(driftX, driftY, driftZ));
      const driftSpeed = 0.28 + settings.flow * 0.12 + settings.cohesion * 0.03;
      const driftVelocityX = (driftX / driftLength) * driftSpeed;
      const driftVelocityY = (driftY / driftLength) * driftSpeed;
      const driftVelocityZ = (driftZ / driftLength) * driftSpeed;
      const groupCount = 7;
      const group = Math.floor(unitSeed * groupCount);
      const groupSeed = (group + 0.5) / groupCount;
      const leaderLag = shaderHash(unitSeed + 9.17) * (1.1 + settings.chaseStrength * 2.4);
      const neighborGroup =
        (group + 1 + Math.floor(shaderHash(unitSeed + 4.2) * 3)) % groupCount;
      const neighborSeed = (neighborGroup + 0.5) / groupCount;
      const primaryAnchor = leaderAnchor(
        flockCenterX,
        flockCenterY,
        flockCenterZ,
        input.time - leaderLag,
        groupSeed,
      );
      const secondaryAnchor = leaderAnchor(
        flockCenterX,
        flockCenterY,
        flockCenterZ,
        input.time - leaderLag * 1.7 - 0.8,
        neighborSeed,
      );
      const role = shaderHash(unitSeed + 5.91);
      const secondaryMix = 0.16 + shaderHash(unitSeed + 6.24) * 0.28;
      const leaderMix = role > 0.84 ? 0.62 : 0;
      const offsetVector = stratifiedOffset(
        index,
        groupSeed,
        input.time,
        settings.chaseStrength,
        settings.separation,
      );
      const followerTargetX =
        lerp(primaryAnchor[0], secondaryAnchor[0], secondaryMix) + offsetVector[0];
      const followerTargetY =
        lerp(primaryAnchor[1], secondaryAnchor[1], secondaryMix) + offsetVector[1];
      const followerTargetZ =
        lerp(primaryAnchor[2], secondaryAnchor[2], secondaryMix) + offsetVector[2];
      const leaderTargetX =
        flockCenterX + (driftX / driftLength) * (0.18 + shaderHash(unitSeed + 7.1) * 0.18);
      const leaderTargetY =
        flockCenterY + (driftY / driftLength) * (0.08 + shaderHash(unitSeed + 8.1) * 0.16);
      const leaderTargetZ =
        flockCenterZ + (driftZ / driftLength) * (0.18 + shaderHash(unitSeed + 9.1) * 0.18);
      const chaseTargetX = lerp(followerTargetX, leaderTargetX, leaderMix);
      const chaseTargetY = lerp(followerTargetY, leaderTargetY, leaderMix);
      const chaseTargetZ = lerp(followerTargetZ, leaderTargetZ, leaderMix);
      const targetX = lerp(legacyTargetX, chaseTargetX, settings.chaseStrength);
      const targetY = lerp(legacyTargetY, chaseTargetY, settings.chaseStrength);
      const targetZ = lerp(legacyTargetZ, chaseTargetZ, settings.chaseStrength);
      const localX = px - targetX;
      const localY = py - targetY;
      const localZ = pz - targetZ;
      const localDistance = Math.max(
        0.0001,
        Math.hypot(localX, localY, localZ),
      );
      const localDirectionX = localX / localDistance;
      const localDirectionY = localY / localDistance;
      const localDirectionZ = localZ / localDistance;
      const blobRadius =
        (0.24 +
          (0.5 + 0.5 * Math.sin(unitSeed * 41 + input.time * 0.29)) * 0.16 +
          Math.sin(phase * Math.PI * 2 + input.time * 0.17) * 0.05) *
        pilotRadius;
      const shellError = localDistance - blobRadius;
      const axisX = Math.sin(input.time * 0.13 + unitSeed * 7);
      const axisY = 0.72 + Math.sin(input.time * 0.19 + unitSeed * 3) * 0.28;
      const axisZ = Math.cos(input.time * 0.17 + unitSeed * 5);
      const axisLength = Math.max(0.0001, Math.hypot(axisX, axisY, axisZ));
      const unitAxisX = axisX / axisLength;
      const unitAxisY = axisY / axisLength;
      const unitAxisZ = axisZ / axisLength;
      const tangentX = unitAxisY * localDirectionZ - unitAxisZ * localDirectionY;
      const tangentY = unitAxisZ * localDirectionX - unitAxisX * localDirectionZ;
      const tangentZ = unitAxisX * localDirectionY - unitAxisY * localDirectionX;
      const tangentLength = Math.max(
        0.0001,
        Math.hypot(tangentX, tangentY, tangentZ),
      );
      const foldX =
        Math.sin(py * 3.7 + input.time * 0.73 + seed) +
        Math.cos(pz * 2.9 - input.time * 0.51);
      const foldY =
        Math.sin(pz * 3.1 - input.time * 0.67 + seed) -
        Math.cos(px * 2.4 + input.time * 0.43);
      const foldZ =
        Math.sin(px * 3.3 + input.time * 0.59 + seed) +
        Math.cos(py * 2.6 - input.time * 0.47);
      const buoyancy =
        Math.sin(localDistance * 8 - input.time * 1.1 + unitSeed * 17) * 0.09 +
        (targetY - py) * 0.24;
      const shellInfluence = 1 - settings.chaseStrength;
      const targetPull =
        0.3 + settings.chaseStrength * 0.42 + settings.separation * 0.08;
      const driftPull = 0.16 + settings.chaseStrength * 0.06;
      const tangentPull = 0.035 * shellInfluence;
      const viscousDrag = settings.chaseStrength * (0.08 + settings.flow * 0.02);
      const flowPull = 0.035 + settings.chaseStrength * 0.015;
      const slotDistance = 0.07 + settings.separation * 0.02;
      const spacingA = slotRepulsion(
        positions,
        count,
        index,
        1,
        px,
        py,
        pz,
        slotDistance,
      );
      const spacingB = slotRepulsion(
        positions,
        count,
        index,
        -1,
        px,
        py,
        pz,
        slotDistance,
      );
      const spacingC = slotRepulsion(
        positions,
        count,
        index,
        7,
        px,
        py,
        pz,
        slotDistance,
      );
      const spacingD = slotRepulsion(
        positions,
        count,
        index,
        -7,
        px,
        py,
        pz,
        slotDistance,
      );
      const spacingE = slotRepulsion(
        positions,
        count,
        index,
        31,
        px,
        py,
        pz,
        slotDistance,
      );
      const spacingF = slotRepulsion(
        positions,
        count,
        index,
        -31,
        px,
        py,
        pz,
        slotDistance,
      );
      const spacingPull = settings.separation * (0.14 + settings.chaseStrength * 0.05);
      const spacingX =
        spacingA[0] + spacingB[0] + spacingC[0] + spacingD[0] + spacingE[0] + spacingF[0];
      const spacingY =
        spacingA[1] + spacingB[1] + spacingC[1] + spacingD[1] + spacingE[1] + spacingF[1];
      const spacingZ =
        spacingA[2] + spacingB[2] + spacingC[2] + spacingD[2] + spacingE[2] + spacingF[2];
      const rippleA = rippleVector(
        px,
        py,
        pz,
        flockCenterX,
        flockCenterY,
        flockCenterZ,
        input.time,
        0,
      );
      const rippleB = rippleVector(
        px,
        py,
        pz,
        flockCenterX,
        flockCenterY,
        flockCenterZ,
        input.time,
        9.333333,
      );
      const rippleC = rippleVector(
        px,
        py,
        pz,
        flockCenterX,
        flockCenterY,
        flockCenterZ,
        input.time,
        18.666666,
      );
      const rippleRadialX = rippleA[0] + rippleB[0] + rippleC[0];
      const rippleRadialY = rippleA[1] + rippleB[1] + rippleC[1];
      const rippleRadialZ = rippleA[2] + rippleB[2] + rippleC[2];
      const rippleAmount = Math.min(1, rippleA[3] + rippleB[3] + rippleC[3]);
      const rippleTwistX =
        (driftY / driftLength) * rippleRadialZ -
        (driftZ / driftLength) * rippleRadialY;
      const rippleTwistY =
        (driftZ / driftLength) * rippleRadialX -
        (driftX / driftLength) * rippleRadialZ;
      const rippleTwistZ =
        (driftX / driftLength) * rippleRadialY -
        (driftY / driftLength) * rippleRadialX;
      const ripplePull = settings.flow * (0.13 + settings.waveGain * 0.04);
      const flowPulse = 0.22 + rippleAmount * 1.35;
      const noisePulse = 0.045 + rippleAmount * 0.08;
      let ax =
        -localDirectionX * shellError * settings.cohesion * 1.35 * shellInfluence +
        (targetX - px) * settings.cohesion * targetPull +
        (driftVelocityX - vx) * settings.alignment * driftPull -
        vx * viscousDrag +
        (tangentX / tangentLength) * settings.alignment * tangentPull +
        spacingX * spacingPull +
        foldX * settings.flow * flowPull * flowPulse +
        (rippleRadialX + rippleTwistX * 0.28) * ripplePull +
        Math.sin(seed + input.time * 1.7) * settings.noise * noisePulse;
      let ay =
        -localDirectionY * shellError * settings.cohesion * 1.35 * shellInfluence +
        (targetY - py) * settings.cohesion * targetPull +
        (driftVelocityY - vy) * settings.alignment * driftPull -
        vy * viscousDrag +
        (tangentY / tangentLength) * settings.alignment * tangentPull +
        spacingY * spacingPull +
        foldY * settings.flow * flowPull * flowPulse +
        (rippleRadialY + rippleTwistY * 0.28) * ripplePull +
        buoyancy * (0.75 + settings.flow * 0.25) +
        Math.cos(seed * 1.31 + input.time * 1.4) * settings.noise * noisePulse;
      let az =
        -localDirectionZ * shellError * settings.cohesion * 1.35 * shellInfluence +
        (targetZ - pz) * settings.cohesion * targetPull +
        (driftVelocityZ - vz) * settings.alignment * driftPull -
        vz * viscousDrag +
        (tangentZ / tangentLength) * settings.alignment * tangentPull +
        spacingZ * spacingPull +
        foldZ * settings.flow * flowPull * flowPulse +
        (rippleRadialZ + rippleTwistZ * 0.28) * ripplePull +
        Math.cos(seed * 0.73 - input.time * 1.2) * settings.noise * noisePulse;

      const innerRadius =
        blobRadius * (0.28 + shellInfluence * 0.18 + settings.separation * 0.012);
      if (localDistance < innerRadius) {
        const expansion = (innerRadius - localDistance) * settings.separation * 1.4;
        ax += localDirectionX * expansion;
        ay += localDirectionY * expansion;
        az += localDirectionZ * expansion;
      }

      if (input.threatPosition && settings.threatStrength > 0) {
        const awayX = px - input.threatPosition[0];
        const awayY = py - input.threatPosition[1];
        const awayZ = pz - input.threatPosition[2];
        const threatDistance = Math.hypot(awayX, awayY, awayZ);

        if (threatDistance > 0 && threatDistance < settings.threatRadius) {
          const proximity = 1 - threatDistance / settings.threatRadius;
          const broadProximity = Math.sqrt(proximity);
          const inverseThreatDistance = 1 / threatDistance;
          const push =
            settings.threatStrength *
            (2.5 + settings.vacuoleStrength * 1.7) *
            broadProximity;
          const wake =
            Math.min(1.8, threatVelocitySpeed) *
            settings.threatStrength *
            broadProximity *
            0.42;
          ax +=
            awayX * inverseThreatDistance * push +
            (awayX * inverseThreatDistance - threatDirectionX * 0.35) * wake;
          ay +=
            awayY * inverseThreatDistance * push +
            (awayY * inverseThreatDistance - threatDirectionY * 0.35) * wake;
          az +=
            awayZ * inverseThreatDistance * push +
            (awayZ * inverseThreatDistance - threatDirectionZ * 0.35) * wake;
          ax += -awayZ * inverseThreatDistance * settings.splitGain * broadProximity * 1.45;
          ay += awayY * inverseThreatDistance * settings.splitGain * broadProximity * 0.28;
          az += awayX * inverseThreatDistance * settings.splitGain * broadProximity * 1.45;
          ax += vx * settings.waveGain * broadProximity * 0.22;
          ay += vy * settings.waveGain * broadProximity * 0.22;
          az += vz * settings.waveGain * broadProximity * 0.22;
        }
      }

      const boundaryAmount = Math.max(0, distance - 1.75 * pilotRadius) * 2.0;

      if (boundaryAmount > 0) {
        ax += (-fromCenterX / distance) * boundaryAmount;
        ay += (-fromCenterY / distance) * boundaryAmount;
        az += (-fromCenterZ / distance) * boundaryAmount;
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
