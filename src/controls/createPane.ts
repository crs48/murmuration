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

export const createPane = (
  host: HTMLElement,
  settings: MutableSettings,
  onResetCamera: () => void,
): PaneController => {
  const pane = new Pane({
    title: "Murmuration",
    container: host,
  });
  const presetState = { preset: "Quiet Roost" as PresetName };

  pane.addBinding(presetState, "preset", {
    label: "Preset",
    options: Object.fromEntries(
      presetNames.map((name) => [name, name]),
    ) as Record<PresetName, PresetName>,
  }).on("change", (event) => {
    presetState.preset = event.value;
    Object.assign(settings, presetByName(presetState.preset).settings);
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
  visual.addBinding(settings, "depthFade", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "trailOpacity", { min: 0, max: 1, step: 0.01 });
  visual.addBinding(settings, "pixelRatioCap", { min: 0.75, max: 2, step: 0.05 });

  const camera = pane.addFolder({ title: "Camera" });
  camera.addBinding(settings, "autoOrbit");
  camera.addBinding(settings, "cameraDamping", { min: 0, max: 0.25, step: 0.01 });
  camera.addBinding(settings, "fov", { min: 25, max: 75, step: 1 });
  camera.addButton({ title: "Reset camera" }).on("click", onResetCamera);

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
