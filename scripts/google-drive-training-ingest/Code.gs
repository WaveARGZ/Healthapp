const TRAINING_FOLDER_NAME = 'BodyMake 共通食事学習データ';
const GOOGLE_OAUTH_CLIENT_ID = '660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com';
const MAX_IMAGE_BASE64_LENGTH = 2_100_000;
const MAX_UPLOADS_PER_SIX_HOURS = 10;

function doPost(event) {
  try {
    const accessToken = String(event.parameter.accessToken || '');
    const payloadText = String(event.parameter.payload || '');
    if (!accessToken || payloadText.length > 2_200_000) throw new Error('invalid_request');

    // Validate the Google-issued token by resolving it against Google's OpenID userinfo endpoint.
    // The account identifier is used only for a short-lived quota key and is never saved to Drive.
    const payload = validatePayload_(JSON.parse(payloadText));
    const account = verifyGoogleAccount_(accessToken);
    enforceUploadLimit_(account.sub);

    const imageBytes = Utilities.base64Decode(payload.imageBase64);
    const imageBlob = Utilities.newBlob(imageBytes, 'image/jpeg', payload.id + '.jpg');
    const folder = getTrainingFolder_();
    const imageFile = folder.createFile(imageBlob);
    const record = {
      schemaVersion: 1,
      id: payload.id,
      imageFileId: imageFile.getId(),
      predictedFoodIds: payload.predictedFoodIds,
      confirmedFoodId: payload.confirmedFoodId,
      confirmedFoodName: payload.confirmedFoodName,
      nutrition: payload.nutrition,
      createdAt: payload.createdAt,
    };
    folder.createFile(Utilities.newBlob(JSON.stringify(record, null, 2), 'application/json', payload.id + '.json'));
    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error('Training upload rejected: ' + String(error && error.message || error));
    return jsonResponse_({ ok: false });
  }
}

function verifyGoogleAccount_(accessToken) {
  const tokenInfoResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken), {
    method: 'get',
    muteHttpExceptions: true,
  });
  if (tokenInfoResponse.getResponseCode() !== 200) throw new Error('invalid_google_token');
  const tokenInfo = JSON.parse(tokenInfoResponse.getContentText());
  const grantedScopes = String(tokenInfo.scope || '').split(' ');
  const hasEmailScope = grantedScopes.includes('email') || grantedScopes.includes('https://www.googleapis.com/auth/userinfo.email');
  const hasProfileScope = grantedScopes.includes('profile') || grantedScopes.includes('https://www.googleapis.com/auth/userinfo.profile');
  if (tokenInfo.issued_to !== GOOGLE_OAUTH_CLIENT_ID || !grantedScopes.includes('openid') || !hasEmailScope || !hasProfileScope) {
    throw new Error('wrong_google_client_or_scope');
  }
  const response = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('invalid_google_token');
  const account = JSON.parse(response.getContentText());
  if (!account.sub || account.email_verified !== true) throw new Error('unverified_google_account');
  return account;
}

function enforceUploadLimit_(subject) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, subject);
  const key = 'uploads:' + digest.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const count = Number(cache.get(key) || '0');
    if (count >= MAX_UPLOADS_PER_SIX_HOURS) throw new Error('upload_limit');
    cache.put(key, String(count + 1), 21600);
  } finally {
    lock.releaseLock();
  }
}

function validatePayload_(payload) {
  if (!payload || payload.schemaVersion !== 1) throw new Error('invalid_schema');
  if (typeof payload.id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.id)) throw new Error('invalid_id');
  if (typeof payload.imageBase64 !== 'string' || payload.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) throw new Error('invalid_image');
  if (payload.imageMimeType !== 'image/jpeg') throw new Error('invalid_image_type');
  if (typeof payload.confirmedFoodName !== 'string' || !payload.confirmedFoodName.trim() || payload.confirmedFoodName.length > 100) throw new Error('invalid_label');
  if (typeof payload.confirmedFoodId !== 'string' || payload.confirmedFoodId.length > 150) throw new Error('invalid_food_id');
  if (!Array.isArray(payload.predictedFoodIds) || payload.predictedFoodIds.length > 10 || payload.predictedFoodIds.some(function (id) { return typeof id !== 'string' || id.length > 150; })) throw new Error('invalid_candidates');
  const nutrition = payload.nutrition;
  if (!nutrition || ['calories', 'proteinG', 'fatG', 'carbsG'].some(function (key) {
    return typeof nutrition[key] !== 'number' || !Number.isFinite(nutrition[key]) || nutrition[key] < 0 || nutrition[key] > 10000;
  })) throw new Error('invalid_nutrition');
  if (typeof payload.createdAt !== 'string' || isNaN(Date.parse(payload.createdAt))) throw new Error('invalid_date');
  return payload;
}

function getTrainingFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty('TRAINING_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      properties.deleteProperty('TRAINING_FOLDER_ID');
    }
  }
  const folder = DriveApp.createFolder(TRAINING_FOLDER_NAME);
  properties.setProperty('TRAINING_FOLDER_ID', folder.getId());
  return folder;
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
