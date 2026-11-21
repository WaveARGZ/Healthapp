import type { User } from "firebase/auth";
import { getProfileDestination, type ProfileDestination } from "@/lib/auth/profile-destination";
import { assertSharedTestAccess } from "@/lib/auth/shared-test-access";

export async function firebaseLoginDestination(user: User): Promise<ProfileDestination> {
  // Firestore rules independently enforce access on the profile read, too.
  const [, destination] = await Promise.all([assertSharedTestAccess(user), getProfileDestination()]);
  return destination;
}
