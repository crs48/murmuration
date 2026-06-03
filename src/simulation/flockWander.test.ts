import { defaultSettings } from "../app/settings";
import { flockWanderCenter } from "./flockWander";

describe("flockWanderCenter", () => {
  it("stays at the origin when wandering is disabled", () => {
    expect(
      flockWanderCenter(
        { ...defaultSettings, attractorRadius: 0, attractorSpeed: 1 },
        128,
      ),
    ).toEqual([0, 0, 0]);
  });

  it("keeps the moving midpoint inside the attractor sphere", () => {
    const samples = Array.from({ length: 240 }, (_, index) =>
      flockWanderCenter(
        {
          ...defaultSettings,
          attractorRadius: 1,
          attractorSpeed: 1,
          wanderRadius: 1,
          wanderSpeed: 1,
        },
        index * 0.5,
      ),
    );

    expect(
      Math.max(...samples.map((point) => Math.hypot(...point))),
    ).toBeLessThanOrEqual(1.0001);
  });

  it("uses meaningful travel on every axis", () => {
    const samples = Array.from({ length: 240 }, (_, index) =>
      flockWanderCenter(
        {
          ...defaultSettings,
          attractorRadius: 1,
          attractorSpeed: 1,
          wanderRadius: 1,
          wanderSpeed: 1,
        },
        index * 0.5,
      ),
    );

    expect(Math.max(...samples.map(([x]) => Math.abs(x)))).toBeGreaterThan(0.7);
    expect(Math.max(...samples.map(([, y]) => Math.abs(y)))).toBeGreaterThan(
      0.7,
    );
    expect(Math.max(...samples.map(([, , z]) => Math.abs(z)))).toBeGreaterThan(
      0.7,
    );
  });

  it("changes destination over time more aggressively at higher attractor speed", () => {
    const slow = flockWanderCenter(
      {
        ...defaultSettings,
        attractorRadius: 1,
        attractorSpeed: 0.2,
      },
      4,
    );
    const fast = flockWanderCenter(
      {
        ...defaultSettings,
        attractorRadius: 1,
        attractorSpeed: 1.4,
      },
      4,
    );
    const distance = Math.hypot(
      slow[0] - fast[0],
      slow[1] - fast[1],
      slow[2] - fast[2],
    );

    expect(distance).toBeGreaterThan(0.25);
  });
});
