import { particleCentroid, blendSwarmCenter } from "./swarmCenter";

describe("swarmCenter", () => {
  it("computes the centroid of particle positions", () => {
    expect(
      particleCentroid({
        count: 3,
        positions: new Float32Array([
          -1, 0, 2,
          2, 3, -1,
          5, -6, 8,
        ]),
      }),
    ).toEqual([2, -1, 3]);
  });

  it("returns null for empty buffers", () => {
    expect(
      particleCentroid({
        count: 0,
        positions: new Float32Array(0),
      }),
    ).toBeNull();
  });

  it("blends tracked swarm centers toward new measurements", () => {
    expect(blendSwarmCenter([0, 0, 0], [2, -4, 6], 0.25)).toEqual([
      0.5,
      -1,
      1.5,
    ]);
    expect(blendSwarmCenter(null, [2, -4, 6], 0.25)).toEqual([2, -4, 6]);
  });
});
