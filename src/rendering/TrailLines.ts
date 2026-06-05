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

const trailSegmentCount = 5;

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
    const trailScale = 0.1 * settings.trailLength;

    for (let index = 0; index < buffers.count; index += 1) {
      const sourceOffset = index * 3;
      const targetOffset = index * trailSegmentCount * 2 * 3;
      const x = buffers.positions[sourceOffset];
      const y = buffers.positions[sourceOffset + 1];
      const z = buffers.positions[sourceOffset + 2];
      const vx = buffers.velocities[sourceOffset];
      const vy = buffers.velocities[sourceOffset + 1];
      const vz = buffers.velocities[sourceOffset + 2];
      const speed = Math.max(0.0001, buffers.speeds[index]);
      const seed = buffers.seeds[index] * Math.PI * 2;
      const inversePlanar = 1 / Math.max(0.0001, Math.hypot(vx, vy));
      const px = -vy * inversePlanar;
      const py = vx * inversePlanar;
      const waveScale = settings.trailWaviness * trailScale * speed * 0.18;

      for (let segment = 0; segment < trailSegmentCount; segment += 1) {
        const segmentOffset = targetOffset + segment * 6;
        const tailProgress = (trailSegmentCount - segment) / trailSegmentCount;
        const headProgress = (trailSegmentCount - segment - 1) / trailSegmentCount;
        const tailWave =
          Math.sin(tailProgress * Math.PI * 2.6 + seed) *
          waveScale *
          tailProgress *
          tailProgress;
        const headWave =
          Math.sin(headProgress * Math.PI * 2.6 + seed) *
          waveScale *
          headProgress *
          headProgress;

        array[segmentOffset] = x - vx * trailScale * tailProgress + px * tailWave;
        array[segmentOffset + 1] = y - vy * trailScale * tailProgress + py * tailWave;
        array[segmentOffset + 2] = z - vz * trailScale * tailProgress;
        array[segmentOffset + 3] = x - vx * trailScale * headProgress + px * headWave;
        array[segmentOffset + 4] = y - vy * trailScale * headProgress + py * headWave;
        array[segmentOffset + 5] = z - vz * trailScale * headProgress;
      }
    }

    position.needsUpdate = true;
    this.geometry.setDrawRange(0, buffers.count * trailSegmentCount * 2);
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
      new BufferAttribute(new Float32Array(count * trailSegmentCount * 2 * 3), 3),
    );
  };
}
