export type TimerWakeStatus = "requesting" | "active" | "released" | "unavailable";

// A visible-page convenience only: never treat this as background/lock-screen support.
export function keepTimerScreenAwake(
  api: Pick<WakeLock, "request"> | undefined,
  page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  report: (status: TimerWakeStatus) => void,
) {
  let alive = true;
  let requesting = false;
  let retryWhenReady = false;
  let held: WakeLockSentinel | null = null;
  let removeReleaseListener = () => {};

  function release() {
    const previous = held;
    held = null;
    removeReleaseListener();
    removeReleaseListener = () => {};
    if (previous) void previous.release().catch(() => {});
  }

  async function acquire() {
    if (!alive || page.visibilityState !== "visible" || held) return;
    if (requesting) { retryWhenReady = true; return; }
    if (!api) { report("unavailable"); return; }
    requesting = true;
    report("requesting");
    try {
      const lock = await api.request("screen");
      if (!alive || page.visibilityState !== "visible") {
        await lock.release();
        return;
      }
      held = lock;
      const onRelease = () => {
        if (!alive || held !== lock) return;
        held = null;
        removeReleaseListener();
        report("released");
      };
      lock.addEventListener("release", onRelease);
      removeReleaseListener = () => lock.removeEventListener("release", onRelease);
      if (lock.released) onRelease();
      else report("active");
    } catch {
      if (alive) report("unavailable");
    } finally {
      requesting = false;
      if (retryWhenReady) { retryWhenReady = false; void acquire(); }
    }
  }

  function visibilityChanged() {
    if (page.visibilityState === "visible") void acquire();
    else { release(); report("released"); }
  }

  page.addEventListener("visibilitychange", visibilityChanged);
  void acquire();
  return () => {
    alive = false;
    page.removeEventListener("visibilitychange", visibilityChanged);
    release();
  };
}
