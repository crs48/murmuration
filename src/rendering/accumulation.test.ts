import { defaultSettings } from "../app/settings";
import {
  accumulationFadeOpacity,
  isAccumulationEnabled,
} from "./accumulation";

describe("accumulation", () => {
  it("enables only for visible accumulation trails", () => {
    expect(
      isAccumulationEnabled({
        ...defaultSettings,
        trailMode: "accumulation",
        trailLength: 0.6,
        trailOpacity: 0.2,
      }),
    ).toBe(true);
    expect(
      isAccumulationEnabled({
        ...defaultSettings,
        trailMode: "velocity",
      }),
    ).toBe(false);
  });

  it("uses lower fade opacity for longer-lived trails", () => {
    const shortTrail = accumulationFadeOpacity({
      ...defaultSettings,
      trailMode: "accumulation",
      trailLength: 0.2,
      trailOpacity: 0.5,
    });
    const longTrail = accumulationFadeOpacity({
      ...defaultSettings,
      trailMode: "accumulation",
      trailLength: 1.8,
      trailOpacity: 0.5,
    });

    expect(longTrail).toBeLessThan(shortTrail);
  });
});

