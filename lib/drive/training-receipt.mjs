/** A load event / opaque response is NOT a storage receipt. */
export function validateTrainingReceipt(value, id, imageSha256) {
  if (!value || value.ok !== true || value.id !== id || value.imageSha256 !== imageSha256 ||
    !/^[\w-]{10,}$/.test(value.imageFileId ?? "") || !/^[\w-]{10,}$/.test(value.jsonFileId ?? "")) {
    throw new Error("Driveの保存完了を確認できませんでした。同じ内容で再送できます。保存済みの場合は重複作成しません。");
  }
  return { id, imageSha256, imageFileId: String(value.imageFileId), jsonFileId: String(value.jsonFileId) };
}
