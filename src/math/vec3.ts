export type Vec3 = readonly [number, number, number];

export const zero3: Vec3 = [0, 0, 0];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

export const sub3 = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

export const scale3 = (a: Vec3, scale: number): Vec3 => [
  a[0] * scale,
  a[1] * scale,
  a[2] * scale,
];

export const lengthSq3 = (a: Vec3): number =>
  a[0] * a[0] + a[1] * a[1] + a[2] * a[2];

export const length3 = (a: Vec3): number => Math.sqrt(lengthSq3(a));

export const normalize3 = (a: Vec3): Vec3 => {
  const length = length3(a);
  return length === 0 ? zero3 : scale3(a, 1 / length);
};

export const limitLength3 = (a: Vec3, maxLength: number): Vec3 => {
  const length = length3(a);
  return length > maxLength && length > 0 ? scale3(a, maxLength / length) : a;
};

export const fromBuffer3 = (buffer: Float32Array, index: number): Vec3 => {
  const offset = index * 3;
  return [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
};

export const writeBuffer3 = (
  buffer: Float32Array,
  index: number,
  value: Vec3,
): void => {
  const offset = index * 3;
  buffer[offset] = value[0];
  buffer[offset + 1] = value[1];
  buffer[offset + 2] = value[2];
};

export const isFinite3 = (a: Vec3): boolean =>
  Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);

