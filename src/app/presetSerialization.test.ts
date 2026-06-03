import { defaultSettings } from "./settings";
import { exportSettings, importSettings } from "./presetSerialization";

describe("presetSerialization", () => {
  it("round-trips exported settings", () => {
    const imported = importSettings(
      exportSettings({
        ...defaultSettings,
        count: 1234,
        theme: "inverse",
        trailMode: "accumulation",
      }),
    );

    expect(imported.count).toBe(1234);
    expect(imported.theme).toBe("inverse");
    expect(imported.trailMode).toBe("accumulation");
  });

  it("clamps imported values", () => {
    const imported = importSettings(
      JSON.stringify({
        kind: "murmuration-preset",
        version: 1,
        settings: {
          count: -5,
          speed: 100,
        },
      }),
    );

    expect(imported.count).toBe(128);
    expect(imported.speed).toBe(5);
  });

  it("rejects unrelated JSON", () => {
    expect(() => importSettings("{}")).toThrow(
      "Expected a murmuration preset JSON document",
    );
  });
});

