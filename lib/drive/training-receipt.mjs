/** A load event / opaque response is NOT a storage receipt. */
export function validateTrainingReceipt(value, id, imageSha256) {
  if (value?.ok === false) {
    const explanations = {
      invalid_google_token: "Google認証の有効期限が切れたか、認証できませんでした。",
      wrong_google_client_or_scope: "Google認証の設定が受信側と一致しません。",
      wrong_google_client: "Google認証に使うアプリの設定が受信側と一致しません。",
      missing_email_scope: "Googleアカウントの確認に必要な権限が付いていません。",
      unverified_google_account: "確認済みのGoogleアカウントが必要です。",
      folder_permission_check_failed: "Driveの保存先を確認できませんでした。",
      not_owner_only: "Driveの保存先が非公開であることを確認できませんでした。",
      outside_food_db: "Driveの保存先がfoodDB内にあることを確認できませんでした。",
      missing_or_duplicate_folder: "Driveの受信フォルダを確認できませんでした。",
      setup_required: "Driveの受信設定が完了していません。",
      upload_limit: "短時間の送信上限に達しました。時間をおいてください。",
      idempotency_conflict: "前回と異なる内容を同じ受付番号で送ろうとしました。",
      invalid_jpeg: "送信用の写真を読み取れませんでした。",
      image_metadata_not_removed: "写真の位置情報などを安全に除去できませんでした。",
      image_hash_mismatch: "送信した写真の内容を照合できませんでした。",
      invalid_image: "送信する写真を確認できませんでした。",
      invalid_image_type: "写真の形式が受信側で扱えません。",
      invalid_label: "料理名を確認できませんでした。",
      invalid_nutrition: "栄養値を確認できませんでした。",
    };
    const code = typeof value.errorCode === "string" && /^[a-z_]{1,40}$/.test(value.errorCode) ? value.errorCode : "unknown";
    const stage = typeof value.stage === "string" && /^[a-z_]{1,40}$/.test(value.stage) ? value.stage : "unknown";
    const detail = Object.hasOwn(explanations, code) ? explanations[code] : "受信側で処理を完了できませんでした。";
    throw new Error(`${detail} 保存は未確認です（診断: ${code}/${stage}）。同じ内容で再試行できます。`);
  }
  if (!value || value.ok !== true || value.id !== id || value.imageSha256 !== imageSha256 ||
    !/^[\w-]{10,}$/.test(value.imageFileId ?? "") || !/^[\w-]{10,}$/.test(value.jsonFileId ?? "")) {
    throw new Error("Driveの保存完了を確認できませんでした。同じ内容で再送できます。保存済みの場合は重複作成しません。");
  }
  // v3 acknowledges the request separately from the stored sanitized image.
  // Older pages use the legacy imageSha256 acknowledgement; new callers must
  // never confuse that alias with the actual saved image's digest.
  let storedImageSha256 = imageSha256;
  if (value.receiptVersion !== undefined) {
    if (value.receiptVersion !== 3 || value.requestImageSha256 !== imageSha256 ||
      !/^[a-f0-9]{64}$/.test(value.requestImageSha256) ||
      !/^[a-f0-9]{64}$/.test(value.storedImageSha256 ?? "") ||
      value.sanitization !== "jpeg-metadata-v1" ||
      value.metadataRemoved !== (value.requestImageSha256 !== value.storedImageSha256)) {
      throw new Error("保存された写真の確認情報が一致しません。同じ内容で再試行できます。");
    }
    storedImageSha256 = value.storedImageSha256;
  }
  return { id, imageSha256: storedImageSha256, imageFileId: String(value.imageFileId), jsonFileId: String(value.jsonFileId) };
}
