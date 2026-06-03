import type { WebGLRenderer } from "three";
import { getWebglGpuSupport, type WebglGpuSupport } from "../simulation/webglGpuSupport";

export type CapabilityReport = Readonly<{
  rendererBackend: "webgl1" | "webgl2";
  webgpuAvailable: boolean;
  webglGpgpu: WebglGpuSupport;
  simulationBackend: "cpu-grid";
}>;

export const createCapabilityReport = (
  renderer: WebGLRenderer,
): CapabilityReport => ({
  rendererBackend: renderer.capabilities.isWebGL2 ? "webgl2" : "webgl1",
  webgpuAvailable: "gpu" in navigator,
  webglGpgpu: getWebglGpuSupport(renderer),
  simulationBackend: "cpu-grid",
});
