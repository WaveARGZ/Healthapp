import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../../lib/workouts/use-timer-push.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function setup({ denied = false } = {}) {
  const state=[], refs=[], effects=[], pending=[], values=new Map(), updates=[];
  let stateAt=0, refAt=0, effectAt=0, subscriptions=0;
  const subscription={ endpoint:'https://web.push.apple.com/3/device/synthetic', async unsubscribe(){return true} };
  const registration={ pushManager:{ async subscribe(){subscriptions++;if(denied)throw Error('denied');return subscription},async getSubscription(){return subscription} } };
  const react={
    useState(initial){const i=stateAt++; if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},
    useRef(initial){return refs[refAt++]??={current:initial}}, useCallback(fn){return fn},
    useEffect(fn,deps){const i=effectAt++;if(!effects[i]||deps.some((v,j)=>!Object.is(v,effects[i].deps[j])))pending.push({i,fn,deps})}
  };
  const modules={react,'@/lib/auth/firebase-session':{currentFirebaseUser:async()=>({getIdToken:async()=> 'synthetic-token'})},'@/lib/firebase/config':{isFirebaseSelected:true},'@/lib/cloud/config':{isTestEnvironment:false}};
  const exports={};
  const key=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url');
  const fetch=async(url,options={})=>{if(url.endsWith('/v1/config'))return {ok:true,json:async()=>({publicKey:key})};updates.push(JSON.parse(options.body));return {ok:true}};
  vm.runInNewContext(source,{exports,require:id=>{assert.ok(Object.hasOwn(modules,id));return modules[id]},process:{env:{NEXT_PUBLIC_BODYMAKE_TIMER_PUSH_URL:'https://bodymake-timer-push.ajimo023.workers.dev'}},navigator:{serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},window:{PushManager:{}},sessionStorage:{getItem:key=>values.get(key)??null,setItem:(key,val)=>values.set(key,val)},crypto:globalThis.crypto,Uint8Array,atob,btoa,fetch,AbortSignal,Date,Promise});
  function render(timer){stateAt=refAt=effectAt=0;const result=exports.useTimerPush(timer);for(const p of pending.splice(0)){effects[p.i]?.cleanup?.();effects[p.i]={deps:p.deps,cleanup:p.fn()}}return result}
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {render,settle,updates,subscriptions:()=>subscriptions};
}
const stopped={rest:true,running:false,startedAt:null,durationMs:90000,elapsed:0};
test('user enables notifications, then start and pause reserve and cancel',async()=>{
  const h=setup();h.render(stopped);await h.settle();let view=h.render(stopped);assert.equal(view.status,'ready');await view.enable();assert.equal(h.subscriptions(),1);h.render(stopped);await h.settle();h.render(stopped);
  const start={...stopped,running:true,startedAt:Date.now()};h.render(start);await h.settle();view=h.render(start);assert.equal(view.status,'scheduled');assert.equal(h.updates.at(-1).kind,'schedule');assert.ok(h.updates.at(-1).deadline>start.startedAt);
  h.render({...stopped,elapsed:2000});await h.settle();view=h.render({...stopped,elapsed:2000});assert.equal(h.updates.at(-1).kind,'cancel');assert.equal(view.status,'enabled');
  const versions=h.updates.map(x=>x.version);assert.ok(versions.every((v,i)=>i===0||v>versions[i-1]));
});
test('permission refusal never schedules a notification',async()=>{
  const h=setup({denied:true});h.render(stopped);await h.settle();const view=h.render(stopped);await view.enable();h.render(stopped);await h.settle();assert.equal(h.render(stopped).status,'failed');assert.equal(h.updates.length,0);
});
