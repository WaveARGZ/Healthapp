const rememberedKey = "bodymake.auth.remembered.v1";
const sessionKey = "bodymake.auth.session.v1";

export function setDemoSession(remember: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(rememberedKey);
    window.sessionStorage.removeItem(sessionKey);
    if (remember) window.localStorage.setItem(rememberedKey, "1");
    else window.sessionStorage.setItem(sessionKey, "1");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function hasDemoSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(rememberedKey) === "1" || window.sessionStorage.getItem(sessionKey) === "1";
  } catch {
    return false;
  }
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(rememberedKey);
    window.sessionStorage.removeItem(sessionKey);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
