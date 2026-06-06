import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  type Color,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import { clamp } from "../math/scalar";

export const isAccumulationEnabled = (
  settings: MurmurationSettings,
): boolean =>
  settings.trailMode === "accumulation" &&
  settings.trailLength > 0 &&
  settings.trailOpacity > 0;

export const accumulationFadeOpacity = (
  settings: MurmurationSettings,
): number => {
  const persistence = clamp(0, 1, settings.trailLength / 5);
  const visibility = clamp(0, 1, settings.trailOpacity);

  return clamp(0.018, 0.32, 0.24 - persistence * 0.19 - visibility * 0.09);
};

export class AccumulationPass {
  private readonly scene = new Scene();

  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly geometry = new PlaneGeometry(2, 2);

  private readonly material = new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  private readonly mesh = new Mesh(this.geometry, this.material);

  private active = false;

  public constructor() {
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  public begin = (
    renderer: WebGLRenderer,
    paper: Color,
    settings: MurmurationSettings,
  ): void => {
    const nextActive = isAccumulationEnabled(settings);
    renderer.autoClear = !nextActive;
    renderer.setClearColor(paper, 1);

    if (!nextActive) {
      this.active = false;
      return;
    }

    if (!this.active) {
      renderer.clear(true, true, true);
      this.active = true;
    }

    this.material.color.copy(paper);
    this.material.opacity = accumulationFadeOpacity(settings);
    renderer.render(this.scene, this.camera);
    renderer.clearDepth();
  };

  public reset = (): void => {
    this.active = false;
  };

  public dispose = (): void => {
    this.geometry.dispose();
    this.material.dispose();
  };
}
