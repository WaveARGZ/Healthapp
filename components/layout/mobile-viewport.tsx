"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { isSoftwareKeyboardOpen } from "@/lib/utils/mobile-viewport";

/** Observe the visible screen without moving focus, scrolling, or changing form values. */
export function MobileViewport({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState({ height: 0, top: 0, keyboard: false, editing: false });

  useEffect(() => {
    const visual = window.visualViewport;
    let baselineHeight = window.innerHeight;
    let lastWidth = window.innerWidth;
    let dialogTop: number | null = null;
    let keyboardOpen = false;
    let dismissedKeyboardAt: Element | null = null;
    let frame = 0;

    function update() {
      const active = document.activeElement;
      const dialog = document.querySelector(".exercise-dialog");
      const setEditorOpen = dialog?.hasAttribute("data-set-editor") ?? false;
      const editingSetNote = setEditorOpen && active instanceof HTMLTextAreaElement &&
        active.hasAttribute("data-workout-set-note");
      // The number pad has a fixed layout. Only notes use the device keyboard.
      if (setEditorOpen && !editingSetNote) {
        dialogTop = null;
        return;
      }
      const height = Math.round(visual?.height ?? window.innerHeight);
      const scale = visual?.scale ?? 1;
      const textInputFocused = active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && ["text", "search", "email", "password", "number", "tel", "url"].includes(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable);
      const anchorDialog = Boolean(dialog) && !setEditorOpen;
      if (Math.abs(lastWidth - window.innerWidth) > 80) {
        baselineHeight = window.innerHeight;
        dialogTop = null;
        keyboardOpen = false;
        dismissedKeyboardAt = null;
      }
      lastWidth = window.innerWidth;
      if (Math.abs(scale - 1) >= 0.05) dialogTop = null;
      if (Math.abs(scale - 1) < 0.05) baselineHeight = Math.max(baselineHeight, window.innerHeight, height);

      const visualTop = Math.round(visual?.offsetTop ?? 0);
      // Keep the picker anchored across focus changes. The note editor instead
      // fits its inner panel to the part of the screen above the keyboard.
      dialogTop = anchorDialog ? dialogTop ?? visualTop : null;
      // Keep the keyboard state across brief focus gaps until the visible area recovers.
      const nextKeyboardOpen = isSoftwareKeyboardOpen({
        width: window.innerWidth, height, baselineHeight, scale, editing: textInputFocused || keyboardOpen,
      });
      if (active !== dismissedKeyboardAt || nextKeyboardOpen) dismissedKeyboardAt = null;
      // Android can close its keyboard while leaving the input focused.
      if (keyboardOpen && !nextKeyboardOpen && textInputFocused && baselineHeight - height <= 140) {
        dismissedKeyboardAt = active;
      }
      keyboardOpen = nextKeyboardOpen;
      const editing = textInputFocused && active !== dismissedKeyboardAt;
      const next = Math.abs(scale - 1) < 0.05
        ? { height, top: dialogTop ?? visualTop, keyboard: keyboardOpen, editing }
        : { height: 0, top: 0, keyboard: false, editing };
      setViewport((previous) => previous.height === next.height && previous.top === next.top &&
        previous.keyboard === next.keyboard && previous.editing === next.editing ? previous : next);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    function handleFocusIn(event: FocusEvent) {
      const target = event.target;
      if (dialogTop === null && target instanceof HTMLInputElement &&
          target.closest(".exercise-dialog:not([data-set-editor])")) {
        dialogTop = Math.round(visual?.offsetTop ?? 0);
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

  return <div className="min-h-dvh bg-[var(--canvas)]" data-records-viewport data-keyboard-open={viewport.keyboard}
    data-text-editing={viewport.editing} style={style}>{children}</div>;
}
