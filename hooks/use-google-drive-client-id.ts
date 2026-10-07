"use client";

import { useSyncExternalStore } from "react";
import { getGoogleDriveClientId, getTrainingDataEndpoint } from "@/lib/storage/google-drive-settings";

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
