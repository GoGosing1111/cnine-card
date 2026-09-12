// A hidden/occluded browser can suspend rAF while wall-clock timers still run.
// Bound waiting by the shared GSAP playback clock, not elapsed wall time.
// This never consumes a shot or reports completion while a live queue remains.
export function waitForVisualDrain({readState, clock, timeoutMs, schedule = setTimeout}) {
  const deadline = clock() + Math.max(0, Number(timeoutMs) || 0);
  return new Promise(resolve => {
    const poll = () => {
      const state = readState();
      if (!state.active || (!state.queued && !state.firing)) return resolve(true);
      if (clock() >= deadline) return resolve(false);
      schedule(poll, 40);
    };
    poll();
  });
}
