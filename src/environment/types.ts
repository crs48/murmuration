import type { Color, Points } from "three";
import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

export type EnvironmentUpdateInput = Readonly<{
  center: Vec3;
  settings: MurmurationSettings;
  pixelRatio: number;
  time: number;
  wake: number;
}>;

export type EnvironmentAdapter = Readonly<{
  points: Points;
  update: (input: EnvironmentUpdateInput) => void;
  setTheme: (ink: Color, paper: Color) => void;
  dispose: () => void;
}>;
