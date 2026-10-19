import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateTrainingReceipt } from "../../lib/drive/training-receipt.mjs";
import { applyEmbeddingCalibration, CLIP_FEATURE_CONTRACT } from "../../lib/food-ai/clip-features.mjs";

test("receipt must contain matching ID, full hash and both Drive IDs", () => {
  const receipt = { ok: true, id: "sample", imageSha256: "abc", imageFileId: "image-file-id", jsonFileId: "json-file-id" };
  assert.equal(validateTrainingReceipt(receipt, "sample", "abc").jsonFileId, "json-file-id");
  for (const value of [{ok:true}, {...receipt,id:"other"}, {...receipt,imageSha256:"different"}, {ok:false}]) assert.throws(() => validateTrainingReceipt(value, "sample", "abc"));
});

function harness() {
  let sequence = 0, writes = 0;
  const files = new Map();
  const iterator = (items) => ({ hasNext: () => items.length > 0, next: () => items.shift() });
  const blob = (data, type, name) => ({ data: Buffer.isBuffer(data) ? data : typeof data === "string" ? Buffer.from(data) : Buffer.from(data), name, getBytes() { return Array.from(this.data); }, getDataAsString() { return this.data.toString(); } });
  const folders = Object.fromEntries(["1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW", "app", "inbox"].map((id, i) => [id, {
    getId: () => id,
    getFoldersByName: (name) => iterator(name === "01_app_feedback" && i === 0 ? [folders.app] : name === "inbox" && i === 1 ? [folders.inbox] : []),
    getFilesByName: (name) => iterator([...files.values()].filter((f) => f.name === name)),
    createFile: (b) => { writes++; const f = { id: "file-identifier-" + (++sequence), name: b.name, getId() { return this.id; }, getBlob: () => b }; files.set(f.id, f); return f; },
  }]));
  let shared = false;
  const context = vm.createContext({
    Utilities: { base64Decode: (s) => [...Buffer.from(s,"base64")], newBlob: blob, DigestAlgorithm: {SHA_256:"sha256"},
      computeDigest: (_, data) => [...createHash("sha256").update(typeof data === "string" ? data : Buffer.from(data)).digest()],
      computeHmacSha256Signature: (s,key) => [...createHmac("sha256",key).update(s).digest()] },
    DriveApp: {getFolderById: (id) => folders[id], getFileById: (id) => files.get(id)},
    ScriptApp: {getOAuthToken: () => "not-a-real-token"},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => "test-secret"})},
    LockService: {getScriptLock: () => ({waitLock(){},hasLock:()=>true,releaseLock(){}})},
    CacheService: {getScriptCache:()=>({get:()=>null,put(){}})},
    ContentService: {MimeType:{JSON:"json"}, createTextOutput:(s)=>({setMimeType:()=>JSON.parse(s)})},
    UrlFetchApp: {fetch:(url)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({trashed:false, parents:[url.includes('/inbox?') ? 'app' : url.includes('/app?') ? '1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW' : 'inbox'],permissions:[{type:shared?'anyone':'user',role:shared?'reader':'owner'}]})})},
  });
  vm.runInContext(readFileSync(new URL("../google-drive-training-ingest/Code.gs", import.meta.url),"utf8"),context);
  vm.runInContext("verifyGoogleAccount_ = function() { return {sub:'test-account'}; }",context);
  const bytes=Buffer.from([255,216,255,218,0,2,255,217]);
  const payload={schemaVersion:2,id:"sample-id-123",imageBase64:bytes.toString("base64"),imageMimeType:"image/jpeg",imageSha256:createHash("sha256").update(bytes).digest("hex"),confirmedFoodName:"ご飯",confirmedFoodId:"rice",predictedFoodIds:["rice"],nutrition:{calories:100,proteinG:1,fatG:1,carbsG:20},createdAt:"2026-10-15T00:00:00Z",consent:{granted:true,version:"food-photo-training-v2",purpose:"food-recognition",at:"2026-10-15T00:00:00Z"}};
  return { send:(p=payload)=>context.doPost({postData:{contents:JSON.stringify({accessToken:"test-token",payload:p})}}), payload, writes:()=>writes, share:()=>{shared=true;} };
}

test("Apps Script confirms two saved files, retries are idempotent",()=>{
  const h=harness();const first=h.send();assert.equal(first.ok,true);assert.ok(first.imageFileId);assert.ok(first.jsonFileId);assert.equal(h.writes(),2);
  assert.equal(h.send().jsonFileId,first.jsonFileId);assert.equal(h.writes(),2);
  assert.equal(h.send({...h.payload,confirmedFoodName:"違う料理"}).ok,false);assert.equal(h.writes(),2);
});
test("Apps Script rejects missing consent, wrong hash, shared folders and old schema",()=>{
  const h=harness();
  for(const p of [{...h.payload,consent:{granted:false}},{...h.payload,imageSha256:"f".repeat(64)},{...h.payload,schemaVersion:1}]) assert.equal(h.send(p).ok,false);
  h.share();assert.equal(h.send().ok,false);assert.equal(h.writes(),0);
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
