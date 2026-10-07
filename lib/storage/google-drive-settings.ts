import { readStorage, writeStorage } from "@/lib/storage/local-storage";

const clientIdKey = "bodymake.google-drive.client-id.v1";
// OAuth client IDs are public identifiers; only the matching origin restrictions protect their use.
const defaultGoogleDriveClientId = "660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com";

export function getGoogleDriveClientId(): string {
  const saved = readStorage<string | null>(clientIdKey, null);
  return saved === null ? defaultGoogleDriveClientId : saved;
}

export function saveGoogleDriveClientId(clientId: string): void {
  writeStorage(clientIdKey, clientId.trim());
  if (typeof window !== "undefined") window.dispatchEvent(new Event("bodymake-google-drive-settings"));
}
