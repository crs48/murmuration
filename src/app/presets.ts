import {
  defaultSettings,
  type MurmurationSettings,
} from "./settings";

export type PresetName =
  | "Quiet Roost"
  | "Lava Lamp"
  | "Ink Cloud"
  | "Predator Ripple"
  | "Vacuole"
  | "Silk Sheet"
  | "Storm Turn";

export type Preset = Readonly<{
  name: PresetName;
  settings: MurmurationSettings;
}>;

const preset = (
  name: PresetName,
  overrides: Partial<MurmurationSettings>,
): Preset => ({
  name,
  settings: {
    ...defaultSettings,
    ...overrides,
  },
});

export const presets = [
  preset("Quiet Roost", {
    count: 3000,
    speed: 0.48,
    minSpeed: 0.06,
    maxSpeed: 1.2,
    separation: 0.85,
    alignment: 0.65,
    cohesion: 1.85,
    inertia: 0.82,
    noise: 0.03,
    flow: 0.18,
    chaseStrength: 0.72,
    attractorRadius: 0.5,
    attractorSpeed: 0.55,
    trailMode: "velocity",
    trailLength: 0.24,
    trailOpacity: 0.12,
    fov: 52,
  }),
  preset("Lava Lamp", {
    count: 16000,
  }),
  preset("Ink Cloud", {
    count: 18000,
    speed: 0.62,
    separation: 0.92,
    alignment: 0.9,
    cohesion: 1.8,
    noise: 0.035,
    flow: 0.3,
    chaseStrength: 0.82,
    attractorRadius: 1.34,
    attractorSpeed: 1.08,
    particleScale: 0.82,
    depthFade: 0.55,
    trailLength: 0.16,
    trailOpacity: 0.1,
  }),
  preset("Predator Ripple", {
    count: 12000,
    speed: 0.78,
    maxSpeed: 1.8,
    separation: 1.05,
    alignment: 1.05,
    cohesion: 1.15,
    inertia: 0.7,
    noise: 0.08,
    flow: 0.48,
    chaseStrength: 0.64,
    attractorRadius: 1.08,
    attractorSpeed: 1.18,
    threatMode: "orbit",
    threatStrength: 0.72,
    threatRadius: 0.24,
    waveGain: 1.35,
    blackeningGain: 0.58,
    trailLength: 0.48,
  }),
  preset("Vacuole", {
    count: 10000,
    speed: 0.68,
    maxSpeed: 1.6,
    separation: 1.12,
    alignment: 0.92,
    cohesion: 1.25,
    flow: 0.42,
    chaseStrength: 0.76,
    attractorRadius: 0.96,
    attractorSpeed: 1.02,
    threatMode: "autonomous",
    threatStrength: 0.68,
    threatRadius: 0.32,
    vacuoleStrength: 1.45,
    splitGain: 0.34,
  }),
  preset("Silk Sheet", {
    count: 14000,
    speed: 0.46,
    minSpeed: 0.05,
    maxSpeed: 1.1,
    neighborRadius: 0.16,
    separation: 0.92,
    alignment: 1.1,
    cohesion: 1.1,
    inertia: 0.88,
    noise: 0.025,
    flow: 0.24,
    chaseStrength: 0.68,
    attractorRadius: 1.12,
    attractorSpeed: 0.68,
    particleScale: 0.74,
    trailLength: 0.42,
  }),
  preset("Storm Turn", {
    count: 16000,
    speed: 0.9,
    maxSpeed: 2.1,
    separation: 1.1,
    alignment: 1.15,
    cohesion: 1.25,
    inertia: 0.58,
    noise: 0.1,
    flow: 0.72,
    chaseStrength: 0.42,
    attractorRadius: 1.28,
    attractorSpeed: 1.55,
    threatMode: "autonomous",
    threatStrength: 0.46,
    threatRadius: 0.2,
    waveGain: 1.7,
    trailLength: 0.62,
  }),
] as const satisfies readonly Preset[];

export const presetNames = presets.map(({ name }) => name);

export const presetByName = (name: PresetName): Preset =>
  presets.find((candidate) => candidate.name === name) ?? presets[0];
