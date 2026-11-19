import type { User } from "firebase/auth";
import { bodyMakeClient } from "@/lib/api/client";
import { assertSharedTestAccess } from "@/lib/auth/shared-test-access";

export async function firebaseLoginDestination(user: User): Promise<string> {
  // Firestore rules independently enforce access on the profile read, too.
  const [, profile] = await Promise.all([assertSharedTestAccess(user), bodyMakeClient.getProfile()]);
  return profile ? "/dashboard" : "/onboarding?from=signup";
}
