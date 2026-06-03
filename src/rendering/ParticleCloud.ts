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

uniform float uParticleScale;
uniform float uPixelRatio;
uniform float uDepthScale;
uniform float uDepthFade;

varying float vDepth01;
varying float vSpeed01;

void main() {
  vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.35, -modelViewPosition.z);
  vDepth01 = smoothstep(0.0, 4.8, depth);
  vSpeed01 = smoothstep(0.0, 3.2, speed);
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

    position.array.set(buffers.positions);
    velocity.array.set(buffers.velocities);
    speed.array.set(buffers.speeds);
    position.needsUpdate = true;
    velocity.needsUpdate = true;
    speed.needsUpdate = true;
    this.geometry.setDrawRange(0, buffers.count);
    this.material.uniforms.uParticleScale.value = settings.particleScale;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    this.material.uniforms.uDepthScale.value = settings.depthScale;
    this.material.uniforms.uDepthFade.value = settings.depthFade;
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
  };
}
