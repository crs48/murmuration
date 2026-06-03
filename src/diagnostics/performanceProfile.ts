import type { MurmurationSettings } from "../app/settings";
import type { SimulationBackend } from "../app/simulationBackend";
import type { FrameStats } from "./frameStats";

export type PerformanceBottleneck =
  | "healthy"
  | "likely-cpu"
  | "likely-vertex"
  | "likely-fragment"
  | "mixed";

export type PerformanceProfileInput = Readonly<{
  settings: MurmurationSettings;
  stats: FrameStats;
  backend: SimulationBackend;
  isXrPresenting: boolean;
}>;

const frameBudgetMs = (
  settings: MurmurationSettings,
  isXrPresenting: boolean,
): number => 1000 / Math.max(isXrPresenting ? 72 : 24, settings.targetFps);

export const classifyPerformanceBottleneck = ({
  settings,
  stats,
  backend,
  isXrPresenting,
}: PerformanceProfileInput): PerformanceBottleneck => {
  if (stats.averageFrameMs <= frameBudgetMs(settings, isXrPresenting) * 1.12) {
    return "healthy";
  }

  const cpuRisk =
    backend === "cpu-grid" ||
    backend === "cpu-field" ||
    settings.simulationMode === "cpu";
  const vertexRisk = settings.count > (isXrPresenting ? 8000 : 30000);
  const fragmentRisk =
    settings.pixelRatioCap > (isXrPresenting ? 1 : 1.25) ||
    settings.trailMode === "accumulation" ||
    settings.trailMode === "velocity" ||
    settings.mediumIntensity > 0.75 ||
    settings.particleScale > 1.25;
  const risks = [cpuRisk, vertexRisk, fragmentRisk].filter(Boolean).length;

  if (risks > 1) {
    return "mixed";
  }

  if (cpuRisk) {
    return "likely-cpu";
  }

  if (fragmentRisk) {
    return "likely-fragment";
  }

  return vertexRisk ? "likely-vertex" : "mixed";
};

export const performanceBottleneckLabel = (
  bottleneck: PerformanceBottleneck,
): string => {
  if (bottleneck === "likely-cpu") {
    return "profile cpu";
  }

  if (bottleneck === "likely-vertex") {
    return "profile vertex";
  }

  if (bottleneck === "likely-fragment") {
    return "profile fragment";
  }

  return bottleneck === "mixed" ? "profile mixed" : "profile healthy";
};
