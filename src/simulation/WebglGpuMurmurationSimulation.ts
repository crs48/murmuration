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
import { isFinite3, type Vec3 } from "../math/vec3";
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
uniform float uTextureSide;
uniform float uCount;
uniform float uSpeed;
uniform float uMinSpeed;
uniform float uMaxSpeed;
uniform float uSeparation;
uniform float uAlignment;
uniform float uCohesion;
uniform float uNoise;
uniform float uFlow;
uniform float uChaseStrength;
uniform float uAttractorSpeed;
uniform float uAttractorRadius;
uniform float uWanderRadius;
uniform float uWanderSpeed;
uniform float uThreatEnabled;
uniform vec3 uThreatPosition;
uniform vec3 uThreatVelocity;
uniform float uThreatStrength;
uniform float uThreatRadius;
uniform float uWaveGain;
uniform float uVacuoleStrength;
uniform float uSplitGain;
uniform float uPilotEnabled;
uniform vec3 uPilotPosition;
uniform vec3 uPilotHeading;
uniform float uPilotRadius;

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

vec3 flockWanderCenter(float time) {
  float t = time * uAttractorSpeed * uWanderSpeed;
  vec3 raw = vec3(
    sin(t * 0.47 + sin(t * 0.19) * 1.15) * 0.82 +
      sin(t * 1.07 + 1.4) * 0.38 +
      cos(t * 0.23 + 2.1) * 0.22,
    cos(t * 0.43 + 0.6 + sin(t * 0.13) * 0.9) * 0.78 +
      sin(t * 0.91 + 2.8) * 0.42 +
      cos(t * 0.29 + 0.4) * 0.24,
    sin(t * 0.39 + 1.1 + cos(t * 0.17) * 1.05) * 0.8 +
      cos(t * 0.97 + 0.2) * 0.4 +
      sin(t * 0.21 + 2.6) * 0.22
  );
  float radialPulse = 0.72 + 0.28 * (0.5 + 0.5 * sin(t * 0.41 + cos(t * 0.17)));
  vec3 travel = raw * (radialPulse / max(1.0, length(raw)));

  return uAttractorRadius * uWanderRadius * travel;
}

vec3 leaderAnchor(vec3 center, float time, float groupSeed) {
  float phase = groupSeed * 6.2831853;

  return center + vec3(
    cos(phase + time * 0.21) * 0.5 + sin(time * 0.13 + phase * 2.3) * 0.16,
    sin(phase * 1.7 + time * 0.19) * 0.34 + cos(time * 0.11 + phase) * 0.12,
    sin(phase + time * 0.16) * 0.46 + cos(time * 0.23 + phase * 1.4) * 0.14
  );
}

vec2 uvForSlot(float slot) {
  float wrappedSlot = mod(slot + uCount, uCount);
  float x = mod(wrappedSlot, uTextureSide);
  float y = floor(wrappedSlot / uTextureSide);

  return (vec2(x, y) + 0.5) / uTextureSide;
}

vec3 slotRepulsion(vec3 pos, float slot, float slotOffset, float minimumDistance) {
  vec3 other = texture2D(uPositionTexture, uvForSlot(slot + slotOffset)).xyz;
  vec3 away = pos - other;
  float distanceToOther = length(away);
  float proximity = max(0.0, minimumDistance - distanceToOther) / minimumDistance;

  if (distanceToOther <= 0.0001 || proximity <= 0.0) {
    return vec3(0.0);
  }

  return (away / distanceToOther) * proximity * proximity;
}

vec3 stratifiedOffset(float slot, float groupSeed, float time, float chaseStrength, float separation) {
  float goldenAngle = 2.39996323;
  float y = 1.0 - 2.0 * fract((slot + 0.5) * 0.61803398875 + groupSeed * 0.13);
  float ring = sqrt(max(0.0, 1.0 - y * y));
  float theta = slot * goldenAngle + groupSeed * 6.2831853;
  float shell = pow(fract((slot + 1.0) * 0.754877666), 0.3333);
  float radius =
    (0.16 + shell * 0.34) *
    (0.68 + chaseStrength * 0.34) *
    (0.92 + separation * 0.045);
  float laminarBreath = 1.0 + sin(time * 0.13 + groupSeed * 12.0) * 0.035;

  return vec3(cos(theta) * ring, y, sin(theta) * ring) * radius * laminarBreath;
}

float rippleEnvelope(float localTime) {
  return smoothstep(0.6, 1.7, localTime) * (1.0 - smoothstep(6.2, 8.8, localTime));
}

vec3 rippleCenter(vec3 center, float time, float offset) {
  float t = time + offset;

  return center + vec3(
    sin(t * 0.17 + offset) * 0.46,
    cos(t * 0.13 + offset * 1.7) * 0.25,
    cos(t * 0.19 + offset * 0.6) * 0.42
  );
}

vec4 rippleVector(vec3 pos, vec3 center, float time, float offset) {
  float period = 28.0;
  float localTime = mod(time + offset, period);
  float envelope = rippleEnvelope(localTime);
  vec3 origin = rippleCenter(center, time, offset);
  vec3 away = pos - origin;
  float distanceFromRipple = max(0.0001, length(away));
  float radius = 0.16 + localTime * 0.16;
  float width = 0.11 + localTime * 0.012;
  float delta = abs(distanceFromRipple - radius) / width;
  float amount = exp(-delta * delta) * envelope;

  return vec4((away / distanceFromRipple) * amount, amount);
}

void main() {
  vec3 pos = texture2D(uPositionTexture, vUv).xyz;
  vec3 vel = texture2D(uVelocityTexture, vUv).xyz;
  float seed = hash(vUv);
  float slot = floor(vUv.x * uTextureSide) + floor(vUv.y * uTextureSide) * uTextureSide;
  vec3 autoFlockCenter = flockWanderCenter(uTime);
  vec3 flockCenter = mix(autoFlockCenter, uPilotPosition, uPilotEnabled);
  vec3 fromCenter = pos - flockCenter;
  float dist = max(0.0001, length(fromCenter));
  vec3 blobA = vec3(
    flockCenter.x + sin(uTime * 0.19) * 0.74,
    flockCenter.y + sin(uTime * 0.31 + 0.8) * 0.48,
    flockCenter.z + cos(uTime * 0.23) * 0.62
  );
  vec3 blobB = vec3(
    flockCenter.x + cos(uTime * 0.17 + 1.6) * 0.68,
    flockCenter.y + sin(uTime * 0.37 + 2.1) * 0.54,
    flockCenter.z + sin(uTime * 0.29 + 0.4) * 0.72
  );
  vec3 blobC = vec3(
    flockCenter.x + sin(uTime * 0.27 + 2.7) * 0.58,
    flockCenter.y + cos(uTime * 0.21 + 1.2) * 0.42,
    flockCenter.z + cos(uTime * 0.33 + 2.5) * 0.68
  );
  vec3 blobD = vec3(
    flockCenter.x + cos(uTime * 0.24 + 3.4) * 0.7,
    flockCenter.y + sin(uTime * 0.33 + 0.6) * 0.5,
    flockCenter.z + sin(uTime * 0.18 + 1.4) * 0.58
  );
  vec3 blobE = vec3(
    flockCenter.x + sin(uTime * 0.14 + 4.4) * 0.48,
    flockCenter.y + sin(uTime * 0.47 + 2.3) * 0.62,
    flockCenter.z + cos(uTime * 0.26 + 4.0) * 0.7
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
  vec3 legacyTarget =
    (blobA * weightA + blobB * weightB + blobC * weightC + blobD * weightD + blobE * weightE) /
    weightTotal;
  vec3 autoDrift = vec3(
    0.72 + sin(uTime * 0.09) * 0.16,
    sin(uTime * 0.13 + 0.7) * 0.22,
    0.08 + cos(uTime * 0.11 + 1.2) * 0.18
  );
  vec3 sharedDrift = normalize(mix(autoDrift, uPilotHeading, uPilotEnabled));
  float groupCount = 7.0;
  float group = floor(seed * groupCount);
  float groupSeed = (group + 0.5) / groupCount;
  float leaderLag = hash(vec2(seed, 9.17)) * (1.1 + uChaseStrength * 2.4);
  float neighborGroup = mod(group + 1.0 + floor(hash(vec2(seed, 4.2)) * 3.0), groupCount);
  float neighborSeed = (neighborGroup + 0.5) / groupCount;
  vec3 primaryAnchor = leaderAnchor(flockCenter, uTime - leaderLag, groupSeed);
  vec3 secondaryAnchor = leaderAnchor(flockCenter, uTime - leaderLag * 1.7 - 0.8, neighborSeed);
  float role = hash(vec2(seed, 5.91));
  float secondaryMix = 0.16 + hash(vec2(seed, 6.24)) * 0.28;
  float leaderMix = step(0.84, role) * 0.62;
  vec3 offset = stratifiedOffset(slot, groupSeed, uTime, uChaseStrength, uSeparation);
  vec3 followerTarget =
    mix(primaryAnchor, secondaryAnchor, secondaryMix) +
    offset;
  vec3 leaderTarget = flockCenter + sharedDrift * (0.18 + hash(vec2(seed, 7.1)) * 0.18);
  vec3 chaseTarget = mix(followerTarget, leaderTarget, leaderMix);
  vec3 blobTarget = mix(legacyTarget, chaseTarget, uChaseStrength);
  vec3 local = pos - blobTarget;
  float localDistance = max(0.0001, length(local));
  vec3 localDirection = local / localDistance;
  float blobRadius =
    (
      0.24 +
      (0.5 + 0.5 * sin(seed * 41.0 + uTime * 0.29)) * 0.16 +
      sin(phase * 6.2831 + uTime * 0.17) * 0.05
    ) * mix(1.0, uPilotRadius, uPilotEnabled);
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
  vec3 driftVelocity = sharedDrift * (0.28 + uFlow * 0.12 + uCohesion * 0.03);
  float shellInfluence = 1.0 - uChaseStrength;
  float targetPull = 0.3 + uChaseStrength * 0.42 + uSeparation * 0.08;
  float driftPull = 0.16 + uChaseStrength * 0.06;
  float tangentPull = 0.035 * shellInfluence;
  float viscousDrag = uChaseStrength * (0.08 + uFlow * 0.02);
  float flowPull = 0.035 + uChaseStrength * 0.015;
  vec4 rippleA = rippleVector(pos, flockCenter, uTime, 0.0);
  vec4 rippleB = rippleVector(pos, flockCenter, uTime, 9.333333);
  vec4 rippleC = rippleVector(pos, flockCenter, uTime, 18.666666);
  vec3 rippleRadial = rippleA.xyz + rippleB.xyz + rippleC.xyz;
  float rippleAmount = clamp(rippleA.w + rippleB.w + rippleC.w, 0.0, 1.0);
  vec3 rippleTwist = cross(sharedDrift, rippleRadial);
  vec3 rippleForce = rippleRadial + rippleTwist * 0.28;
  float flowPulse = 0.22 + rippleAmount * 1.35;
  float noisePulse = 0.045 + rippleAmount * 0.08;
  float slotDistance = 0.07 + uSeparation * 0.02;
  vec3 spacingForce =
    slotRepulsion(pos, slot, 1.0, slotDistance) +
    slotRepulsion(pos, slot, -1.0, slotDistance) +
    slotRepulsion(pos, slot, 7.0, slotDistance) +
    slotRepulsion(pos, slot, -7.0, slotDistance) +
    slotRepulsion(pos, slot, 31.0, slotDistance) +
    slotRepulsion(pos, slot, -31.0, slotDistance);
  vec3 acceleration =
    -localDirection * shellError * uCohesion * 1.35 * shellInfluence +
    (blobTarget - pos) * uCohesion * targetPull +
    (driftVelocity - vel) * uAlignment * driftPull -
    vel * viscousDrag +
    (tangent / tangentLength) * uAlignment * tangentPull +
    spacingForce * uSeparation * (0.14 + uChaseStrength * 0.05) +
    fold * uFlow * flowPull * flowPulse +
    rippleForce * uFlow * (0.13 + uWaveGain * 0.04) +
    vec3(0.0, buoyancy * (0.75 + uFlow * 0.25), 0.0) +
    vec3(
      sin(seed * 100.0 + uTime * 1.7),
      cos(seed * 131.0 + uTime * 1.4),
      cos(seed * 73.0 - uTime * 1.2)
    ) * uNoise * noisePulse;

  float innerRadius = blobRadius * (0.28 + shellInfluence * 0.18 + uSeparation * 0.012);
  if (localDistance < innerRadius) {
    acceleration += localDirection * (innerRadius - localDistance) * uSeparation * 1.4;
  }

  if (uThreatEnabled > 0.5 && uThreatStrength > 0.0) {
    vec3 away = pos - uThreatPosition;
    float threatDistance = length(away);

    if (threatDistance > 0.0 && threatDistance < uThreatRadius) {
      float proximity = 1.0 - threatDistance / uThreatRadius;
      float broadProximity = sqrt(proximity);
      vec3 direction = away / threatDistance;
      float threatSpeed = length(uThreatVelocity);
      vec3 threatDirection =
        threatSpeed > 0.0001 ? uThreatVelocity / threatSpeed : vec3(0.0);
      float push = uThreatStrength * (2.5 + uVacuoleStrength * 1.7) * broadProximity;
      float wake = min(1.8, threatSpeed) * uThreatStrength * broadProximity * 0.42;
      acceleration += direction * push;
      acceleration += (direction - threatDirection * 0.35) * wake;
      acceleration += vec3(-direction.z, direction.y * 0.28, direction.x) *
        uSplitGain *
        broadProximity *
        1.45;
      acceleration += vel * uWaveGain * broadProximity * 0.22;
    }
  }

  float boundary = max(0.0, dist - 1.75 * mix(1.0, uPilotRadius, uPilotEnabled)) * 2.0;
  acceleration += -(fromCenter / dist) * boundary;

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
      uTextureSide: { value: 1 },
      uCount: { value: 1 },
      uSpeed: { value: 0 },
      uMinSpeed: { value: 0 },
      uMaxSpeed: { value: 0 },
      uSeparation: { value: 0 },
      uAlignment: { value: 0 },
      uCohesion: { value: 0 },
      uNoise: { value: 0 },
      uFlow: { value: 0 },
      uChaseStrength: { value: 0 },
      uAttractorSpeed: { value: 0 },
      uAttractorRadius: { value: 0 },
      uWanderRadius: { value: 0 },
      uWanderSpeed: { value: 0 },
      uThreatEnabled: { value: 0 },
      uThreatPosition: { value: [0, 0, 0] },
      uThreatVelocity: { value: [0, 0, 0] },
      uThreatStrength: { value: 0 },
      uThreatRadius: { value: 0 },
      uWaveGain: { value: 0 },
      uVacuoleStrength: { value: 0 },
      uSplitGain: { value: 0 },
      uPilotEnabled: { value: 0 },
      uPilotPosition: { value: [0, 0, 0] },
      uPilotHeading: { value: [0, 0, -1] },
      uPilotRadius: { value: 1 },
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

  private positionReadTarget: WebGLRenderTarget | null = null;

  private centerReadback = new Float32Array(0);

  private centerReadbackFailed = false;

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
    this.centerReadbackFailed = false;
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
    this.velocityMaterial.uniforms.uTextureSide.value = this.textureSide;
    this.velocityMaterial.uniforms.uCount.value = input.settings.count;
    this.velocityMaterial.uniforms.uSpeed.value = input.settings.speed;
    this.velocityMaterial.uniforms.uMinSpeed.value = input.settings.minSpeed;
    this.velocityMaterial.uniforms.uMaxSpeed.value = input.settings.maxSpeed;
    this.velocityMaterial.uniforms.uSeparation.value = input.settings.separation;
    this.velocityMaterial.uniforms.uAlignment.value = input.settings.alignment;
    this.velocityMaterial.uniforms.uCohesion.value = input.settings.cohesion;
    this.velocityMaterial.uniforms.uNoise.value = input.settings.noise;
    this.velocityMaterial.uniforms.uFlow.value = input.settings.flow;
    this.velocityMaterial.uniforms.uChaseStrength.value = input.settings.chaseStrength;
    this.velocityMaterial.uniforms.uAttractorSpeed.value = input.settings.attractorSpeed;
    this.velocityMaterial.uniforms.uAttractorRadius.value = input.settings.attractorRadius;
    this.velocityMaterial.uniforms.uWanderRadius.value = input.settings.wanderRadius;
    this.velocityMaterial.uniforms.uWanderSpeed.value = input.settings.wanderSpeed;
    this.velocityMaterial.uniforms.uThreatEnabled.value = input.threatPosition ? 1 : 0;
    this.velocityMaterial.uniforms.uThreatPosition.value = input.threatPosition ?? [0, 0, 0];
    this.velocityMaterial.uniforms.uThreatVelocity.value = input.threatVelocity ?? [0, 0, 0];
    this.velocityMaterial.uniforms.uThreatStrength.value = input.settings.threatStrength;
    this.velocityMaterial.uniforms.uThreatRadius.value = input.settings.threatRadius;
    this.velocityMaterial.uniforms.uWaveGain.value = input.settings.waveGain;
    this.velocityMaterial.uniforms.uVacuoleStrength.value = input.settings.vacuoleStrength;
    this.velocityMaterial.uniforms.uSplitGain.value = input.settings.splitGain;
    this.velocityMaterial.uniforms.uPilotEnabled.value = input.pilot ? 1 : 0;
    this.velocityMaterial.uniforms.uPilotPosition.value = input.pilot?.corePosition ?? [0, 0, 0];
    this.velocityMaterial.uniforms.uPilotHeading.value = input.pilot?.heading ?? [0, 0, -1];
    this.velocityMaterial.uniforms.uPilotRadius.value = input.pilot?.radius ?? 1;
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
    this.positionReadTarget = positionTarget;
    this.writeIndex = 1 - this.writeIndex;

    return {
      positionTexture: this.positionSource,
      velocityTexture: this.velocitySource,
      textureSide: this.textureSide,
      count: this.count,
    };
  };

  public sampleCenter = (): Vec3 | null => {
    if (
      !this.positionReadTarget ||
      this.centerReadbackFailed ||
      this.count <= 0 ||
      this.textureSide <= 0
    ) {
      return null;
    }

    const requiredLength = this.textureSide * this.textureSide * 4;

    if (this.centerReadback.length !== requiredLength) {
      this.centerReadback = new Float32Array(requiredLength);
    }

    try {
      this.renderer.readRenderTargetPixels(
        this.positionReadTarget,
        0,
        0,
        this.textureSide,
        this.textureSide,
        this.centerReadback,
      );
    } catch {
      this.centerReadbackFailed = true;
      return null;
    }

    let x = 0;
    let y = 0;
    let z = 0;

    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 4;
      x += this.centerReadback[offset];
      y += this.centerReadback[offset + 1];
      z += this.centerReadback[offset + 2];
    }

    const center: Vec3 = [x / this.count, y / this.count, z / this.count];

    return isFinite3(center) ? center : null;
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
    this.positionReadTarget = null;

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
