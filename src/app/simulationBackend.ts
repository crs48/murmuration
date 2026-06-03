import type { MurmurationSettings } from "./settings";
import type { CapabilityReport } from "../diagnostics/capabilityReport";
import { gridSimulationLimit } from "../simulation/CpuMurmurationSimulation";

export type WebgpuRuntimeStatus =
  | "unavailable"
  | "initializing"
  | "ready"
  | "failed"
  | "lost";

export type SimulationBackend =
  | "webgpu"
  | "webgl-gpgpu"
  | "cpu-field"
  | "cpu-grid";

export const selectSimulationBackend = (
  settings: MurmurationSettings,
  capability: CapabilityReport,
  webgpuStatus: WebgpuRuntimeStatus,
): SimulationBackend => {
  if (settings.simulationMode === "webgpu" && webgpuStatus === "ready") {
    return "webgpu";
  }

  if (
    (settings.simulationMode === "webgl-gpgpu" ||
      settings.simulationMode === "webgpu" ||
      settings.simulationMode === "auto") &&
    capability.webglGpgpu.isSupported
  ) {
    return "webgl-gpgpu";
  }

  return settings.simulationMode !== "cpu" && settings.count > gridSimulationLimit
    ? "cpu-field"
    : "cpu-grid";
};

export const simulationBackendLabel = (
  backend: SimulationBackend,
  requestedMode: MurmurationSettings["simulationMode"],
): string => {
  if (backend === "webgpu") {
    return "webgpu";
  }

  if (requestedMode === "webgpu") {
    return `webgpu->${backend}`;
  }

  return backend;
};

export const webgpuStatusLabel = (
  webgpuStatus: WebgpuRuntimeStatus,
): string => {
  if (webgpuStatus === "ready") {
    return "webgpu ready";
  }

  if (webgpuStatus === "initializing") {
    return "webgpu initializing";
  }

  if (webgpuStatus === "lost") {
    return "webgpu lost";
  }

  return webgpuStatus === "failed" ? "webgpu failed" : "webgpu unavailable";
};
