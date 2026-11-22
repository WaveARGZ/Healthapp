import { bodyMakeClient } from "@/lib/api/client";
import { fitnessGoalLabels } from "@/types/user";

export const profileSetupPath = "/onboarding?from=signup";
export type ProfileDestination = "/dashboard" | typeof profileSetupPath;

export async function getProfileDestination(): Promise<ProfileDestination> {
  const profile = await bodyMakeClient.getProfile();
  if (typeof profile?.name === "string" && profile.name.trim() && Object.hasOwn(fitnessGoalLabels, profile.goal)) {
    return "/dashboard";
  }
  return profileSetupPath;
}
