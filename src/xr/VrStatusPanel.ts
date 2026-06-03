import {
  CanvasTexture,
  LinearFilter,
  Sprite,
  SpriteMaterial,
  type PerspectiveCamera,
} from "three";
import type { MediumMode } from "../app/settings";
import type { PresetName } from "../app/presets";

export type VrStatusPanelUpdate = Readonly<{
  isPresenting: boolean;
  presetName: PresetName;
  mediumMode: MediumMode;
  simulationLabel: string;
  profileLabel: string;
  fps: number;
  count: number;
  radius: number;
  coreSpeed: number;
}>;

export class VrStatusPanel {
  private readonly canvas = document.createElement("canvas");

  private readonly context: CanvasRenderingContext2D;

  private readonly texture: CanvasTexture;

  private readonly material: SpriteMaterial;

  private readonly sprite: Sprite;

  private lastSignature = "";

  public constructor(camera: PerspectiveCamera) {
    this.canvas.width = 768;
    this.canvas.height = 256;
    const context = this.canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to create VR status canvas context");
    }

    this.context = context;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.material = new SpriteMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.86,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new Sprite(this.material);
    this.sprite.position.set(0, -0.48, -1.35);
    this.sprite.scale.set(0.9, 0.3, 1);
    this.sprite.visible = false;
    camera.add(this.sprite);
  }

  public update = (update: VrStatusPanelUpdate): void => {
    this.sprite.visible = update.isPresenting;

    if (!update.isPresenting) {
      return;
    }

    const signature = JSON.stringify({
      ...update,
      fps: Math.round(update.fps),
      coreSpeed: update.coreSpeed.toFixed(2),
      radius: update.radius.toFixed(2),
    });

    if (signature === this.lastSignature) {
      return;
    }

    this.lastSignature = signature;
    this.draw(update);
  };

  public dispose = (): void => {
    this.sprite.removeFromParent();
    this.texture.dispose();
    this.material.dispose();
  };

  private draw = (update: VrStatusPanelUpdate): void => {
    const { context } = this;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = "rgba(10, 10, 10, 0.62)";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.strokeStyle = "rgba(255, 255, 255, 0.24)";
    context.lineWidth = 2;
    context.strokeRect(2, 2, this.canvas.width - 4, this.canvas.height - 4);
    context.fillStyle = "rgba(255, 255, 255, 0.94)";
    context.font = "700 38px Inter, system-ui, sans-serif";
    context.fillText(update.presetName, 34, 60);
    context.font = "600 25px Inter, system-ui, sans-serif";
    context.fillStyle = "rgba(255, 255, 255, 0.74)";
    context.fillText(
      `${update.simulationLabel} · ${update.mediumMode} · ${update.profileLabel}`,
      34,
      100,
    );
    context.font = "700 31px Inter, system-ui, sans-serif";
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.fillText(`${Math.round(update.fps)} fps`, 34, 158);
    context.fillText(`${update.count.toLocaleString()} particles`, 192, 158);
    context.fillText(`${update.radius.toFixed(2)} radius`, 34, 210);
    context.fillText(`${update.coreSpeed.toFixed(2)} core`, 260, 210);
    this.texture.needsUpdate = true;
  };
}
