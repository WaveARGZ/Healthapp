const driveScope = "https://www.googleapis.com/auth/drive.file";
const trainingFolderName = "BodyMake 食事画像正解データ";
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

/** Requests a short-lived Google access token from an explicit user action. */
export function requestGoogleDriveAccessToken(clientId: string): Promise<string> {
  const request = (): Promise<string> => {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google認証を初期化できませんでした。");
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: driveScope,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description ?? response.error ?? "Google Driveへのアクセスが許可されませんでした。"));
      },
    });
    client.requestAccessToken();
  });
  };
  if (window.google?.accounts?.oauth2) return request();
  return loadGoogleIdentity().then(request);
}

async function driveRequest(path: string, token: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Driveへの保存に失敗しました (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return response;
}

async function ensureTrainingFolder(token: string): Promise<string> {
  const query = encodeURIComponent(`name = '${trainingFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const search = await driveRequest(`files?q=${query}&fields=files(id,name)&spaces=drive`, token);
  const result = await search.json() as { files?: Array<{ id: string }> };
  if (result.files?.[0]?.id) return result.files[0].id;
  const created = await driveRequest("files?fields=id", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: trainingFolderName, mimeType: "application/vnd.google-apps.folder" }),
  });
  const folder = await created.json() as { id?: string };
  if (!folder.id) throw new Error("Google Driveに保存先フォルダを作成できませんでした。");
  return folder.id;
}

async function uploadFile(token: string, folderId: string, name: string, mimeType: string, content: Blob | string): Promise<string> {
  const boundary = `bodymake_${crypto.randomUUID().replaceAll("-", "")}`;
  const metadata = JSON.stringify({ name, mimeType, parents: [folderId] });
  const media = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${media.type || mimeType}\r\n\r\n`,
    media,
    `\r\n--${boundary}--`,
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Driveへの保存に失敗しました (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const file = await response.json() as { id?: string };
  if (!file.id) throw new Error("Google Driveが保存先IDを返しませんでした。");
  return file.id;
}

export async function verifyGoogleDriveAccess(token: string): Promise<void> {
  await ensureTrainingFolder(token);
}

export async function saveFoodCorrectionToGoogleDrive(input: {
  token: string;
  id: string;
  image: Blob;
  predictedFoodIds: string[];
  confirmedFoodId: string;
  confirmedFoodName: string;
  nutrition: { calories: number; proteinG: number; fatG: number; carbsG: number };
  createdAt: string;
}): Promise<void> {
  const folderId = await ensureTrainingFolder(input.token);
  const extension = input.image.type === "image/png" ? "png" : "jpg";
  const imageId = await uploadFile(input.token, folderId, `${input.id}.${extension}`, input.image.type || "image/jpeg", input.image);
  const record = {
    schemaVersion: 1,
    id: input.id,
    imageFileId: imageId,
    predictedFoodIds: input.predictedFoodIds,
    confirmedFoodId: input.confirmedFoodId,
    confirmedFoodName: input.confirmedFoodName,
    nutrition: input.nutrition,
    createdAt: input.createdAt,
  };
  await uploadFile(input.token, folderId, `${input.id}.json`, "application/json", JSON.stringify(record, null, 2));
}
