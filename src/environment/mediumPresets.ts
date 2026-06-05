import type { MediumMode } from "../app/settings";

export type MediumPreset = Readonly<{
  mode: MediumMode;
  opacity: number;
  pointScale: number;
  turbulence: number;
  drift: number;
  colorMix: number;
  density: number;
  jitter: number;
}>;

export const mediumPresets = [
  {
    mode: "off",
    opacity: 0,
    pointScale: 1,
    turbulence: 0,
    drift: 0,
    colorMix: 0,
    density: 0,
    jitter: 0,
  },
  {
    mode: "grid",
    opacity: 0.58,
    pointScale: 1.08,
    turbulence: 0,
    drift: 0,
    colorMix: 0.72,
    density: 1,
    jitter: 0,
  },
  {
    mode: "dust",
    opacity: 0.48,
    pointScale: 0.82,
    turbulence: 0.42,
    drift: 0.12,
    colorMix: 0.68,
    density: 0.76,
    jitter: 0.16,
  },
  {
    mode: "air",
    opacity: 0.32,
    pointScale: 0.68,
    turbulence: 0.26,
    drift: 0.24,
    colorMix: 0.58,
    density: 0.44,
    jitter: 0.19,
  },
  {
    mode: "starlight",
    opacity: 0.72,
    pointScale: 0.66,
    turbulence: 0.02,
    drift: 0.01,
    colorMix: 0.88,
    density: 0.34,
    jitter: 0.15,
  },
] as const satisfies readonly MediumPreset[];

export const mediumPresetByMode = (mode: MediumMode): MediumPreset =>
  mediumPresets.find((preset) => preset.mode === mode) ?? mediumPresets[0];
