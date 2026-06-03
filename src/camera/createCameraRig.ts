import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MurmurationSettings } from "../app/settings";

export type CameraRig = Readonly<{
  camera: PerspectiveCamera;
  controls: OrbitControls;
  resize: (settings: MurmurationSettings) => void;
  reset: () => void;
  dispose: () => void;
}>;

export const createCameraRig = (
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  settings: MurmurationSettings,
): CameraRig => {
  const camera = new PerspectiveCamera(settings.fov, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  const reset = (): void => {
    camera.position.set(0, 0.34, 3.6);
    controls.target.copy(new Vector3(0, 0, 0));
    controls.update();
  };

  controls.enableDamping = true;
  controls.dampingFactor = settings.cameraDamping;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.7;
  controls.maxDistance = 9;
  controls.rotateSpeed = 0.62;
  controls.panSpeed = 0.45;
  controls.zoomSpeed = 0.8;
  reset();

  return {
    camera,
    controls,
    resize: (currentSettings) => {
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.fov = currentSettings.fov;
      camera.updateProjectionMatrix();
      controls.dampingFactor = currentSettings.cameraDamping;
      controls.autoRotate = currentSettings.autoOrbit;
      controls.autoRotateSpeed = 0.45;
    },
    reset,
    dispose: () => controls.dispose(),
  };
};

