import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Color,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import type { GpuParticleState } from "../simulation/WebglGpuMurmurationSimulation";
import { themeByName } from "./themes";

const vertexShader = `
attribute vec2 reference;

uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform float uParticleScale;
uniform float uPixelRatio;
uniform float uDepthScale;

varying float vDepth01;
varying float vSpeed01;

void main() {
  vec3 positionSample = texture2D(uPositionTexture, reference).xyz;
  vec3 velocitySample = texture2D(uVelocityTexture, reference).xyz;
  vec4 modelViewPosition = modelViewMatrix * vec4(positionSample, 1.0);
  float depth = max(0.35, -modelViewPosition.z);
  vDepth01 = smoothstep(0.0, 4.8, depth);
  vSpeed01 = smoothstep(0.0, 3.2, length(velocitySample));
  gl_Position = projectionMatrix * modelViewPosition;
  float depthSize = 8.75 / pow(max(0.25, depth / 3.2), uDepthScale);
  gl_PointSize = clamp(uParticleScale * uPixelRatio * depthSize, 1.5, 38.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uDepthFade;
uniform float uTrailOpacity;

varying float vDepth01;
varying float vSpeed01;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);

  if (r2 > 1.0) {
    discard;
  }

  float z = sqrt(1.0 - r2);
  float edge = smoothstep(1.0, 0.62, r2);
  float shade = 0.62 + 0.38 * z;
  float depth = mix(1.0, 1.0 - vDepth01, uDepthFade);
  float alpha = edge * depth * mix(0.72, 1.0, vSpeed01) * (0.84 + uTrailOpacity * 0.16);
  vec3 color = mix(uPaper, uInk, shade);

  gl_FragColor = vec4(color, alpha);
}
`;

export class GpuParticleCloud {
  public readonly points: Points;

  private readonly geometry = new BufferGeometry();

  private readonly material: ShaderMaterial;

  private capacity = 0;

  public constructor(settings: MurmurationSettings) {
    const theme = themeByName(settings.theme);
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: {
        uInk: { value: theme.ink.clone() },
        uPaper: { value: theme.paper.clone() },
        uPositionTexture: { value: null },
        uVelocityTexture: { value: null },
        uParticleScale: { value: settings.particleScale },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, settings.pixelRatioCap) },
        uDepthScale: { value: settings.depthScale },
        uDepthFade: { value: settings.depthFade },
        uTrailOpacity: { value: settings.trailOpacity },
      },
      vertexShader,
      fragmentShader,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  public update = (
    state: GpuParticleState,
    settings: MurmurationSettings,
    pixelRatio: number,
  ): void => {
    this.ensureCapacity(state.count, state.textureSide);
    this.material.uniforms.uPositionTexture.value = state.positionTexture;
    this.material.uniforms.uVelocityTexture.value = state.velocityTexture;
    this.material.uniforms.uParticleScale.value = settings.particleScale;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    this.material.uniforms.uDepthScale.value = settings.depthScale;
    this.material.uniforms.uDepthFade.value = settings.depthFade;
    this.material.uniforms.uTrailOpacity.value = settings.trailOpacity;
    this.geometry.setDrawRange(0, state.count);
  };

  public setTheme = (ink: Color, paper: Color): void => {
    this.material.uniforms.uInk.value.copy(ink);
    this.material.uniforms.uPaper.value.copy(paper);
  };

  public dispose = (): void => {
    this.geometry.dispose();
    this.material.dispose();
  };

  private ensureCapacity = (count: number, textureSide: number): void => {
    if (count === this.capacity) {
      return;
    }

    this.capacity = count;
    const references = new Float32Array(count * 2);

    for (let index = 0; index < count; index += 1) {
      references[index * 2] = (index % textureSide + 0.5) / textureSide;
      references[index * 2 + 1] = (Math.floor(index / textureSide) + 0.5) / textureSide;
    }

    this.geometry.setAttribute("reference", new BufferAttribute(references, 2));
  };
}
