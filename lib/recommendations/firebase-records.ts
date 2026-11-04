import { validateRecommendationRecords } from "./records.ts";
import type { RecommendationInput } from "./types.ts";

type Records = Omit<RecommendationInput, "date" | "constraints">;

export interface RecommendationServerDocument {
  path: string;
  exists: boolean;
  data?: unknown;
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface RecommendationServerCollection {
  path: string;
  documents: RecommendationServerDocument[];
  fromCache: boolean;
  hasPendingWrites: boolean;
}

/** Read-only dependency boundary. Implementations must use server-only reads, not cache fallback. */
export interface FirebaseRecommendationSource {
  authStateReady(): Promise<void>;
  currentUid(): string | null;
  onUidChanged(changed: (uid: string | null) => void): () => void;
  getDocumentFromServer(path: readonly string[]): Promise<RecommendationServerDocument>;
  getCollectionFromServer(path: readonly string[]): Promise<RecommendationServerCollection>;
}

type ReadErrorCode = "recommendation_auth_required" | "recommendation_auth_changed"
  | "recommendation_records_unreadable" | "recommendation_records_invalid_shape"
  | "recommendation_records_not_current";

class RecommendationRecordReadError extends Error {
  constructor(code: ReadErrorCode) { super(code); this.name = "RecommendationRecordReadError"; }
}
function fail(code: ReadErrorCode): never { throw new RecommendationRecordReadError(code); }
function validUid(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128
    && value !== "." && value !== ".." && !/[\/\u0000-\u001f\u007f]/.test(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireServerSnapshot(snapshot: unknown, path: string): asserts snapshot is Record<string, unknown> {
  if (!object(snapshot) || snapshot.path !== path) fail("recommendation_records_invalid_shape");
  if (snapshot.fromCache !== false || snapshot.hasPendingWrites !== false) fail("recommendation_records_not_current");
}
function documentValue(snapshot: unknown, path: string, missing: unknown): unknown {
  requireServerSnapshot(snapshot, path);
  if (snapshot.exists === false) {
    if (snapshot.data !== undefined) fail("recommendation_records_invalid_shape");
    return missing;
  }
  if (snapshot.exists !== true || !object(snapshot.data)) fail("recommendation_records_invalid_shape");
  return snapshot.data;
}
function collectionValues(snapshot: unknown, path: string): unknown[] {
  requireServerSnapshot(snapshot, path);
  if (!Array.isArray(snapshot.documents)) fail("recommendation_records_invalid_shape");
  return snapshot.documents.map((entry: unknown) => {
    if (!object(entry) || typeof entry.path !== "string" || !entry.path.startsWith(`${path}/`)) fail("recommendation_records_invalid_shape");
    const id = entry.path.slice(path.length + 1);
    if (!id || id.includes("/") || id === "." || id === ".." || entry.exists !== true) fail("recommendation_records_invalid_shape");
    const value = documentValue(entry, `${path}/${id}`, undefined);
    if (!object(value) || value.id !== id) fail("recommendation_records_invalid_shape");
    return value;
  });
}

/** SDK loading and Firebase initialization happen only when a browser explicitly requests records. */
async function browserSource(): Promise<FirebaseRecommendationSource> {
  if (typeof window === "undefined") fail("recommendation_records_unreadable");
  const [{ firebaseAuth, firebaseDb }, { onAuthStateChanged }, firestore] = await Promise.all([
    import("../firebase/app.ts"), import("firebase/auth"), import("firebase/firestore"),
  ]);
  const auth = firebaseAuth();
  const db = firebaseDb();
  return {
    authStateReady: () => auth.authStateReady(),
    currentUid: () => auth.currentUser?.uid ?? null,
    onUidChanged: (changed) => onAuthStateChanged(auth, (user) => changed(user?.uid ?? null)),
    async getDocumentFromServer(path) {
      const snapshot = await firestore.getDocFromServer(firestore.doc(db, path.join("/")));
      return {
        path: snapshot.ref.path, exists: snapshot.exists(),
        ...(snapshot.exists() ? { data: snapshot.data() } : {}),
        fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites,
      };
    },
    async getCollectionFromServer(path) {
      const snapshot = await firestore.getDocsFromServer(firestore.collection(db, path.join("/")));
      return {
        path: path.join("/"), fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        documents: snapshot.docs.map((entry) => ({
          path: entry.ref.path, exists: true, data: entry.data(),
          fromCache: entry.metadata.fromCache, hasPendingWrites: entry.metadata.hasPendingWrites,
        })),
      };
    },
  };
}

/**
 * Fetch only the signed-in person's four recommendation inputs, into RAM.
 * The UID is pinned before reads and checked after them; an intervening sign-out or
 * account switch invalidates the whole snapshot even when the original account returns.
 * Missing documents / empty collections are accepted only after successful server reads.
 * Failures never fall back to demo records, cached data, empty history, or default safety flags.
 * Callers must invalidate displayed results/consent on later auth or record changes and
 * obtain a fresh snapshot before paid inference. This function never writes or reads photos.
 */
export async function readFirebaseRecommendationRecords(source?: FirebaseRecommendationSource): Promise<Records> {
  let unsubscribe: (() => void) | undefined;
  try {
    const reader = source ?? await browserSource();
    await reader.authStateReady();
    const uid = reader.currentUid();
    if (!validUid(uid)) fail("recommendation_auth_required");
    let changed = false;
    unsubscribe = reader.onUidChanged((current) => { if (current !== uid) changed = true; });
    if (typeof unsubscribe !== "function") fail("recommendation_records_unreadable");
    const requireSameUser = () => {
      if (changed || reader.currentUid() !== uid) fail("recommendation_auth_changed");
    };
    requireSameUser();
    const base = ["users", uid];
    const profilePath = [...base, "profile", "main"];
    const mealPath = [...base, "meals"];
    const workoutPath = [...base, "workouts"];
    const preferencesPath = [...base, "settings", "workout-preferences"];
    const [profile, meals, workouts, preferences] = await Promise.all([
      reader.getDocumentFromServer(profilePath), reader.getCollectionFromServer(mealPath),
      reader.getCollectionFromServer(workoutPath), reader.getDocumentFromServer(preferencesPath),
    ]);
    requireSameUser();
    const rawProfile = documentValue(profile, profilePath.join("/"), null);
    if (rawProfile !== null && (!object(rawProfile) || rawProfile.id !== uid)) fail("recommendation_records_invalid_shape");
    let records: Records;
    try {
      records = validateRecommendationRecords({
        profile: rawProfile, meals: collectionValues(meals, mealPath.join("/")),
        workouts: collectionValues(workouts, workoutPath.join("/")),
        preferences: documentValue(preferences, preferencesPath.join("/"), {}),
      });
    } catch (error) {
      if (error instanceof RecommendationRecordReadError) throw error;
      fail("recommendation_records_invalid_shape");
    }
    requireSameUser();
    return records;
  } catch (error) {
    if (error instanceof RecommendationRecordReadError) throw error;
    // Never expose SDK errors, credentials, raw record bodies, or another user's UID.
    return fail("recommendation_records_unreadable");
  } finally {
    if (typeof unsubscribe === "function") {
      try { unsubscribe(); } catch { /* Cleanup must not reveal provider details or replace a safe error. */ }
    }
  }
}
