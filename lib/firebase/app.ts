import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { assertFirebaseConfigured, firebaseConfig } from "@/lib/firebase/config";
import { isSharedTestEnvironment } from "@/lib/cloud/config";
import { hasPendingGoogleRedirect } from "@/lib/auth/google-redirect-state";

let auth: Auth | undefined;

export function firebaseApp() {
  assertFirebaseConfigured();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth() {
  if (auth) return auth;
  const app = firebaseApp();
  // Avoid the mobile OAuth iframe on ordinary session restoration. Redirect
  // returns retain the SDK resolver so it completes before notifying observers.
  auth = isSharedTestEnvironment && !hasPendingGoogleRedirect()
    ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] })
    : getAuth(app);
  return auth;
}
export function firebaseDb() { return getFirestore(firebaseApp()); }
