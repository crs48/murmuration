import type { WebGLRenderer } from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";

export type XrSessionButton = Readonly<{
  element: HTMLElement;
  isImmersiveVrSupported: () => boolean;
  dispose: () => void;
}>;

type XrNavigator = Navigator & {
  xr?: {
    isSessionSupported: (mode: "immersive-vr") => Promise<boolean>;
  };
};

export const createXrSessionButton = (
  renderer: WebGLRenderer,
  host: HTMLElement,
): XrSessionButton => {
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.xr.setFramebufferScaleFactor(0.85);
  renderer.xr.setFoveation(0.65);

  const element = VRButton.createButton(renderer, {
    optionalFeatures: ["local-floor", "bounded-floor"],
  });
  element.classList.add("xr-session-button");
  host.append(element);

  let immersiveVrSupported = false;
  const xr = (navigator as XrNavigator).xr;

  if (xr) {
    void xr
      .isSessionSupported("immersive-vr")
      .then((isSupported) => {
        immersiveVrSupported = isSupported;
        element.dataset.xrSupported = String(isSupported);
      })
      .catch(() => {
        immersiveVrSupported = false;
        element.dataset.xrSupported = "false";
      });
  } else {
    element.dataset.xrSupported = "false";
  }

  return {
    element,
    isImmersiveVrSupported: () => immersiveVrSupported,
    dispose: () => element.remove(),
  };
};
