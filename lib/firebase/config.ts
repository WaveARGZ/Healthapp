import { isTestEnvironment } from "@/lib/cloud/config";

const prefix = isTestEnvironment ? "test" : "production";
const mobileHostingDomain = process.env.NEXT_PUBLIC_BODYMAKE_FIREBASE_MOBILE_AUTH_DOMAIN ?? "";
const useMobileHostingDomain = typeof window !== "undefined" && Boolean(mobileHostingDomain)
  && window.location.hostname === mobileHostingDomain
  && ((typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches)
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

const production = {
  apiKey: process.env.NEXT_PUBLIC_BODYMAKE_FIREBASE_API_KEY ?? "",
  authDomain: useMobileHostingDomain ? mobileHostingDomain : process.env.NEXT_PUBLIC_BODYMAKE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_BODYMAKE_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_BODYMAKE_FIREBASE_APP_ID ?? "",
};

const test = {
  apiKey: process.env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_APP_ID ?? "",
};

export const firebaseConfig = isTestEnvironment ? test : production;
export const isFirebaseSelected = (isTestEnvironment
  ? process.env.NEXT_PUBLIC_BODYMAKE_TEST_BACKEND
  : process.env.NEXT_PUBLIC_BODYMAKE_BACKEND) === "firebase";

// Test builds must never silently read production credentials or write to that project.
export const isFirebaseConfigured = isFirebaseSelected && Object.values(firebaseConfig).every(Boolean)
  && (!isTestEnvironment || !production.projectId || test.projectId !== production.projectId);

export function assertFirebaseConfigured(): void {
  if (!isFirebaseConfigured) throw new Error(`${prefix} 用のFirebase設定が未完了です。別プロジェクトの設定を確認してください。`);
}
