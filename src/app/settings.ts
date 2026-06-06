export type ThemeName = "ink" | "inverse" | "paper" | "graphite";
export type RenderMode = "points" | "impostor-quads" | "instanced-spheres";
export type ThreatMode = "off" | "cursor" | "orbit" | "autonomous";
export type SimulationMode = "auto" | "cpu" | "webgl-gpgpu" | "webgpu";
export type TrailMode = "velocity" | "accumulation" | "off";
export type MediumMode = "off" | "grid" | "dust" | "air" | "starlight";

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
  chaseStrength: number;
  attractorSpeed: number;
  attractorRadius: number;
  attractorDebug: boolean;
  wanderRadius: number;
  wanderSpeed: number;
  threatMode: ThreatMode;
  threatStrength: number;
  threatRadius: number;
  threatSpeed: number;
  threatAcceleration: number;
  threatMomentum: number;
  threatDebug: boolean;
  waveGain: number;
  vacuoleStrength: number;
  splitGain: number;
  blackeningGain: number;
  particleScale: number;
  particleOpacity: number;
  depthScale: number;
  depthFade: number;
  trailMode: TrailMode;
  mediumMode: MediumMode;
  mediumIntensity: number;
  mediumTurbulence: number;
  mediumWake: number;
  mediumPointScale: number;
  trailLength: number;
  trailOpacity: number;
  trailWaviness: number;
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
  count: 16000,
  speed: 0.52,
  minSpeed: 0.03,
  maxSpeed: 1.12,
  neighborCount: 7,
  neighborRadius: 0.12,
  separation: 0.92,
  alignment: 0.48,
  cohesion: 1.72,
  inertia: 0.84,
  noise: 0.012,
  flow: 0.2,
  chaseStrength: 0.82,
  attractorSpeed: 0.92,
  attractorRadius: 1.18,
  attractorDebug: false,
  wanderRadius: 1,
  wanderSpeed: 1,
  threatMode: "autonomous",
  threatStrength: 0.72,
  threatRadius: 0.58,
  threatSpeed: 0.69,
  threatAcceleration: 5.48,
  threatMomentum: 0.74,
  threatDebug: false,
  waveGain: 0.95,
  vacuoleStrength: 0.9,
  splitGain: 0.26,
  blackeningGain: 0.38,
  particleScale: 0.2,
  particleOpacity: 1,
  depthScale: 1,
  depthFade: 0.42,
  trailMode: "accumulation",
  mediumMode: "grid",
  mediumIntensity: 1,
  mediumTurbulence: 0.25,
  mediumWake: 0.5,
  mediumPointScale: 1,
  trailLength: 0.01,
  trailOpacity: 0.72,
  trailWaviness: 0.68,
  theme: "ink",
  renderMode: "impostor-quads",
  simulationMode: "auto",
  targetFps: 60,
  pixelRatioCap: 1.5,
  adaptiveQuality: true,
  autoOrbit: false,
  cameraDamping: 0.08,
  fov: 58,
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
  chaseStrength: Math.min(1, Math.max(0, settings.chaseStrength)),
  attractorSpeed: Math.min(3, Math.max(0.05, settings.attractorSpeed)),
  attractorRadius: Math.min(2.4, Math.max(0, settings.attractorRadius)),
  attractorDebug: Boolean(settings.attractorDebug),
  wanderRadius: Math.min(1, Math.max(0, settings.wanderRadius)),
  wanderSpeed: Math.min(2, Math.max(0.05, settings.wanderSpeed)),
  threatStrength: Math.min(1, Math.max(0, settings.threatStrength)),
  threatRadius: Math.min(0.6, Math.max(0.05, settings.threatRadius)),
  threatSpeed: Math.min(5, Math.max(0.1, settings.threatSpeed)),
  threatAcceleration: Math.min(10, Math.max(0.1, settings.threatAcceleration)),
  threatMomentum: Math.min(0.96, Math.max(0, settings.threatMomentum)),
  threatDebug: Boolean(settings.threatDebug),
  waveGain: Math.min(2, Math.max(0, settings.waveGain)),
  vacuoleStrength: Math.min(2, Math.max(0, settings.vacuoleStrength)),
  splitGain: Math.min(1, Math.max(0, settings.splitGain)),
  blackeningGain: Math.min(1, Math.max(0, settings.blackeningGain)),
  particleScale: Math.min(4, Math.max(0.2, settings.particleScale)),
  particleOpacity: Math.min(1, Math.max(0, settings.particleOpacity)),
  depthScale: Math.min(2, Math.max(0, settings.depthScale)),
  depthFade: Math.min(1, Math.max(0, settings.depthFade)),
  mediumIntensity: Math.min(1, Math.max(0, settings.mediumIntensity)),
  mediumTurbulence: Math.min(1, Math.max(0, settings.mediumTurbulence)),
  mediumWake: Math.min(1, Math.max(0, settings.mediumWake)),
  mediumPointScale: Math.min(2, Math.max(0.2, settings.mediumPointScale)),
  trailLength: Math.min(5, Math.max(0, settings.trailLength)),
  trailOpacity: Math.min(1, Math.max(0, settings.trailOpacity)),
  trailWaviness: Math.min(1, Math.max(0, settings.trailWaviness)),
  targetFps: Math.min(120, Math.max(24, Math.round(settings.targetFps))),
  pixelRatioCap: Math.min(2, Math.max(0.75, settings.pixelRatioCap)),
  cameraDamping: Math.min(0.25, Math.max(0, settings.cameraDamping)),
  fov: Math.min(75, Math.max(25, settings.fov)),
});
