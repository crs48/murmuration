import {
  neutralSwarmPilotIntent,
  type SwarmPilotIntent,
} from "./inputIntent";

export type DesktopPilotIntentSource = Readonly<{
  intent: () => SwarmPilotIntent;
  dispose: () => void;
}>;

const activeValue = (
  keys: ReadonlySet<string>,
  positive: string,
  negative: string,
): number => Number(keys.has(positive)) - Number(keys.has(negative));

export const intentFromDesktopKeys = (
  keys: ReadonlySet<string>,
): SwarmPilotIntent => ({
  ...neutralSwarmPilotIntent,
  thrust: activeValue(keys, "KeyW", "KeyS"),
  yaw: activeValue(keys, "KeyD", "KeyA") + activeValue(keys, "ArrowRight", "ArrowLeft"),
  pitch: activeValue(keys, "ArrowUp", "ArrowDown") * 0.65,
  roll: activeValue(keys, "KeyE", "KeyQ"),
  gather: Number(keys.has("ShiftLeft") || keys.has("ShiftRight")),
  scatter: Number(keys.has("AltLeft") || keys.has("AltRight")),
  zoom: activeValue(keys, "Equal", "Minus"),
  mediumPulse: Number(keys.has("Space")),
});

export const createDesktopPilotIntent = (
  target: Window,
): DesktopPilotIntentSource => {
  const keys = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    keys.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.code);
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    intent: () => intentFromDesktopKeys(keys),
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      keys.clear();
    },
  };
};
