import { cloneSettings, clampSettings } from "./settings";
import { exportSettings, importSettings } from "./presetSerialization";
import { CpuMurmurationSimulation } from "../simulation/CpuMurmurationSimulation";
import { gridSimulationLimit } from "../simulation/CpuMurmurationSimulation";
import { WebglGpuMurmurationSimulation } from "../simulation/WebglGpuMurmurationSimulation";
import { createCameraRig } from "../camera/createCameraRig";
import { createPane, coercePaneSettings } from "../controls/createPane";
import { createFrameStatsTracker } from "../diagnostics/frameStats";
import {
  adaptiveQualityPatch,
  createAdaptiveQualityState,
} from "../diagnostics/adaptiveQuality";
import { createCapabilityReport } from "../diagnostics/capabilityReport";
import { ParticleCloud } from "../rendering/ParticleCloud";
import { GpuParticleCloud } from "../rendering/GpuParticleCloud";
import { createRendererRig } from "../rendering/createRenderer";
import { TrailLines } from "../rendering/TrailLines";
import { AccumulationPass, isAccumulationEnabled } from "../rendering/accumulation";
import { themeByName } from "../rendering/themes";
import {
  deriveThreatPosition,
  type PointerThreat,
} from "../simulation/threat";

export type MurmurationApp = Readonly<{
  dispose: () => void;
}>;

const createElement = <TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  className: string,
): HTMLElementTagNameMap[TagName] => {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
};

export const createApp = (root: HTMLElement): MurmurationApp => {
  const settings = cloneSettings();
  const host = createElement("section", "murmuration-app");
  const sceneHost = createElement("div", "scene-host");
  const hud = createElement("aside", "hud");
  const paneHost = createElement("aside", "pane-host");

  hud.dataset.testid = "hud";
  paneHost.dataset.testid = "settings-panel";
  root.replaceChildren(host);
  host.append(sceneHost, hud, paneHost);

  const rendererRig = createRendererRig(sceneHost, settings);
  const cameraRig = createCameraRig(
    rendererRig.renderer.domElement,
    sceneHost,
    settings,
  );
  const simulation = new CpuMurmurationSimulation({
    initialCount: settings.count,
    seed: 29,
  });
  const particles = new ParticleCloud(settings);
  const gpuParticles = new GpuParticleCloud(settings);
  const trails = new TrailLines(settings);
  const accumulation = new AccumulationPass();
  const stats = createFrameStatsTracker();
  const adaptiveQuality = createAdaptiveQualityState();
  const capability = createCapabilityReport(rendererRig.renderer);
  const pointerThreat: PointerThreat = {
    active: false,
    position: [0, 0, 0],
  };
  const pane = createPane(paneHost, settings, {
    onResetCamera: cameraRig.reset,
    onExportPreset: () => exportSettings(settings),
    onImportPreset: (source) => {
      Object.assign(settings, importSettings(source));
    },
  });
  let animationId = 0;
  let disposed = false;
  let lastNow = performance.now();
  let lastHudUpdate = 0;

  const gpuSimulation = new WebglGpuMurmurationSimulation(rendererRig.renderer);

  rendererRig.scene.add(trails.lines, particles.points, gpuParticles.points);

  const updateTheme = (): void => {
    const theme = themeByName(settings.theme);
    rendererRig.scene.background = isAccumulationEnabled(settings)
      ? null
      : theme.paper;
    particles.setTheme(theme.ink, theme.paper);
    gpuParticles.setTheme(theme.ink, theme.paper);
    trails.setTheme(theme.ink);
    document.documentElement.style.setProperty("--panel-bg", theme.panel);
    document.documentElement.style.setProperty("--panel-text", theme.panelText);
  };

  const resize = (): void => {
    rendererRig.resize(settings);
    accumulation.reset();
    cameraRig.resize(settings);
  };

  const updateHud = (): void => {
    const { fps, averageFrameMs } = stats.snapshot();
    const simulationLabel =
      settings.simulationMode === "webgl-gpgpu" &&
      capability.webglGpgpu.isSupported
        ? "webgl-gpgpu"
        : settings.simulationMode !== "cpu" && settings.count > gridSimulationLimit
        ? "cpu-field"
        : "cpu-grid";
    hud.innerHTML = `
      <span>${Math.round(fps)} fps</span>
      <span>${settings.count.toLocaleString()} particles</span>
      <span>${averageFrameMs.toFixed(1)} ms</span>
      <span>${simulationLabel}</span>
      <span>${capability.rendererBackend}</span>
      <span>${capability.webglGpgpu.isSupported ? "gpgpu ready" : "gpgpu unavailable"}</span>
      <span>${capability.webgpuAvailable ? "webgpu ready" : "webgpu unavailable"}</span>
    `;
  };

  const updatePointerThreat = (event: PointerEvent): void => {
    const rect = sceneHost.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    pointerThreat.active = true;
    pointerThreat.position = [x * 1.05, y * 0.72, 0];
  };

  const clearPointerThreat = (): void => {
    pointerThreat.active = false;
  };

  const frame = (now: number): void => {
    if (disposed) {
      return;
    }

    const dt = Math.min(1 / 20, (now - lastNow) / 1000);
    lastNow = now;
    coercePaneSettings(settings, clampSettings(settings));
    resize();
    updateTheme();
    cameraRig.controls.update();
    const threatPosition = deriveThreatPosition(
      settings,
      now / 1000,
      pointerThreat,
    );
    const useWebglGpgpu =
      settings.simulationMode === "webgl-gpgpu" &&
      capability.webglGpgpu.isSupported;

    if (useWebglGpgpu) {
      const gpuState = gpuSimulation.step({
        dt,
        time: now / 1000,
        settings,
        threatPosition,
      });
      gpuParticles.update(gpuState, settings, rendererRig.pixelRatio());
      gpuParticles.points.visible = true;
      particles.points.visible = false;
      trails.lines.visible = false;
    } else {
      const buffers = simulation.step({
        dt,
        time: now / 1000,
        settings,
        threatPosition,
      });
      trails.update(buffers, settings);
      particles.update(buffers, settings, rendererRig.pixelRatio());
      particles.points.visible = true;
      gpuParticles.points.visible = false;
    }
    accumulation.begin(
      rendererRig.renderer,
      themeByName(settings.theme).paper,
      settings,
    );
    rendererRig.renderer.render(rendererRig.scene, cameraRig.camera);
    const frameStats = stats.sample(now);
    const qualityPatch = adaptiveQualityPatch(
      settings,
      frameStats,
      now,
      adaptiveQuality,
    );

    if (Object.keys(qualityPatch).length > 0) {
      Object.assign(settings, qualityPatch);
      pane.refresh();
    }

    if (now - lastHudUpdate > 250) {
      lastHudUpdate = now;
      updateHud();
    }

    animationId = window.requestAnimationFrame(frame);
  };

  updateTheme();
  resize();
  window.addEventListener("resize", resize);
  sceneHost.addEventListener("pointermove", updatePointerThreat);
  sceneHost.addEventListener("pointerleave", clearPointerThreat);
  animationId = window.requestAnimationFrame(frame);

  return {
    dispose: () => {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      sceneHost.removeEventListener("pointermove", updatePointerThreat);
      sceneHost.removeEventListener("pointerleave", clearPointerThreat);
      pane.dispose();
      particles.dispose();
      gpuParticles.dispose();
      trails.dispose();
      accumulation.dispose();
      cameraRig.dispose();
      rendererRig.dispose();
      simulation.dispose();
      gpuSimulation.dispose();
      root.replaceChildren();
    },
  };
};
