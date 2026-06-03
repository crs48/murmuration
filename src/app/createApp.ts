import { cloneSettings, clampSettings } from "./settings";
import { exportSettings, importSettings } from "./presetSerialization";
import type { MurmurationDebugApi } from "./debugApi";
import {
  selectSimulationBackend,
  simulationBackendLabel,
  webgpuStatusLabel,
  type WebgpuRuntimeStatus,
} from "./simulationBackend";
import { CpuMurmurationSimulation } from "../simulation/CpuMurmurationSimulation";
import { WebglGpuMurmurationSimulation } from "../simulation/WebglGpuMurmurationSimulation";
import { createCameraRig } from "../camera/createCameraRig";
import { createPane, coercePaneSettings } from "../controls/createPane";
import { createFrameStatsTracker } from "../diagnostics/frameStats";
import {
  adaptiveQualityPatch,
  createAdaptiveQualityState,
} from "../diagnostics/adaptiveQuality";
import { createCapabilityReport } from "../diagnostics/capabilityReport";
import { ReferenceGrid } from "../environment/referenceGrid";
import { ParticleCloud } from "../rendering/ParticleCloud";
import { GpuParticleCloud } from "../rendering/GpuParticleCloud";
import { WebgpuParticleLayer } from "../rendering/WebgpuParticleLayer";
import { createRendererRig } from "../rendering/createRenderer";
import { TrailLines } from "../rendering/TrailLines";
import { AccumulationPass, isAccumulationEnabled } from "../rendering/accumulation";
import { themeByName } from "../rendering/themes";
import {
  deriveThreatPosition,
  type PointerThreat,
} from "../simulation/threat";
import { createXrControllerRig } from "../xr/createXrControllerRig";
import { createXrSessionButton } from "../xr/createXrSessionButton";

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
  const referenceGrid = new ReferenceGrid(settings);
  const accumulation = new AccumulationPass();
  const stats = createFrameStatsTracker();
  const adaptiveQuality = createAdaptiveQualityState();
  const capability = createCapabilityReport(rendererRig.renderer);
  const xrSessionButton = createXrSessionButton(rendererRig.renderer, host);
  const xrControllerRig = createXrControllerRig(
    rendererRig.renderer,
    rendererRig.scene,
  );
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
  let disposed = false;
  let lastNow = performance.now();
  let lastHudUpdate = 0;
  let webgpuStatus: WebgpuRuntimeStatus = capability.webgpuAvailable
    ? "initializing"
    : "unavailable";
  let webgpuLayer: WebgpuParticleLayer | null = null;
  const debugApi: MurmurationDebugApi = {
    applySettings: (patch) => {
      Object.assign(settings, clampSettings({ ...settings, ...patch }));
      pane.refresh();
    },
    snapshot: () => ({
      settings: { ...settings },
      hudText: hud.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }),
  };

  const gpuSimulation = new WebglGpuMurmurationSimulation(rendererRig.renderer);

  rendererRig.scene.add(
    referenceGrid.points,
    trails.lines,
    particles.points,
    gpuParticles.points,
  );
  window.__murmuration = debugApi;
  if (capability.webgpuAvailable) {
    void WebgpuParticleLayer.create(sceneHost)
      .then((layer) => {
        if (disposed) {
          layer?.dispose();
          return;
        }

        webgpuLayer = layer;
        webgpuStatus = layer ? "ready" : "failed";
      })
      .catch((error) => {
        console.warn("WebGPU initialization failed", error);
        webgpuStatus = "failed";
      });
  }

  const updateTheme = (): void => {
    const theme = themeByName(settings.theme);
    rendererRig.scene.background = isAccumulationEnabled(settings)
      ? null
      : theme.paper;
    particles.setTheme(theme.ink, theme.paper);
    gpuParticles.setTheme(theme.ink, theme.paper);
    trails.setTheme(theme.ink);
    referenceGrid.setTheme(theme.ink, theme.paper);
    document.documentElement.style.setProperty("--panel-bg", theme.panel);
    document.documentElement.style.setProperty("--panel-text", theme.panelText);
  };

  const resize = (): void => {
    const didResize = rendererRig.resize(settings);

    if (didResize) {
      accumulation.reset();
    }

    cameraRig.resize(settings);
  };

  const updateHud = (): void => {
    const { fps, averageFrameMs } = stats.snapshot();
    const simulationBackend = selectSimulationBackend(
      settings,
      capability,
      webgpuStatus,
    );
    const simulationLabel = simulationBackendLabel(
      simulationBackend,
      settings.simulationMode,
    );

    hud.innerHTML = `
      <span>${Math.round(fps)} fps</span>
      <span>${settings.count.toLocaleString()} particles</span>
      <span>${averageFrameMs.toFixed(1)} ms</span>
      <span>${simulationLabel}</span>
      <span>${capability.rendererBackend}</span>
      <span>${capability.webglGpgpu.isSupported ? "gpgpu ready" : "gpgpu unavailable"}</span>
      <span>${webgpuStatusLabel(webgpuStatus)}</span>
      <span>${rendererRig.renderer.xr.isPresenting ? "immersive vr" : xrSessionButton.isImmersiveVrSupported() ? "vr ready" : "desktop"}</span>
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
    const simulationBackend = selectSimulationBackend(
      settings,
      capability,
      webgpuStatus,
    );
    referenceGrid.update({
      center: [0, 0, 0],
      settings,
      pixelRatio: rendererRig.pixelRatio(),
    });

    if (simulationBackend === "webgpu" && webgpuLayer) {
      const theme = themeByName(settings.theme);
      particles.points.visible = false;
      gpuParticles.points.visible = false;
      trails.lines.visible = false;
      webgpuLayer.setVisible(true);
      rendererRig.renderer.render(rendererRig.scene, cameraRig.camera);
      webgpuLayer.render(
        {
          dt,
          time: now / 1000,
          settings,
          threatPosition,
        },
        cameraRig.camera,
        theme.ink,
        theme.paper,
        rendererRig.pixelRatio(),
      );

      if (webgpuLayer.isLost()) {
        webgpuStatus = "lost";
      }
    } else if (simulationBackend === "webgl-gpgpu") {
      webgpuLayer?.setVisible(false);
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
      webgpuLayer?.setVisible(false);
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

    if (simulationBackend !== "webgpu") {
      accumulation.begin(
        rendererRig.renderer,
        themeByName(settings.theme).paper,
        settings,
      );
      rendererRig.renderer.render(rendererRig.scene, cameraRig.camera);
    }

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

  };

  updateTheme();
  resize();
  window.addEventListener("resize", resize);
  sceneHost.addEventListener("pointermove", updatePointerThreat);
  sceneHost.addEventListener("pointerleave", clearPointerThreat);
  rendererRig.renderer.setAnimationLoop(frame);

  return {
    dispose: () => {
      disposed = true;
      rendererRig.renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      sceneHost.removeEventListener("pointermove", updatePointerThreat);
      sceneHost.removeEventListener("pointerleave", clearPointerThreat);
      pane.dispose();
      particles.dispose();
      gpuParticles.dispose();
      webgpuLayer?.dispose();
      trails.dispose();
      referenceGrid.dispose();
      accumulation.dispose();
      xrSessionButton.dispose();
      xrControllerRig.dispose();
      cameraRig.dispose();
      rendererRig.dispose();
      simulation.dispose();
      gpuSimulation.dispose();
      if (window.__murmuration === debugApi) {
        delete window.__murmuration;
      }
      root.replaceChildren();
    },
  };
};
