import type { BodyMakeClient } from "@/lib/api/bodymake-client";
import type { MealEntry } from "@/types/meal";
import type { BodyPhotoEntry, WeightEntry } from "@/types/progress";
import type { UserProfile } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";
import { cloudConfig } from "@/lib/cloud/config";
import { getCloudAccessToken } from "@/lib/auth/cognito-session";

export async function cloudRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getCloudAccessToken();
  if (!token) throw new Error("ログインが必要です。再度ログインしてください。");
  const response = await fetch(`${cloudConfig.apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("ログイン期限が切れました。再度ログインしてください。");
  if (!response.ok) throw new Error(`保存先との通信に失敗しました（${response.status}）。`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const get = <T>(kind: string) => cloudRequest<T>(`/records/${kind}`);
const put = <T>(kind: string, id: string, value: unknown) => cloudRequest<T>(`/records/${kind}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(value) });
const remove = (kind: string, id: string) => cloudRequest<void>(`/records/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });

async function uploadPhoto(entry: BodyPhotoEntry): Promise<BodyPhotoEntry> {
  if (!entry.imageUrl.startsWith("data:image/")) return entry;
  const image = await fetch(entry.imageUrl).then((response) => response.blob());
  if (image.type !== "image/jpeg" || image.size > 2_000_000) throw new Error("写真は2MB以下のJPEG画像にしてください。");
  const signed = await cloudRequest<{ imageKey: string; upload: { url: string; fields: Record<string, string> } }>("/photos/upload", {
    method: "POST", body: JSON.stringify({ id: entry.id, mimeType: "image/jpeg" }),
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(signed.upload.fields)) form.append(key, value);
  form.append("file", image, `${entry.id}.jpg`);
  const response = await fetch(signed.upload.url, { method: "POST", body: form });
  if (!response.ok) throw new Error("写真のアップロードに失敗しました。");
  return put<BodyPhotoEntry>("photos", entry.id, {
    id: entry.id, view: entry.view, imageKey: signed.imageKey,
    capturedAt: entry.capturedAt, createdAt: entry.createdAt,
  });
}

export class AwsBodyMakeClient implements BodyMakeClient {
  getProfile() { return get<UserProfile | null>("profile"); }
  saveProfile(profile: UserProfile) { return put<UserProfile>("profile", "main", profile); }
  getWorkouts() { return get<WorkoutEntry[]>("workouts"); }
  saveWorkout(entry: WorkoutEntry) { return put<WorkoutEntry>("workouts", entry.id, entry); }
  deleteWorkout(id: string) { return remove("workouts", id); }
  getMeals() { return get<MealEntry[]>("meals"); }
  saveMeal(entry: MealEntry) { return put<MealEntry>("meals", entry.id, entry); }
  deleteMeal(id: string) { return remove("meals", id); }
  getWeightEntries() { return get<WeightEntry[]>("weights"); }
  saveWeightEntry(entry: WeightEntry) { return put<WeightEntry>("weights", entry.id, entry); }
  deleteWeightEntry(id: string) { return remove("weights", id); }
  getBodyPhotos() { return get<BodyPhotoEntry[]>("photos"); }
  saveBodyPhoto(entry: BodyPhotoEntry) { return uploadPhoto(entry); }
  deleteBodyPhoto(id: string) { return remove("photos", id); }
}
