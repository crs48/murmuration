export type FrameStats = Readonly<{
  fps: number;
  frameMs: number;
  averageFrameMs: number;
}>;

export type FrameStatsTracker = Readonly<{
  sample: (now: number) => FrameStats;
  snapshot: () => FrameStats;
}>;

export const createFrameStatsTracker = (): FrameStatsTracker => {
  let previous = performance.now();
  let averageFrameMs = 1000 / 60;
  let snapshot: FrameStats = {
    fps: 60,
    frameMs: averageFrameMs,
    averageFrameMs,
  };

  return {
    sample: (now) => {
      const frameMs = Math.min(250, Math.max(0.01, now - previous));
      previous = now;
      averageFrameMs = averageFrameMs * 0.92 + frameMs * 0.08;
      snapshot = {
        fps: 1000 / averageFrameMs,
        frameMs,
        averageFrameMs,
      };
      return snapshot;
    },
    snapshot: () => snapshot,
  };
};

