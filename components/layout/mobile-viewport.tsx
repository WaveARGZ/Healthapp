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
    let frame = 0;

    function update() {
      const height = Math.round(visual?.height ?? window.innerHeight);
      const scale = visual?.scale ?? 1;
      const active = document.activeElement;
      const editing = active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && ["text", "search", "email", "password", "number", "tel", "url"].includes(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (Math.abs(lastWidth - window.innerWidth) > 80) baselineHeight = window.innerHeight;
      lastWidth = window.innerWidth;
      if (Math.abs(scale - 1) < 0.05) baselineHeight = Math.max(baselineHeight, window.innerHeight, height);

      const keyboard = isSoftwareKeyboardOpen({ width: window.innerWidth, height, baselineHeight, scale, editing });
      // At pinch zoom, leave the dialog on the layout viewport so it can be panned normally.
      const next = Math.abs(scale - 1) < 0.05
        ? { height, top: Math.round(visual?.offsetTop ?? 0), keyboard }
        : { height: 0, top: 0, keyboard: false };
      setViewport((previous) => previous.height === next.height && previous.top === next.top && previous.keyboard === next.keyboard ? previous : next);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }

    schedule();
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, []);

  const style = viewport.height ? {
    "--visual-height": `${viewport.height}px`,
    "--visual-top": `${viewport.top}px`,
  } as CSSProperties : undefined;

  return <div className="min-h-dvh bg-[var(--canvas)]" data-keyboard-open={viewport.keyboard} style={style}>{children}</div>;
}
