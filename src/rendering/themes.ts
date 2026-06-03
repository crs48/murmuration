import { Color } from "three";
import type { ThemeName } from "../app/settings";

export type Theme = Readonly<{
  name: ThemeName;
  ink: Color;
  paper: Color;
  panel: string;
  panelText: string;
}>;

export const themes: Record<ThemeName, Theme> = {
  ink: {
    name: "ink",
    ink: new Color("#0b0b0b"),
    paper: new Color("#fbfbf8"),
    panel: "rgba(251, 251, 248, 0.78)",
    panelText: "#111111",
  },
  inverse: {
    name: "inverse",
    ink: new Color("#f6f6f0"),
    paper: new Color("#070707"),
    panel: "rgba(12, 12, 12, 0.76)",
    panelText: "#f8f8f2",
  },
  paper: {
    name: "paper",
    ink: new Color("#151412"),
    paper: new Color("#f4f0e6"),
    panel: "rgba(244, 240, 230, 0.82)",
    panelText: "#151412",
  },
  graphite: {
    name: "graphite",
    ink: new Color("#eeeeea"),
    paper: new Color("#242628"),
    panel: "rgba(36, 38, 40, 0.78)",
    panelText: "#eeeeea",
  },
};

export const themeByName = (name: ThemeName): Theme => themes[name];

