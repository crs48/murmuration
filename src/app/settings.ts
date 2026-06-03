export type ThemeName = "ink" | "inverse" | "paper" | "graphite";
export type RenderMode = "points" | "impostor-quads" | "instanced-spheres";
export type ThreatMode = "off" | "cursor" | "orbit" | "autonomous";
export type SimulationMode = "auto" | "cpu" | "webgl-gpgpu" | "webgpu";
export type TrailMode = "velocity" | "accumulation" | "off";

export type MurmurationSettings = Readonly<{
  count: number;
  speed: number;
  minSpeed: number;
  maxSpeed: number;
  neighborCount: number;
  neighborRadius: number;
  separation: number;
  alignment: number;
  cohesion: number;
  inertia: number;
  noise: number;
  flow: number;
  threatMode: ThreatMode;
  threatStrength: number;
  threatRadius: number;
  waveGain: number;
  vacuoleStrength: number;
  splitGain: number;
  blackeningGain: number;
  particleScale: number;
  depthFade: number;
  trailMode: TrailMode;
  trailLength: number;
  trailOpacity: number;
  theme: ThemeName;
  renderMode: RenderMode;
  simulationMode: SimulationMode;
  targetFps: number;
  pixelRatioCap: number;
  adaptiveQuality: boolean;
  autoOrbit: boolean;
  cameraDamping: number;
  fov: number;
}>;

export const defaultSettings: MurmurationSettings = {
  count: 3000,
  speed: 0.85,
  minSpeed: 0.25,
  maxSpeed: 2.2,
  neighborCount: 7,
  neighborRadius: 0.12,
  separation: 1.35,
  alignment: 1.8,
  cohesion: 0.85,
  inertia: 0.72,
  noise: 0.08,
  flow: 0.35,
  threatMode: "off",
  threatStrength: 0,
  threatRadius: 0.18,
  waveGain: 0.2,
  vacuoleStrength: 0,
  splitGain: 0,
  blackeningGain: 0.25,
  particleScale: 1,
  depthFade: 0.44,
  trailMode: "velocity",
  trailLength: 0.35,
  trailOpacity: 0.18,
  theme: "ink",
  renderMode: "impostor-quads",
  simulationMode: "auto",
  targetFps: 60,
  pixelRatioCap: 1.5,
  adaptiveQuality: true,
  autoOrbit: false,
  cameraDamping: 0.08,
  fov: 48,
};

export type MutableSettings = {
  -readonly [Key in keyof MurmurationSettings]: MurmurationSettings[Key];
};

export const cloneSettings = (
  settings: MurmurationSettings = defaultSettings,
): MutableSettings => ({ ...settings });

export const countToCapacity = (count: number): number =>
  Math.max(128, Math.floor(count));

export const textureSideForCount = (count: number): number =>
  Math.ceil(Math.sqrt(Math.max(1, count)));

export const capacityForTextureSide = (side: number): number => side * side;

export const particleTexturePlan = (count: number) => {
  const textureSide = textureSideForCount(count);
  const capacity = capacityForTextureSide(textureSide);

  return {
    requestedCount: count,
    textureSide,
    capacity,
    inactiveSlots: capacity - count,
  } as const;
};

export const clampSettings = (
  settings: MurmurationSettings,
): MurmurationSettings => ({
  ...settings,
  count: Math.min(100000, Math.max(128, Math.round(settings.count))),
  speed: Math.min(5, Math.max(0.1, settings.speed)),
  minSpeed: Math.min(2, Math.max(0, settings.minSpeed)),
  maxSpeed: Math.min(8, Math.max(0.2, settings.maxSpeed)),
  neighborCount: Math.min(12, Math.max(3, Math.round(settings.neighborCount))),
  neighborRadius: Math.min(0.5, Math.max(0.02, settings.neighborRadius)),
  separation: Math.min(4, Math.max(0, settings.separation)),
  alignment: Math.min(4, Math.max(0, settings.alignment)),
  cohesion: Math.min(4, Math.max(0, settings.cohesion)),
  inertia: Math.min(1, Math.max(0, settings.inertia)),
  noise: Math.min(1, Math.max(0, settings.noise)),
  flow: Math.min(2, Math.max(0, settings.flow)),
  threatStrength: Math.min(1, Math.max(0, settings.threatStrength)),
  threatRadius: Math.min(0.6, Math.max(0.05, settings.threatRadius)),
  waveGain: Math.min(2, Math.max(0, settings.waveGain)),
  vacuoleStrength: Math.min(2, Math.max(0, settings.vacuoleStrength)),
  splitGain: Math.min(1, Math.max(0, settings.splitGain)),
  blackeningGain: Math.min(1, Math.max(0, settings.blackeningGain)),
  particleScale: Math.min(4, Math.max(0.2, settings.particleScale)),
  depthFade: Math.min(1, Math.max(0, settings.depthFade)),
  trailLength: Math.min(2, Math.max(0, settings.trailLength)),
  trailOpacity: Math.min(1, Math.max(0, settings.trailOpacity)),
  targetFps: Math.min(120, Math.max(24, Math.round(settings.targetFps))),
  pixelRatioCap: Math.min(2, Math.max(0.75, settings.pixelRatioCap)),
  cameraDamping: Math.min(0.25, Math.max(0, settings.cameraDamping)),
  fov: Math.min(75, Math.max(25, settings.fov)),
});
