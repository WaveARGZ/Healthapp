/** Keep production records, local demo data and shared tests strictly separate. */
export function recommendationMode(environment: {
  test: boolean; sharedTest: boolean; cloud: boolean;
  firebase: boolean; firebaseConfigured: boolean; projectId: string;
}): "local" | "firebase" | null {
  if (environment.sharedTest || environment.cloud) return null;
  if (environment.test) return environment.firebase ? null : "local";
  return environment.firebase && environment.firebaseConfigured && environment.projectId === "healthapp-14a3f"
    ? "firebase" : null;
}
