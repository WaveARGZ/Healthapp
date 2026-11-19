const pendingKey = "bodymake:test-google-redirect-pending";

/** A flow flag only; never store an account, token or authorization result. */
export function hasPendingGoogleRedirect(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(pendingKey) === "true"; }
  catch { return true; } // Restricted storage keeps the SDK's normal redirect recovery.
}

export function markGoogleRedirectPending(pending: boolean): void {
  try {
    if (pending) window.sessionStorage.setItem(pendingKey, "true");
    else window.sessionStorage.removeItem(pendingKey);
  } catch { /* The SDK still handles browsers with restricted session storage. */ }
}
