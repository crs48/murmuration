import type { WebGLRenderer } from "three";

export type CapabilityReport = Readonly<{
  rendererBackend: "webgl1" | "webgl2";
  webgpuAvailable: boolean;
  simulationBackend: "cpu-grid";
}>;

export const createCapabilityReport = (
  renderer: WebGLRenderer,
): CapabilityReport => ({
  rendererBackend: renderer.capabilities.isWebGL2 ? "webgl2" : "webgl1",
  webgpuAvailable: "gpu" in navigator,
  simulationBackend: "cpu-grid",
});

