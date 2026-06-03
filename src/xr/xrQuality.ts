import type { MutableSettings } from "../app/settings";

export const quest2XrQualityPatch = (
  settings: MutableSettings,
  isPresenting: boolean,
): Partial<MutableSettings> => {
  if (!isPresenting) {
    return {};
  }

  return {
    ...(settings.targetFps < 72 ? { targetFps: 72 } : {}),
    ...(settings.count > 8000 ? { count: 8000 } : {}),
    ...(settings.pixelRatioCap > 1 ? { pixelRatioCap: 1 } : {}),
    ...(settings.trailMode !== "off" ? { trailMode: "off" as const } : {}),
  };
};
