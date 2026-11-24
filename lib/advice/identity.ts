export interface RecommendationIdentity {
  readonly uid: string;
  assertCurrent(): void;
  getIdToken(): Promise<string>;
  dispose(): void;
}

export interface RecommendationAuthSource {
  ready(): Promise<void>;
  currentUser(): { uid: string; getIdToken(forceRefresh: boolean): Promise<string> } | null;
  subscribe(changed: (uid: string | null) => void): () => void;
}

async function browserAuthSource(): Promise<RecommendationAuthSource> {
  const [{ firebaseAuth }, { onAuthStateChanged }] = await Promise.all([
    import("../firebase/app.ts"), import("firebase/auth"),
  ]);
  const auth = firebaseAuth();
  return {
    ready: () => auth.authStateReady(), currentUser: () => auth.currentUser,
    subscribe: (changed) => onAuthStateChanged(auth, (user) => changed(user?.uid ?? null)),
  };
}

/** Pin the person for the entire page lifetime, including sign-out/sign-in races.
 * Tokens are returned in RAM only; callers send them solely to the fixed Worker.
 * Returning to the original account does not revive an invalidated session. */
export async function openRecommendationIdentity(
  onInvalidated: () => void, source?: RecommendationAuthSource,
): Promise<RecommendationIdentity> {
  const reader = source ?? await browserAuthSource();
  await reader.ready();
  const user = reader.currentUser();
  if (!user?.uid) throw new Error("recommendation_auth_required");
  let invalid = false;
  let disposed = false;
  const invalidate = () => {
    if (invalid || disposed) return;
    invalid = true;
    onInvalidated();
  };
  const unsubscribe = reader.subscribe((uid) => { if (uid !== user.uid) invalidate(); });
  const assertCurrent = () => {
    if (disposed || invalid || reader.currentUser()?.uid !== user.uid) {
      invalidate();
      throw new Error("recommendation_auth_changed");
    }
  };
  try { assertCurrent(); } catch (error) { unsubscribe(); throw error; }
  return {
    uid: user.uid, assertCurrent,
    async getIdToken() {
      assertCurrent();
      let token: string;
      try { token = await user.getIdToken(true); }
      catch { assertCurrent(); throw new Error("recommendation_auth_unavailable"); }
      assertCurrent();
      return token;
    },
    dispose() { if (!disposed) { disposed = true; unsubscribe(); } },
  };
}
