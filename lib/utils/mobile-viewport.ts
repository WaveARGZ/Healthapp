interface KeyboardViewport {
  width: number;
  height: number;
  baselineHeight: number;
  scale: number;
  editing: boolean;
}

/** A browser toolbar change or pinch zoom must not be mistaken for a keyboard. */
export function isSoftwareKeyboardOpen({ width, height, baselineHeight, scale, editing }: KeyboardViewport): boolean {
  return editing && width < 1024 && Math.abs(scale - 1) < 0.05 && baselineHeight - height > 140;
}

/** Keep one anchor throughout the set editor, including the blur between two inputs. */
export function workoutSetEditorTop(anchor: number | null, visualTop: number, editorOpen: boolean): number | null {
  return editorOpen ? anchor ?? visualTop : null;
}

/** Ignore a temporary viewport expansion while the keyboard changes between set fields. */
export function workoutSetEditorHeight(previous: number | null, height: number, keyboardOpen: boolean, editorOpen: boolean): number | null {
  if (!editorOpen) return null;
  return keyboardOpen ? Math.min(previous ?? height, height) : previous;
}
