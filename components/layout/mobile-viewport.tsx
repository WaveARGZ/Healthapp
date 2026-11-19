"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { isSoftwareKeyboardOpen } from "@/lib/utils/mobile-viewport";

/** Observe the visible screen without moving focus, scrolling, or changing form values. */
export function MobileViewport({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState({ height: 0, top: 0, keyboard: false });

  useEffect(() => {
    const visual = window.visualViewport;
    let baselineHeight = window.innerHeight;
    let lastWidth = window.innerWidth;
    let setEditorTop: number | null = null;
    let frame = 0;

    function update() {
      const height = Math.round(visual?.height ?? window.innerHeight);
      const scale = visual?.scale ?? 1;
      const active = document.activeElement;
      const editing = active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && ["text", "search", "email", "password", "number", "tel", "url"].includes(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable);
      const editingWorkoutSet = active instanceof HTMLInputElement && active.type === "number" &&
        Boolean(active.closest("[data-workout-set-editor]"));

      if (Math.abs(lastWidth - window.innerWidth) > 80) {
        baselineHeight = window.innerHeight;
        setEditorTop = null;
      }
      lastWidth = window.innerWidth;
      if (Math.abs(scale - 1) >= 0.05) setEditorTop = null;
      if (Math.abs(scale - 1) < 0.05) baselineHeight = Math.max(baselineHeight, window.innerHeight, height);

      const keyboard = isSoftwareKeyboardOpen({ width: window.innerWidth, height, baselineHeight, scale, editing });
      const visualTop = Math.round(visual?.offsetTop ?? 0);
      if (editingWorkoutSet && setEditorTop === null) setEditorTop = visualTop;
      if (!editingWorkoutSet) setEditorTop = null;
      // Keep the set editor anchored while the keyboard pans the visual viewport.
      // At pinch zoom, leave the dialog on the layout viewport so it can be panned normally.
      const next = Math.abs(scale - 1) < 0.05
        ? { height, top: editingWorkoutSet ? setEditorTop ?? visualTop : visualTop, keyboard }
        : { height: 0, top: 0, keyboard: false };
      setViewport((previous) => previous.height === next.height && previous.top === next.top && previous.keyboard === next.keyboard ? previous : next);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
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
    visual?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
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
