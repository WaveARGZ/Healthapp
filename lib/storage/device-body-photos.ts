import type { BodyPhotoEntry } from "@/types/progress";

const databaseName = "bodymake-private-photos-v1";
const storeName = "photos";
type StoredPhoto = Omit<BodyPhotoEntry, "imageUrl"> & { key: string; ownerUid: string; blob: Blob };

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("このブラウザでは写真を端末内に保存できません。");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("写真の保存領域を開けません。"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error("写真の保存に失敗しました。")); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("写真の保存が中断されました。")); };
  });
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("写真を読み込めません。"));
    reader.readAsDataURL(blob);
  });
}

export async function getDeviceBodyPhotos(uid: string): Promise<BodyPhotoEntry[]> {
  const stored = await transaction<StoredPhoto[]>("readonly", (store) => store.getAll());
  return Promise.all(stored.filter((photo) => photo.ownerUid === uid).map(async (photo) => ({
    id: photo.id, view: photo.view, capturedAt: photo.capturedAt,
    createdAt: photo.createdAt, imageUrl: await asDataUrl(photo.blob),
  })));
}

export async function saveDeviceBodyPhoto(uid: string, entry: BodyPhotoEntry) {
  if (!entry.imageUrl.startsWith("data:image/")) throw new Error("端末内に保存できる写真形式ではありません。");
  const blob = await fetch(entry.imageUrl).then((response) => response.blob());
  await transaction("readwrite", (store) => store.put({
    key: `${uid}:${entry.id}`, ownerUid: uid, id: entry.id, view: entry.view,
    capturedAt: entry.capturedAt, createdAt: entry.createdAt, blob,
  } satisfies StoredPhoto));
  return entry;
}

export async function deleteDeviceBodyPhoto(uid: string, id: string) {
  await transaction("readwrite", (store) => store.delete(`${uid}:${id}`));
}
