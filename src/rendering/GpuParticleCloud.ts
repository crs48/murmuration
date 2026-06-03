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
uniform float uTrailLength;
uniform float uVelocityTrail;

varying float vDepth01;
varying float vSpeed01;
varying vec2 vTrailDirection;
varying float vTrailStretch;

void main() {
  vec3 positionSample = texture2D(uPositionTexture, reference).xyz;
  vec3 velocitySample = texture2D(uVelocityTexture, reference).xyz;
  vec4 modelViewPosition = modelViewMatrix * vec4(positionSample, 1.0);
  vec4 tailViewPosition = modelViewMatrix * vec4(positionSample - velocitySample * uTrailLength * 0.12, 1.0);
  vec4 headClip = projectionMatrix * modelViewPosition;
  vec4 tailClip = projectionMatrix * tailViewPosition;
  vec2 motion = headClip.xy / headClip.w - tailClip.xy / tailClip.w;
  float motionLength = length(motion);
  float depth = max(0.35, -modelViewPosition.z);
  vDepth01 = smoothstep(0.0, 4.8, depth);
  vSpeed01 = smoothstep(0.0, 3.2, length(velocitySample));
  vTrailDirection = motionLength > 0.0001 ? motion / motionLength : vec2(1.0, 0.0);
  vTrailStretch =
    uVelocityTrail *
    clamp(uTrailLength * 0.85, 0.0, 2.0) *
    clamp(motionLength * 18.0 + vSpeed01 * 0.65, 0.0, 1.0);
  gl_Position = headClip;
  float depthSize = 8.75 / pow(max(0.25, depth / 3.2), uDepthScale);
  gl_PointSize = clamp(
    uParticleScale * uPixelRatio * depthSize * (1.0 + vTrailStretch * 2.2),
    1.5,
    72.0
  );
}
`;

const fragmentShader = `
precision highp float;

uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uDepthFade;
uniform float uParticleOpacity;
uniform float uTrailOpacity;

varying float vDepth01;
varying float vSpeed01;
varying vec2 vTrailDirection;
varying float vTrailStretch;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float headRadius = max(0.28, 1.0 / (1.0 + vTrailStretch * 2.2));
  vec2 headP = p / headRadius;
  float headR2 = dot(headP, headP);
  float head = 1.0 - smoothstep(0.84, 1.0, headR2);
  float behind = dot(p, -vTrailDirection);
  float across = abs(p.x * vTrailDirection.y - p.y * vTrailDirection.x);
  float tailLength = 0.18 + vTrailStretch * 1.1;
  float tailWidth = mix(0.3, 0.08, clamp(vTrailStretch, 0.0, 1.0));
  float tail =
    step(0.0, behind) *
    (1.0 - smoothstep(tailWidth, tailWidth + 0.22, across)) *
    (1.0 - smoothstep(tailLength * 0.18, tailLength, behind)) *
    vTrailStretch *
    uTrailOpacity;

  if (max(head, tail) <= 0.001) {
    discard;
  }

  float rim = smoothstep(0.58, 1.0, headR2);
  float shade = 1.0 - rim * 0.22;
  float edgeAlpha = mix(1.0, 0.76, smoothstep(0.72, 1.0, headR2));
  float depth = mix(1.0, 1.0 - vDepth01, uDepthFade);
  float alpha = max(head * edgeAlpha, tail * 0.68) * depth * uParticleOpacity;
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
        uParticleOpacity: { value: settings.particleOpacity },
        uTrailLength: { value: settings.trailLength },
        uVelocityTrail: { value: settings.trailMode === "velocity" ? settings.trailOpacity : 0 },
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
    this.material.uniforms.uParticleOpacity.value = settings.particleOpacity;
    this.material.uniforms.uTrailLength.value = settings.trailLength;
    this.material.uniforms.uVelocityTrail.value =
      settings.trailMode === "velocity" ? settings.trailOpacity : 0;
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
