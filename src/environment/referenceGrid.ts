import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Color,
} from "three";
import type { MediumMode, MurmurationSettings } from "../app/settings";
import { mulberry32 } from "../math/random";
import type { Vec3 } from "../math/vec3";
import {
  mediumPresetByMode,
  type MediumPreset,
} from "./mediumPresets";
import type { EnvironmentAdapter, EnvironmentUpdateInput } from "./types";

const gridX = 25;
const gridY = 13;
const gridZ = 25;
const spacing = 0.34;
const count = gridX * gridY * gridZ;

const vertexShader = `
attribute float referenceAlpha;
attribute float seed;

uniform float uPixelRatio;
uniform float uPointScale;
uniform float uTime;
uniform float uTurbulence;
uniform float uDrift;
uniform float uWake;

varying float vAlpha;

void main() {
  vec3 drift = vec3(
    sin(seed * 19.7 + uTime * 0.7),
    cos(seed * 17.3 + uTime * 0.55),
    sin(seed * 13.1 - uTime * 0.8)
  ) * uTurbulence * 0.045;
  drift.z += sin(uTime * 0.21 + seed * 7.0) * uDrift * 0.06;
  drift += vec3(
    sin(uTime * 2.1 + seed * 23.0),
    cos(uTime * 1.7 + seed * 29.0),
    sin(uTime * 1.4 + seed * 31.0)
  ) * uWake * 0.055;

  vec3 worldPosition = position + drift;
  vec4 modelViewPosition = modelViewMatrix * vec4(worldPosition, 1.0);
  float depth = max(0.4, -modelViewPosition.z);
  float distanceFade = 1.0 - smoothstep(3.2, 6.8, length(worldPosition));
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
uniform float uColorMix;

varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);

  if (r2 > 1.0) {
    discard;
  }

  float dotAlpha = (1.0 - smoothstep(0.42, 1.0, r2)) * vAlpha * uOpacity;
  vec3 color = mix(uPaper, uInk, uColorMix);

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

const jitter = (random: () => number, scale: number): number =>
  (random() * 2 - 1) * scale;

export class ReferenceGrid implements EnvironmentAdapter {
  public readonly points: Points;

  private readonly geometry = new BufferGeometry();

  private readonly material: ShaderMaterial;

  private readonly positions = new Float32Array(count * 3);

  private readonly alphas = new Float32Array(count);

  private readonly seeds = new Float32Array(count);

  private lastAnchor: Vec3 | null = null;

  private lastMode: MediumMode | null = null;

  public constructor(settings: MurmurationSettings) {
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: {
        uInk: { value: null },
        uPaper: { value: null },
        uOpacity: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, settings.pixelRatioCap) },
        uPointScale: { value: 1 },
        uTime: { value: 0 },
        uTurbulence: { value: 0 },
        uDrift: { value: 0 },
        uWake: { value: 0 },
        uColorMix: { value: 0.55 },
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
    this.geometry.setAttribute(
      "seed",
      new BufferAttribute(this.seeds, 1),
    );
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.rebuild([0, 0, 0], mediumPresetByMode(settings.mediumMode));
  }

  public update = ({
    center,
    settings,
    pixelRatio,
    time,
    wake,
  }: EnvironmentUpdateInput): void => {
    const preset = mediumPresetByMode(settings.mediumMode);
    this.points.visible = settings.mediumMode !== "off";
    this.material.uniforms.uOpacity.value =
      preset.opacity * settings.mediumIntensity;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    this.material.uniforms.uPointScale.value =
      settings.mediumPointScale * preset.pointScale;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uTurbulence.value =
      settings.mediumTurbulence * preset.turbulence;
    this.material.uniforms.uDrift.value = preset.drift;
    this.material.uniforms.uWake.value = settings.mediumWake * wake;
    this.material.uniforms.uColorMix.value = preset.colorMix;

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
      this.lastAnchor[2] === anchor[2] &&
      this.lastMode === settings.mediumMode
    ) {
      return;
    }

    this.rebuild(center, preset);
    this.lastAnchor = anchor;
    this.lastMode = settings.mediumMode;
  };

  public setTheme = (ink: Color, paper: Color): void => {
    this.material.uniforms.uInk.value = ink.clone();
    this.material.uniforms.uPaper.value = paper.clone();
  };

  public dispose = (): void => {
    this.geometry.dispose();
    this.material.dispose();
  };

  private rebuild = (center: Vec3, preset: MediumPreset): void => {
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
          const visible = random() <= preset.density;

          this.positions[offset] = cx * spacing + jitter(random, preset.jitter);
          this.positions[offset + 1] = cy * spacing + jitter(random, preset.jitter);
          this.positions[offset + 2] = cz * spacing + jitter(random, preset.jitter);
          this.alphas[index] = visible
            ? 0.32 + (1 - normalizedY) * 0.38 + random() * 0.18
            : 0;
          this.seeds[index] = random();
          index += 1;
        }
      }
    }

    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("referenceAlpha").needsUpdate = true;
    this.geometry.getAttribute("seed").needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  };
}
