import { isSharedTestEnvironment } from "@/lib/cloud/config";

// OAuth client IDs are public identifiers; only the matching origin restrictions protect their use.
const defaultGoogleDriveClientId = "660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com";
// Public Apps Script web-app URL. The server validates the caller's Google token.
const defaultTrainingDataEndpoint = "https://script.google.com/macros/s/AKfycbwNzlNzy0K7AjWHCTBs6YaO4PGiOxb33_zPha4A8ikGj3LI35kwrTcJi_UldoEFl11SZg/exec";

export function getGoogleDriveClientId(): string {
  return isSharedTestEnvironment ? "" : defaultGoogleDriveClientId;
}

export function getTrainingDataEndpoint(): string {
  if (isSharedTestEnvironment) return "";
  return process.env.NEXT_PUBLIC_BODYMAKE_ENV === "test"
    ? process.env.NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT ?? ""
    : process.env.NEXT_PUBLIC_BODYMAKE_TRAINING_ENDPOINT || defaultTrainingDataEndpoint;
}
