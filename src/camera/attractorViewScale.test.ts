import {
  attractorViewScale,
  fittedSphereRadius,
  resetCameraDistance,
} from "./attractorViewScale";

describe("attractorViewScale", () => {
  it("uses the reset desktop view as the neutral attractor scale", () => {
    expect(
      attractorViewScale({
        distance: resetCameraDistance,
        fovDegrees: 58,
        aspect: 16 / 9,
      }),
    ).toBeCloseTo(1);
  });

  it("allows a larger attractor sphere as the camera zooms out", () => {
    const near = attractorViewScale({
      distance: resetCameraDistance,
      fovDegrees: 58,
      aspect: 16 / 9,
    });
    const far = attractorViewScale({
      distance: resetCameraDistance * 2,
      fovDegrees: 58,
      aspect: 16 / 9,
    });

    expect(far).toBeCloseTo(near * 2);
  });

  it("uses the narrower frustum axis as the fit limit", () => {
    const wide = fittedSphereRadius({
      distance: resetCameraDistance,
      fovDegrees: 58,
      aspect: 16 / 9,
    });
    const portrait = fittedSphereRadius({
      distance: resetCameraDistance,
      fovDegrees: 58,
      aspect: 0.5,
    });

    expect(portrait).toBeLessThan(wide);
  });
});
