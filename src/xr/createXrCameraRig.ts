import type { WebGLRenderer } from "three";
import type { CameraRig } from "../camera/createCameraRig";

export type XrCameraRig = Readonly<{
  update: () => void;
  isPresenting: () => boolean;
}>;

export const createXrCameraRig = (
  renderer: WebGLRenderer,
  cameraRig: CameraRig,
): XrCameraRig => ({
  update: () => {
    const isPresenting = renderer.xr.isPresenting;
    cameraRig.controls.enabled = !isPresenting;

    if (!isPresenting) {
      cameraRig.controls.update();
    }
  },
  isPresenting: () => renderer.xr.isPresenting,
});
