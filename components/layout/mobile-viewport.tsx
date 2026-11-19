"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { isSoftwareKeyboardOpen, workoutSetEditorHeight, workoutSetEditorTop } from "@/lib/utils/mobile-viewport";

/** Observe the visible screen without moving focus, scrolling, or changing form values. */
export function MobileViewport({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState({ height: 0, top: 0, keyboard: false });

  useEffect(() => {
    const visual = window.visualViewport;
    let baselineHeight = window.innerHeight;
    let lastWidth = window.innerWidth;
    let setEditorTop: number | null = null;
    let setEditorHeight: number | null = null;
    let releaseSetEditorHeightTimer: number | null = null;
    let frame = 0;

    function cancelSetEditorHeightRelease() {
      if (releaseSetEditorHeightTimer !== null) window.clearTimeout(releaseSetEditorHeightTimer);
      releaseSetEditorHeightTimer = null;
    }

    function update() {
      const height = Math.round(visual?.height ?? window.innerHeight);
      const scale = visual?.scale ?? 1;
      const active = document.activeElement;
      const editing = active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && ["text", "search", "email", "password", "number", "tel", "url"].includes(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable);
      const setEditorOpen = Boolean(document.querySelector("[data-workout-set-editor]"));

      if (Math.abs(lastWidth - window.innerWidth) > 80) {
        baselineHeight = window.innerHeight;
        setEditorTop = null;
        setEditorHeight = null;
        cancelSetEditorHeightRelease();
      }
      lastWidth = window.innerWidth;
      if (Math.abs(scale - 1) >= 0.05) setEditorTop = null;
      if (Math.abs(scale - 1) < 0.05) baselineHeight = Math.max(baselineHeight, window.innerHeight, height);

      const visualTop = Math.round(visual?.offsetTop ?? 0);
      const setEditorActive = setEditorOpen && Math.abs(scale - 1) < 0.05;
      const measuredKeyboard = isSoftwareKeyboardOpen({ width: window.innerWidth, height, baselineHeight, scale, editing: setEditorActive });
      setEditorTop = workoutSetEditorTop(setEditorTop, visualTop, setEditorActive);
      setEditorHeight = workoutSetEditorHeight(setEditorHeight, height, measuredKeyboard, setEditorActive);
      if (measuredKeyboard || !setEditorActive) cancelSetEditorHeightRelease();
      else if (setEditorHeight !== null && releaseSetEditorHeightTimer === null) {
        // A field switch briefly restores the full viewport on some mobile keyboards.
        // Restore the full height only when that state persists after the transition.
        releaseSetEditorHeightTimer = window.setTimeout(() => {
          releaseSetEditorHeightTimer = null;
          setEditorHeight = null;
          schedule();
        }, 700);
      }
      const keyboard = isSoftwareKeyboardOpen({ width: window.innerWidth, height, baselineHeight, scale, editing }) || (setEditorActive && setEditorHeight !== null);
      // A focus change between weight and reps must not recalculate the dialog's top.
      // At pinch zoom, leave the dialog on the layout viewport so it can be panned normally.
      const next = Math.abs(scale - 1) < 0.05
        ? { height: setEditorHeight ?? height, top: setEditorTop ?? visualTop, keyboard }
        : { height: 0, top: 0, keyboard: false };
      setViewport((previous) => previous.height === next.height && previous.top === next.top && previous.keyboard === next.keyboard ? previous : next);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    function handleVisualScroll() {
      if (setEditorTop !== null && document.querySelector("[data-workout-set-editor]")) return;
      schedule();
    }
    function handleFocusIn(event: FocusEvent) {
      const target = event.target;
      if (setEditorTop === null && target instanceof HTMLInputElement && target.type === "number" && target.closest("[data-workout-set-editor]")) {
        setEditorTop = Math.round(visual?.offsetTop ?? 0);
      }
      schedule();
    }

    schedule();
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", handleVisualScroll);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelSetEditorHeightRelease();
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", handleVisualScroll);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", schedule);
    };
  }, []);

  const style = viewport.height ? {
    "--visual-height": `${viewport.height}px`,
    "--visual-top": `${viewport.top}px`,
  } as CSSProperties : undefined;

  return <div className="min-h-dvh bg-[var(--canvas)]" data-keyboard-open={viewport.keyboard} style={style}>{children}</div>;
}
