import { intentFromDesktopKeys } from "./desktopPilotIntent";

describe("intentFromDesktopKeys", () => {
  it("emits the same semantic intent shape from keyboard controls", () => {
    const intent = intentFromDesktopKeys(
      new Set(["KeyW", "KeyD", "KeyE", "ShiftLeft", "Space"]),
    );

    expect(intent.thrust).toBe(1);
    expect(intent.yaw).toBe(1);
    expect(intent.roll).toBe(1);
    expect(intent.gather).toBe(1);
    expect(intent.mediumPulse).toBe(1);
    expect(intent.preferredHeading).toBeNull();
  });

  it("cancels opposing keys", () => {
    const intent = intentFromDesktopKeys(new Set(["KeyW", "KeyS", "KeyA", "KeyD"]));

    expect(intent.thrust).toBe(0);
    expect(intent.yaw).toBe(0);
  });
});
