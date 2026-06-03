import { particleTexturePlan } from "../app/settings";

describe("webgl gpgpu texture planning", () => {
  it("packs particles into square textures for shader addressing", () => {
    expect(particleTexturePlan(3000)).toEqual({
      requestedCount: 3000,
      textureSide: 55,
      capacity: 3025,
      inactiveSlots: 25,
    });
  });
});

