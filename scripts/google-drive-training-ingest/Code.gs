const FOOD_DB_FOLDER_ID = '1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW';
// The previous folder is preserved. New records go ONLY to 01_app_feedback/inbox.
const GOOGLE_OAUTH_CLIENT_ID = '660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com';
const INGEST_VERSION = '2026-10-22.1';
const MAX_IMAGE_BASE64_LENGTH = 2100000;
const MAX_UPLOADS_PER_SIX_HOURS = 10;

// Public configuration only: no tokens, account details or Drive contents.
function doGet() {
  return jsonResponse_({ ok: true, service: 'bodymake-training-ingest', version: INGEST_VERSION,
    schemaVersion: 2, clientId: GOOGLE_OAUTH_CLIENT_ID });
}

function doPost(event) {
  var lock;
  var stage = 'request';
  try {
    if (!event || !event.postData || event.postData.contents.length > 2200000) throw new Error('invalid_request');
    const request = JSON.parse(event.postData.contents);
    const accessToken = String(request.accessToken || '');
    if (!accessToken || accessToken.length > 8192) throw new Error('invalid_request');
    stage = 'payload';
    const payload = validatePayload_(request.payload);
    stage = 'google_account';
    const account = verifyGoogleAccount_(accessToken);
    stage = 'photo';
    const requestBytes = Utilities.base64Decode(payload.imageBase64);
    const requestImageSha256 = sha256_(requestBytes);
    if (requestImageSha256 !== payload.imageSha256) throw new Error('image_hash_mismatch');
    // Older open pages redraw onto canvas but some encoders add EXIF again.
    // Strip that metadata in RAM before any Drive write; never save the input.
    const imageBytes = stripJpegMetadata_(requestBytes);
    assertCleanJpeg_(imageBytes);
    const imageSha256 = sha256_(imageBytes);
    stage = 'drive_folder';
    const folder = getTrainingFolder_();
    // A keyed opaque name prevents cross-account replay/collision without storing an account ID.
    const secret = PropertiesService.getScriptProperties().getProperty('INGEST_HMAC_SECRET');
    if (!secret) throw new Error('setup_required');
    const key = Utilities.computeHmacSha256Signature(account.sub + ':' + payload.id, secret)
      .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    stage = 'drive_write';
    // Metadata-only differences on retries must not create a second record.
    // For already-clean legacy payloads this is the original fingerprint.
    const canonicalPayload = Object.assign({}, payload, {
      imageBase64: Utilities.base64Encode(imageBytes), imageSha256: imageSha256,
    });
    const fingerprint = sha256_(Utilities.newBlob(JSON.stringify(canonicalPayload)).getBytes());
    var jsonFile = uniqueFile_(folder, key + '.json');
    if (jsonFile) {
      const existing = JSON.parse(jsonFile.getBlob().getDataAsString());
      if (existing.requestFingerprint !== fingerprint) throw new Error('idempotency_conflict');
      if (existing.imageSha256 !== imageSha256) throw new Error('saved_image_mismatch');
      const image = DriveApp.getFileById(existing.imageFileId);
      assertPrivate_(image.getId(), folder.getId());
      if (sha256_(image.getBlob().getBytes()) !== imageSha256) throw new Error('saved_image_mismatch');
      return uploadReceipt_(payload.id, image.getId(), jsonFile.getId(), requestImageSha256, imageSha256);
    }
    var imageFile = uniqueFile_(folder, key + '.jpg');
    if (!imageFile) {
      // The script lock serializes this allowance check and creation. A retry
      // completing an already-written photo must not consume the quota again.
      const allowance = checkUploadLimit_(account.sub);
      imageFile = folder.createFile(Utilities.newBlob(imageBytes, 'image/jpeg', key + '.jpg'));
      allowance.cache.put(allowance.key, String(allowance.count + 1), 21600);
    }
    assertPrivate_(imageFile.getId(), folder.getId());
    if (sha256_(imageFile.getBlob().getBytes()) !== imageSha256) throw new Error('saved_image_mismatch');
    const record = {
      schemaVersion: 2,
      id: payload.id,
      imageFileId: imageFile.getId(),
      imageSha256: imageSha256,
      imageProcessing: { method: 'jpeg-metadata-v1', requestImageSha256: requestImageSha256,
        metadataRemoved: requestImageSha256 !== imageSha256 },
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
    return uploadReceipt_(payload.id, imageFile.getId(), jsonFile.getId(), requestImageSha256, imageSha256);
  } catch (error) {
    // Return only a fixed diagnostic code and stage. Never echo tokens, photos,
    // account details, labels, or arbitrary exception messages to the browser.
    const safeCodes = [
      'invalid_request', 'invalid_schema', 'consent_required', 'invalid_hash',
      'invalid_id', 'invalid_image', 'invalid_image_type', 'invalid_label',
      'invalid_food_id', 'invalid_candidates', 'invalid_nutrition', 'invalid_date',
      'invalid_google_token', 'wrong_google_client_or_scope', 'wrong_google_client',
      'missing_email_scope', 'unverified_google_account',
      'invalid_jpeg', 'image_metadata_not_removed', 'image_hash_mismatch',
      'folder_permission_check_failed', 'not_owner_only', 'outside_food_db',
      'missing_or_duplicate_folder', 'setup_required', 'duplicate_filename',
      'idempotency_conflict', 'saved_image_mismatch', 'saved_json_mismatch', 'upload_limit',
    ];
    const code = error && safeCodes.includes(error.message) ? error.message : 'internal_error';
    return jsonResponse_({ ok: false, errorCode: code, stage: stage });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function uploadReceipt_(id, imageFileId, jsonFileId, requestImageSha256, storedImageSha256) {
  return jsonResponse_({ ok: true, receiptVersion: 3, id: id,
    imageFileId: imageFileId, jsonFileId: jsonFileId,
    // Compatibility acknowledgement for pages already open before this fix.
    // This alias identifies the REQUEST, not the stored, sanitized bytes.
    imageSha256: requestImageSha256, requestImageSha256: requestImageSha256,
    storedImageSha256: storedImageSha256, sanitization: 'jpeg-metadata-v1',
    metadataRemoved: requestImageSha256 !== storedImageSha256 });
}

// Same marker policy as lib/drive/jpeg-metadata.mjs. Keep this standalone for
// Apps Script; parity tests cover baseline/progressive JPEGs and signed bytes.
function stripJpegMetadata_(signedBytes) {
  const bytes = new Uint8Array(signedBytes.map(function (b) { return b & 255; }));
  const invalidJpeg = function () { return new Error('invalid_jpeg'); };
  if (bytes.length < 4 || bytes.length > 1500000 || bytes[0] !== 255 || bytes[1] !== 216) throw invalidJpeg();
  const output = new Uint8Array(bytes.length);
  var written = 0;
  const copy = function (start, end) { output.set(bytes.subarray(start, end), written); written += end - start; };
  const matches = function (start, end, signature) {
    return end - start >= signature.length && Array.from(signature, function (char, index) {
      return bytes[start + index] === char.charCodeAt(0);
    }).every(Boolean);
  };
  copy(0, 2);
  var offset = 2, inScan = false, sawFrame = false, sawScan = false;
  while (offset < bytes.length) {
    if (inScan) {
      const scanStart = offset;
      var scanBytes = 0;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 255) { scanBytes++; continue; }
        const markerStart = offset - 1;
        while (bytes[offset] === 255) offset++;
        if (offset >= bytes.length) throw invalidJpeg();
        const marker = bytes[offset++];
        if (marker === 0) { scanBytes++; continue; }
        if (marker >= 208 && marker <= 215) continue;
        if (!scanBytes) throw invalidJpeg();
        copy(scanStart, markerStart); offset = markerStart; inScan = false; break;
      }
      if (inScan) throw invalidJpeg();
    }
    const markerStart = offset;
    if (bytes[offset++] !== 255) throw invalidJpeg();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) {
      if (!sawFrame || !sawScan || offset !== bytes.length) throw invalidJpeg();
      copy(markerStart, offset);
      // Utilities.newBlob/computeDigest take signed Java byte arrays.
      return Array.from(output.subarray(0, written), function (b) { return b > 127 ? b - 256 : b; });
    }
    const application = marker >= 224 && marker <= 239;
    if (!application && marker !== 254 && ![192, 193, 194, 196, 218, 219, 221].includes(marker)) throw invalidJpeg();
    if (offset + 2 > bytes.length) throw invalidJpeg();
    const length = bytes[offset] * 256 + bytes[offset + 1], end = offset + length;
    if (length < 2 || end > bytes.length) throw invalidJpeg();
    var keep = !application && marker !== 254;
    if (marker === 224) {
      keep = length === 16 && matches(offset + 2, end, 'JFIF\0') && bytes[end - 2] === 0 && bytes[end - 1] === 0;
    } else if (marker === 226) {
      keep = length > 16 && matches(offset + 2, end, 'ICC_PROFILE\0') && bytes[offset + 14] > 0 && bytes[offset + 14] <= bytes[offset + 15];
    } else if (marker >= 192 && marker <= 194) {
      const components = bytes[offset + 7], height = bytes[offset + 3] * 256 + bytes[offset + 4], width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (sawFrame || length < 11 || bytes[offset + 2] !== 8 || ![1, 3].includes(components) || length !== 8 + 3 * components || !width || !height || width > 1280 || height > 1280) throw invalidJpeg();
      sawFrame = true;
    } else if (marker === 218) {
      const components = bytes[offset + 2];
      if (!sawFrame || components < 1 || components > 3 || length !== 6 + 2 * components) throw invalidJpeg();
      sawScan = true; inScan = true;
    }
    if (keep) copy(markerStart, end);
    offset = end;
  }
  throw invalidJpeg();
}

/** Owner-run runtime check only. Synthetic 1px JPEG; no Drive, HTTP or user data. */
function testPhotoMetadataInMemory() {
  const clean = Utilities.base64Decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AP//Z');
  const exif = [-1, -31, 0, 8, 69, 120, 105, 102, 0, 0];
  const dirty = clean.slice(0, 2).concat(exif, clean.slice(2));
  const sanitized = stripJpegMetadata_(dirty);
  assertCleanJpeg_(sanitized);
  const roundTrip = Utilities.newBlob(sanitized, 'image/jpeg').getBytes();
  if (sha256_(roundTrip) !== sha256_(clean) || sha256_(dirty) === sha256_(clean) ||
      Utilities.base64Encode(sanitized) !== Utilities.base64Encode(clean)) throw new Error('runtime_sanitization_failed');
  console.log('PASS: EXIF removed; pixels unchanged; signed-byte Blob and SHA-256 round-trip verified. No files written.');
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
  var frame = null;
  var sawScan = false;
  var inScan = false;
  var hasQuantization = false;
  var hasHuffman = false;
  while (offset < bytes.length) {
    if (inScan) {
      // Entropy data uses FF 00 for a literal FF and FF D0..D7 for restart
      // markers. Other markers return to the header parser, including between
      // progressive scans: metadata there must not bypass the privacy check.
      var scanBytes = 0;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 255) { scanBytes++; continue; }
        const markerStart = offset - 1;
        while (bytes[offset] === 255) offset++;
        if (offset >= bytes.length) throw new Error('invalid_jpeg');
        const scanMarker = bytes[offset++];
        if (scanMarker === 0) { scanBytes++; continue; }
        if (scanMarker >= 208 && scanMarker <= 215) continue;
        if (!scanBytes) throw new Error('invalid_jpeg');
        offset = markerStart;
        inScan = false;
        break;
      }
      if (inScan) throw new Error('invalid_jpeg');
    }
    if (bytes[offset++] !== 255) throw new Error('invalid_jpeg');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) {
      // No trailing payload is accepted after the end-of-image marker.
      if (!frame || !sawScan || offset !== bytes.length) throw new Error('invalid_jpeg');
      return;
    }
    // Canvas JPEGs can contain JFIF (APP0) and a color profile (APP2), but
    // EXIF/IPTC/comments and other application metadata are not accepted.
    if (marker === 254 || (marker >= 225 && marker <= 239 && marker !== 226)) throw new Error('image_metadata_not_removed');
    if (![192, 193, 194, 196, 218, 219, 221, 224, 226].includes(marker) || offset + 2 > bytes.length) throw new Error('invalid_jpeg');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error('invalid_jpeg');
    if (marker >= 192 && marker <= 194) {
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      const components = bytes[offset + 7];
      if (frame || length < 11 || bytes[offset + 2] !== 8 || components < 1 || components > 4 || length !== 8 + 3 * components ||
          !width || !height || width > 8192 || height > 8192 || width * height > 16777216) throw new Error('invalid_jpeg');
      frame = [];
      for (var component = 0; component < components; component++) {
        const id = bytes[offset + 8 + component * 3];
        if (frame.includes(id)) throw new Error('invalid_jpeg');
        frame.push(id);
      }
    } else if (marker === 219) {
      var tableOffset = offset + 2;
      while (tableOffset < offset + length) {
        const table = bytes[tableOffset++];
        if ((table >> 4) > 1 || (table & 15) > 3) throw new Error('invalid_jpeg');
        tableOffset += 64 * ((table >> 4) + 1);
      }
      if (length < 67 || tableOffset !== offset + length) throw new Error('invalid_jpeg');
      hasQuantization = true;
    } else if (marker === 196) {
      var huffmanOffset = offset + 2;
      while (huffmanOffset < offset + length) {
        const table = bytes[huffmanOffset++];
        if ((table >> 4) > 1 || (table & 15) > 3 || huffmanOffset + 16 > offset + length) throw new Error('invalid_jpeg');
        var symbols = 0;
        for (var size = 0; size < 16; size++) symbols += bytes[huffmanOffset++];
        if (!symbols || symbols > 256) throw new Error('invalid_jpeg');
        huffmanOffset += symbols;
      }
      if (length < 20 || huffmanOffset !== offset + length) throw new Error('invalid_jpeg');
      hasHuffman = true;
    } else if (marker === 221 && length !== 4) {
      throw new Error('invalid_jpeg');
    } else if (marker === 218) {
      const components = bytes[offset + 2];
      if (!frame || !hasQuantization || !hasHuffman || components < 1 || components > frame.length || length !== 6 + 2 * components) throw new Error('invalid_jpeg');
      const scanComponents = [];
      for (var component = 0; component < components; component++) {
        const id = bytes[offset + 3 + component * 2];
        if (!frame.includes(id) || scanComponents.includes(id)) throw new Error('invalid_jpeg');
        scanComponents.push(id);
      }
      sawScan = true;
      inScan = true;
    }
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
  // oauth2.googleapis.com returns aud/azp. The older v2 endpoint used
  // audience/issued_to. Require every supplied client claim to agree; never
  // accept a token issued to another app merely because one alias matches.
  const clients = [tokenInfo.aud, tokenInfo.azp, tokenInfo.audience, tokenInfo.issued_to]
    .filter(function (value) { return value !== undefined && value !== null; });
  if (!clients.length || clients.some(function (value) { return value !== GOOGLE_OAUTH_CLIENT_ID; })) throw new Error('wrong_google_client');
  if (tokenInfo.expires_in !== undefined && (!Number.isFinite(Number(tokenInfo.expires_in)) || Number(tokenInfo.expires_in) <= 0)) throw new Error('invalid_google_token');
  if (!hasEmailScope) throw new Error('missing_email_scope');
  const response = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('invalid_google_token');
  const account = JSON.parse(response.getContentText());
  if (!account.sub || account.email_verified !== true) throw new Error('unverified_google_account');
  if ((tokenInfo.sub && tokenInfo.sub !== account.sub) || (tokenInfo.user_id && tokenInfo.user_id !== account.sub)) throw new Error('invalid_google_token');
  return account;
}

function checkUploadLimit_(subject) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, subject);
  const key = 'uploads:' + digest.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key) || '0');
  if (count >= MAX_UPLOADS_PER_SIX_HOURS) throw new Error('upload_limit');
  return { cache: cache, key: key, count: count };
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
