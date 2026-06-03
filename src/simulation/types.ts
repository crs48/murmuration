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
}>;

export type SimulationAdapter = Readonly<{
  resize: (count: number) => void;
  step: (input: SimulationStepInput) => ParticleBuffers;
  snapshot: () => ParticleBuffers;
  dispose: () => void;
}>;

