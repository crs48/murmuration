import { Pane } from "tweakpane";
import type { MutableSettings, MurmurationSettings } from "../app/settings";
import {
  presetByName,
  presetNames,
  type PresetName,
} from "../app/presets";

export type PaneController = Readonly<{
  pane: Pane;
  refresh: () => void;
  dispose: () => void;
}>;

export type PaneActions = Readonly<{
  onResetCamera: () => void;
  onExportPreset: () => string;
  onImportPreset: (source: string) => void;
  onPresetChange?: (preset: PresetName) => void;
}>;

export const createPane = (
  host: HTMLElement,
  settings: MutableSettings,
  actions: PaneActions,
): PaneController => {
  const pane = new Pane({
    title: "Murmuration",
    container: host,
  });
  const presetState = { preset: "Lava Lamp" as PresetName };

  pane.addBinding(presetState, "preset", {
    label: "Preset",
    options: Object.fromEntries(
      presetNames.map((name) => [name, name]),
    ) as Record<PresetName, PresetName>,
  }).on("change", (event) => {
    presetState.preset = event.value;
    Object.assign(settings, presetByName(presetState.preset).settings);
    actions.onPresetChange?.(presetState.preset);
    pane.refresh();
  });

  const simulation = pane.addFolder({ title: "Simulation" });
  simulation.addBinding(settings, "count", { min: 128, max: 100000, step: 1 });
  simulation.addBinding(settings, "speed", { min: 0.1, max: 5, step: 0.01 });
  simulation.addBinding(settings, "minSpeed", { min: 0, max: 2, step: 0.01 });
  simulation.addBinding(settings, "maxSpeed", { min: 0.2, max: 8, step: 0.01 });
  simulation.addBinding(settings, "neighborCount", { min: 3, max: 12, step: 1 });
  simulation.addBinding(settings, "neighborRadius", { min: 0.02, max: 0.5, step: 0.01 });
  simulation.addBinding(settings, "separation", { min: 0, max: 4, step: 0.01 });
  simulation.addBinding(settings, "alignment", { min: 0, max: 4, step: 0.01 });
  simulation.addBinding(settings, "cohesion", { min: 0, max: 4, step: 0.01 });
  simulation.addBinding(settings, "inertia", { min: 0, max: 1, step: 0.01 });
  simulation.addBinding(settings, "noise", { min: 0, max: 1, step: 0.01 });
  simulation.addBinding(settings, "flow", { min: 0, max: 2, step: 0.01 });
  simulation.addBinding(settings, "chaseStrength", { min: 0, max: 1, step: 0.01 });

  const attractor = pane.addFolder({ title: "Attractor" });
  attractor.addBinding(settings, "attractorSpeed", { min: 0.05, max: 3, step: 0.01 });
  attractor.addBinding(settings, "attractorRadius", { min: 0, max: 2.4, step: 0.01 });
  attractor.addBinding(settings, "attractorDebug", { label: "debug" });

  const visual = pane.addFolder({ title: "Visual" });
  visual.addBinding(settings, "theme", {
    options: {
      Ink: "ink",
      Inverse: "inverse",
      Paper: "paper",
      Graphite: "graphite",
    },
  });
  visual.addBinding(settings, "particleScale", { min: 0.2, max: 4, step: 0.01 });
  visual.addBinding(settings, "particleOpacity", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "depthScale", { min: 0, max: 2, step: 0.01 });
  visual.addBinding(settings, "depthFade", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "mediumMode", {
    label: "Medium",
    options: {
      Grid: "grid",
      Dust: "dust",
      Air: "air",
      Starlight: "starlight",
      Off: "off",
    },
  });
  visual.addBinding(settings, "mediumIntensity", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "mediumTurbulence", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "mediumWake", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "mediumPointScale", { min: 0.2, max: 2, step: 0.01 });
  visual.addBinding(settings, "trailMode", {
    options: {
      Velocity: "velocity",
      History: "accumulation",
      Off: "off",
    },
  });
  visual.addBinding(settings, "trailLength", { min: 0, max: 5, step: 0.01 });
  visual.addBinding(settings, "trailOpacity", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "trailWaviness", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "pixelRatioCap", { min: 0.75, max: 2, step: 0.05 });

  const threat = pane.addFolder({ title: "Threat" });
  threat.addBinding(settings, "threatMode", {
    options: {
      Off: "off",
      Cursor: "cursor",
      Orbit: "orbit",
      Autonomous: "autonomous",
    },
  });
  threat.addBinding(settings, "threatStrength", { min: 0, max: 1, step: 0.01 });
  threat.addBinding(settings, "threatRadius", { min: 0.05, max: 0.6, step: 0.01 });
  threat.addBinding(settings, "threatSpeed", { min: 0.1, max: 5, step: 0.01 });
  threat.addBinding(settings, "threatAcceleration", { min: 0.1, max: 10, step: 0.01 });
  threat.addBinding(settings, "threatMomentum", { min: 0, max: 0.96, step: 0.01 });
  threat.addBinding(settings, "threatDebug", { label: "debug" });
  threat.addBinding(settings, "waveGain", { min: 0, max: 2, step: 0.01 });
  threat.addBinding(settings, "vacuoleStrength", { min: 0, max: 2, step: 0.01 });
  threat.addBinding(settings, "splitGain", { min: 0, max: 1, step: 0.01 });
  threat.addBinding(settings, "blackeningGain", { min: 0, max: 1, step: 0.01 });

  const camera = pane.addFolder({ title: "Camera" });
  camera.addBinding(settings, "autoOrbit");
  camera.addBinding(settings, "cameraDamping", { min: 0, max: 0.25, step: 0.01 });
  camera.addBinding(settings, "fov", { min: 25, max: 75, step: 1 });
  camera.addButton({ title: "Reset camera" }).on("click", actions.onResetCamera);

  const performance = pane.addFolder({ title: "Performance" });
  performance.addBinding(settings, "adaptiveQuality");
  performance.addBinding(settings, "targetFps", { min: 24, max: 120, step: 1 });
  performance.addBinding(settings, "simulationMode", {
    options: {
      Auto: "auto",
      CPU: "cpu",
      "WebGL GPGPU": "webgl-gpgpu",
      WebGPU: "webgpu",
    },
  });

  const presetIo = pane.addFolder({ title: "Preset IO" });
  presetIo.addButton({ title: "Copy preset JSON" }).on("click", () => {
    const serialized = actions.onExportPreset();
    void navigator.clipboard?.writeText(serialized);
  });
  presetIo.addButton({ title: "Paste preset JSON" }).on("click", async () => {
    const source = await navigator.clipboard?.readText();

    if (!source) {
      return;
    }

    actions.onImportPreset(source);
    pane.refresh();
  });

  return {
    pane,
    refresh: () => pane.refresh(),
    dispose: () => pane.dispose(),
  };
};

export const coercePaneSettings = (
  settings: MutableSettings,
  clamped: MurmurationSettings,
): MutableSettings => Object.assign(settings, clamped);
