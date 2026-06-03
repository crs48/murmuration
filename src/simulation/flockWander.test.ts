import { defaultSettings } from "../app/settings";
import { flockWanderCenter } from "./flockWander";

describe("flockWanderCenter", () => {
  it("stays at the origin when wandering is disabled", () => {
    expect(
      flockWanderCenter(
        { ...defaultSettings, wanderRadius: 0, wanderSpeed: 1 },
        128,
      ),
    ).toEqual([0, 0, 0]);
  });

  it("keeps the moving midpoint inside a camera-friendly volume", () => {
    const samples = Array.from({ length: 240 }, (_, index) =>
      flockWanderCenter(
        { ...defaultSettings, wanderRadius: 1, wanderSpeed: 1 },
        index * 0.5,
      ),
    );

    expect(Math.max(...samples.map(([x]) => Math.abs(x)))).toBeLessThan(0.85);
    expect(Math.max(...samples.map(([, y]) => Math.abs(y)))).toBeLessThan(0.55);
    expect(Math.max(...samples.map(([, , z]) => Math.abs(z)))).toBeLessThan(0.55);
  });
});
