/** Browser-safe JSON persistence. Keep browser APIs isolated from UI components. */
export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorage(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
