import type { MutableSettings, MurmurationSettings } from "./settings";

export type MurmurationDebugSnapshot = Readonly<{
  settings: MurmurationSettings;
  hudText: string;
}>;

export type MurmurationDebugApi = Readonly<{
  applySettings: (patch: Partial<MutableSettings>) => void;
  snapshot: () => MurmurationDebugSnapshot;
}>;

declare global {
  interface Window {
    __murmuration?: MurmurationDebugApi;
  }
}

