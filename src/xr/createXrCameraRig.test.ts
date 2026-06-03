import { createXrCameraRig } from "./createXrCameraRig";

describe("createXrCameraRig", () => {
  it("disables desktop controls while presenting and restores them after exit", () => {
    const renderer = {
      xr: {
        isPresenting: false,
      },
    };
    const controls = {
      enabled: true,
      update: vi.fn(),
    };
    const rig = createXrCameraRig(renderer as never, {
      camera: {} as never,
      controls: controls as never,
      resize: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
    });

    rig.update();
    expect(controls.enabled).toBe(true);
    expect(controls.update).toHaveBeenCalledTimes(1);

    renderer.xr.isPresenting = true;
    rig.update();
    expect(controls.enabled).toBe(false);
    expect(controls.update).toHaveBeenCalledTimes(1);

    renderer.xr.isPresenting = false;
    rig.update();
    expect(controls.enabled).toBe(true);
    expect(controls.update).toHaveBeenCalledTimes(2);
  });
});
