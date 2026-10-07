import { readStorage, writeStorage } from "@/lib/storage/local-storage";

const clientIdKey = "bodymake.google-drive.client-id.v1";

export function getGoogleDriveClientId(): string {
  return readStorage<string>(clientIdKey, "");
}

export function saveGoogleDriveClientId(clientId: string): void {
  writeStorage(clientIdKey, clientId.trim());
  if (typeof window !== "undefined") window.dispatchEvent(new Event("bodymake-google-drive-settings"));
}
