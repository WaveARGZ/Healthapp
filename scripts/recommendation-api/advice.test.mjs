import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { initializeCloudflareBudgetStore, createCloudflareBudgetStore } from "./cloudflare-budget-store.ts";
import { reserveCumulativeBudget } from "./cumulative-budget.ts";
import { initializeAdviceBudget, reserveAdvice, settleAdvice, adviceBudget, CALL_HOLD_MICROS } from "./advice-budget.ts";
import { BodyMakeRecommendationBudget, creditConfiguration } from "./advice-worker.ts";
import { createAdviceProvider, verifyAdviceConnection, checkedUsage, ADVICE_MODEL, advicePayload } from "./advice-provider.ts";
import { summarizeAdviceRecords } from "../../lib/advice/summary.ts";

const NOW = Date.parse("2026-11-23T04:00:00Z");
const input = () => summarizeAdviceRecords({ profile: { age: 30, goal: "maintain" }, meals: [], workouts: [], preferences: {} }, "2026-11-23");
const advice = () => ({ summary: "記録を増やして無理なく続けましょう。", meal: { title: "ごはんと魚の定食", foods: ["ごはん小茶碗1杯（調整できる例）", "焼き魚と野菜"], reason: "食事記録がまだないので一般的な組み合わせです。" }, workout: { title: "軽く動く日", exercises: [{ name: "ウォーキング", amount: "無理のないペースで10分を目安に" }], reason: "完了した運動記録はありません。" }, recovery: "疲れがある日は休息を優先してください。", missing: ["今日食べたものを記録してください。"] });
const account = { organization: "org-synthetic", project: "proj_synthetic" };
const env = () => ({ BODYMAKE_ADVICE_ENABLED: "true", CREDIT_ALLOCATION_MICROS: "99000000", CREDIT_VERIFIED_AT: new Date(NOW).toISOString(), CREDIT_VALID_UNTIL: "2026-12-01T00:00:00Z", CREDIT_NO_ADDITIONAL_CHARGE_CONFIRMED: "true", SUBJECT_HMAC_KEY: "a".repeat(64), OPENAI_ORGANIZATION_ID: account.organization, OPENAI_PROJECT_ID: account.project });
const call = () => ({ id: randomUUID(), subject: "a".repeat(64), input: "b".repeat(64) });
class MemoryStorage {
  constructor(t) {
    this.db = new DatabaseSync(":memory:"); this.db.exec("PRAGMA temp_store=MEMORY"); t.after(()=>this.db.close()); this.failSync = false;
    this.sql = { exec: (q,...b)=>({toArray:()=>this.db.prepare(q).all(...b)}) };
  }
  transactionSync(fn) { this.db.exec("BEGIN"); try { const v=fn(); this.db.exec("COMMIT"); return v; } catch(e) {this.db.exec("ROLLBACK");throw e;} }
  async sync() { if(this.failSync)throw new Error("synthetic acknowledgement failure"); }
}
async function store(t, allowance=99000000) { const s=new MemoryStorage(t);await initializeCloudflareBudgetStore(s);await initializeAdviceBudget(s,allowance);return s; }
const request = (body={requestId:randomUUID(),transferConsent:true,input:input()},path="/advice",origin="https://healthapp-14a3f.web.app") => new Request("https://worker.invalid"+path,{method:path==="/session"?"GET":"POST",headers:{Origin:origin,Authorization:"Bearer synthetic","Content-Type":"application/json"},...(path!=="/session"?{body:JSON.stringify(body)}:{})});

test("unverified, stale, expired or additional-charge billing is rejected (never assume $100)",()=>{
  assert.equal(creditConfiguration(env(),NOW),99000000);
  for(const e of [{}, {...env(),CREDIT_NO_ADDITIONAL_CHARGE_CONFIRMED:"false"},{...env(),CREDIT_VERIFIED_AT:"2026-11-20T00:00:00Z"},{...env(),CREDIT_VALID_UNTIL:"2026-11-23T00:00:00Z"},{...env(),CREDIT_ALLOCATION_MICROS:""}]) assert.throws(()=>creditConfiguration(e,NOW));
});
test("missing/corrupt legacy journals never create a fresh allowance",async t=>{
  const s=new MemoryStorage(t);await assert.rejects(initializeAdviceBudget(s,99000000));
  assert.equal(s.db.prepare("SELECT count(*) n FROM sqlite_master").get().n,0);
});
test("migration retains previous reservations and cannot be repeated",async t=>{
  const s=new MemoryStorage(t);await initializeCloudflareBudgetStore(s);
  await reserveCumulativeBudget(createCloudflareBudgetStore(s),{requestId:randomUUID(),subjectHash:"a".repeat(64),inputHash:"b".repeat(64),upperBoundMicros:500000});
  const before=s.db.prepare("SELECT * FROM bodymake_recommendation_budget_reservations").all();
  await initializeAdviceBudget(s,99000000);assert.equal(adviceBudget(s).estimatedMicros,500000);
  assert.deepEqual(s.db.prepare("SELECT * FROM bodymake_recommendation_budget_reservations").all(),before);
  await assert.rejects(initializeAdviceBudget(s,99000000));
});
test("$10 triggers an alert and DOES NOT stop further usage within verified credits",async t=>{
  const s=await store(t);
  for(let i=0;i<40;i++){const c=call();await reserveAdvice(s,c,NOW+i*86400001);await settleAdvice(s,c.id,{costMicros:250000,inputTokens:922000,outputTokens:1800});}
  const b=adviceBudget(s);assert.equal(b.estimatedMicros,10000000);assert.equal(b.alert,true);assert.equal(b.stopped,false);
  await reserveAdvice(s,call(),NOW+41*86400001);
});
test("confirmed allocation cannot be overspent, including concurrent or repeated requests",async t=>{
  const s=await store(t,500000);const c=call();
  const attempts=await Promise.allSettled([reserveAdvice(s,c,NOW),reserveAdvice(s,c,NOW)]);assert.equal(attempts.filter(a=>a.status==="fulfilled").length,1);
  await assert.rejects(reserveAdvice(s,call(),NOW));
  await settleAdvice(s,c.id,{costMicros:250000,inputTokens:922000,outputTokens:1800});
  const next=call();await reserveAdvice(s,next,NOW+60000);await settleAdvice(s,next.id,{costMicros:250000,inputTokens:922000,outputTokens:1800});
  assert.equal(adviceBudget(s).remainingMicros,0);await assert.rejects(reserveAdvice(s,call(),NOW+120000));
});
test("unknown outcome or lost durable acknowledgement retains the hold and blocks a restarted process",async t=>{
  const s=await store(t);s.failSync=true;await assert.rejects(reserveAdvice(s,call(),NOW));s.failSync=false;
  assert.equal(adviceBudget(s).pending,true);assert.equal(adviceBudget(s).heldMicros,CALL_HOLD_MICROS);
  await assert.rejects(reserveAdvice(s,call(),NOW+86400000));
});
test("provider usage is bounded; cache-write premium and long inputs are accounted conservatively",()=>{
  const response={model:ADVICE_MODEL,service_tier:"default",usage:{input_tokens:1000,output_tokens:100,total_tokens:1100}};
  assert.equal(checkedUsage(response).costMicros,175);
  for(const overrides of [{model:"other"},{service_tier:"priority"},{usage:{input_tokens:1000,output_tokens:1801,total_tokens:2801}},{usage:{input_tokens:1000,output_tokens:1,total_tokens:9}}])assert.throws(()=>checkedUsage({...response,...overrides}));
});
test("one fixed Responses request, no storage/tools/retry; schema and usage validated",async()=>{
  let calls=0;
  const provider=createAdviceProvider("synthetic-openai-key",account,async(url,init)=>{
    calls++;assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(init.redirect,"manual");
    assert.equal(init.headers["OpenAI-Organization"],account.organization);assert.equal(init.headers["OpenAI-Project"],account.project);
    const payload=JSON.parse(init.body);assert.equal(payload.store,false);assert.equal(payload.tools,undefined);assert.equal(payload.model,ADVICE_MODEL);
    return new Response(JSON.stringify({model:ADVICE_MODEL,service_tier:"default",status:"completed",usage:{input_tokens:1000,output_tokens:500,total_tokens:1500},output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(advice())}]}]}),{headers:{"Content-Type":"application/json","openai-organization":account.organization}});
  },()=>NOW);
  const result=await provider(input());assert.deepEqual(result.advice,advice());assert.equal(result.usage.costMicros,375);assert.equal(calls,1);
  assert.equal(advicePayload(input()).text.format.strict,true);
});
test("provider timeout includes a stalled body and never retries",async()=>{
  let calls=0;const provider=createAdviceProvider("synthetic-openai-key",account,async()=>{calls++;return new Response(new ReadableStream({start(){}}),{headers:{"Content-Type":"application/json","openai-organization":account.organization}});},()=>NOW,10);
  await assert.rejects(provider(input()),/provider_timeout/);assert.equal(calls,1);
});
test("provider rejects redirects without forwarding credentials or retrying",async()=>{
  let calls=0;const provider=createAdviceProvider("synthetic-openai-key",account,async(url,init)=>{
    calls++;assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(init.redirect,"manual");
    return new Response(null,{status:307,headers:{Location:"https://untrusted.invalid"}});
  },()=>NOW);
  await assert.rejects(provider(input()),/provider_failed/);assert.equal(calls,1);
});
test("worker rejects missing consent, wrong origin, disabled API and failed auth without paid work",async t=>{
  const s=await store(t);let calls=0;
  const deps={verifyAuthorization:async()=>({uid:"synthetic-owner"}),now:()=>NOW,provider:async()=>{calls++;return{advice:advice(),usage:{costMicros:100,inputTokens:100,outputTokens:100}};}};
  const worker=new BodyMakeRecommendationBudget({storage:s},env(),deps);
  assert.equal((await worker.fetch(request({...JSON.parse(await request().text()),transferConsent:false}))).status,403);
  assert.equal((await worker.fetch(request(undefined,"/advice","https://attacker.invalid"))).status,403);
  const disabled=new BodyMakeRecommendationBudget({storage:s},{...env(),BODYMAKE_ADVICE_ENABLED:"false"},deps);
  assert.equal((await disabled.fetch(request())).status,503);
  const denied=new BodyMakeRecommendationBudget({storage:s},env(),{...deps,verifyAuthorization:async()=>{throw new Error("invalid token");}});
  assert.equal((await denied.fetch(request())).status,503);assert.equal(calls,0);
});
test("one valid call settles usage without storing meal data, tokens, UID or response text",async t=>{
  const s=await store(t);let calls=0;const worker=new BodyMakeRecommendationBudget({storage:s},env(),{verifyAuthorization:async()=>({uid:"PRIVATE_UID"}),now:()=>NOW,provider:async()=>{calls++;return{advice:advice(),usage:{costMicros:100,inputTokens:100,outputTokens:100}};}});
  const r=request();const duplicate=r.clone();const response=await worker.fetch(r);assert.equal(response.status,200);assert.equal((await response.json()).budget.estimatedMicros,100);
  assert.equal((await worker.fetch(duplicate)).status,409);assert.equal(calls,1);
  const saved=JSON.stringify(s.db.prepare("SELECT * FROM bodymake_advice_calls_v2").all());assert.ok(!saved.includes("PRIVATE_UID"));assert.ok(!saved.includes("synthetic"));assert.ok(!saved.includes("ごはん"));
});
test("stale credits, missing billing project or failed durable save prevent ALL paid calls",async t=>{
  const s=await store(t);let calls=0;
  const deps={verifyAuthorization:async()=>({uid:"synthetic-owner"}),now:()=>NOW,provider:async()=>{calls++;return{advice:advice(),usage:{costMicros:100,inputTokens:100,outputTokens:100}};}};
  for(const overrides of [{CREDIT_VERIFIED_AT:"2026-11-01T00:00:00Z"},{OPENAI_PROJECT_ID:""},{OPENAI_ORGANIZATION_ID:""},{CREDIT_NO_ADDITIONAL_CHARGE_CONFIRMED:"false"}]) {
    const worker=new BodyMakeRecommendationBudget({storage:s},{...env(),...overrides},deps);
    assert.equal((await worker.fetch(request())).status,503);
    assert.equal(adviceBudget(s).heldMicros,0);
  }
  s.failSync=true;
  const worker=new BodyMakeRecommendationBudget({storage:s},env(),deps);
  assert.equal((await worker.fetch(request())).status,503);assert.equal(calls,0);assert.equal(adviceBudget(s).pending,true);
});
test("unknown provider outcome blocks subsequent paid requests even after restart",async t=>{
  const s=await store(t);let calls=0;
  const deps={verifyAuthorization:async()=>({uid:"synthetic-owner"}),now:()=>NOW,provider:async()=>{calls++;throw new Error("unknown result");}};
  assert.equal((await new BodyMakeRecommendationBudget({storage:s},env(),deps).fetch(request())).status,503);
  assert.equal((await new BodyMakeRecommendationBudget({storage:s},env(),deps).fetch(request())).status,503);
  assert.equal(calls,1);assert.equal(adviceBudget(s).pending,true);
});
test("unexpected billing organization or expired prices are never silently accepted",async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return Response.json({},{headers:{"openai-organization":"org-different"}});};
  await assert.rejects(createAdviceProvider("synthetic-openai-key",account,fetcher,()=>NOW)(input()),/provider_cost_unconfirmed/);
  assert.equal(calls,1);
  await assert.rejects(createAdviceProvider("synthetic-openai-key",account,fetcher,()=>Date.parse("2026-12-24"))(input()),/pricing_review_required/);
  assert.equal(calls,1);
});

test("connection preflight only reads fixed model metadata with the verified account",async()=>{
  let calls=0;
  const result=await verifyAdviceConnection("synthetic-openai-key",account,async(url,init)=>{
    calls++;assert.equal(url,`https://api.openai.com/v1/models/${ADVICE_MODEL}`);
    assert.equal(init.method,"GET");assert.equal(init.body,undefined);assert.equal(init.redirect,"manual");
    assert.equal(init.headers["OpenAI-Organization"],account.organization);assert.equal(init.headers["OpenAI-Project"],account.project);
    return Response.json({id:ADVICE_MODEL,object:"model"},{headers:{"openai-organization":account.organization}});
  });
  assert.deepEqual(result,{model:ADVICE_MODEL,accountMatched:true,inferencePerformed:false});assert.equal(calls,1);
});
test("preflight rejects wrong accounts, bad metadata, redirects and stalled bodies without retry",async()=>{
  const cases=[
    ()=>Response.json({id:ADVICE_MODEL,object:"model"},{headers:{"openai-organization":"org-other"}}),
    ()=>Response.json({id:"different",object:"model"},{headers:{"openai-organization":account.organization}}),
    ()=>new Response("",{status:302,headers:{Location:"https://untrusted.invalid"}}),
    ()=>new Response(" ".repeat(8193),{headers:{"content-type":"application/json","openai-organization":account.organization}}),
    ()=>new Response(new ReadableStream({start(){}}),{headers:{"content-type":"application/json","openai-organization":account.organization}}),
  ];
  for(const response of cases){let calls=0;await assert.rejects(verifyAdviceConnection("synthetic-openai-key",account,async()=>{calls++;return response();},10));assert.equal(calls,1);}
});
test("preflight diagnostics never return upstream messages or arbitrary error codes",async()=>{
  for(const [code,expected] of [["invalid_api_key","provider_invalid_api_key"],["synthetic-private-value","provider_http_401"]]) {
    await assert.rejects(verifyAdviceConnection("synthetic-openai-key",account,async()=>Response.json({error:{code,message:"Do not echo synthetic-private-value"}},{status:401})),e=>e.code===expected&&!String(e).includes("synthetic-private-value"));
  }
  await assert.rejects(verifyAdviceConnection("synthetic-openai-key",account,async()=>Response.json({error:{code:null,message:"OpenAI-Project mismatch synthetic-private-value"}},{status:401})),e=>e.code==="provider_http_401_project"&&!String(e).includes("synthetic-private-value"));
});
test("admin connection check requires explicit disabled state and cannot touch budget or inference",async t=>{
  const s=new MemoryStorage(t);let checks=0;
  const deps={now:()=>NOW,verifyAuthorization:async()=>{throw Error("user auth must not be used for metadata");},provider:async()=>{throw Error("no inference");},verifyConnection:async(key,scope)=>{
    assert.equal(key,"synthetic-openai-key");assert.deepEqual(scope,account);checks++;return {model:ADVICE_MODEL,accountMatched:true,inferencePerformed:false};
  }};
  const config={...env(),BODYMAKE_ADVICE_ENABLED:"false",OPENAI_API_KEY:"synthetic-openai-key",INITIALIZE_SECRET:"c".repeat(64)};
  const req=(secret="c".repeat(64),origin="https://healthapp-14a3f.web.app")=>new Request("https://worker.invalid/admin/provider-check",{headers:{Origin:origin,Authorization:"Bearer "+secret}});
  const worker=new BodyMakeRecommendationBudget({storage:s},config,deps);
  assert.equal((await worker.fetch(req("invalid"))).status,401);
  assert.equal((await worker.fetch(req(undefined,"https://untrusted.invalid"))).status,403);
  for(const state of [undefined,"true"]){assert.equal((await new BodyMakeRecommendationBudget({storage:s},{...config,BODYMAKE_ADVICE_ENABLED:state},deps).fetch(req())).status,503);}
  assert.equal(checks,0);
  const r=await worker.fetch(req());assert.equal(r.status,200);assert.equal((await r.json()).connection.inferencePerformed,false);assert.equal(checks,1);
  assert.equal(s.db.prepare("SELECT count(*) n FROM sqlite_master").get().n,0);
});
