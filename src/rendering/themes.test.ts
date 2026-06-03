import { themeByName, themes } from "./themes";

describe("themes", () => {
  it("defines all monochrome visual themes", () => {
    expect(Object.keys(themes).sort()).toEqual([
      "graphite",
      "ink",
      "inverse",
      "paper",
    ]);
  });

  it("keeps inverse contrast inverted from ink", () => {
    expect(themeByName("ink").paper.getHexString()).toBe("fbfbf8");
    expect(themeByName("inverse").paper.getHexString()).toBe("070707");
  });
});

