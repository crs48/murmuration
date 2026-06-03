import {
  buildSpatialHash,
  candidateIndices,
  nearestTopologicalNeighbors,
} from "./cpuSpatialHash";

describe("cpuSpatialHash", () => {
  it("groups nearby particles into queryable cells", () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.1, 0, 0,
      1.2, 0, 0,
    ]);
    const hash = buildSpatialHash(positions, 3, 0.25);

    expect(candidateIndices(hash, [0, 0, 0])).toContain(1);
    expect(candidateIndices(hash, [0, 0, 0])).not.toContain(2);
  });

  it("keeps nearest topological neighbors within a metric limit", () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.1, 0, 0,
      0.2, 0, 0,
      0.3, 0, 0,
    ]);
    const neighbors = nearestTopologicalNeighbors(
      positions,
      0,
      [0, 1, 2, 3],
      0.5,
      2,
    );

    expect(neighbors.map(({ index }) => index)).toEqual([1, 2]);
  });
});

