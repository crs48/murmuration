import { Scene, WebGLRenderer } from "three";
import type { MurmurationSettings } from "../app/settings";
import { themeByName } from "./themes";

export type RendererRig = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  resize: (settings: MurmurationSettings) => boolean;
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

  let lastWidth = 0;
  let lastHeight = 0;
  let lastPixelRatio = 0;

  const resize = (currentSettings: MurmurationSettings): boolean => {
    const { clientWidth, clientHeight } = host;
    const nextPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      currentSettings.pixelRatioCap,
    );

    if (
      clientWidth === lastWidth &&
      clientHeight === lastHeight &&
      nextPixelRatio === lastPixelRatio
    ) {
      scene.background = themeByName(currentSettings.theme).paper;
      return false;
    }

    lastWidth = clientWidth;
    lastHeight = clientHeight;
    lastPixelRatio = nextPixelRatio;
    renderer.setPixelRatio(nextPixelRatio);
    renderer.setSize(clientWidth, clientHeight, false);
    scene.background = themeByName(currentSettings.theme).paper;
    return true;
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
