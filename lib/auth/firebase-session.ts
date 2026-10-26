import {
  browserLocalPersistence, browserSessionPersistence, GoogleAuthProvider,
  getRedirectResult, onAuthStateChanged, setPersistence, signInWithPopup, signInWithRedirect,
  signOut, type User,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/app";
import { isSharedTestEnvironment } from "@/lib/cloud/config";

let redirectResultPromise: Promise<User | null> | undefined;

export function completeGoogleRedirect(): Promise<User | null> {
  const auth = firebaseAuth();
  if (window.location.hostname !== auth.app.options.authDomain) return Promise.resolve(null);
  // React can mount the login page twice in development. Consume the result once.
  redirectResultPromise ??= getRedirectResult(auth).then((result) => result?.user ?? null);
  return redirectResultPromise;
}

export function watchFirebaseUser(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth(), callback);
}

export async function currentFirebaseUser(): Promise<User> {
  const auth = firebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("ログインが必要です。Googleでログインしてください。");
  return auth.currentUser;
}

export async function signInWithGoogle(remember: boolean): Promise<User | null> {
  const auth = firebaseAuth();
  const provider = new GoogleAuthProvider();
  if (isSharedTestEnvironment) provider.setCustomParameters({ prompt: "select_account" });
  const isTouchBrowser = (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches)
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isTouchBrowser && window.location.hostname === auth.app.options.authDomain) {
    // On Firebase Hosting, the redirect helper is same-origin with the app.
    // Mobile browsers often block popups or partition cross-origin storage.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithRedirect(auth, provider);
    return null;
  }
  let user: User;
  try {
    user = (await signInWithPopup(auth, provider)).user;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error
      && (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment")) {
      throw new Error("ログイン画面を開けませんでした。ポップアップを許可し、SafariまたはChromeで開いてください。");
    }
    throw error;
  }
  // Preserve the click gesture used to open the popup. Firebase migrates the session.
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  return user;
}

export async function signOutFirebase() {
  await signOut(firebaseAuth());
}
