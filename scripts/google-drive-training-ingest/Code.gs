const FOOD_DB_FOLDER_ID = '1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW';
// The previous folder is preserved. New records go ONLY to 01_app_feedback/inbox.
const GOOGLE_OAUTH_CLIENT_ID = '660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com';
const MAX_IMAGE_BASE64_LENGTH = 2100000;
const MAX_UPLOADS_PER_SIX_HOURS = 10;

function doPost(event) {
  var lock;
  try {
    if (!event || !event.postData || event.postData.contents.length > 2200000) throw new Error('invalid_request');
    const request = JSON.parse(event.postData.contents);
    const accessToken = String(request.accessToken || '');
    if (!accessToken || accessToken.length > 8192) throw new Error('invalid_request');
    const payload = validatePayload_(request.payload);
    const account = verifyGoogleAccount_(accessToken);
    const imageBytes = Utilities.base64Decode(payload.imageBase64);
    assertCleanJpeg_(imageBytes);
    const imageSha256 = sha256_(imageBytes);
    if (imageSha256 !== payload.imageSha256) throw new Error('image_hash_mismatch');
    const folder = getTrainingFolder_();
    // A keyed opaque name prevents cross-account replay/collision without storing an account ID.
    const secret = PropertiesService.getScriptProperties().getProperty('INGEST_HMAC_SECRET');
    if (!secret) throw new Error('setup_required');
    const key = Utilities.computeHmacSha256Signature(account.sub + ':' + payload.id, secret)
      .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const fingerprint = sha256_(Utilities.newBlob(JSON.stringify(payload)).getBytes());
    var jsonFile = uniqueFile_(folder, key + '.json');
    if (jsonFile) {
      const existing = JSON.parse(jsonFile.getBlob().getDataAsString());
      if (existing.requestFingerprint !== fingerprint) throw new Error('idempotency_conflict');
      const image = DriveApp.getFileById(existing.imageFileId);
      assertPrivate_(image.getId(), folder.getId());
      if (sha256_(image.getBlob().getBytes()) !== imageSha256) throw new Error('saved_image_mismatch');
      return jsonResponse_({ ok: true, id: payload.id, imageFileId: image.getId(), jsonFileId: jsonFile.getId(), imageSha256: imageSha256 });
    }
    enforceUploadLimit_(account.sub);
    var imageFile = uniqueFile_(folder, key + '.jpg');
    if (!imageFile) imageFile = folder.createFile(Utilities.newBlob(imageBytes, 'image/jpeg', key + '.jpg'));
    assertPrivate_(imageFile.getId(), folder.getId());
    if (sha256_(imageFile.getBlob().getBytes()) !== imageSha256) throw new Error('saved_image_mismatch');
    const record = {
      schemaVersion: 2,
      id: payload.id,
      imageFileId: imageFile.getId(),
      imageSha256: imageSha256,
      requestFingerprint: fingerprint,
      source: payload.predictedFoodIds[0] === payload.confirmedFoodId ? 'app_user_confirmed' : 'app_user_corrected',
      consent: { granted: true, version: 'food-photo-training-v2', purpose: 'food-recognition', at: payload.createdAt },
      review: { status: 'pending' },
      // User-provided nutrition values are not ground truth for weight/PFC training.
      nutritionProvenance: 'user_estimate',
      predictedFoodIds: payload.predictedFoodIds,
      confirmedFoodId: payload.confirmedFoodId,
      confirmedFoodName: payload.confirmedFoodName,
      nutrition: payload.nutrition,
      createdAt: payload.createdAt,
    };
    const text = JSON.stringify(record, null, 2);
    jsonFile = folder.createFile(Utilities.newBlob(text, 'application/json', key + '.json'));
    assertPrivate_(jsonFile.getId(), folder.getId());
    if (jsonFile.getBlob().getDataAsString() !== text) throw new Error('saved_json_mismatch');
    return jsonResponse_({ ok: true, id: payload.id, imageFileId: imageFile.getId(), jsonFileId: jsonFile.getId(), imageSha256: imageSha256 });
  } catch (error) {
    // Do not log tokens, photo data, names, emails or free-form labels.
    return jsonResponse_({ ok: false });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function sha256_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function uniqueFile_(folder, name) {
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return null;
  const file = files.next();
  if (files.hasNext()) throw new Error('duplicate_filename');
  assertPrivate_(file.getId(), folder.getId());
  return file;
}

function assertCleanJpeg_(signedBytes) {
  const bytes = signedBytes.map(function (b) { return b & 255; });
  if (bytes.length < 4 || bytes.length > 1500000 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('invalid_jpeg');
  var offset = 2;
  while (offset < bytes.length - 3) {
    if (bytes[offset++] !== 255) throw new Error('invalid_jpeg');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) return; // start of scan; metadata must have appeared before this.
    if (marker === 225 || marker === 237 || marker === 254) throw new Error('image_metadata_not_removed');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error('invalid_jpeg');
    offset += length;
  }
  throw new Error('invalid_jpeg');
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
  const count = Number(cache.get(key) || '0');
  if (count >= MAX_UPLOADS_PER_SIX_HOURS) throw new Error('upload_limit');
  cache.put(key, String(count + 1), 21600);
}

function validatePayload_(payload) {
  if (!payload || payload.schemaVersion !== 2) throw new Error('invalid_schema');
  if (!payload.consent || payload.consent.granted !== true || payload.consent.version !== 'food-photo-training-v2' || payload.consent.purpose !== 'food-recognition' || payload.consent.at !== payload.createdAt) throw new Error('consent_required');
  if (!/^[a-f0-9]{64}$/.test(payload.imageSha256 || '')) throw new Error('invalid_hash');
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
  assertPrivate_(FOOD_DB_FOLDER_ID);
  const parent = uniqueFolder_(DriveApp.getFolderById(FOOD_DB_FOLDER_ID), '01_app_feedback', false);
  const folder = uniqueFolder_(parent, 'inbox', false);
  return folder;
}

function assertPrivate_(id, parentId) {
  const response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,parents,trashed,permissions(type,role)', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('folder_permission_check_failed');
  const meta = JSON.parse(response.getContentText());
  if (meta.trashed !== false || !meta.permissions || !meta.permissions.length || meta.permissions.some(function (p) { return p.type !== 'user' || p.role !== 'owner'; })) throw new Error('not_owner_only');
  if (parentId && (meta.parents.length !== 1 || meta.parents[0] !== parentId)) throw new Error('outside_food_db');
}

function uniqueFolder_(parent, name, create) {
  const folders = parent.getFoldersByName(name);
  const folder = folders.hasNext() ? folders.next() : create ? parent.createFolder(name) : null;
  if (!folder || folders.hasNext()) throw new Error('missing_or_duplicate_folder');
  assertPrivate_(folder.getId(), parent.getId());
  return folder;
}

/** Run once in the Apps Script editor as owner; never exposed via doPost. */
function setupTrainingInbox() {
  assertPrivate_(FOOD_DB_FOLDER_ID);
  const parent = uniqueFolder_(DriveApp.getFolderById(FOOD_DB_FOLDER_ID), '01_app_feedback', true);
  const inbox = uniqueFolder_(parent, 'inbox', true);
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('INGEST_HMAC_SECRET')) properties.setProperty('INGEST_HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  return { folderId: inbox.getId() };
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
