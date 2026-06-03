import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

export type ParticleBuffers = Readonly<{
  positions: Float32Array;
  previousPositions: Float32Array;
  velocities: Float32Array;
  speeds: Float32Array;
  seeds: Float32Array;
  count: number;
}>;

export type SimulationStepInput = Readonly<{
  dt: number;
  time: number;
  settings: MurmurationSettings;
  threatPosition: Vec3 | null;
  pilot?: SimulationPilot | null;
}>;

export type SimulationPilot = Readonly<{
  corePosition: Vec3;
  coreVelocity: Vec3;
  heading: Vec3;
  radius: number;
  roll: number;
  mediumPulse: number;
}>;

export type SimulationAdapter = Readonly<{
  resize: (count: number) => void;
  step: (input: SimulationStepInput) => ParticleBuffers;
  snapshot: () => ParticleBuffers;
  dispose: () => void;
}>;
