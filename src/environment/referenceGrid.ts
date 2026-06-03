import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  type Color,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import { mulberry32 } from "../math/random";
import type { Vec3 } from "../math/vec3";
import type { EnvironmentAdapter, EnvironmentUpdateInput } from "./types";

const gridX = 25;
const gridY = 13;
const gridZ = 25;
const spacing = 0.34;
const jitterScale = 0.048;
const count = gridX * gridY * gridZ;

const vertexShader = `
attribute float referenceAlpha;

uniform float uPixelRatio;
uniform float uPointScale;

varying float vAlpha;

void main() {
  vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.4, -modelViewPosition.z);
  float distanceFade = 1.0 - smoothstep(3.2, 6.8, length(position));
  vAlpha = referenceAlpha * distanceFade;
  gl_Position = projectionMatrix * modelViewPosition;
  gl_PointSize = clamp(uPointScale * uPixelRatio * (10.0 / depth), 0.8, 5.5);
}
`;

const fragmentShader = `
precision highp float;

uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uOpacity;

varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);

  if (r2 > 1.0) {
    discard;
  }

  float dotAlpha = (1.0 - smoothstep(0.42, 1.0, r2)) * vAlpha * uOpacity;
  vec3 color = mix(uPaper, uInk, 0.55);

  gl_FragColor = vec4(color, dotAlpha);
}
`;

const wrappedCell = (
  centerValue: number,
  axisCount: number,
  axisIndex: number,
): number => {
  const half = Math.floor(axisCount / 2);
  return Math.floor(centerValue / spacing) + axisIndex - half;
};

const jitter = (random: () => number): number =>
  (random() * 2 - 1) * jitterScale;

export class ReferenceGrid implements EnvironmentAdapter {
  public readonly points: Points;

  private readonly geometry = new BufferGeometry();

  private readonly material: ShaderMaterial;

  private readonly positions = new Float32Array(count * 3);

  private readonly alphas = new Float32Array(count);

  private lastAnchor: Vec3 | null = null;

  public constructor(settings: MurmurationSettings) {
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uInk: { value: null },
        uPaper: { value: null },
        uOpacity: { value: settings.mediumMode === "grid" ? 0.34 : 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, settings.pixelRatioCap) },
        uPointScale: { value: 1 },
      },
      vertexShader,
      fragmentShader,
    });
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute(
      "referenceAlpha",
      new BufferAttribute(this.alphas, 1),
    );
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.rebuild([0, 0, 0]);
  }

  public update = ({
    center,
    settings,
    pixelRatio,
  }: EnvironmentUpdateInput): void => {
    this.points.visible = settings.mediumMode === "grid";
    this.material.uniforms.uOpacity.value =
      settings.mediumMode === "grid" ? 0.34 : 0;
    this.material.uniforms.uPixelRatio.value = pixelRatio;

    if (!this.points.visible) {
      return;
    }

    const anchor: Vec3 = [
      Math.floor(center[0] / spacing),
      Math.floor(center[1] / spacing),
      Math.floor(center[2] / spacing),
    ];

    if (
      this.lastAnchor &&
      this.lastAnchor[0] === anchor[0] &&
      this.lastAnchor[1] === anchor[1] &&
      this.lastAnchor[2] === anchor[2]
    ) {
      return;
    }

    this.rebuild(center);
    this.lastAnchor = anchor;
  };

  public setTheme = (ink: Color, paper: Color): void => {
    this.material.uniforms.uInk.value = ink.clone();
    this.material.uniforms.uPaper.value = paper.clone();
  };

  public dispose = (): void => {
    this.geometry.dispose();
    this.material.dispose();
  };

  private rebuild = (center: Vec3): void => {
    const random = mulberry32(2718);
    let index = 0;

    for (let z = 0; z < gridZ; z += 1) {
      for (let y = 0; y < gridY; y += 1) {
        for (let x = 0; x < gridX; x += 1) {
          const cx = wrappedCell(center[0], gridX, x);
          const cy = wrappedCell(center[1], gridY, y);
          const cz = wrappedCell(center[2], gridZ, z);
          const offset = index * 3;
          const normalizedY = Math.abs(y - Math.floor(gridY / 2)) / Math.max(1, gridY / 2);

          this.positions[offset] = cx * spacing + jitter(random);
          this.positions[offset + 1] = cy * spacing + jitter(random);
          this.positions[offset + 2] = cz * spacing + jitter(random);
          this.alphas[index] = 0.32 + (1 - normalizedY) * 0.38 + random() * 0.18;
          index += 1;
        }
      }
    }

    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("referenceAlpha").needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  };
}
