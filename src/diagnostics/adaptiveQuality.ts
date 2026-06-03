import type { MutableSettings } from "../app/settings";
import type { FrameStats } from "./frameStats";

export type AdaptiveQualityState = {
  lastAdjustment: number;
};

export const createAdaptiveQualityState = (): AdaptiveQualityState => ({
  lastAdjustment: 0,
});

export const adaptiveQualityPatch = (
  settings: MutableSettings,
  stats: FrameStats,
  now: number,
  state: AdaptiveQualityState,
): Partial<MutableSettings> => {
  if (!settings.adaptiveQuality || now - state.lastAdjustment < 1800) {
    return {};
  }

  if (stats.fps >= settings.targetFps * 0.78) {
    return {};
  }

  state.lastAdjustment = now;

  if (settings.trailMode !== "off") {
    return {
      trailMode: "off",
    };
  }

  if (settings.pixelRatioCap > 0.8) {
    return {
      pixelRatioCap: Math.max(0.75, Number((settings.pixelRatioCap - 0.15).toFixed(2))),
    };
  }

  if (settings.count > 512) {
    return {
      count: Math.max(512, Math.floor(settings.count * 0.82)),
    };
  }

  return {};
};
