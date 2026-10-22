import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateTrainingReceipt } from "../../lib/drive/training-receipt.mjs";
import { applyEmbeddingCalibration, CLIP_FEATURE_CONTRACT } from "../../lib/food-ai/clip-features.mjs";
import { jpegSamples, withExif } from "./test-support/jpeg-fixtures.mjs";
import { stripCanvasJpegMetadata } from "../../lib/drive/jpeg-metadata.mjs";

test("receipt must contain matching ID, full hash and both Drive IDs", () => {
  const receipt = { ok: true, id: "sample", imageSha256: "abc", imageFileId: "image-file-id", jsonFileId: "json-file-id" };
  assert.equal(validateTrainingReceipt(receipt, "sample", "abc").jsonFileId, "json-file-id");
  for (const value of [{ok:true}, {...receipt,id:"other"}, {...receipt,imageSha256:"different"}, {ok:false}]) assert.throws(() => validateTrainingReceipt(value, "sample", "abc"));
  assert.throws(
    () => validateTrainingReceipt({ok:false,errorCode:"wrong_google_client_or_scope",stage:"google_account"}, "sample", "abc"),
    /Google認証の設定が受信側と一致しません.*wrong_google_client_or_scope\/google_account/,
  );
  assert.throws(
    () => validateTrainingReceipt({ok:false,errorCode:"<private>",stage:"<private>"}, "sample", "abc"),
    /診断: unknown\/unknown/,
  );
});

test("v3 receipts distinguish request acknowledgements from stored image hashes", () => {
  const inputHash = "a".repeat(64), savedHash = "b".repeat(64);
  const receipt = { ok: true, receiptVersion: 3, id: "sample", imageSha256: inputHash,
    requestImageSha256: inputHash, storedImageSha256: savedHash, metadataRemoved: true,
    sanitization: "jpeg-metadata-v1", imageFileId: "image-file-id", jsonFileId: "json-file-id" };
  assert.equal(validateTrainingReceipt(receipt, "sample", inputHash).imageSha256, savedHash);
  for (const bad of [
    { receiptVersion: 4 }, { requestImageSha256: savedHash }, { storedImageSha256: undefined },
    { storedImageSha256: "invalid" }, { sanitization: "skipped" }, { metadataRemoved: false },
    { imageSha256: savedHash },
  ]) assert.throws(() => validateTrainingReceipt({ ...receipt, ...bad }, "sample", inputHash));
  const untouched = { ...receipt, storedImageSha256: inputHash, metadataRemoved: false };
  assert.equal(validateTrainingReceipt(untouched, "sample", inputHash).imageSha256, inputHash);
});

function harness() {
  let sequence = 0, writes = 0;
  let failJsonWrites = 0, failImageWrites = 0;
  const files = new Map();
  const cache = new Map();
  const iterator = (items) => ({ hasNext: () => items.length > 0, next: () => items.shift() });
  const blob = (data, type, name) => ({ data: Buffer.isBuffer(data) ? data : typeof data === "string" ? Buffer.from(data) : Buffer.from(data), name, getBytes() { return Array.from(this.data); }, getDataAsString() { return this.data.toString(); } });
  const folders = Object.fromEntries(["1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW", "app", "inbox"].map((id, i) => [id, {
    getId: () => id,
    getFoldersByName: (name) => iterator(name === "01_app_feedback" && i === 0 ? [folders.app] : name === "inbox" && i === 1 ? [folders.inbox] : []),
    getFilesByName: (name) => iterator([...files.values()].filter((f) => f.name === name)),
    createFile: (b) => {
      if (b.name.endsWith(".json") && failJsonWrites > 0) { failJsonWrites--; throw new Error("synthetic_write_failure"); }
      if (b.name.endsWith(".jpg") && failImageWrites > 0) { failImageWrites--; throw new Error("synthetic_write_failure"); }
      writes++;
      const f = { id: "file-identifier-" + (++sequence), name: b.name, getId() { return this.id; }, getBlob: () => b };
      files.set(f.id, f); return f;
    },
  }]));
  let shared = false;
  const context = vm.createContext({
    Utilities: { base64Decode: (s) => [...Buffer.from(s,"base64")].map((b)=>b>127?b-256:b),
      base64Encode: (bytes) => Buffer.from(bytes).toString("base64"), newBlob: blob, DigestAlgorithm: {SHA_256:"sha256"},
      computeDigest: (_, data) => [...createHash("sha256").update(typeof data === "string" ? data : Buffer.from(data)).digest()],
      computeHmacSha256Signature: (s,key) => [...createHmac("sha256",key).update(s).digest()] },
    DriveApp: {getFolderById: (id) => folders[id], getFileById: (id) => files.get(id)},
    ScriptApp: {getOAuthToken: () => "not-a-real-token"},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => "test-secret"})},
    LockService: {getScriptLock: () => ({waitLock(){},hasLock:()=>true,releaseLock(){}})},
    CacheService: {getScriptCache:()=>({get:(key)=>cache.get(key) ?? null,put:(key,value)=>cache.set(key,value)})},
    ContentService: {MimeType:{JSON:"json"}, createTextOutput:(s)=>({setMimeType:()=>JSON.parse(s)})},
    UrlFetchApp: {fetch:(url)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({trashed:false, parents:[url.includes('/inbox?') ? 'app' : url.includes('/app?') ? '1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW' : 'inbox'],permissions:[{type:shared?'anyone':'user',role:shared?'reader':'owner'}]})})},
  });
  vm.runInContext(readFileSync(new URL("../google-drive-training-ingest/Code.gs", import.meta.url),"utf8"),context);
  vm.runInContext("verifyGoogleAccount_ = function() { return {sub:'test-account'}; }",context);
  const bytes=Buffer.from(jpegSamples["RGB-baseline"],"base64");
  const payload={schemaVersion:2,id:"sample-id-123",imageBase64:bytes.toString("base64"),imageMimeType:"image/jpeg",imageSha256:createHash("sha256").update(bytes).digest("hex"),confirmedFoodName:"ご飯",confirmedFoodId:"rice",predictedFoodIds:["rice"],nutrition:{calories:100,proteinG:1,fatG:1,carbsG:20},createdAt:"2026-10-15T00:00:00Z",consent:{granted:true,version:"food-photo-training-v2",purpose:"food-recognition",at:"2026-10-15T00:00:00Z"}};
  return {
    send:(p=payload)=>context.doPost({postData:{contents:JSON.stringify({accessToken:"test-token",payload:p})}}),
    payload, writes:()=>writes, share:()=>{shared=true;},
    failJsonWrites:(count)=>{failJsonWrites=count;}, failImageWrites:(count)=>{failImageWrites=count;},
    quota:()=>Number([...cache.values()][0] ?? 0),
    runtimeSelfTest:()=>context.testPhotoMetadataInMemory(),
    savedPhoto:()=>[...files.values()].find((item)=>item.name.endsWith(".jpg"))?.getBlob().data,
    savedRecord:()=>JSON.parse([...files.values()].find((item)=>item.name.endsWith(".json")).getBlob().getDataAsString()),
    useLegacyRecord:()=>{
      const file=[...files.values()].find((item)=>item.name.endsWith(".json"));
      const record=JSON.parse(file.getBlob().getDataAsString()); delete record.imageProcessing;
      file.getBlob().data=Buffer.from(JSON.stringify(record)); return file.getBlob().data.toString();
    },
    corruptFirstImage:()=>{const file=[...files.values()].find((item)=>item.name.endsWith(".jpg")); file.getBlob().data=Buffer.from("damaged");},
  };
}

test("Apps Script confirms two saved files, retries are idempotent",()=>{
  const h=harness();const first=h.send();assert.equal(first.ok,true);assert.ok(first.imageFileId);assert.ok(first.jsonFileId);assert.equal(h.writes(),2);
  assert.equal(h.send().jsonFileId,first.jsonFileId);assert.equal(h.writes(),2);
  assert.equal(h.send({...h.payload,confirmedFoodName:"違う料理"}).ok,false);assert.equal(h.writes(),2);
});
test("owner runtime self-test uses only a synthetic RAM image and writes no files",()=>{
  const h=harness();
  assert.doesNotThrow(()=>h.runtimeSelfTest());
  assert.equal(h.writes(),0);
  assert.equal(h.quota(),0);
});
test("older canvas pages with EXIF are sanitized on receipt and can retry without duplicates",()=>{
  const h=harness();
  const original=withExif();
  const payloadFor=(bytes)=>({...h.payload,imageBase64:Buffer.from(bytes).toString("base64"),imageSha256:createHash("sha256").update(bytes).digest("hex")});
  const clean=stripCanvasJpegMetadata(original);
  const accepted=h.send(payloadFor(original));
  assert.equal(accepted.ok,true);
  assert.equal(accepted.receiptVersion,3);
  assert.equal(accepted.imageSha256,payloadFor(original).imageSha256,"legacy acknowledgement matches input");
  assert.equal(accepted.requestImageSha256,payloadFor(original).imageSha256);
  assert.equal(accepted.storedImageSha256,payloadFor(clean).imageSha256);
  assert.equal(accepted.metadataRemoved,true);
  assert.deepEqual(h.savedPhoto(),Buffer.from(clean));
  assert.equal(h.savedRecord().imageSha256,accepted.storedImageSha256);
  assert.equal(h.savedRecord().review.status,"pending");
  assert.equal(h.savedRecord().imageProcessing.requestImageSha256,accepted.requestImageSha256);
  assert.equal(validateTrainingReceipt(accepted,h.payload.id,payloadFor(original).imageSha256).imageSha256,accepted.storedImageSha256);
  assert.equal(h.writes(),2);
  assert.equal(h.send(payloadFor(original)).jsonFileId,accepted.jsonFileId);
  // Metadata-only changes between old/new encoders do not change the record.
  assert.equal(h.send(payloadFor(clean)).jsonFileId,accepted.jsonFileId);
  assert.equal(h.send(payloadFor(withExif(original))).jsonFileId,accepted.jsonFileId);
  assert.equal(h.writes(),2);
  assert.equal(h.quota(),1);
  assert.equal(h.send({...payloadFor(original),confirmedFoodName:"別の料理"}).errorCode,"idempotency_conflict");
});
test("legacy stored records remain readable and are never rewritten on a retry",()=>{
  const h=harness(),first=h.send();
  const legacy=h.useLegacyRecord();
  assert.equal(h.send().jsonFileId,first.jsonFileId);
  assert.deepEqual(h.savedRecord(),JSON.parse(legacy));
  assert.equal(h.writes(),2);
});
test("metadata input hashes and malformed photos are checked before any write",()=>{
  const h=harness();
  const raw=withExif();
  assert.equal(h.send({...h.payload,imageBase64:raw.toString("base64")}).errorCode,"image_hash_mismatch");
  for(const bytes of [raw.subarray(0,raw.length-2),Buffer.concat([raw,Buffer.from("private trailing data")])]) {
    const result=h.send({...h.payload,imageBase64:bytes.toString("base64"),imageSha256:createHash("sha256").update(bytes).digest("hex")});
    assert.equal(result.errorCode,"invalid_jpeg");
  }
  assert.equal(h.writes(),0);
  assert.equal(h.quota(),0);
});
test("a partial sanitized photo can be completed using the old raw retry payload",()=>{
  const h=harness(),raw=withExif();
  const payload={...h.payload,imageBase64:raw.toString("base64"),imageSha256:createHash("sha256").update(raw).digest("hex")};
  h.failJsonWrites(1);
  assert.equal(h.send(payload).errorCode,"internal_error");
  assert.deepEqual(h.savedPhoto(),Buffer.from(stripCanvasJpegMetadata(raw)));
  const receipt=h.send(payload);
  assert.equal(receipt.ok,true);
  assert.equal(h.writes(),2);
  assert.equal(h.quota(),1);
});
test("Apps Script rejects missing consent, wrong hash, shared folders and old schema",()=>{
  const h=harness();
  for(const p of [{...h.payload,consent:{granted:false}},{...h.payload,imageSha256:"f".repeat(64)},{...h.payload,schemaVersion:1}]) assert.equal(h.send(p).ok,false);
  assert.equal(h.send({...h.payload,imageSha256:"f".repeat(64)}).errorCode,"image_hash_mismatch");
  h.share();const shared=h.send();assert.equal(shared.ok,false);assert.equal(shared.errorCode,"not_owner_only");assert.equal(shared.stage,"drive_folder");assert.equal(h.writes(),0);
});
test("Apps Script recovers partial writes without consuming the upload allowance again",()=>{
  const h=harness();
  h.failJsonWrites(10);
  for(let i=0;i<10;i++) {
    assert.equal(h.send({...h.payload,id:`partial-upload-${i}`}).errorCode,"internal_error");
  }
  assert.equal(h.writes(),10);
  assert.equal(h.quota(),10);
  assert.equal(h.send({...h.payload,id:"brand-new-upload"}).errorCode,"upload_limit");
  // The fully hashed photo is already stored. Completing its missing label
  // remains possible even when the new-upload allowance has been exhausted.
  const recovered=h.send({...h.payload,id:"partial-upload-0"});
  assert.equal(recovered.ok,true);
  assert.equal(h.writes(),11);
  assert.equal(h.quota(),10);
  assert.equal(h.send({...h.payload,id:"partial-upload-0"}).jsonFileId,recovered.jsonFileId);
  assert.equal(h.writes(),11);
});
test("Apps Script charges only created photos and verifies an existing photo before recovery",()=>{
  const h=harness();
  h.failImageWrites(1);
  assert.equal(h.send().errorCode,"internal_error");
  assert.equal(h.quota(),0);
  assert.equal(h.writes(),0);
  h.failJsonWrites(1);
  assert.equal(h.send().errorCode,"internal_error");
  assert.equal(h.quota(),1);
  h.corruptFirstImage();
  assert.equal(h.send().errorCode,"saved_image_mismatch");
  assert.equal(h.quota(),1);
  assert.equal(h.writes(),1);
});
test("Apps Script accepts decoded baseline/progressive JPEGs and checks the full marker stream",()=>{
  const context=vm.createContext({});
  vm.runInContext(readFileSync(new URL("../google-drive-training-ingest/Code.gs",import.meta.url),"utf8"),context);
  const validate=(bytes)=>context.assertCleanJpeg_([...bytes]);
  for(const sample of Object.values(jpegSamples)) assert.doesNotThrow(()=>validate(Buffer.from(sample,"base64")));
  const valid=Buffer.from(jpegSamples["RGB-baseline"],"base64");
  const progressive=Buffer.from(jpegSamples["RGB-progressive"],"base64");
  const metadata=Buffer.from([255,225,0,8,69,120,105,102,0,0]);
  const firstScan=valid.indexOf(Buffer.from([255,218]));
  const secondScan=progressive.indexOf(Buffer.from([255,218]),progressive.indexOf(Buffer.from([255,218]))+2);
  assert.ok(firstScan>0 && secondScan>0);
  for(const bad of [
    Buffer.from([255,216,255,218,0,2,255,217]),
    valid.subarray(0,valid.length-2),
    Buffer.concat([valid,Buffer.from("trailing private data")]),
    Buffer.concat([valid.subarray(0,2),metadata,valid.subarray(2)]),
    // APP1 after the entropy scan must be rejected, not skipped by an early
    // return at SOS. Progressive scans can likewise contain later markers.
    Buffer.concat([valid.subarray(0,valid.length-2),metadata,valid.subarray(valid.length-2)]),
    Buffer.concat([progressive.subarray(0,progressive.length-2),metadata,progressive.subarray(progressive.length-2)]),
    Buffer.concat([progressive.subarray(0,secondScan),metadata,progressive.subarray(secondScan)]),
    Buffer.concat([valid.subarray(0,firstScan+2+valid.readUInt16BE(firstScan+2)),valid.subarray(valid.length-2)]),
  ]) assert.throws(()=>validate(bad),/invalid_jpeg|image_metadata_not_removed/);
  const dimensions=Buffer.from(valid);
  const sof=dimensions.indexOf(Buffer.from([255,192]));
  assert.ok(sof>0);
  dimensions.writeUInt16BE(65535,sof+5);
  dimensions.writeUInt16BE(65535,sof+7);
  assert.throws(()=>validate(dimensions),/invalid_jpeg/);
  const brokenBoundary=Buffer.from(valid);
  brokenBoundary.writeUInt16BE(65535,4);
  assert.throws(()=>validate(brokenBoundary),/invalid_jpeg/);
  const noFrame=Buffer.concat([valid.subarray(0,sof),valid.subarray(sof+2+valid.readUInt16BE(sof+2))]);
  assert.throws(()=>validate(noFrame),/invalid_jpeg/);
});
test("Apps Script verifies the OAuth client and email scope without requiring profile scope",()=>{
  const source=readFileSync(new URL("../google-drive-training-ingest/Code.gs", import.meta.url),"utf8");
  const clientId="660995834538-7bg97is2n8emvfnc365i12c3earac8pq.apps.googleusercontent.com";
  const verify=(tokenInfo)=>{
    const context=vm.createContext({UrlFetchApp:{fetch:(url)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes("tokeninfo")?tokenInfo:{sub:"test-subject",email_verified:true})})}});
    vm.runInContext(source,context);
    return context.verifyGoogleAccount_("synthetic-token");
  };
  assert.equal(verify({audience:clientId,scope:"https://www.googleapis.com/auth/userinfo.email"}).sub,"test-subject");
  assert.equal(verify({issued_to:clientId,scope:"openid email profile"}).sub,"test-subject");
  assert.equal(verify({aud:clientId,azp:clientId,scope:"openid https://www.googleapis.com/auth/userinfo.email",expires_in:"3599",sub:"test-subject"}).sub,"test-subject");
  assert.equal(verify({aud:clientId,scope:"email"}).sub,"test-subject");
  assert.throws(()=>verify({issued_to:"another-client",scope:"openid email profile"}),/wrong_google_client/);
  assert.throws(()=>verify({aud:clientId,azp:"another-client",scope:"email"}),/wrong_google_client/);
  assert.throws(()=>verify({scope:"email"}),/wrong_google_client/);
  assert.throws(()=>verify({aud:clientId,scope:"email",expires_in:0}),/invalid_google_token/);
  assert.throws(()=>verify({aud:clientId,scope:"email",sub:"another-user"}),/invalid_google_token/);
  assert.throws(()=>verify({issued_to:clientId,scope:"profile"}),/missing_email_scope/);
});
test("embedding head preserves baseline on any contract mismatch",()=>{
  const p=[.4,.6],x=Array(512).fill(0);x[0]=1;
  const model={schemaVersion:2,status:"trained",contract:CLIP_FEATURE_CONTRACT,labelIds:["a","b"],clipLabels:["A","B"],weights:[Array(512).fill(0),Array(512).fill(0)],biases:[1,0]};
  assert.ok(applyEmbeddingCalibration(p,x,["a","b"],["A","B"],model)[0]>.5);
  assert.deepEqual(applyEmbeddingCalibration(p,x,["b","a"],["A","B"],model),p);
});

test("Python training head and browser head give the same probabilities",()=>{
  const x=Array(512).fill(0);x[7]=1;
  const p=[.2,.8];
  const model={schemaVersion:2,status:"trained",contract:CLIP_FEATURE_CONTRACT,labelIds:["rice","natto"],clipLabels:["rice","natto"],weights:[Array(512).fill(.1),Array(512).fill(-.15)],biases:[.2,-.1]};
  const python = execFileSync("python3",["-B","-c", "import sys,json; sys.path.insert(0,'scripts/food-ai/streaming'); from hybrid import predict; v=json.load(sys.stdin); print(json.dumps(predict([{'embedding':v['x'],'scores':v['p'],'confirmedFoodId':'rice'}],['rice','natto'],v['model']).tolist()[0]))"],{input:JSON.stringify({x,p,model}),encoding:"utf8",env:{...process.env,PYTHONDONTWRITEBYTECODE:"1",OPENBLAS_NUM_THREADS:"1"}});
  const expected=JSON.parse(python);
  const actual=applyEmbeddingCalibration(p,x,["rice","natto"],["rice","natto"],model);
  actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-12));
});
