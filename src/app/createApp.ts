import {
  cloneSettings,
  clampSettings,
  type MurmurationSettings,
} from "./settings";
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
import {
  classifyPerformanceBottleneck,
  performanceBottleneckLabel,
} from "../diagnostics/performanceProfile";
import { ReferenceGrid } from "../environment/referenceGrid";
import { ParticleCloud } from "../rendering/ParticleCloud";
import { GpuParticleCloud } from "../rendering/GpuParticleCloud";
import { WebgpuParticleLayer } from "../rendering/WebgpuParticleLayer";
import { AttractorDebugOverlay } from "../rendering/AttractorDebugOverlay";
import { ThreatDebugOverlay } from "../rendering/ThreatDebugOverlay";
import { createRendererRig } from "../rendering/createRenderer";
import { TrailLines } from "../rendering/TrailLines";
import { AccumulationPass, isAccumulationEnabled } from "../rendering/accumulation";
import { themeByName } from "../rendering/themes";
import { flockWanderCenter } from "../simulation/flockWander";
import type { SimulationPilot } from "../simulation/types";
import {
  initialThreatState,
  nextThreatState,
  type PointerThreat,
} from "../simulation/threat";
import { createXrControllerRig } from "../xr/createXrControllerRig";
import { createXrCameraRig } from "../xr/createXrCameraRig";
import { createDesktopPilotIntent } from "../xr/desktopPilotIntent";
import { createXrSessionButton } from "../xr/createXrSessionButton";
import { createSwarmPilotRig } from "../xr/swarmPilotRig";
import { quest2XrQualityPatch } from "../xr/xrQuality";
import { VrStatusPanel } from "../xr/VrStatusPanel";
import {
  createXrHapticsState,
  pulseXrInputSources,
  shouldPulseHaptics,
} from "../xr/haptics";
import { hasActiveSwarmPilotIntent } from "../xr/inputIntent";
import type { PresetName } from "./presets";

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

const cameraScaledAttractorSettings = (
  settings: MurmurationSettings,
  attractorScale: number,
): MurmurationSettings => ({
  ...settings,
  attractorRadius: settings.attractorRadius * attractorScale,
});

const attractorContainmentRadius = (
  settings: Pick<MurmurationSettings, "attractorRadius" | "wanderRadius">,
): number => settings.attractorRadius * settings.wanderRadius;

const activeSimulationPilot = (
  isXrPresenting: boolean,
  isDesktopPilotActive: boolean,
  pilot: SimulationPilot,
): SimulationPilot | null =>
  isXrPresenting || isDesktopPilotActive ? pilot : null;

export const createApp = (root: HTMLElement): MurmurationApp => {
  const settings = cloneSettings();
  const host = createElement("section", "murmuration-app");
  const sceneHost = createElement("div", "scene-host");
  const hud = createElement("aside", "hud");
  const paneHost = createElement("aside", "pane-host");
  let selectedPreset: PresetName = "Lava Lamp";

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
  const attractorDebug = new AttractorDebugOverlay();
  const threatDebug = new ThreatDebugOverlay();
  const accumulation = new AccumulationPass();
  const stats = createFrameStatsTracker();
  const adaptiveQuality = createAdaptiveQualityState();
  const capability = createCapabilityReport(rendererRig.renderer);
  const xrSessionButton = createXrSessionButton(rendererRig.renderer, host);
  const xrControllerRig = createXrControllerRig(
    rendererRig.renderer,
    rendererRig.scene,
  );
  const xrCameraRig = createXrCameraRig(rendererRig.renderer, cameraRig);
  rendererRig.scene.add(cameraRig.camera);
  const vrStatusPanel = new VrStatusPanel(cameraRig.camera);
  const desktopPilotIntent = createDesktopPilotIntent(window);
  const swarmPilot = createSwarmPilotRig();
  const hapticsState = createXrHapticsState();
  let threatState = initialThreatState();
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
    onPresetChange: (preset) => {
      selectedPreset = preset;
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
    attractorDebug.group,
    threatDebug.group,
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
    const pilot = swarmPilot.snapshot();
    const simulationBackend = selectSimulationBackend(
      settings,
      capability,
      webgpuStatus,
    );
    const simulationLabel = simulationBackendLabel(
      simulationBackend,
      settings.simulationMode,
    );
    const profileLabel = performanceBottleneckLabel(
      classifyPerformanceBottleneck({
        settings,
        stats: stats.snapshot(),
        backend: simulationBackend,
        isXrPresenting: rendererRig.renderer.xr.isPresenting,
      }),
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
      <span>${Math.hypot(...pilot.coreVelocity).toFixed(2)} core</span>
      <span>${pilot.radius.toFixed(2)} radius</span>
      <span>${profileLabel}</span>
    `;
    vrStatusPanel.update({
      isPresenting: rendererRig.renderer.xr.isPresenting,
      presetName: selectedPreset,
      mediumMode: settings.mediumMode,
      simulationLabel,
      profileLabel,
      fps,
      count: settings.count,
      radius: pilot.radius,
      coreSpeed: Math.hypot(...pilot.coreVelocity),
    });
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
    const time = now / 1000;
    lastNow = now;
    coercePaneSettings(settings, clampSettings(settings));
    resize();
    updateTheme();
    xrCameraRig.update();
    const isXrPresenting = xrCameraRig.isPresenting();
    const xrQualityPatch = quest2XrQualityPatch(
      settings,
      isXrPresenting,
    );

    if (Object.keys(xrQualityPatch).length > 0) {
      Object.assign(settings, xrQualityPatch);
      pane.refresh();
    }

    const pilotIntent = isXrPresenting
      ? xrControllerRig.intent()
      : desktopPilotIntent.intent();
    const isDesktopPilotActive =
      !isXrPresenting && hasActiveSwarmPilotIntent(pilotIntent);

    if (
      isXrPresenting &&
      shouldPulseHaptics(pilotIntent, now, hapticsState)
    ) {
      pulseXrInputSources(
        rendererRig.renderer.xr.getSession()?.inputSources ?? [],
      );
    }

    const pilot = swarmPilot.step({ dt, intent: pilotIntent });
    const simulationPilot = activeSimulationPilot(
      isXrPresenting,
      isDesktopPilotActive,
      pilot,
    );
    const simulationBackend = selectSimulationBackend(
      settings,
      capability,
      webgpuStatus,
    );
    const simulationSettings = cameraScaledAttractorSettings(
      settings,
      cameraRig.attractorScale(),
    );
    const attractorCenter =
      simulationPilot?.corePosition ?? flockWanderCenter(simulationSettings, time);
    const radius = simulationPilot
      ? Math.max(0.42, simulationPilot.radius)
      : attractorContainmentRadius(simulationSettings);
    const threat = nextThreatState(threatState, {
      dt,
      time,
      settings: simulationSettings,
      pointer: pointerThreat,
      swarmCenter: attractorCenter,
    });
    threatState = threat.state;
    const threatPosition = threat.position;
    const threatVelocity = threat.velocity;
    const theme = themeByName(settings.theme);
    referenceGrid.update({
      center: attractorCenter,
      settings,
      pixelRatio: rendererRig.pixelRatio(),
      time,
      wake: Math.min(
        1,
        (simulationPilot?.mediumPulse ?? 0) +
          Math.hypot(...(simulationPilot?.coreVelocity ?? [0, 0, 0])) * 0.32,
      ),
    });
    attractorDebug.update({
      settings,
      center: attractorCenter,
      radius,
    });
    threatDebug.update({
      settings,
      position: threatPosition,
      velocity: threatVelocity,
      radius: simulationSettings.threatRadius,
    });

    if (simulationBackend === "webgpu" && webgpuLayer) {
      particles.points.visible = false;
      gpuParticles.points.visible = false;
      trails.lines.visible = false;
      webgpuLayer.setVisible(true);
      rendererRig.renderer.render(rendererRig.scene, cameraRig.camera);
      webgpuLayer.render(
        {
          dt,
          time,
          settings: simulationSettings,
          threatPosition,
          threatVelocity,
          pilot: simulationPilot,
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
        time,
        settings: simulationSettings,
        threatPosition,
        threatVelocity,
        pilot: simulationPilot,
      });
      gpuParticles.update(gpuState, settings, rendererRig.pixelRatio());
      gpuParticles.points.visible = true;
      particles.points.visible = false;
      trails.lines.visible = false;
    } else {
      webgpuLayer?.setVisible(false);
      const buffers = simulation.step({
        dt,
        time,
        settings: simulationSettings,
        threatPosition,
        threatVelocity,
        pilot: simulationPilot,
      });
      trails.update(buffers, settings);
      particles.update(buffers, settings, rendererRig.pixelRatio());
      particles.points.visible = true;
      gpuParticles.points.visible = false;
    }

    if (simulationBackend !== "webgpu") {
      accumulation.begin(
        rendererRig.renderer,
        theme.paper,
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
      attractorDebug.dispose();
      threatDebug.dispose();
      referenceGrid.dispose();
      accumulation.dispose();
      xrSessionButton.dispose();
      xrControllerRig.dispose();
      desktopPilotIntent.dispose();
      vrStatusPanel.dispose();
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
