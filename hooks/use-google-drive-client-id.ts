"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getGoogleDriveClientId, getTrainingDataEndpoint } from "@/lib/storage/google-drive-settings";
import { checkTrainingConnection, preloadGoogleIdentity, trainingConnectionError } from "@/lib/drive/google-drive-client";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("bodymake-google-drive-settings", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("bodymake-google-drive-settings", callback);
  };
}

export function useGoogleDriveClientId(): string {
  return useSyncExternalStore(subscribe, getGoogleDriveClientId, () => "");
}

export function useTrainingDataEndpoint(): string {
  return useSyncExternalStore(subscribe, getTrainingDataEndpoint, () => "");
}

/** Prepares popup authentication before the sharing tap, including on phones. */
export function useTrainingConnection(clientId: string, endpoint: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; error: string } | null>(null);
  const key = `${clientId}:${endpoint}:${attempt}`;
  useEffect(() => {
    if (!clientId || !endpoint) return;
    let active = true;
    const controller = new AbortController();
    Promise.all([preloadGoogleIdentity(), checkTrainingConnection(endpoint, clientId, controller.signal)]).then(
      () => { if (active) setResult({ key, error: "" }); },
      (error: unknown) => { if (active) setResult({ key, error: trainingConnectionError(error) }); },
    );
    return () => { active = false; controller.abort(); };
  }, [clientId, endpoint, key]);
  const current = result?.key === key ? result : null;
  const failed = Boolean(current?.error);
  useEffect(() => {
    if (!failed) return;
    // Returning from an in-app browser / network settings can recover a failed
    // check without reloading the page and losing the photo held in memory.
    let retried = false;
    const recover = () => {
      if (retried || document.visibilityState !== "visible" || navigator.onLine === false) return;
      retried = true;
      setAttempt((value) => value + 1);
    };
    window.addEventListener("online", recover);
    window.addEventListener("pageshow", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.removeEventListener("online", recover);
      window.removeEventListener("pageshow", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [failed, key]);
  return {
    ready: Boolean(clientId && endpoint && current && !current.error),
    checking: Boolean(clientId && endpoint && !current),
    error: !clientId || !endpoint ? "共有先を準備しています。" : current?.error ?? "",
    retry: () => setAttempt((value) => value + 1),
  };
}
