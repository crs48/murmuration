import { defaultSettings } from "../app/settings";
import { CpuMurmurationSimulation } from "./CpuMurmurationSimulation";

describe("CpuMurmurationSimulation", () => {
  it("initializes deterministic typed-array particle buffers", () => {
    const a = new CpuMurmurationSimulation({ seed: 9, initialCount: 12 });
    const b = new CpuMurmurationSimulation({ seed: 9, initialCount: 12 });

    expect(a.snapshot().positions).toEqual(b.snapshot().positions);
    expect(a.snapshot().velocities).toEqual(b.snapshot().velocities);
    expect(a.snapshot().count).toBe(12);
  });

  it("steps without producing NaN positions or velocities", () => {
    const simulation = new CpuMurmurationSimulation({ seed: 11, initialCount: 96 });
    const buffers = simulation.step({
      dt: 1 / 60,
      time: 1,
      settings: {
        ...defaultSettings,
        count: 96,
        threatMode: "autonomous",
        threatStrength: 0.8,
        vacuoleStrength: 1.2,
      },
      threatPosition: [0.15, 0, 0],
    });

    expect([...buffers.positions].every(Number.isFinite)).toBe(true);
    expect([...buffers.velocities].every(Number.isFinite)).toBe(true);
    expect([...buffers.speeds].every((speed) => speed >= defaultSettings.minSpeed)).toBe(true);
    expect(
      [...buffers.positions].every((component) => Math.abs(component) < 2),
    ).toBe(true);
  });

  it("preserves particle count when resizing up and down", () => {
    const simulation = new CpuMurmurationSimulation({ seed: 4, initialCount: 32 });

    simulation.resize(48);
    expect(simulation.snapshot().count).toBe(48);
    expect(simulation.snapshot().positions.length).toBe(144);

    simulation.resize(8);
    expect(simulation.snapshot().count).toBe(8);
    expect(simulation.snapshot().positions.length).toBe(24);
  });

  it("uses a finite high-count auto field path", () => {
    const simulation = new CpuMurmurationSimulation({ seed: 15, initialCount: 5000 });
    const buffers = simulation.step({
      dt: 1 / 60,
      time: 2,
      settings: {
        ...defaultSettings,
        count: 5000,
      },
      threatPosition: null,
    });

    expect(buffers.count).toBe(5000);
    expect([...buffers.positions].every(Number.isFinite)).toBe(true);
    expect([...buffers.velocities].every(Number.isFinite)).toBe(true);
  });

  it("falls back to the high-count field path for unsupported GPU modes", () => {
    const simulation = new CpuMurmurationSimulation({ seed: 19, initialCount: 5000 });
    const buffers = simulation.step({
      dt: 1 / 60,
      time: 2,
      settings: {
        ...defaultSettings,
        count: 5000,
        simulationMode: "webgpu",
      },
      threatPosition: null,
    });

    expect(buffers.count).toBe(5000);
    expect([...buffers.positions].every(Number.isFinite)).toBe(true);
  });
});
