import {
  clampSettings,
  defaultSettings,
  type MurmurationSettings,
} from "./settings";

export const exportSettings = (settings: MurmurationSettings): string =>
  JSON.stringify(
    {
      kind: "murmuration-preset",
      version: 1,
      settings,
    },
    null,
    2,
  );

export const importSettings = (source: string): MurmurationSettings => {
  const parsed = JSON.parse(source) as {
    kind?: unknown;
    settings?: Partial<MurmurationSettings>;
  };

  if (parsed.kind !== "murmuration-preset" || !parsed.settings) {
    throw new Error("Expected a murmuration preset JSON document");
  }

  return clampSettings({
    ...defaultSettings,
    ...parsed.settings,
  });
};

