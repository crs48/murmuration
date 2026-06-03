import {
  defaultSettings,
  type MurmurationSettings,
} from "./settings";

export type PresetName =
  | "Quiet Roost"
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
  preset("Quiet Roost", {}),
  preset("Ink Cloud", {
    count: 18000,
    speed: 1.1,
    separation: 1.05,
    alignment: 2.2,
    cohesion: 1.4,
    noise: 0.05,
    flow: 0.5,
    particleScale: 0.82,
    depthFade: 0.55,
    trailLength: 0.16,
    trailOpacity: 0.1,
  }),
  preset("Predator Ripple", {
    count: 12000,
    speed: 1.35,
    separation: 1.6,
    alignment: 2.4,
    cohesion: 0.72,
    noise: 0.16,
    flow: 0.85,
    threatMode: "orbit",
    threatStrength: 0.72,
    threatRadius: 0.24,
    waveGain: 1.35,
    blackeningGain: 0.58,
    trailLength: 0.48,
  }),
  preset("Vacuole", {
    count: 10000,
    speed: 1.05,
    separation: 1.8,
    alignment: 1.9,
    cohesion: 0.55,
    flow: 0.65,
    threatMode: "autonomous",
    threatStrength: 0.68,
    threatRadius: 0.32,
    vacuoleStrength: 1.45,
    splitGain: 0.34,
  }),
  preset("Silk Sheet", {
    count: 14000,
    speed: 0.76,
    minSpeed: 0.18,
    maxSpeed: 1.7,
    neighborRadius: 0.16,
    separation: 1.18,
    alignment: 2.65,
    cohesion: 0.52,
    inertia: 0.84,
    noise: 0.04,
    flow: 0.38,
    particleScale: 0.74,
    trailLength: 0.42,
  }),
  preset("Storm Turn", {
    count: 16000,
    speed: 1.65,
    maxSpeed: 4.4,
    separation: 1.72,
    alignment: 2.1,
    cohesion: 0.9,
    inertia: 0.42,
    noise: 0.22,
    flow: 1.35,
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

