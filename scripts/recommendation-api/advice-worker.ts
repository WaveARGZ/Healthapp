import { createFirebaseOwnerVerifier, FirebaseAuthError } from "./firebase-auth.ts";
import { AdviceBudgetError, adviceBudget, initializeAdviceBudget, reserveAdvice, settleAdvice } from "./advice-budget.ts";
import { createAdviceProvider, verifyAdviceConnection, validateOpenAiAccount, AdviceApiError, apiFail, type AdviceProvider } from "./advice-provider.ts";
import type { CloudflareSqliteStorage } from "./cloudflare-budget-store.ts";
import { object, validateAdviceInput } from "../../lib/advice/contracts.ts";

// KEEP this identity: it contains the previous $5 ledger, which must never be reset.
export const GLOBAL_RECOMMENDATION_BUDGET_NAME = "lifetime-usd5-v1";
const ORIGINS = new Set(["https://healthapp-14a3f.web.app", "https://healthapp-14a3f.firebaseapp.com"]);
type Namespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
export interface AdviceEnvironment {
  RECOMMENDATION_BUDGET?: Namespace;
  BODYMAKE_ADVICE_ENABLED?: string;
  OPENAI_API_KEY?: string; OWNER_UID?: string; FIREBASE_WEB_API_KEY?: string; SUBJECT_HMAC_KEY?: string;
  INITIALIZE_SECRET?: string;
  // Set only from an actual billing audit of the SAME organization/project as the stored key.
  CREDIT_ALLOCATION_MICROS?: string; CREDIT_VERIFIED_AT?: string; CREDIT_VALID_UNTIL?: string;
  CREDIT_NO_ADDITIONAL_CHARGE_CONFIRMED?: string;
  OPENAI_ORGANIZATION_ID?: string; OPENAI_PROJECT_ID?: string; OPENAI_RESPONSE_ORGANIZATION?: string;
}
function openAiAccount(e: AdviceEnvironment) {
  return { organization: e.OPENAI_ORGANIZATION_ID ?? "", project: e.OPENAI_PROJECT_ID ?? "", ...(e.OPENAI_RESPONSE_ORGANIZATION ? {responseOrganization:e.OPENAI_RESPONSE_ORGANIZATION} : {}) };
}
type Dependencies = { verifyAuthorization?: (value: string | null) => Promise<{ uid: string }>; provider?: AdviceProvider; verifyConnection?: typeof verifyAdviceConnection; now?: () => number };
const methods: Record<string, string> = { "/health": "GET", "/session": "GET", "/advice": "POST", "/admin/credit-init": "POST", "/admin/budget": "GET", "/admin/provider-check": "GET" };
const statuses: Record<string, number> = { not_found:404, method_not_allowed:405, origin_not_allowed:403, admin_required:401, invalid_request:400, json_required:415, request_too_large:413, request_timeout:408, duplicate_request:409, budget_already_initialized:409, credit_exhausted:429, rate_limited:429, request_in_progress:429, consent_required:403 };
function fail(code: string): never { return apiFail(code, statuses[code] ?? 503); }
function reply(r: Request, status: number, body: unknown) {
  const headers = new Headers({ "Content-Type":"application/json", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", Vary:"Origin" });
  const origin = r.headers.get("Origin"); if (origin && ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}
function safeError(r: Request, e: unknown) {
  if (e instanceof AdviceApiError || e instanceof FirebaseAuthError) return reply(r,e.status,{error:e.code});
  if (e instanceof AdviceBudgetError) return reply(r,statuses[e.code]??503,{error:e.code});
  return reply(r,503,{error:"service_unavailable"});
}
function route(r: Request) {
  const u = new URL(r.url); const origin = r.headers.get("Origin");
  if (u.protocol !== "https:" || !origin || !ORIGINS.has(origin)) fail("origin_not_allowed");
  if (u.search || u.hash || !Object.hasOwn(methods,u.pathname)) fail("not_found");
  if (r.method === "OPTIONS") {
    const headers=(r.headers.get("Access-Control-Request-Headers")??"").toLowerCase().split(",").map(x=>x.trim()).filter(Boolean);
    if (r.headers.get("Access-Control-Request-Method")!==methods[u.pathname] || headers.some(h=>!["content-type","authorization"].includes(h))) fail("origin_not_allowed");
    return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":methods[u.pathname],"Access-Control-Allow-Headers":"Authorization, Content-Type","Cache-Control":"no-store",Vary:"Origin"}});
  }
  if (r.method!==methods[u.pathname]) fail("method_not_allowed"); return u.pathname;
}
async function readJson(r: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(r.headers.get("Content-Type")??"") || r.headers.has("Content-Encoding")) fail("json_required");
  if (!r.body || Number(r.headers.get("Content-Length")??0)>32768) fail("request_too_large");
  const reader=r.body.getReader(); let timer:ReturnType<typeof setTimeout>|undefined;
  try { return await Promise.race([
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>undefined);reject(new AdviceApiError("request_timeout",408));},5000);}),
    (async()=>{ let text="";let size=0;const d=new TextDecoder("utf-8",{fatal:true});
      while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>32768)fail("request_too_large");text+=d.decode(c.value,{stream:true});}
      text+=d.decode();try{return JSON.parse(text);}catch{return fail("invalid_request");}
    })(),
  ]); } finally {if(timer)clearTimeout(timer);void reader.cancel().catch(()=>undefined);}
}
function admin(r:Request,e:AdviceEnvironment) {
  if (!e.INITIALIZE_SECRET || !/^[a-f0-9]{64}$/.test(e.INITIALIZE_SECRET)) fail("admin_required");
  const wanted="Bearer "+e.INITIALIZE_SECRET, actual=r.headers.get("Authorization")??"";
  if(actual.length!==wanted.length)fail("admin_required");let diff=0;for(let i=0;i<wanted.length;i++)diff|=actual.charCodeAt(i)^wanted.charCodeAt(i);if(diff)fail("admin_required");
}
/** Missing billing evidence is never treated as $100 of available credits. */
export function creditConfiguration(e:AdviceEnvironment,now:number) {
  validateOpenAiAccount(openAiAccount(e));
  const verified=Date.parse(e.CREDIT_VERIFIED_AT??""),until=Date.parse(e.CREDIT_VALID_UNTIL??"");
  const allowance=Number(e.CREDIT_ALLOCATION_MICROS);
  if(e.CREDIT_NO_ADDITIONAL_CHARGE_CONFIRMED!=="true" || !Number.isFinite(verified) || verified>now || now-verified>86400000
    || !Number.isFinite(until) || until<=now || !Number.isSafeInteger(allowance) || allowance<1 || allowance>100000000)fail("credit_not_verified");
  return allowance;
}
async function hash(value:string,secret?:string) {
  const bytes=new TextEncoder().encode(value);
  const result=secret ? await crypto.subtle.sign("HMAC",await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]),bytes) : await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export class BodyMakeRecommendationBudget {
  private busy=false;
  private storage:CloudflareSqliteStorage;private env:AdviceEnvironment;private deps:Dependencies;
  private verify:(value:string|null)=>Promise<{uid:string}>;
  constructor(ctx:{storage:CloudflareSqliteStorage},env:AdviceEnvironment,deps:Dependencies={}) {
    this.storage=ctx.storage;this.env=env;this.deps=deps;
    this.verify=deps.verifyAuthorization??createFirebaseOwnerVerifier({ownerUid:env.OWNER_UID,firebaseApiKey:env.FIREBASE_WEB_API_KEY});
  }
  async fetch(r:Request):Promise<Response> {
    try {
      const path=route(r);if(path instanceof Response)return path;
      if(path==="/health")return reply(r,200,{service:"bodymake-home-advice",enabled:this.env.BODYMAKE_ADVICE_ENABLED==="true"});
      const now=this.deps.now?.()??Date.now();
      if(path.startsWith("/admin/")) {
        admin(r,this.env);
        if(path==="/admin/provider-check") {
          if(this.env.BODYMAKE_ADVICE_ENABLED!=="false")fail("initialization_not_allowed");
          const connection=await (this.deps.verifyConnection??verifyAdviceConnection)(this.env.OPENAI_API_KEY??"",openAiAccount(this.env));
          return reply(r,200,{connection});
        }
        if(path==="/admin/credit-init") {
          if(this.env.BODYMAKE_ADVICE_ENABLED==="true")fail("initialization_not_allowed");
          const body=await readJson(r);if(!object(body)||Object.keys(body).length)fail("invalid_request");
          await initializeAdviceBudget(this.storage,creditConfiguration(this.env,now));
        }
        return reply(r,200,{budget:adviceBudget(this.storage)});
      }
      const identity=await this.verify(r.headers.get("Authorization"));
      if(this.env.BODYMAKE_ADVICE_ENABLED!=="true")return reply(r,503,{error:"credit_not_verified"});
      const allocation=creditConfiguration(this.env,now);
      const budget=adviceBudget(this.storage);
      if(budget.limitMicros!==allocation)fail("credit_not_verified");
      if(path==="/session")return reply(r,200,{budget});
      if(this.busy)fail("request_in_progress");
      this.busy=true;
      try {
        const body=await readJson(r);
        if(!object(body)||Object.keys(body).length!==3||!Object.hasOwn(body,"requestId")||!Object.hasOwn(body,"input")||!Object.hasOwn(body,"transferConsent"))fail("invalid_request");
        if(body.transferConsent!==true)fail("consent_required");
        if(typeof body.requestId!=="string"||!this.env.SUBJECT_HMAC_KEY||!/^[a-f0-9]{64}$/.test(this.env.SUBJECT_HMAC_KEY))fail("configuration_required");
        let input;try{input=validateAdviceInput(body.input);}catch{return fail("invalid_request");}
        if(Math.abs(Date.parse(input.date)-now)>2*86400000)fail("invalid_request");
        if(!this.env.OPENAI_API_KEY && !this.deps.provider)fail("configuration_required");
        const subject=await hash(identity.uid,this.env.SUBJECT_HMAC_KEY),inputHash=await hash(JSON.stringify(input));
        await reserveAdvice(this.storage,{id:body.requestId,subject,input:inputHash},now);
        const result=await (this.deps.provider??createAdviceProvider(this.env.OPENAI_API_KEY!, openAiAccount(this.env)))(input);
        await settleAdvice(this.storage,body.requestId,result.usage);
        const updated=adviceBudget(this.storage);
        return reply(r,result.advice?200:502,result.advice?{advice:result.advice,budget:updated}:{error:"provider_bad_output",budget:updated});
      }finally{this.busy=false;}
    }catch(e){return safeError(r,e);}
  }
}
const worker = {
  async fetch(r:Request,e:AdviceEnvironment):Promise<Response> {
    try {
      const path=route(r);if(path instanceof Response)return path;
      if(path==="/health")return reply(r,200,{service:"bodymake-home-advice",enabled:e.BODYMAKE_ADVICE_ENABLED==="true"});
      if(typeof path === "string" && path.startsWith("/admin/"))admin(r,e);
      if(!e.RECOMMENDATION_BUDGET)fail("configuration_required");
      return await e.RECOMMENDATION_BUDGET.get(e.RECOMMENDATION_BUDGET.idFromName(GLOBAL_RECOMMENDATION_BUDGET_NAME)).fetch(r);
    }catch(error){return safeError(r,error);}
  },
};
export default worker;
