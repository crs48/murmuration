import { fromBuffer3, type Vec3 } from "../math/vec3";

export type SpatialHash = Readonly<{
  cellSize: number;
  cells: Map<string, number[]>;
}>;

export type Neighbor = Readonly<{
  index: number;
  distanceSq: number;
}>;

const cellCoord = (value: number, cellSize: number): number =>
  Math.floor(value / cellSize);

export const cellKey = (
  x: number,
  y: number,
  z: number,
  cellSize: number,
): string =>
  `${cellCoord(x, cellSize)},${cellCoord(y, cellSize)},${cellCoord(z, cellSize)}`;

export const buildSpatialHash = (
  positions: Float32Array,
  count: number,
  cellSize: number,
): SpatialHash => {
  const cells = new Map<string, number[]>();

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const key = cellKey(
      positions[offset],
      positions[offset + 1],
      positions[offset + 2],
      cellSize,
    );
    const existing = cells.get(key);

    if (existing) {
      existing.push(index);
    } else {
      cells.set(key, [index]);
    }
  }

  return { cellSize, cells };
};

export const candidateIndices = (
  hash: SpatialHash,
  position: Vec3,
): readonly number[] => {
  const cx = cellCoord(position[0], hash.cellSize);
  const cy = cellCoord(position[1], hash.cellSize);
  const cz = cellCoord(position[2], hash.cellSize);
  const candidates: number[] = [];

  for (let z = cz - 1; z <= cz + 1; z += 1) {
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        const cell = hash.cells.get(`${x},${y},${z}`);

        if (cell) {
          candidates.push(...cell);
        }
      }
    }
  }

  return candidates;
};

export const nearestTopologicalNeighbors = (
  positions: Float32Array,
  selfIndex: number,
  candidates: readonly number[],
  maxDistance: number,
  neighborCount: number,
): readonly Neighbor[] => {
  const self = fromBuffer3(positions, selfIndex);
  const maxDistanceSq = maxDistance * maxDistance;

  return candidates
    .filter((index) => index !== selfIndex)
    .map((index) => {
      const other = fromBuffer3(positions, index);
      const dx = other[0] - self[0];
      const dy = other[1] - self[1];
      const dz = other[2] - self[2];

      return {
        index,
        distanceSq: dx * dx + dy * dy + dz * dz,
      };
    })
    .filter(({ distanceSq }) => distanceSq > 0 && distanceSq <= maxDistanceSq)
    .sort((a, b) => a.distanceSq - b.distanceSq)
    .slice(0, neighborCount);
};

