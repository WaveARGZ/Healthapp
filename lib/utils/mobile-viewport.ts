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
