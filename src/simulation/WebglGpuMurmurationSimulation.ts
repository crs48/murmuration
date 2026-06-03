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
import { mulberry32, randomSigned } from "../math/random";
import type { Vec3 } from "../math/vec3";
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

void main() {
  vec3 pos = texture2D(uPositionTexture, vUv).xyz;
  vec3 vel = texture2D(uVelocityTexture, vUv).xyz;
  float seed = hash(vUv);
  float dist = max(0.0001, length(pos));
  float sheet = sin(seed * 32.0 + uTime * 0.32) * 0.18;
  vec3 swirl = vec3(-pos.z / dist, (sin(uTime * 0.26 + seed * 20.0) * 0.3 - pos.y) * 0.35, pos.x / dist);
  vec3 fold = vec3(
    sin(pos.y * 3.1 + uTime * 0.7 + seed * 10.0),
    cos((pos.x + pos.z) * 2.2 - uTime * 0.5 + seed * 11.0),
    sin(pos.x * 2.7 - uTime * 0.6 + seed * 12.0)
  );
  float desiredRadius = 0.78 + sheet + uCohesion * 0.06;
  float radialError = dist - desiredRadius;
  vec3 acceleration =
    swirl * uAlignment * 0.42 -
    normalize(pos) * radialError * uCohesion * 0.85 +
    fold * uFlow * 0.1 +
    vec3(
      sin(seed * 100.0 + uTime * 1.7),
      cos(seed * 131.0 + uTime * 1.4),
      cos(seed * 73.0 - uTime * 1.2)
    ) * uNoise * 0.18;

  if (dist < 0.34) {
    acceleration += normalize(pos) * (0.34 - dist) * uSeparation * 1.5;
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

  float boundary = max(0.0, dist - 1.55) * 1.8;
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

const initialPosition = (
  random: () => number,
  index: number,
  count: number,
): Vec3 => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const t = count <= 1 ? 0 : index / (count - 1);
  const y = 1 - 2 * t;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * index;
  const jitter = 0.055;

  return [
    Math.cos(theta) * radius * 0.9 + randomSigned(random) * jitter,
    y * 0.42 + randomSigned(random) * jitter,
    Math.sin(theta) * radius * 0.9 + randomSigned(random) * jitter,
  ];
};

const initialVelocity = (random: () => number, position: Vec3): Vec3 => {
  const tangent: Vec3 = [-position[2], randomSigned(random) * 0.18, position[0]];
  return [
    tangent[0] * 0.7 + randomSigned(random) * 0.08,
    tangent[1] + randomSigned(random) * 0.08,
    tangent[2] * 0.7 + randomSigned(random) * 0.08,
  ];
};

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
      const position = initialPosition(random, index, count);
      const velocity = initialVelocity(random, position);
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
    Object.assign(this.velocityMaterial.uniforms, {
      uPositionTexture: { value: this.positionSource },
      uVelocityTexture: { value: this.velocitySource },
      uTime: { value: input.time },
      uDelta: { value: delta },
      uSpeed: { value: input.settings.speed },
      uMinSpeed: { value: input.settings.minSpeed },
      uMaxSpeed: { value: input.settings.maxSpeed },
      uSeparation: { value: input.settings.separation },
      uAlignment: { value: input.settings.alignment },
      uCohesion: { value: input.settings.cohesion },
      uNoise: { value: input.settings.noise },
      uFlow: { value: input.settings.flow },
      uThreatEnabled: { value: input.threatPosition ? 1 : 0 },
      uThreatPosition: { value: input.threatPosition ?? [0, 0, 0] },
      uThreatStrength: { value: input.settings.threatStrength },
      uThreatRadius: { value: input.settings.threatRadius },
      uWaveGain: { value: input.settings.waveGain },
      uVacuoleStrength: { value: input.settings.vacuoleStrength },
      uSplitGain: { value: input.settings.splitGain },
    });
    this.renderer.setRenderTarget(velocityTarget);
    this.renderer.render(this.scene, this.camera);

    this.quad.material = this.positionMaterial;
    Object.assign(this.positionMaterial.uniforms, {
      uPositionTexture: { value: this.positionSource },
      uVelocityTexture: { value: velocityTarget.texture },
      uDelta: { value: delta },
      uSpeed: { value: input.settings.speed },
    });
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
