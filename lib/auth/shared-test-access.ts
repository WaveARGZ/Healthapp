import type { User } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { isSharedTestEnvironment } from "@/lib/cloud/config";
import { firebaseDb } from "@/lib/firebase/app";

const notAllowed = "テスト環境への参加がまだ許可されていません。登録したGoogleアカウントを確認してください。";

/** The test project's Firestore rules enforce this same private developer list. */
export async function assertSharedTestAccess(user: User): Promise<void> {
  if (!isSharedTestEnvironment) return;
  if (!user.email || !user.emailVerified || !user.providerData.some((provider) => provider.providerId === "google.com")) {
    throw new Error(notAllowed);
  }
  try {
    const access = await getDocFromServer(doc(firebaseDb(), "developerAccess", user.email));
    if (!access.exists() || access.data().enabled !== true) throw new Error(notAllowed);
  } catch (error) {
    if (error instanceof Error && error.message === notAllowed) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "permission-denied") {
      throw new Error(notAllowed);
    }
    throw new Error("テスト環境の参加確認に接続できませんでした。通信を確認して、もう一度ログインしてください。");
  }
}
