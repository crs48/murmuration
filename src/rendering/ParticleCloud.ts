import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Color,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import type { ParticleBuffers } from "../simulation/types";
import { themeByName } from "./themes";

const vertexShader = `
attribute vec3 velocity;
attribute float speed;
attribute float seed;

uniform float uParticleScale;
uniform float uPixelRatio;
uniform float uDepthScale;
uniform float uDepthFade;
uniform float uTrailLength;
uniform float uVelocityTrail;
uniform float uTrailWaviness;

varying float vDepth01;
varying float vSpeed01;
varying vec2 vTrailDirection;
varying float vTrailStretch;
varying float vTrailWave;

void main() {
  vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
  vec4 tailViewPosition = modelViewMatrix * vec4(position - velocity * uTrailLength * 0.12, 1.0);
  vec4 headClip = projectionMatrix * modelViewPosition;
  vec4 tailClip = projectionMatrix * tailViewPosition;
  vec2 motion = headClip.xy / headClip.w - tailClip.xy / tailClip.w;
  float motionLength = length(motion);
  float depth = max(0.35, -modelViewPosition.z);
  vDepth01 = smoothstep(0.0, 4.8, depth);
  vSpeed01 = smoothstep(0.0, 3.2, speed);
  vTrailDirection = motionLength > 0.0001 ? motion / motionLength : vec2(1.0, 0.0);
  vTrailWave = seed * 6.2831853 + vSpeed01 * 2.3;
  vTrailStretch =
    uVelocityTrail *
    clamp(uTrailLength * 0.72, 0.0, 3.4) *
    clamp(motionLength * 24.0 + vSpeed01 * 0.85, 0.0, 1.0);
  gl_Position = headClip;
  float depthSize = 8.75 / pow(max(0.25, depth / 3.2), uDepthScale);
  gl_PointSize = clamp(
    uParticleScale * uPixelRatio * depthSize * (1.0 + vTrailStretch * 2.8),
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
uniform float uTrailWaviness;

varying float vDepth01;
varying float vSpeed01;
varying vec2 vTrailDirection;
varying float vTrailStretch;
varying float vTrailWave;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float headRadius = max(0.28, 1.0 / (1.0 + vTrailStretch * 2.8));
  vec2 headP = p / headRadius;
  float headR2 = dot(headP, headP);
  float head = 1.0 - smoothstep(0.84, 1.0, headR2);
  vec2 backward = -vTrailDirection;
  vec2 perpendicular = vec2(-backward.y, backward.x);
  float rawBehind = dot(p, backward);
  float tailLength = 0.22 + vTrailStretch * 1.35;
  float rawProgress = clamp(rawBehind / max(0.001, tailLength), 0.0, 1.0);
  float waveEnvelope = rawProgress * rawProgress * (1.0 - smoothstep(0.86, 1.0, rawProgress));
  float wave =
    sin(rawProgress * (5.4 + vSpeed01 * 3.4) + vTrailWave) *
    uTrailWaviness *
    vTrailStretch *
    0.18 *
    waveEnvelope;
  vec2 tailP = p - perpendicular * wave;
  float behind = dot(tailP, backward);
  float progress = clamp(behind / max(0.001, tailLength), 0.0, 1.0);
  float across = abs(tailP.x * vTrailDirection.y - tailP.y * vTrailDirection.x);
  float tailWidth = mix(0.34, 0.07, clamp(vTrailStretch * 0.62, 0.0, 1.0));
  float tail =
    step(0.0, behind) *
    (1.0 - smoothstep(tailWidth, tailWidth + 0.22, across)) *
    (1.0 - smoothstep(0.08, 1.0, progress)) *
    clamp(vTrailStretch * 0.82, 0.0, 1.4) *
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

export class ParticleCloud {
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
        uParticleScale: { value: settings.particleScale },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, settings.pixelRatioCap) },
        uDepthScale: { value: settings.depthScale },
        uDepthFade: { value: settings.depthFade },
        uParticleOpacity: { value: settings.particleOpacity },
        uTrailLength: { value: settings.trailLength },
        uVelocityTrail: { value: settings.trailMode === "velocity" ? 1 : 0 },
        uTrailWaviness: { value: settings.trailWaviness },
        uTrailOpacity: { value: settings.trailOpacity },
      },
      vertexShader,
      fragmentShader,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  public update = (
    buffers: ParticleBuffers,
    settings: MurmurationSettings,
    pixelRatio: number,
  ): void => {
    this.ensureCapacity(buffers.count);
    const position = this.geometry.getAttribute("position") as BufferAttribute;
    const velocity = this.geometry.getAttribute("velocity") as BufferAttribute;
    const speed = this.geometry.getAttribute("speed") as BufferAttribute;
    const seed = this.geometry.getAttribute("seed") as BufferAttribute;

    position.array.set(buffers.positions);
    velocity.array.set(buffers.velocities);
    speed.array.set(buffers.speeds);
    seed.array.set(buffers.seeds);
    position.needsUpdate = true;
    velocity.needsUpdate = true;
    speed.needsUpdate = true;
    seed.needsUpdate = true;
    this.geometry.setDrawRange(0, buffers.count);
    this.material.uniforms.uParticleScale.value = settings.particleScale;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    this.material.uniforms.uDepthScale.value = settings.depthScale;
    this.material.uniforms.uDepthFade.value = settings.depthFade;
    this.material.uniforms.uParticleOpacity.value = settings.particleOpacity;
    this.material.uniforms.uTrailLength.value = settings.trailLength;
    this.material.uniforms.uVelocityTrail.value =
      settings.trailMode === "velocity" ? 1 : 0;
    this.material.uniforms.uTrailWaviness.value = settings.trailWaviness;
    this.material.uniforms.uTrailOpacity.value = settings.trailOpacity;
  };

  public setTheme = (ink: Color, paper: Color): void => {
    this.material.uniforms.uInk.value.copy(ink);
    this.material.uniforms.uPaper.value.copy(paper);
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
      new BufferAttribute(new Float32Array(count * 3), 3),
    );
    this.geometry.setAttribute(
      "velocity",
      new BufferAttribute(new Float32Array(count * 3), 3),
    );
    this.geometry.setAttribute(
      "speed",
      new BufferAttribute(new Float32Array(count), 1),
    );
    this.geometry.setAttribute(
      "seed",
      new BufferAttribute(new Float32Array(count), 1),
    );
  };
}
