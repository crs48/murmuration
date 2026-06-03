import { clamp } from "../math/scalar";

export const resetCameraDistance = Math.hypot(0, 0.34, 3.6);

export type FrustumScaleInput = Readonly<{
  distance: number;
  fovDegrees: number;
  aspect: number;
}>;

const degreesToRadians = (degrees: number): number => degrees * (Math.PI / 180);

export const fittedSphereRadius = ({
  distance,
  fovDegrees,
  aspect,
}: FrustumScaleInput): number => {
  if (distance <= 0 || fovDegrees <= 0 || aspect <= 0) {
    return 0;
  }

  const verticalHalfFov = degreesToRadians(fovDegrees) / 2;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);

  return distance * Math.sin(limitingHalfFov);
};

export const attractorViewScale = (
  input: FrustumScaleInput,
  reference: FrustumScaleInput = {
    distance: resetCameraDistance,
    fovDegrees: 58,
    aspect: 16 / 9,
  },
): number => {
  const currentRadius = fittedSphereRadius(input);
  const referenceRadius = fittedSphereRadius(reference);

  if (
    !Number.isFinite(currentRadius) ||
    !Number.isFinite(referenceRadius) ||
    referenceRadius <= 0
  ) {
    return 1;
  }

  return clamp(0.1, 4, currentRadius / referenceRadius);
};
