import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  WebGLRenderer,
  type Texture,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import { particleTexturePlan } from "../app/settings";
import { mulberry32 } from "../math/random";
import {
  initialParticlePosition,
  initialParticleVelocity,
} from "./particleInitialization";
import type { SimulationStepInput } from "./types";

export type GpuParticleState = Readonly<{
  positionTexture: Texture;
  velocityTexture: Texture;
  textureSide: number;
  count: number;
}>;

const passVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const velocityFragmentShader = `
precision highp float;

uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform float uTime;
uniform float uDelta;
uniform float uSpeed;
uniform float uMinSpeed;
uniform float uMaxSpeed;
uniform float uSeparation;
uniform float uAlignment;
uniform float uCohesion;
uniform float uNoise;
uniform float uFlow;
uniform float uThreatEnabled;
uniform vec3 uThreatPosition;
uniform float uThreatStrength;
uniform float uThreatRadius;
uniform float uWaveGain;
uniform float uVacuoleStrength;
uniform float uSplitGain;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float cyclicWeight(float value, float center) {
  float distanceToCenter = abs(value - center);
  float wrappedDistance = min(distanceToCenter, 1.0 - distanceToCenter);
  float weight = max(0.0, 1.0 - wrappedDistance * 7.5);
  return weight * weight;
}

void main() {
  vec3 pos = texture2D(uPositionTexture, vUv).xyz;
  vec3 vel = texture2D(uVelocityTexture, vUv).xyz;
  float seed = hash(vUv);
  float dist = max(0.0001, length(pos));
  vec3 blobA = vec3(
    sin(uTime * 0.19) * 0.74,
    sin(uTime * 0.31 + 0.8) * 0.48,
    cos(uTime * 0.23) * 0.62
  );
  vec3 blobB = vec3(
    cos(uTime * 0.17 + 1.6) * 0.68,
    sin(uTime * 0.37 + 2.1) * 0.54,
    sin(uTime * 0.29 + 0.4) * 0.72
  );
  vec3 blobC = vec3(
    sin(uTime * 0.27 + 2.7) * 0.58,
    cos(uTime * 0.21 + 1.2) * 0.42,
    cos(uTime * 0.33 + 2.5) * 0.68
  );
  vec3 blobD = vec3(
    cos(uTime * 0.24 + 3.4) * 0.7,
    sin(uTime * 0.33 + 0.6) * 0.5,
    sin(uTime * 0.18 + 1.4) * 0.58
  );
  vec3 blobE = vec3(
    sin(uTime * 0.14 + 4.4) * 0.48,
    sin(uTime * 0.47 + 2.3) * 0.62,
    cos(uTime * 0.26 + 4.0) * 0.7
  );
  float phase = fract(
    seed * 3.71 +
    uTime * 0.022 +
    sin(seed * 19.0 + uTime * 0.11) * 0.09
  );
  float weightA = cyclicWeight(phase, 0.0);
  float weightB = cyclicWeight(phase, 0.2);
  float weightC = cyclicWeight(phase, 0.4);
  float weightD = cyclicWeight(phase, 0.6);
  float weightE = cyclicWeight(phase, 0.8);
  float weightTotal = max(0.0001, weightA + weightB + weightC + weightD + weightE);
  vec3 blobTarget =
    (blobA * weightA + blobB * weightB + blobC * weightC + blobD * weightD + blobE * weightE) /
    weightTotal;
  vec3 local = pos - blobTarget;
  float localDistance = max(0.0001, length(local));
  vec3 localDirection = local / localDistance;
  float blobRadius =
    0.24 +
    (0.5 + 0.5 * sin(seed * 41.0 + uTime * 0.29)) * 0.16 +
    sin(phase * 6.2831 + uTime * 0.17) * 0.05;
  float shellError = localDistance - blobRadius;
  vec3 axis = normalize(vec3(
    sin(uTime * 0.13 + seed * 7.0),
    0.72 + sin(uTime * 0.19 + seed * 3.0) * 0.28,
    cos(uTime * 0.17 + seed * 5.0)
  ));
  vec3 tangent = cross(axis, localDirection);
  float tangentLength = max(0.0001, length(tangent));
  vec3 fold = vec3(
    sin(pos.y * 3.7 + uTime * 0.73 + seed * 10.0) +
      cos(pos.z * 2.9 - uTime * 0.51),
    sin(pos.z * 3.1 - uTime * 0.67 + seed * 11.0) -
      cos(pos.x * 2.4 + uTime * 0.43),
    sin(pos.x * 3.3 + uTime * 0.59 + seed * 12.0) +
      cos(pos.y * 2.6 - uTime * 0.47)
  );
  float buoyancy =
    sin(localDistance * 8.0 - uTime * 1.1 + seed * 17.0) * 0.09 +
    (blobTarget.y - pos.y) * 0.24;
  vec3 acceleration =
    -localDirection * shellError * uCohesion * 1.35 +
    (blobTarget - pos) * uCohesion * 0.22 +
    (tangent / tangentLength) * uAlignment * 0.18 +
    fold * uFlow * 0.085 +
    vec3(0.0, buoyancy * (0.75 + uFlow * 0.25), 0.0) +
    vec3(
      sin(seed * 100.0 + uTime * 1.7),
      cos(seed * 131.0 + uTime * 1.4),
      cos(seed * 73.0 - uTime * 1.2)
    ) * uNoise * 0.16;

  if (localDistance < blobRadius * 0.42) {
    acceleration += localDirection * (blobRadius * 0.42 - localDistance) * uSeparation * 1.8;
  }

  if (uThreatEnabled > 0.5 && uThreatStrength > 0.0) {
    vec3 away = pos - uThreatPosition;
    float threatDistance = length(away);

    if (threatDistance > 0.0 && threatDistance < uThreatRadius) {
      float proximity = 1.0 - threatDistance / uThreatRadius;
      vec3 direction = away / threatDistance;
      acceleration += direction * uThreatStrength * (1.1 + uVacuoleStrength) * proximity;
      acceleration += vec3(-direction.z, direction.y * 0.25, direction.x) * uSplitGain * proximity;
      acceleration += vel * uWaveGain * proximity * 0.12;
    }
  }

  float boundary = max(0.0, dist - 1.75) * 2.0;
  acceleration += -normalize(pos) * boundary;

  vec3 nextVelocity = vel + acceleration * uDelta * uSpeed;
  float velocityLength = length(nextVelocity);
  float targetSpeed = clamp(velocityLength, uMinSpeed, uMaxSpeed);
  nextVelocity = velocityLength == 0.0 ? vec3(targetSpeed, 0.0, 0.0) : nextVelocity * (targetSpeed / velocityLength);

  gl_FragColor = vec4(nextVelocity, 1.0);
}
`;

const positionFragmentShader = `
precision highp float;

uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform float uDelta;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  vec3 pos = texture2D(uPositionTexture, vUv).xyz;
  vec3 vel = texture2D(uVelocityTexture, vUv).xyz;
  gl_FragColor = vec4(pos + vel * uDelta * uSpeed, 1.0);
}
`;

const copyFragmentShader = `
precision highp float;

uniform sampler2D uSource;

varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uSource, vUv);
}
`;

const targetOptions = {
  wrapS: ClampToEdgeWrapping,
  wrapT: ClampToEdgeWrapping,
  minFilter: NearestFilter,
  magFilter: NearestFilter,
  type: FloatType,
  format: RGBAFormat,
  depthBuffer: false,
  stencilBuffer: false,
} as const;

export class WebglGpuMurmurationSimulation {
  private readonly scene = new Scene();

  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly geometry = new PlaneGeometry(2, 2);

  private readonly velocityMaterial = new ShaderMaterial({
    vertexShader: passVertexShader,
    fragmentShader: velocityFragmentShader,
    uniforms: {
      uPositionTexture: { value: null },
      uVelocityTexture: { value: null },
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uSpeed: { value: 0 },
      uMinSpeed: { value: 0 },
      uMaxSpeed: { value: 0 },
      uSeparation: { value: 0 },
      uAlignment: { value: 0 },
      uCohesion: { value: 0 },
      uNoise: { value: 0 },
      uFlow: { value: 0 },
      uThreatEnabled: { value: 0 },
      uThreatPosition: { value: [0, 0, 0] },
      uThreatStrength: { value: 0 },
      uThreatRadius: { value: 0 },
      uWaveGain: { value: 0 },
      uVacuoleStrength: { value: 0 },
      uSplitGain: { value: 0 },
    },
  });

  private readonly positionMaterial = new ShaderMaterial({
    vertexShader: passVertexShader,
    fragmentShader: positionFragmentShader,
    uniforms: {
      uPositionTexture: { value: null },
      uVelocityTexture: { value: null },
      uDelta: { value: 0 },
      uSpeed: { value: 0 },
    },
  });

  private readonly copyMaterial = new ShaderMaterial({
    vertexShader: passVertexShader,
    fragmentShader: copyFragmentShader,
    uniforms: {
      uSource: { value: null },
    },
  });

  private readonly quad = new Mesh(this.geometry, this.copyMaterial);

  private count = 0;

  private textureSide = 0;

  private positionSource: Texture | null = null;

  private velocitySource: Texture | null = null;

  private positionTargets: [WebGLRenderTarget, WebGLRenderTarget] | null = null;

  private velocityTargets: [WebGLRenderTarget, WebGLRenderTarget] | null = null;

  private writeIndex = 0;

  public constructor(private readonly renderer: WebGLRenderer) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  public resize = (count: number): void => {
    if (count === this.count) {
      return;
    }

    this.disposeTargets();
    const plan = particleTexturePlan(count);
    this.count = count;
    this.textureSide = plan.textureSide;
    const random = mulberry32(71);
    const positionData = new Float32Array(plan.capacity * 4);
    const velocityData = new Float32Array(plan.capacity * 4);

    for (let index = 0; index < count; index += 1) {
      const position = initialParticlePosition(random, index, count);
      const velocity = initialParticleVelocity(random, position);
      const offset = index * 4;
      positionData[offset] = position[0];
      positionData[offset + 1] = position[1];
      positionData[offset + 2] = position[2];
      positionData[offset + 3] = 1;
      velocityData[offset] = velocity[0];
      velocityData[offset + 1] = velocity[1];
      velocityData[offset + 2] = velocity[2];
      velocityData[offset + 3] = 1;
    }

    this.positionSource = new DataTexture(
      positionData,
      this.textureSide,
      this.textureSide,
      RGBAFormat,
      FloatType,
    );
    this.velocitySource = new DataTexture(
      velocityData,
      this.textureSide,
      this.textureSide,
      RGBAFormat,
      FloatType,
    );
    this.positionSource.needsUpdate = true;
    this.velocitySource.needsUpdate = true;
    this.positionTargets = [
      new WebGLRenderTarget(this.textureSide, this.textureSide, targetOptions),
      new WebGLRenderTarget(this.textureSide, this.textureSide, targetOptions),
    ];
    this.velocityTargets = [
      new WebGLRenderTarget(this.textureSide, this.textureSide, targetOptions),
      new WebGLRenderTarget(this.textureSide, this.textureSide, targetOptions),
    ];
    this.writeIndex = 0;
  };

  public step = (input: SimulationStepInput): GpuParticleState => {
    this.resize(input.settings.count);

    if (
      !this.positionSource ||
      !this.velocitySource ||
      !this.positionTargets ||
      !this.velocityTargets
    ) {
      throw new Error("GPU simulation failed to initialize");
    }

    const delta = Math.min(1 / 20, Math.max(0, input.dt));
    const velocityTarget = this.velocityTargets[this.writeIndex];
    const positionTarget = this.positionTargets[this.writeIndex];
    const previousAutoClear = this.renderer.autoClear;

    this.renderer.autoClear = true;

    this.quad.material = this.velocityMaterial;
    this.velocityMaterial.uniforms.uPositionTexture.value = this.positionSource;
    this.velocityMaterial.uniforms.uVelocityTexture.value = this.velocitySource;
    this.velocityMaterial.uniforms.uTime.value = input.time;
    this.velocityMaterial.uniforms.uDelta.value = delta;
    this.velocityMaterial.uniforms.uSpeed.value = input.settings.speed;
    this.velocityMaterial.uniforms.uMinSpeed.value = input.settings.minSpeed;
    this.velocityMaterial.uniforms.uMaxSpeed.value = input.settings.maxSpeed;
    this.velocityMaterial.uniforms.uSeparation.value = input.settings.separation;
    this.velocityMaterial.uniforms.uAlignment.value = input.settings.alignment;
    this.velocityMaterial.uniforms.uCohesion.value = input.settings.cohesion;
    this.velocityMaterial.uniforms.uNoise.value = input.settings.noise;
    this.velocityMaterial.uniforms.uFlow.value = input.settings.flow;
    this.velocityMaterial.uniforms.uThreatEnabled.value = input.threatPosition ? 1 : 0;
    this.velocityMaterial.uniforms.uThreatPosition.value = input.threatPosition ?? [0, 0, 0];
    this.velocityMaterial.uniforms.uThreatStrength.value = input.settings.threatStrength;
    this.velocityMaterial.uniforms.uThreatRadius.value = input.settings.threatRadius;
    this.velocityMaterial.uniforms.uWaveGain.value = input.settings.waveGain;
    this.velocityMaterial.uniforms.uVacuoleStrength.value = input.settings.vacuoleStrength;
    this.velocityMaterial.uniforms.uSplitGain.value = input.settings.splitGain;
    this.renderer.setRenderTarget(velocityTarget);
    this.renderer.render(this.scene, this.camera);

    this.quad.material = this.positionMaterial;
    this.positionMaterial.uniforms.uPositionTexture.value = this.positionSource;
    this.positionMaterial.uniforms.uVelocityTexture.value = velocityTarget.texture;
    this.positionMaterial.uniforms.uDelta.value = delta;
    this.positionMaterial.uniforms.uSpeed.value = input.settings.speed;
    this.renderer.setRenderTarget(positionTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = previousAutoClear;

    this.positionSource = positionTarget.texture;
    this.velocitySource = velocityTarget.texture;
    this.writeIndex = 1 - this.writeIndex;

    return {
      positionTexture: this.positionSource,
      velocityTexture: this.velocitySource,
      textureSide: this.textureSide,
      count: this.count,
    };
  };

  public dispose = (): void => {
    this.disposeTargets();
    this.geometry.dispose();
    this.velocityMaterial.dispose();
    this.positionMaterial.dispose();
    this.copyMaterial.dispose();
  };

  private disposeTargets = (): void => {
    const targetTextures = new Set<Texture>([
      ...(this.positionTargets?.map((target) => target.texture) ?? []),
      ...(this.velocityTargets?.map((target) => target.texture) ?? []),
    ]);

    this.positionTargets?.forEach((target) => target.dispose());
    this.velocityTargets?.forEach((target) => target.dispose());
    this.positionTargets = null;
    this.velocityTargets = null;

    if (this.positionSource && !targetTextures.has(this.positionSource)) {
      this.positionSource.dispose();
    }

    if (this.velocitySource && !targetTextures.has(this.velocitySource)) {
      this.velocitySource.dispose();
    }

    this.positionSource = null;
    this.velocitySource = null;
  };
}
