import { Scene, WebGLRenderer } from "three";
import type { MurmurationSettings } from "../app/settings";
import { themeByName } from "./themes";

export type RendererRig = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  resize: (settings: MurmurationSettings) => void;
  pixelRatio: () => number;
  dispose: () => void;
}>;

export const createRendererRig = (
  host: HTMLElement,
  settings: MurmurationSettings,
): RendererRig => {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  const scene = new Scene();

  renderer.domElement.className = "murmuration-canvas";
  host.append(renderer.domElement);

  const pixelRatio = () =>
    Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap);

  const resize = (currentSettings: MurmurationSettings): void => {
    const { clientWidth, clientHeight } = host;
    const nextPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      currentSettings.pixelRatioCap,
    );
    renderer.setPixelRatio(nextPixelRatio);
    renderer.setSize(clientWidth, clientHeight, false);
    scene.background = themeByName(currentSettings.theme).paper;
  };

  resize(settings);

  return {
    renderer,
    scene,
    resize,
    pixelRatio,
    dispose: () => {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};

