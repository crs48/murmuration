import { Matrix4, type Color, type PerspectiveCamera } from "three";
import type { MurmurationSettings } from "../app/settings";
import { mulberry32 } from "../math/random";
import {
  initialParticlePosition,
  initialParticleVelocity,
} from "../simulation/particleInitialization";
import type { SimulationStepInput } from "../simulation/types";

const workgroupSize = 128;
const particleStrideBytes = 16;
const simUniformFloats = 20;
const renderUniformFloats = 40;

const velocityShader = `
struct SimUniforms {
  params0: vec4<f32>,
  params1: vec4<f32>,
  params2: vec4<f32>,
  threat: vec4<f32>,
  params3: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read> positionsIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velocitiesIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> velocitiesOut: array<vec4<f32>>;

fn hash(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

fn cyclicWeight(value: f32, center: f32) -> f32 {
  let distanceToCenter = abs(value - center);
  let wrappedDistance = min(distanceToCenter, 1.0 - distanceToCenter);
  let weight = max(0.0, 1.0 - wrappedDistance * 7.5);
  return weight * weight;
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let count = u32(u.params0.w);

  if (index >= count) {
    return;
  }

  let pos = positionsIn[index].xyz;
  let vel = velocitiesIn[index].xyz;
  let seed = hash(f32(index) + 1.0);
  let delta = u.params0.x;
  let time = u.params0.y;
  let speed = u.params0.z;
  let minSpeed = u.params1.x;
  let maxSpeed = u.params1.y;
  let separation = u.params1.z;
  let alignment = u.params1.w;
  let cohesion = u.params2.x;
  let noise = u.params2.y;
  let flow = u.params2.z;
  let threatEnabled = u.params2.w;
  let threatStrength = u.threat.w;
  let threatRadius = u.params3.x;
  let waveGain = u.params3.y;
  let vacuoleStrength = u.params3.z;
  let splitGain = u.params3.w;
  let dist = max(0.0001, length(pos));
  let radial = pos / dist;
  let blobA = vec3<f32>(
    sin(time * 0.19) * 0.74,
    sin(time * 0.31 + 0.8) * 0.48,
    cos(time * 0.23) * 0.62
  );
  let blobB = vec3<f32>(
    cos(time * 0.17 + 1.6) * 0.68,
    sin(time * 0.37 + 2.1) * 0.54,
    sin(time * 0.29 + 0.4) * 0.72
  );
  let blobC = vec3<f32>(
    sin(time * 0.27 + 2.7) * 0.58,
    cos(time * 0.21 + 1.2) * 0.42,
    cos(time * 0.33 + 2.5) * 0.68
  );
  let blobD = vec3<f32>(
    cos(time * 0.24 + 3.4) * 0.7,
    sin(time * 0.33 + 0.6) * 0.5,
    sin(time * 0.18 + 1.4) * 0.58
  );
  let blobE = vec3<f32>(
    sin(time * 0.14 + 4.4) * 0.48,
    sin(time * 0.47 + 2.3) * 0.62,
    cos(time * 0.26 + 4.0) * 0.7
  );
  let phase = fract(
    seed * 3.71 +
    time * 0.022 +
    sin(seed * 19.0 + time * 0.11) * 0.09
  );
  let weightA = cyclicWeight(phase, 0.0);
  let weightB = cyclicWeight(phase, 0.2);
  let weightC = cyclicWeight(phase, 0.4);
  let weightD = cyclicWeight(phase, 0.6);
  let weightE = cyclicWeight(phase, 0.8);
  let weightTotal = max(0.0001, weightA + weightB + weightC + weightD + weightE);
  let blobTarget =
    (blobA * weightA + blobB * weightB + blobC * weightC + blobD * weightD + blobE * weightE) /
    weightTotal;
  let local = pos - blobTarget;
  let localDistance = max(0.0001, length(local));
  let localDirection = local / localDistance;
  let blobRadius =
    0.24 +
    (0.5 + 0.5 * sin(seed * 41.0 + time * 0.29)) * 0.16 +
    sin(phase * 6.2831 + time * 0.17) * 0.05;
  let shellError = localDistance - blobRadius;
  let axis = normalize(vec3<f32>(
    sin(time * 0.13 + seed * 7.0),
    0.72 + sin(time * 0.19 + seed * 3.0) * 0.28,
    cos(time * 0.17 + seed * 5.0)
  ));
  let tangent = cross(axis, localDirection);
  let tangentLength = max(0.0001, length(tangent));
  let fold = vec3<f32>(
    sin(pos.y * 3.7 + time * 0.73 + seed * 10.0) +
      cos(pos.z * 2.9 - time * 0.51),
    sin(pos.z * 3.1 - time * 0.67 + seed * 11.0) -
      cos(pos.x * 2.4 + time * 0.43),
    sin(pos.x * 3.3 + time * 0.59 + seed * 12.0) +
      cos(pos.y * 2.6 - time * 0.47)
  );
  let buoyancy =
    sin(localDistance * 8.0 - time * 1.1 + seed * 17.0) * 0.09 +
    (blobTarget.y - pos.y) * 0.24;
  var acceleration =
    -localDirection * shellError * cohesion * 1.35 +
    (blobTarget - pos) * cohesion * 0.22 +
    (tangent / tangentLength) * alignment * 0.18 +
    fold * flow * 0.085 +
    vec3<f32>(0.0, buoyancy * (0.75 + flow * 0.25), 0.0) +
    vec3<f32>(
      sin(seed * 100.0 + time * 1.7),
      cos(seed * 131.0 + time * 1.4),
      cos(seed * 73.0 - time * 1.2)
    ) * noise * 0.16;

  if (localDistance < blobRadius * 0.42) {
    acceleration += localDirection * (blobRadius * 0.42 - localDistance) * separation * 1.8;
  }

  if (threatEnabled > 0.5 && threatStrength > 0.0) {
    let away = pos - u.threat.xyz;
    let threatDistance = length(away);

    if (threatDistance > 0.0 && threatDistance < threatRadius) {
      let proximity = 1.0 - threatDistance / threatRadius;
      let direction = away / threatDistance;
      acceleration += direction * threatStrength * (1.1 + vacuoleStrength) * proximity;
      acceleration += vec3<f32>(-direction.z, direction.y * 0.25, direction.x) * splitGain * proximity;
      acceleration += vel * waveGain * proximity * 0.12;
    }
  }

  let boundary = max(0.0, dist - 1.75) * 2.0;
  acceleration += -radial * boundary;

  var nextVelocity = vel + acceleration * delta * speed;
  let velocityLength = length(nextVelocity);
  let targetSpeed = clamp(velocityLength, minSpeed, maxSpeed);

  if (velocityLength < 0.0001) {
    nextVelocity = vec3<f32>(targetSpeed, 0.0, 0.0);
  } else {
    nextVelocity *= targetSpeed / velocityLength;
  }

  velocitiesOut[index] = vec4<f32>(nextVelocity, 1.0);
}
`;

const positionShader = `
struct SimUniforms {
  params0: vec4<f32>,
  params1: vec4<f32>,
  params2: vec4<f32>,
  threat: vec4<f32>,
  params3: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read> positionsIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velocitiesIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> positionsOut: array<vec4<f32>>;

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let count = u32(u.params0.w);

  if (index >= count) {
    return;
  }

  let pos = positionsIn[index].xyz;
  let vel = velocitiesIn[index].xyz;
  positionsOut[index] = vec4<f32>(pos + vel * u.params0.x * u.params0.z, 1.0);
}
`;

const renderShader = `
struct RenderUniforms {
  viewProjection: mat4x4<f32>,
  cameraRight: vec4<f32>,
  cameraUp: vec4<f32>,
  cameraPosition: vec4<f32>,
  ink: vec4<f32>,
  paper: vec4<f32>,
  params: vec4<f32>,
};

struct VertexOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) depth01: f32,
  @location(2) speed01: f32,
};

@group(0) @binding(0) var<uniform> u: RenderUniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velocities: array<vec4<f32>>;

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );
  let corner = corners[vertexIndex % 6u];
  let pos = positions[instanceIndex].xyz;
  let vel = velocities[instanceIndex].xyz;
  let cameraDistance = max(0.35, length(pos - u.cameraPosition.xyz));
  let speed01 = smoothstep(0.0, 3.2, length(vel));
  let worldSize = u.params.y * u.cameraRight.w * (0.75 + speed01 * 0.2) * sqrt(cameraDistance);
  let worldPosition =
    pos + (u.cameraRight.xyz * corner.x + u.cameraUp.xyz * corner.y) * worldSize;
  var out: VertexOut;
  out.clipPosition = u.viewProjection * vec4<f32>(worldPosition, 1.0);
  out.uv = corner;
  out.depth01 = smoothstep(0.0, 4.8, cameraDistance);
  out.speed01 = speed01;
  return out;
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4<f32> {
  let radius2 = dot(input.uv, input.uv);

  if (radius2 > 1.0) {
    discard;
  }

  let z = sqrt(1.0 - radius2);
  let edge = 1.0 - smoothstep(0.62, 1.0, radius2);
  let shade = 0.62 + 0.38 * z;
  let depth = mix(1.0, 1.0 - input.depth01, u.cameraUp.w);
  let alpha = edge * depth * mix(0.72, 1.0, input.speed01) * (0.84 + u.params.x * 0.16);
  let color = mix(u.paper.rgb, u.ink.rgb, shade);
  return vec4<f32>(color, alpha);
}
`;

type WebgpuParticleBuffers = Readonly<{
  positions: [GPUBuffer, GPUBuffer];
  velocities: [GPUBuffer, GPUBuffer];
  velocityBindGroups: [GPUBindGroup, GPUBindGroup];
  positionBindGroups: [GPUBindGroup, GPUBindGroup];
  renderBindGroups: [GPUBindGroup, GPUBindGroup];
}>;

export class WebgpuParticleLayer {
  private readonly context: GPUCanvasContext;

  private readonly simUniformBuffer: GPUBuffer;

  private readonly renderUniformBuffer: GPUBuffer;

  private readonly velocityPipeline: GPUComputePipeline;

  private readonly positionPipeline: GPUComputePipeline;

  private readonly renderPipeline: GPURenderPipeline;

  private readonly simUniforms = new Float32Array(simUniformFloats);

  private readonly renderUniforms = new Float32Array(renderUniformFloats);

  private readonly viewProjection = new Matrix4();

  private buffers: WebgpuParticleBuffers | null = null;

  private count = 0;

  private readIndex = 0;

  private width = 0;

  private height = 0;

  private lost = false;

  private constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly format: GPUTextureFormat,
  ) {
    const context = canvas.getContext("webgpu");

    if (!context) {
      throw new Error("WebGPU canvas context is unavailable");
    }

    this.context = context;
    this.simUniformBuffer = device.createBuffer({
      label: "murmuration sim uniforms",
      size: simUniformFloats * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniformBuffer = device.createBuffer({
      label: "murmuration render uniforms",
      size: renderUniformFloats * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.velocityPipeline = device.createComputePipeline({
      label: "murmuration velocity compute",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "murmuration velocity shader",
          code: velocityShader,
        }),
        entryPoint: "main",
      },
    });
    this.positionPipeline = device.createComputePipeline({
      label: "murmuration position compute",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "murmuration position shader",
          code: positionShader,
        }),
        entryPoint: "main",
      },
    });
    this.renderPipeline = device.createRenderPipeline({
      label: "murmuration webgpu render",
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          label: "murmuration billboard shader",
          code: renderShader,
        }),
        entryPoint: "vertexMain",
      },
      fragment: {
        module: device.createShaderModule({
          label: "murmuration billboard shader",
          code: renderShader,
        }),
        entryPoint: "fragmentMain",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    canvas.className = "webgpu-canvas";
    canvas.hidden = true;
    host.append(canvas);
    void device.lost.then(() => {
      this.lost = true;
    });
  }

  public static create = async (
    host: HTMLElement,
  ): Promise<WebgpuParticleLayer | null> => {
    const gpu = navigator.gpu;

    if (!gpu) {
      return null;
    }

    const adapter = await gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      return null;
    }

    const device = await adapter.requestDevice();
    const canvas = document.createElement("canvas");
    const format = gpu.getPreferredCanvasFormat();

    return new WebgpuParticleLayer(host, canvas, device, format);
  };

  public isLost = (): boolean => this.lost;

  public setVisible = (visible: boolean): void => {
    this.canvas.hidden = !visible;
  };

  public render = (
    input: SimulationStepInput,
    camera: PerspectiveCamera,
    ink: Color,
    paper: Color,
    pixelRatio: number,
  ): void => {
    if (this.lost) {
      return;
    }

    this.resize(input.settings, pixelRatio);
    this.ensureBuffers(input.settings.count);
    this.updateSimulationUniforms(input);
    this.updateRenderUniforms(input.settings, camera, ink, paper);

    if (!this.buffers) {
      return;
    }

    const writeIndex = 1 - this.readIndex;
    const workgroups = Math.ceil(this.count / workgroupSize);
    const encoder = this.device.createCommandEncoder({
      label: "murmuration webgpu frame",
    });
    const computePass = encoder.beginComputePass({
      label: "murmuration simulation",
    });

    computePass.setPipeline(this.velocityPipeline);
    computePass.setBindGroup(0, this.buffers.velocityBindGroups[this.readIndex]);
    computePass.dispatchWorkgroups(workgroups);
    computePass.setPipeline(this.positionPipeline);
    computePass.setBindGroup(0, this.buffers.positionBindGroups[this.readIndex]);
    computePass.dispatchWorkgroups(workgroups);
    computePass.end();

    const renderPass = encoder.beginRenderPass({
      label: "murmuration particles",
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: {
            r: paper.r,
            g: paper.g,
            b: paper.b,
            a: 1,
          },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.buffers.renderBindGroups[writeIndex]);
    renderPass.draw(6, this.count);
    renderPass.end();
    this.device.queue.submit([encoder.finish()]);
    this.readIndex = writeIndex;
  };

  public dispose = (): void => {
    this.disposeBuffers();
    this.simUniformBuffer.destroy();
    this.renderUniformBuffer.destroy();
    this.context.unconfigure();
    this.device.destroy();
    this.canvas.remove();
  };

  private resize = (
    settings: MurmurationSettings,
    pixelRatio: number,
  ): void => {
    const width = Math.max(1, Math.floor(this.host.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.host.clientHeight * pixelRatio));

    if (width === this.width && height === this.height) {
      return;
    }

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${this.host.clientWidth}px`;
    this.canvas.style.height = `${this.host.clientHeight}px`;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });
    this.canvas.dataset.pixelRatio = String(pixelRatio);
    this.canvas.dataset.pixelRatioCap = String(settings.pixelRatioCap);
  };

  private ensureBuffers = (count: number): void => {
    if (count === this.count && this.buffers) {
      return;
    }

    this.disposeBuffers();
    this.count = count;
    this.readIndex = 0;
    const random = mulberry32(71);
    const positions = new Float32Array(count * 4);
    const velocities = new Float32Array(count * 4);

    for (let index = 0; index < count; index += 1) {
      const position = initialParticlePosition(random, index, count);
      const velocity = initialParticleVelocity(random, position);
      const offset = index * 4;
      positions[offset] = position[0];
      positions[offset + 1] = position[1];
      positions[offset + 2] = position[2];
      positions[offset + 3] = 1;
      velocities[offset] = velocity[0];
      velocities[offset + 1] = velocity[1];
      velocities[offset + 2] = velocity[2];
      velocities[offset + 3] = 1;
    }

    const usage =
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC;
    const size = Math.max(1, count) * particleStrideBytes;
    const positionBuffers = [
      this.device.createBuffer({
        label: "murmuration positions a",
        size,
        usage,
      }),
      this.device.createBuffer({
        label: "murmuration positions b",
        size,
        usage,
      }),
    ] as [GPUBuffer, GPUBuffer];
    const velocityBuffers = [
      this.device.createBuffer({
        label: "murmuration velocities a",
        size,
        usage,
      }),
      this.device.createBuffer({
        label: "murmuration velocities b",
        size,
        usage,
      }),
    ] as [GPUBuffer, GPUBuffer];

    positionBuffers.forEach((buffer) => {
      this.device.queue.writeBuffer(buffer, 0, positions);
    });
    velocityBuffers.forEach((buffer) => {
      this.device.queue.writeBuffer(buffer, 0, velocities);
    });

    this.buffers = this.createBindGroups(positionBuffers, velocityBuffers);
  };

  private createBindGroups = (
    positions: [GPUBuffer, GPUBuffer],
    velocities: [GPUBuffer, GPUBuffer],
  ): WebgpuParticleBuffers => {
    const velocityLayout = this.velocityPipeline.getBindGroupLayout(0);
    const positionLayout = this.positionPipeline.getBindGroupLayout(0);
    const renderLayout = this.renderPipeline.getBindGroupLayout(0);
    const velocityBindGroups = [0, 1].map((readIndex) => {
      const writeIndex = 1 - readIndex;

      return this.device.createBindGroup({
        label: `murmuration velocity bind ${readIndex}`,
        layout: velocityLayout,
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuffer } },
          { binding: 1, resource: { buffer: positions[readIndex] } },
          { binding: 2, resource: { buffer: velocities[readIndex] } },
          { binding: 3, resource: { buffer: velocities[writeIndex] } },
        ],
      });
    }) as [GPUBindGroup, GPUBindGroup];
    const positionBindGroups = [0, 1].map((readIndex) => {
      const writeIndex = 1 - readIndex;

      return this.device.createBindGroup({
        label: `murmuration position bind ${readIndex}`,
        layout: positionLayout,
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuffer } },
          { binding: 1, resource: { buffer: positions[readIndex] } },
          { binding: 2, resource: { buffer: velocities[writeIndex] } },
          { binding: 3, resource: { buffer: positions[writeIndex] } },
        ],
      });
    }) as [GPUBindGroup, GPUBindGroup];
    const renderBindGroups = [0, 1].map((stateIndex) =>
      this.device.createBindGroup({
        label: `murmuration render bind ${stateIndex}`,
        layout: renderLayout,
        entries: [
          { binding: 0, resource: { buffer: this.renderUniformBuffer } },
          { binding: 1, resource: { buffer: positions[stateIndex] } },
          { binding: 2, resource: { buffer: velocities[stateIndex] } },
        ],
      }),
    ) as [GPUBindGroup, GPUBindGroup];

    return {
      positions,
      velocities,
      velocityBindGroups,
      positionBindGroups,
      renderBindGroups,
    };
  };

  private updateSimulationUniforms = (input: SimulationStepInput): void => {
    const delta = Math.min(1 / 20, Math.max(0, input.dt));
    const { settings } = input;
    this.simUniforms[0] = delta;
    this.simUniforms[1] = input.time;
    this.simUniforms[2] = settings.speed;
    this.simUniforms[3] = settings.count;
    this.simUniforms[4] = settings.minSpeed;
    this.simUniforms[5] = settings.maxSpeed;
    this.simUniforms[6] = settings.separation;
    this.simUniforms[7] = settings.alignment;
    this.simUniforms[8] = settings.cohesion;
    this.simUniforms[9] = settings.noise;
    this.simUniforms[10] = settings.flow;
    this.simUniforms[11] = input.threatPosition ? 1 : 0;
    this.simUniforms[12] = input.threatPosition?.[0] ?? 0;
    this.simUniforms[13] = input.threatPosition?.[1] ?? 0;
    this.simUniforms[14] = input.threatPosition?.[2] ?? 0;
    this.simUniforms[15] = settings.threatStrength;
    this.simUniforms[16] = settings.threatRadius;
    this.simUniforms[17] = settings.waveGain;
    this.simUniforms[18] = settings.vacuoleStrength;
    this.simUniforms[19] = settings.splitGain;
    this.device.queue.writeBuffer(this.simUniformBuffer, 0, this.simUniforms);
  };

  private updateRenderUniforms = (
    settings: MurmurationSettings,
    camera: PerspectiveCamera,
    ink: Color,
    paper: Color,
  ): void => {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.renderUniforms.set(this.viewProjection.elements, 0);
    const cameraElements = camera.matrixWorld.elements;
    this.renderUniforms[16] = cameraElements[0];
    this.renderUniforms[17] = cameraElements[1];
    this.renderUniforms[18] = cameraElements[2];
    this.renderUniforms[19] = settings.particleScale;
    this.renderUniforms[20] = cameraElements[4];
    this.renderUniforms[21] = cameraElements[5];
    this.renderUniforms[22] = cameraElements[6];
    this.renderUniforms[23] = settings.depthFade;
    this.renderUniforms[24] = camera.position.x;
    this.renderUniforms[25] = camera.position.y;
    this.renderUniforms[26] = camera.position.z;
    this.renderUniforms[27] = 1;
    this.renderUniforms[28] = ink.r;
    this.renderUniforms[29] = ink.g;
    this.renderUniforms[30] = ink.b;
    this.renderUniforms[31] = 1;
    this.renderUniforms[32] = paper.r;
    this.renderUniforms[33] = paper.g;
    this.renderUniforms[34] = paper.b;
    this.renderUniforms[35] = 1;
    this.renderUniforms[36] = settings.trailOpacity;
    this.renderUniforms[37] = 0.006;
    this.renderUniforms[38] = this.width;
    this.renderUniforms[39] = this.height;
    this.device.queue.writeBuffer(
      this.renderUniformBuffer,
      0,
      this.renderUniforms,
    );
  };

  private disposeBuffers = (): void => {
    this.buffers?.positions.forEach((buffer) => buffer.destroy());
    this.buffers?.velocities.forEach((buffer) => buffer.destroy());
    this.buffers = null;
  };
}
