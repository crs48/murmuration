import type { CapabilityReport } from "../diagnostics/capabilityReport";
import {
  selectSimulationBackend,
  simulationBackendLabel,
  webgpuStatusLabel,
} from "./simulationBackend";
import { defaultSettings } from "./settings";

const capability = (
  overrides: Partial<CapabilityReport> = {},
): CapabilityReport => ({
  rendererBackend: "webgl2",
  simulationBackend: "cpu-grid",
  webgpuAvailable: true,
  webglGpgpu: {
    isSupported: true,
    isWebGL2: true,
    hasFloatRenderTarget: true,
    hasVertexTextures: true,
  },
  ...overrides,
});

describe("simulation backend selection", () => {
  it("uses WebGPU when the requested mode has a ready device", () => {
    const backend = selectSimulationBackend(
      { ...defaultSettings, simulationMode: "webgpu" },
      capability(),
      "ready",
    );

    expect(backend).toBe("webgpu");
  });

  it("falls back from initializing WebGPU to WebGL GPGPU when available", () => {
    const backend = selectSimulationBackend(
      { ...defaultSettings, simulationMode: "webgpu" },
      capability(),
      "initializing",
    );

    expect(backend).toBe("webgl-gpgpu");
    expect(simulationBackendLabel(backend, "webgpu")).toBe("webgpu->webgl-gpgpu");
  });

  it("uses WebGL GPGPU for auto mode when the browser supports it", () => {
    const backend = selectSimulationBackend(
      { ...defaultSettings, simulationMode: "auto" },
      capability(),
      "failed",
    );

    expect(backend).toBe("webgl-gpgpu");
  });

  it("falls back from unavailable WebGPU to CPU when no GPGPU path exists", () => {
    const backend = selectSimulationBackend(
      { ...defaultSettings, count: 12_000, simulationMode: "webgpu" },
      capability({
        webgpuAvailable: false,
        webglGpgpu: {
          isSupported: false,
          isWebGL2: true,
          hasFloatRenderTarget: false,
          hasVertexTextures: true,
        },
      }),
      "unavailable",
    );

    expect(backend).toBe("cpu-field");
    expect(simulationBackendLabel(backend, "webgpu")).toBe("webgpu->cpu-field");
  });

  it("keeps explicit CPU mode on the CPU grid", () => {
    const backend = selectSimulationBackend(
      { ...defaultSettings, count: 50_000, simulationMode: "cpu" },
      capability(),
      "ready",
    );

    expect(backend).toBe("cpu-grid");
  });

  it("formats WebGPU runtime statuses for the HUD", () => {
    expect(webgpuStatusLabel("ready")).toBe("webgpu ready");
    expect(webgpuStatusLabel("initializing")).toBe("webgpu initializing");
    expect(webgpuStatusLabel("failed")).toBe("webgpu failed");
    expect(webgpuStatusLabel("lost")).toBe("webgpu lost");
    expect(webgpuStatusLabel("unavailable")).toBe("webgpu unavailable");
  });
});
