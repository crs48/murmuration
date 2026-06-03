import type { MediumMode } from "../app/settings";

export type MediumPreset = Readonly<{
  mode: MediumMode;
  opacity: number;
  pointScale: number;
  turbulence: number;
  drift: number;
  colorMix: number;
}>;

export const mediumPresets = [
  {
    mode: "off",
    opacity: 0,
    pointScale: 1,
    turbulence: 0,
    drift: 0,
    colorMix: 0,
  },
  {
    mode: "grid",
    opacity: 0.34,
    pointScale: 1,
    turbulence: 0.08,
    drift: 0.02,
    colorMix: 0.55,
  },
  {
    mode: "dust",
    opacity: 0.3,
    pointScale: 0.92,
    turbulence: 0.42,
    drift: 0.12,
    colorMix: 0.62,
  },
  {
    mode: "air",
    opacity: 0.18,
    pointScale: 0.68,
    turbulence: 0.26,
    drift: 0.24,
    colorMix: 0.46,
  },
  {
    mode: "starlight",
    opacity: 0.46,
    pointScale: 0.78,
    turbulence: 0.02,
    drift: 0.01,
    colorMix: 0.82,
  },
] as const satisfies readonly MediumPreset[];

export const mediumPresetByMode = (mode: MediumMode): MediumPreset =>
  mediumPresets.find((preset) => preset.mode === mode) ?? mediumPresets[0];
