import { validateTrainingReceipt } from "@/lib/drive/training-receipt.mjs";

const identityScope = "openid email profile";
const identityScriptUrl = "https://accounts.google.com/gsi/client";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(options: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }): GoogleTokenClient;
        };
      };
    };
  }
}

let identityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (identityScriptPromise) return identityScriptPromise;
  identityScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = identityScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { identityScriptPromise = null; reject(new Error("Google認証ライブラリを読み込めませんでした。")); };
    document.head.appendChild(script);
  });
  return identityScriptPromise;
}

export function preloadGoogleIdentity(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return loadGoogleIdentity();
}

/** Requests a short-lived Google account token from an explicit user action. */
export function requestGoogleAccountToken(clientId: string): Promise<string> {
  const request = (): Promise<string> => {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google認証を初期化できませんでした。");
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: identityScope,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description ?? response.error ?? "Googleアカウントでのログインが許可されませんでした。"));
      },
    });
    client.requestAccessToken();
  });
  };
  if (window.google?.accounts?.oauth2) return request();
  return loadGoogleIdentity().then(request);
}

export async function getGoogleAccountEmail(token: string): Promise<string> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Googleアカウントを確認できませんでした。もう一度ログインしてください。");
  const profile = await response.json() as { email?: string; email_verified?: boolean };
  if (!profile.email || !profile.email_verified) throw new Error("確認済みのGoogleアカウントが必要です。");
  return profile.email;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("写真を送信用に変換できませんでした。"));
    reader.readAsDataURL(blob);
  });
}

/** Re-encodes the photo to JPEG so EXIF/GPS metadata is not carried to the shared dataset. */
export async function sanitizeTrainingPhoto(file: Blob): Promise<Blob> {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("写真を送信用に変換できませんでした。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!result) throw new Error("写真を送信用に変換できませんでした。");
    if (result.size > 1_500_000) throw new Error("写真の容量が大きすぎます。小さい画像を選び直してください。");
    return result;
  } finally {
    image.close();
  }
}

/** Only a validated, readable receipt confirms storage. Tokens/photos remain in RAM. */
export async function submitFoodCorrectionToSharedDrive(input: {
  endpoint: string;
  accessToken: string;
  id: string;
  image: Blob;
  predictedFoodIds: string[];
  confirmedFoodId: string;
  confirmedFoodName: string;
  nutrition: { calories: number; proteinG: number; fatG: number; carbsG: number };
  createdAt: string;
  consent: true;
}): Promise<{ id: string; imageSha256: string; imageFileId: string; jsonFileId: string }> {
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[\w-]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
    throw new Error("共有Driveの保存先URLが正しくありません。");
  }
  const image = await sanitizeTrainingPhoto(input.image);
  const digest = await crypto.subtle.digest("SHA-256", await image.arrayBuffer());
  const imageSha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const payload = {
    schemaVersion: 2,
    id: input.id,
    imageBase64: await blobToBase64(image),
    imageMimeType: "image/jpeg",
    predictedFoodIds: input.predictedFoodIds,
    confirmedFoodId: input.confirmedFoodId,
    confirmedFoodName: input.confirmedFoodName,
    nutrition: input.nutrition,
    createdAt: input.createdAt,
    imageSha256,
    consent: { granted: input.consent, version: "food-photo-training-v2", purpose: "food-recognition", at: input.createdAt },
  };
  const response = await fetch(endpoint.href, {
    method: "POST", mode: "cors", credentials: "omit", redirect: "follow", cache: "no-store",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ accessToken: input.accessToken, payload }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || response.type === "opaque") throw new Error("Driveの保存結果を受信できませんでした。再送して確認してください。");
  return validateTrainingReceipt(await response.json(), input.id, imageSha256);
}
