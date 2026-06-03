import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Color,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import type { ParticleBuffers } from "../simulation/types";
import { themeByName } from "./themes";

export class TrailLines {
  public readonly lines: LineSegments;

  private readonly geometry = new BufferGeometry();

  private readonly material: LineBasicMaterial;

  private capacity = 0;

  public constructor(settings: MurmurationSettings) {
    const theme = themeByName(settings.theme);
    this.material = new LineBasicMaterial({
      color: theme.ink,
      transparent: true,
      opacity: settings.trailOpacity,
      depthTest: false,
      depthWrite: false,
    });
    this.lines = new LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
  }

  public update = (
    buffers: ParticleBuffers,
    settings: MurmurationSettings,
  ): void => {
    this.ensureCapacity(buffers.count);
    this.lines.visible =
      settings.trailMode === "velocity" &&
      settings.trailLength > 0 &&
      settings.trailOpacity > 0;
    this.material.opacity = settings.trailOpacity;

    if (!this.lines.visible) {
      return;
    }

    const position = this.geometry.getAttribute("position") as BufferAttribute;
    const array = position.array as Float32Array;
    const trailScale = 0.045 * settings.trailLength;

    for (let index = 0; index < buffers.count; index += 1) {
      const sourceOffset = index * 3;
      const targetOffset = index * 6;
      const x = buffers.positions[sourceOffset];
      const y = buffers.positions[sourceOffset + 1];
      const z = buffers.positions[sourceOffset + 2];
      const vx = buffers.velocities[sourceOffset];
      const vy = buffers.velocities[sourceOffset + 1];
      const vz = buffers.velocities[sourceOffset + 2];

      array[targetOffset] = x - vx * trailScale;
      array[targetOffset + 1] = y - vy * trailScale;
      array[targetOffset + 2] = z - vz * trailScale;
      array[targetOffset + 3] = x;
      array[targetOffset + 4] = y;
      array[targetOffset + 5] = z;
    }

    position.needsUpdate = true;
    this.geometry.setDrawRange(0, buffers.count * 2);
  };

  public setTheme = (ink: Color): void => {
    this.material.color.copy(ink);
  };

  public dispose = (): void => {
    this.geometry.dispose();
    this.material.dispose();
  };

  private ensureCapacity = (count: number): void => {
    if (count === this.capacity) {
      return;
    }

    this.capacity = count;
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(count * 2 * 3), 3),
    );
  };
}
