// OAuth client IDs are public identifiers; only the matching origin restrictions protect their use.
const defaultGoogleDriveClientId = "660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com";

export function getGoogleDriveClientId(): string {
  return defaultGoogleDriveClientId;
}

export function getTrainingDataEndpoint(): string {
  return process.env.NEXT_PUBLIC_BODYMAKE_TRAINING_ENDPOINT ?? "";
}
