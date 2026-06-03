import { defaultSettings, type MurmurationSettings } from "../app/settings";
import { writeBuffer3 } from "../math/vec3";
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

  it("reuses hot-path typed-array buffers when the count is stable", () => {
    const simulation = new CpuMurmurationSimulation({ seed: 6, initialCount: 96 });
    const settings: MurmurationSettings = {
      ...defaultSettings,
      count: 96,
      simulationMode: "cpu",
    };
    const before = simulation.snapshot();

    for (let frame = 0; frame < 5; frame += 1) {
      simulation.step({
        dt: 1 / 60,
        time: frame / 60,
        settings,
        threatPosition: null,
      });
    }

    const after = simulation.snapshot();

    expect(after.positions).toBe(before.positions);
    expect(after.previousPositions).toBe(before.previousPositions);
    expect(after.velocities).toBe(before.velocities);
    expect(after.speeds).toBe(before.speeds);
    expect(after.seeds).toBe(before.seeds);
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

  it("keeps low-scale high-count particles from collapsing into micro-clumps", () => {
    const simulation = new CpuMurmurationSimulation({ seed: 43, initialCount: 1300 });
    const settings: MurmurationSettings = {
      ...defaultSettings,
      count: 1300,
      particleScale: 0.32,
      separation: 1.05,
      noise: 0.012,
      flow: 0.24,
      simulationMode: "auto",
    };

    for (let frame = 0; frame < 360; frame += 1) {
      simulation.step({
        dt: 1 / 60,
        time: frame / 60,
        settings,
        threatPosition: null,
      });
    }

    const { positions, count } = simulation.snapshot();
    const closeRadiusSq = 0.045 * 0.045;
    const neighborCounts = new Uint8Array(count);

    for (let first = 0; first < count; first += 1) {
      const firstOffset = first * 3;
      const firstX = positions[firstOffset];
      const firstY = positions[firstOffset + 1];
      const firstZ = positions[firstOffset + 2];

      for (let second = first + 1; second < count; second += 1) {
        const secondOffset = second * 3;
        const dx = positions[secondOffset] - firstX;
        const dy = positions[secondOffset + 1] - firstY;
        const dz = positions[secondOffset + 2] - firstZ;
        const distanceSq = dx * dx + dy * dy + dz * dz;

        if (distanceSq < closeRadiusSq) {
          neighborCounts[first] += 1;
          neighborCounts[second] += 1;
        }
      }
    }

    const crowdedParticles = [...neighborCounts].filter((neighbors) => neighbors >= 3);
    const crowdedRatio = crowdedParticles.length / count;

    expect(crowdedRatio).toBeLessThan(0.025);
    expect(Math.max(...neighborCounts)).toBeLessThanOrEqual(7);
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

  it("uses chase strength to alter high-count lobe following", () => {
    const lowChase = new CpuMurmurationSimulation({ seed: 31, initialCount: 1300 });
    const highChase = new CpuMurmurationSimulation({ seed: 31, initialCount: 1300 });
    const baseSettings: MurmurationSettings = {
      ...defaultSettings,
      count: 1300,
      simulationMode: "auto",
    };

    for (let frame = 0; frame < 12; frame += 1) {
      const time = 2 + frame / 60;
      lowChase.step({
        dt: 1 / 60,
        time,
        settings: {
          ...baseSettings,
          chaseStrength: 0,
        },
        threatPosition: null,
      });
      highChase.step({
        dt: 1 / 60,
        time,
        settings: {
          ...baseSettings,
          chaseStrength: 1,
        },
        threatPosition: null,
      });
    }

    const lowPositions = lowChase.snapshot().positions;
    const highPositions = highChase.snapshot().positions;
    const meanDelta =
      lowPositions.reduce(
        (sum, value, index) => sum + Math.abs(value - highPositions[index]),
        0,
      ) / lowPositions.length;

    expect(meanDelta).toBeGreaterThan(0.002);
  });

  it("biases the high-count field path toward a pilot core", () => {
    const control = new CpuMurmurationSimulation({ seed: 52, initialCount: 1300 });
    const piloted = new CpuMurmurationSimulation({ seed: 52, initialCount: 1300 });
    const settings: MurmurationSettings = {
      ...defaultSettings,
      count: 1300,
      simulationMode: "auto",
      cohesion: 2.2,
      alignment: 1.2,
    };

    for (let frame = 0; frame < 24; frame += 1) {
      const time = frame / 60;
      control.step({
        dt: 1 / 60,
        time,
        settings,
        threatPosition: null,
      });
      piloted.step({
        dt: 1 / 60,
        time,
        settings,
        threatPosition: null,
        pilot: {
          corePosition: [1, 0, 0],
          coreVelocity: [0, 0, 0],
          heading: [1, 0, 0],
          radius: 1,
          roll: 0,
          mediumPulse: 0,
        },
      });
    }

    const controlPositions = control.snapshot().positions;
    const pilotedPositions = piloted.snapshot().positions;
    const meanX = (positions: Float32Array) => {
      let total = 0;

      for (let index = 0; index < positions.length; index += 3) {
        total += positions[index];
      }

      return total / (positions.length / 3);
    };

    expect(meanX(pilotedPositions)).toBeGreaterThan(meanX(controlPositions) + 0.02);
  });

  it("propagates a local threat speed change through nearby alignment", () => {
    const control = new CpuMurmurationSimulation({ seed: 21, initialCount: 8 });
    const threatened = new CpuMurmurationSimulation({ seed: 21, initialCount: 8 });
    const settings: MurmurationSettings = {
      ...defaultSettings,
      count: 8,
      speed: 1.8,
      minSpeed: 0,
      maxSpeed: 5,
      neighborRadius: 0.36,
      neighborCount: 7,
      separation: 0,
      alignment: 4,
      cohesion: 0,
      inertia: 0.2,
      noise: 0,
      flow: 0,
      threatMode: "orbit",
      threatStrength: 1,
      threatRadius: 0.11,
      waveGain: 2,
      vacuoleStrength: 1,
      splitGain: 0,
    };

    for (const simulation of [control, threatened]) {
      const buffers = simulation.snapshot();

      for (let index = 0; index < buffers.count; index += 1) {
        writeBuffer3(buffers.positions, index, [index * 0.15, 0, 0]);
        writeBuffer3(buffers.previousPositions, index, [index * 0.15, 0, 0]);
        writeBuffer3(buffers.velocities, index, [0.35, 0, 0]);
        buffers.speeds[index] = 0.35;
      }
    }

    for (let frame = 0; frame < 6; frame += 1) {
      control.step({
        dt: 1 / 60,
        time: 1 + frame / 60,
        settings,
        threatPosition: null,
      });
    }
    threatened.step({
      dt: 1 / 60,
      time: 1,
      settings,
      threatPosition: [-0.05, 0, 0],
    });

    for (let frame = 1; frame < 6; frame += 1) {
      threatened.step({
        dt: 1 / 60,
        time: 1 + frame / 60,
        settings,
        threatPosition: null,
      });
    }

    const propagatedNeighborVelocity =
      threatened.snapshot().velocities[3] - control.snapshot().velocities[3];

    expect(Math.abs(propagatedNeighborVelocity)).toBeGreaterThan(0.001);
  });
});
