import { validateTrainingReceipt } from "@/lib/drive/training-receipt.mjs";
import { stripCanvasJpegMetadata } from "@/lib/drive/jpeg-metadata.mjs";

const identityScope = "openid email profile";
const identityScriptUrl = "https://accounts.google.com/gsi/client";
const photoOperationTimeoutMs = 15_000;
const photoConversionError = "写真を送信用に変換できませんでした。もう一度お試しください。";

interface GoogleTokenResponse {
  access_token?: string;
  scope?: string;
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
            error_callback: (error: { type?: string }) => void;
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
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      identityScriptPromise = null;
      reject(new Error("Google認証を読み込めませんでした。通信を確認して「再接続」を押してください。"));
    };
    const timer = setTimeout(fail, 20_000);
    script.src = identityScriptUrl;
    script.async = true;
    script.onload = () => {
      if (!window.google?.accounts?.oauth2) { fail(); return; }
      clearTimeout(timer);
      resolve();
    };
    script.onerror = fail;
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
  const oauth2 = window.google?.accounts?.oauth2;
  // Opening the account chooser after awaiting a script download loses the
  // original tap on mobile. Prepare first, then invoke directly from the tap.
  if (!oauth2) {
    void preloadGoogleIdentity().catch(() => undefined);
    return Promise.reject(new Error("Google認証を準備しています。少し待ってから、もう一度共有ボタンを押してください。"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (token?: string, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (token) resolve(token);
      else reject(error ?? new Error("Google認証を確認できませんでした。"));
    };
    const timer = setTimeout(() => finish(undefined, new Error("Google認証の確認が時間切れになりました。認証画面を閉じて、もう一度お試しください。")), 120_000);
    try {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: identityScope,
      callback: (response) => {
        if (response.access_token) finish(response.access_token);
        else finish(undefined, new Error(response.error === "access_denied" ? "Google認証がキャンセルされました。同じ写真のまま再試行できます。" : "Google認証を完了できませんでした。もう一度お試しください。"));
      },
      error_callback: (error) => finish(undefined, new Error(error.type === "popup_closed"
        ? "Google認証の画面が閉じられました。同じ写真のまま再試行できます。"
        : error.type === "popup_failed_to_open"
          ? "Google認証画面を開けませんでした。SafariまたはChromeでこのページを開いて、もう一度お試しください。"
          : "Google認証を開始できませんでした。もう一度お試しください。")),
    });
    client.requestAccessToken();
    } catch { finish(undefined, new Error("Google認証を開始できませんでした。もう一度お試しください。")); }
  });
}

async function fetchJsonWithTimeout(url: string, options: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<{ response: Response; value: unknown }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const value: unknown = await response.json();
    return { response, value };
  }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}

function trainingEndpoint(value: string): URL {
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[\w-]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
    throw new Error("共有先を確認できませんでした。時間をおいて再接続してください。");
  }
  return endpoint;
}

/** Checks the deployed receiver before asking the user to sign in or upload. */
export async function checkTrainingConnection(endpointValue: string, clientId: string, signal?: AbortSignal): Promise<void> {
  const endpoint = trainingEndpoint(endpointValue);
  // Only retry the public, read-only readiness request. A slow mobile connection
  // or Apps Script startup must not permanently disable sharing after 20 seconds.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error("Connection check cancelled"), { name: "AbortError" });
    let result: { response: Response; value: unknown };
    try {
      result = await fetchJsonWithTimeout(endpoint.href, { credentials: "omit", mode: "cors", cache: "no-store", redirect: "follow" }, 45_000, signal);
    } catch (error) {
      // Temporary gateway pages can be HTML, not JSON. Never accept them as ready.
      if (!signal?.aborted && attempt === 0 && error instanceof Error && ["AbortError", "TypeError", "SyntaxError"].includes(error.name)) continue;
      throw error;
    }
    const { response, value: raw } = result;
    if (attempt === 0 && (response.status === 408 || response.status === 429 || response.status >= 500)) continue;
    if (!response.ok) throw new Error("共有先に接続できませんでした。通信を確認して再接続してください。");
    const value = raw as { ok?: boolean; service?: string; schemaVersion?: number; clientId?: string } | null;
    if (value?.ok !== true || value.service !== "bodymake-training-ingest" || value.schemaVersion !== 2 || value.clientId !== clientId) {
      throw new Error("共有先の準備が完了していません。時間をおいて再接続してください。");
    }
    return;
  }
}

/** Do not display browser exception details or remote response fragments. */
export function trainingConnectionError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "共有先の確認が時間切れになりました。写真と入力内容はこの画面に残っています。通信を確認して再接続してください。";
  if (error instanceof Error && /^(Google認証を読み込めませんでした|共有先を確認できませんでした|共有先に接続できませんでした|共有先の準備が完了していません)/.test(error.message)) return error.message;
  return "共有先に接続できませんでした。通信を確認して再接続してください。";
}

export async function getGoogleAccountEmail(token: string): Promise<string> {
  const { response, value } = await fetchJsonWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  }, 20_000);
  if (!response.ok) throw new Error("Googleアカウントを確認できませんでした。もう一度ログインしてください。");
  const profile = value as { email?: string; email_verified?: boolean };
  if (!profile.email || !profile.email_verified) throw new Error("確認済みのGoogleアカウントが必要です。");
  return profile.email;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reader.onload = reader.onerror = reader.onabort = null;
      if (value) resolve(value);
      else reject(new Error(photoConversionError));
    };
    const timer = setTimeout(() => {
      finish();
      try { reader.abort(); } catch { /* The read may already have ended. */ }
    }, photoOperationTimeoutMs);
    reader.onload = () => finish(typeof reader.result === "string" ? reader.result.split(",", 2)[1] : undefined);
    reader.onerror = () => finish();
    reader.onabort = () => finish();
    try { reader.readAsDataURL(blob); } catch { finish(); }
  });
}

export function isSupportedFoodPhoto(file: File): boolean {
  return (file.type.startsWith("image/") || (!file.type && /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name))) && file.size > 0 && file.size <= 20_000_000;
}

async function decodePhoto(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
        let settled = false;
        const fail = () => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error(photoConversionError)); };
        const timer = setTimeout(fail, photoOperationTimeoutMs);
        // The decoder itself cannot be aborted. Close a bitmap arriving after
        // the deadline so that its pixels cannot accumulate in mobile memory.
        try {
          createImageBitmap(file).then((value) => {
            if (settled) { value.close(); return; }
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }, fail);
        } catch { fail(); }
      });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Safari can decode some phone photos through an image element. */ }
  }
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const fail = () => { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error("この写真を読み込めませんでした。写真アプリからJPEGまたはPNGとして選び直してください。")); };
    const timer = setTimeout(fail, 20_000);
    image.onload = () => {
      clearTimeout(timer);
      if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) });
    };
    image.onerror = fail;
    image.src = url;
  });
}

/** Redraws, then strips encoder-added metadata in RAM before hashing/uploading. */
export async function sanitizeTrainingPhoto(file: Blob): Promise<Blob> {
  const image = await decodePhoto(file);
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("写真を送信用に変換できませんでした。");
    for (const [maxSide, quality] of [[1280, 0.82], [1280, 0.68], [1024, 0.72], [768, 0.7]]) {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      const result = await new Promise<Blob | null>((resolve, reject) => {
        let settled = false;
        const fail = () => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error(photoConversionError)); };
        const timer = setTimeout(fail, photoOperationTimeoutMs);
        try {
          canvas.toBlob((value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }, "image/jpeg", quality);
        } catch { fail(); }
      });
      if (result && result.type === "image/jpeg" && result.size > 0 && result.size <= 1_500_000) {
        try {
          const cleanBytes = stripCanvasJpegMetadata(new Uint8Array(await result.arrayBuffer()));
          return new Blob([cleanBytes], { type: "image/jpeg" });
        } catch {
          // Do not send the original or a JPEG whose metadata boundaries are
          // unreadable. The receiver's independent privacy check stays strict.
          throw new Error("写真の安全な変換を確認できませんでした。JPEGまたはPNGとして選び直してください。");
        }
      }
    }
    throw new Error("写真を送信用に変換できませんでした。小さい写真を選び直してください。");
  } finally {
    canvas.width = canvas.height = 0;
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
  onProgress?: (message: string) => void;
}): Promise<{ id: string; imageSha256: string; imageFileId: string; jsonFileId: string }> {
  const endpoint = trainingEndpoint(input.endpoint);
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
  // Reuse the exact bytes and ID after an interrupted response. The receiver's
  // idempotency check returns the existing receipt when the first POST saved it.
  const body = JSON.stringify({ accessToken: input.accessToken, payload });
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: unknown;
    try {
      const { response, value } = await fetchJsonWithTimeout(endpoint.href, {
        method: "POST", mode: "cors", credentials: "omit", redirect: "follow", cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body,
      }, 60_000);
      if (!response.ok || response.type === "opaque") throw new Error("unreadable_receipt");
      result = value;
    } catch {
      if (attempt === 0) {
        input.onProgress?.("通信が途切れたため、同じ受付番号で保存結果を再確認しています…");
        continue;
      }
      throw new Error("保存結果を受信できませんでした。写真と入力内容はこの画面に残っています。同じ内容で再試行してください。");
    }
    // An explicit rejection must not be retried automatically.
    return validateTrainingReceipt(result, input.id, imageSha256);
  }
  throw new Error("保存結果を確認できませんでした。");
}
