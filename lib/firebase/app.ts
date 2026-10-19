import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { assertFirebaseConfigured, firebaseConfig } from "@/lib/firebase/config";

export function firebaseApp() {
  assertFirebaseConfigured();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth() { return getAuth(firebaseApp()); }
export function firebaseDb() { return getFirestore(firebaseApp()); }
