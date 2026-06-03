import {
  Vector3,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import type { Vec3 } from "../math/vec3";
import {
  combineSwarmPilotIntents,
  readControllerIntent,
  type SwarmPilotIntent,
} from "./inputIntent";

export type XrControllerRig = Readonly<{
  intent: () => SwarmPilotIntent;
  dispose: () => void;
}>;

const forward = new Vector3(0, 0, -1);

const vectorToVec3 = (vector: Vector3): Vec3 => [
  vector.x,
  vector.y,
  vector.z,
];

const preferredHeadingFromGrip = (grip: Object3D): Vec3 => {
  const direction = forward.clone();
  direction.applyQuaternion(grip.quaternion).normalize();
  return vectorToVec3(direction);
};

const handPositionFromGrip = (grip: Object3D): Vec3 =>
  vectorToVec3(grip.getWorldPosition(new Vector3()));

export const createXrControllerRig = (
  renderer: WebGLRenderer,
  scene: Scene,
): XrControllerRig => {
  const grips = [0, 1].map((index) => renderer.xr.getControllerGrip(index));

  grips.forEach((grip) => scene.add(grip));

  const gripForHand = (
    sources: readonly XRInputSource[],
    handedness: XRHandedness,
  ): Object3D | null => {
    const sourceIndex = sources.findIndex((source) => source.handedness === handedness);
    return sourceIndex >= 0 ? grips[sourceIndex] ?? null : null;
  };

  return {
    intent: () => {
      const sources = Array.from(renderer.xr.getSession()?.inputSources ?? []);
      const rightGrip = gripForHand(sources, "right");
      const leftGrip = gripForHand(sources, "left");
      const controllerIntent = readControllerIntent(sources);

      return combineSwarmPilotIntents(controllerIntent, {
        preferredHeading: rightGrip ? preferredHeadingFromGrip(rightGrip) : null,
        rightHandPosition: rightGrip ? handPositionFromGrip(rightGrip) : null,
        leftHandPosition: leftGrip ? handPositionFromGrip(leftGrip) : null,
      });
    },
    dispose: () => grips.forEach((grip) => grip.removeFromParent()),
  };
};
