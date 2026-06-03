import { cloneSettings, clampSettings } from "./settings";
import { CpuMurmurationSimulation } from "../simulation/CpuMurmurationSimulation";
import { createCameraRig } from "../camera/createCameraRig";
import { createPane, coercePaneSettings } from "../controls/createPane";
import { createFrameStatsTracker } from "../diagnostics/frameStats";
import { ParticleCloud } from "../rendering/ParticleCloud";
import { createRendererRig } from "../rendering/createRenderer";
import { themeByName } from "../rendering/themes";

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
  const stats = createFrameStatsTracker();
  const pane = createPane(paneHost, settings, cameraRig.reset);
  let animationId = 0;
  let disposed = false;
  let lastNow = performance.now();
  let lastHudUpdate = 0;

  rendererRig.scene.add(particles.points);

  const updateTheme = (): void => {
    const theme = themeByName(settings.theme);
    rendererRig.scene.background = theme.paper;
    particles.setTheme(theme.ink, theme.paper);
    document.documentElement.style.setProperty("--panel-bg", theme.panel);
    document.documentElement.style.setProperty("--panel-text", theme.panelText);
  };

  const resize = (): void => {
    rendererRig.resize(settings);
    cameraRig.resize(settings);
  };

  const updateHud = (): void => {
    const { fps, averageFrameMs } = stats.snapshot();
    hud.innerHTML = `
      <span>${Math.round(fps)} fps</span>
      <span>${settings.count.toLocaleString()} particles</span>
      <span>${averageFrameMs.toFixed(1)} ms</span>
      <span>CPU grid</span>
    `;
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
    const buffers = simulation.step({
      dt,
      time: now / 1000,
      settings,
      threatPosition: null,
    });
    particles.update(buffers, settings, rendererRig.pixelRatio());
    rendererRig.renderer.render(rendererRig.scene, cameraRig.camera);
    stats.sample(now);

    if (now - lastHudUpdate > 250) {
      lastHudUpdate = now;
      updateHud();
    }

    animationId = window.requestAnimationFrame(frame);
  };

  updateTheme();
  resize();
  window.addEventListener("resize", resize);
  animationId = window.requestAnimationFrame(frame);

  return {
    dispose: () => {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      pane.dispose();
      particles.dispose();
      cameraRig.dispose();
      rendererRig.dispose();
      simulation.dispose();
      root.replaceChildren();
    },
  };
};

