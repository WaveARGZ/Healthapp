import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAdviceRecords } from "../lib/advice/summary.ts";
import { eligibleExercises, validateAdviceInput } from "../lib/advice/contracts.ts";
import { openRecommendationIdentity } from "../lib/advice/identity.ts";
import { budgetFromError, generateAdvice } from "../lib/advice/client.ts";
const date="2026-11-23";
const records=()=>({profile:{id:"private",name:"PRIVATE_NAME",email:"private@example.invalid",age:30,goal:"maintain"},meals:[],workouts:[],preferences:{}});
test("unknown nutrition stays null while explicit 0 is retained; identifiers/photos excluded",()=>{
  const r=records();r.meals=[{id:"private",name:"お茶",recordedAt:date,calories:0,proteinG:0,photo:"PRIVATE_PHOTO"},{name:"昼食",recordedAt:date,calories:500,items:[{name:"ごはん",calories:300,proteinG:3},{name:"おかず"}]}];
  const s=summarizeAdviceRecords(r,date);assert.equal(s.days[6].meals[0].kcal,0);assert.equal(s.days[6].meals[0].fat,null);assert.equal(s.days[6].meals[1].kcal,null);
  const json=JSON.stringify(s);for(const value of ["PRIVATE_NAME","PRIVATE_PHOTO","private@example.invalid",'"id"'])assert.ok(!json.includes(value));
});
test("only completed sets within 7 days enter the summary; cardio minutes/km retained",()=>{
  const r=records();r.workouts=[{performedAt:date,exercises:[{name:"ベンチプレス",setRecords:[{completed:true,reps:10,weightKg:30},{completed:false,reps:20,weightKg:90}]},{name:"ウォーキング",setRecords:[{completed:true,durationMinutes:20,distanceKm:1.5}]}]},{performedAt:"2026-11-24",exercises:[]},{performedAt:"2026-11-01",exercises:[]}];
  const s=summarizeAdviceRecords(r,date);assert.equal(s.days.length,7);assert.equal(s.days[6].workouts[0].sets,1);assert.equal(s.days[6].workouts[0].kg,30);assert.equal(s.days[6].workouts[1].minutes,20);assert.equal(s.days[6].workouts[1].km,1.5);
});
test("gym equipment restrictions are preserved; absent equipment does not authorize machines",()=>{
  const r=records();r.preferences={isGymMember:true,facilityEquipment:["バーベル","ベンチ"]};const s=summarizeAdviceRecords(r,date);
  assert.ok(eligibleExercises(s).some(e=>e.name==="ベンチプレス"));assert.ok(!eligibleExercises(s).some(e=>e.name==="レッグプレス"));
  r.preferences.isGymMember=false;assert.ok(!eligibleExercises(summarizeAdviceRecords(r,date)).some(e=>e.name==="ベンチプレス"));
});
test("read failures cannot silently become an empty-history advice request; input bounds enforced",()=>{
  assert.throws(()=>summarizeAdviceRecords({...records(),meals:null},date));assert.throws(()=>summarizeAdviceRecords({...records(),workouts:[{}]},date));
  const s=summarizeAdviceRecords(records(),date);assert.throws(()=>validateAdviceInput({...s,email:"private@example.invalid"}));assert.throws(()=>validateAdviceInput({...s,date:"2026-02-30"}));
});
test("changing records between consent and send results in ZERO inference calls",async()=>{
  const preview=summarizeAdviceRecords(records(),date);let requests=0;const identity={uid:"synthetic",assertCurrent(){},getIdToken:async()=>"synthetic",dispose(){}};
  await assert.rejects(generateAdvice(identity,preview,async()=>({...preview,constraints:"changed"}),async()=>{requests++;throw new Error("must not be called");}),/records_changed/);assert.equal(requests,0);
});
test("account switches permanently invalidate the request, including a return to the original UID",async()=>{
  let uid="first",changed;let invalidations=0;
  const source={ready:async()=>{},currentUser:()=>({uid,getIdToken:async()=>"synthetic-token"}),subscribe:f=>{changed=f;return()=>{};}};
  const identity=await openRecommendationIdentity(()=>invalidations++,source);uid="second";changed(uid);uid="first";changed(uid);
  assert.throws(()=>identity.assertCurrent(),/recommendation_auth_changed/);await assert.rejects(identity.getIdToken());assert.equal(invalidations,1);
});
test("legacy repetitions are counted across all saved sets",()=>{
  const r=records();r.workouts=[{performedAt:date,exercises:[{name:"スクワット",reps:10,sets:3,weightKg:0}]}];
  const w=summarizeAdviceRecords(r,date).days[6].workouts[0];assert.equal(w.reps,30);assert.equal(w.sets,3);assert.equal(w.kg,0);
});
const identity=()=>({uid:"synthetic",assertCurrent(){},getIdToken:async()=>"synthetic-token",dispose(){}});
const updatedBudget={limitMicros:99000000,estimatedMicros:10000001,heldMicros:0,remainingMicros:88999999,stopped:false,pending:false,alert:true};
test("a rejected answer still delivers the $10 alert and never retries",async()=>{
  const preview=summarizeAdviceRecords(records(),date);let calls=0;
  await assert.rejects(generateAdvice(identity(),preview,async()=>preview,async(url,options)=>{
    calls++;assert.equal(url,"https://bodymake-recommendation-api.ajimo023.workers.dev/advice");assert.equal(options.redirect,"error");assert.equal(options.credentials,"omit");
    assert.equal(JSON.parse(options.body).transferConsent,true);
    return Response.json({error:"provider_bad_output",budget:updatedBudget},{status:502});
  }),e=>{assert.deepEqual(budgetFromError(e),updatedBudget);return e.message==="provider_bad_output";});
  assert.equal(calls,1);
});
test("invalid output retains usage while preventing it from being shown",async()=>{
  const preview=summarizeAdviceRecords(records(),date);
  await assert.rejects(generateAdvice(identity(),preview,async()=>preview,async()=>Response.json({advice:{malformed:true},budget:updatedBudget})),e=>{
    assert.deepEqual(budgetFromError(e),updatedBudget);return e.message==="provider_bad_output";
  });
});
test("a response cannot cross an account switch or leak the old budget",async()=>{
  const preview=summarizeAdviceRecords(records(),date);let current=true;const session=identity();session.assertCurrent=()=>{if(!current)throw new Error("recommendation_auth_changed");};
  await assert.rejects(generateAdvice(session,preview,async()=>preview,async()=>{current=false;return Response.json({error:"provider_bad_output",budget:updatedBudget},{status:502});}),e=>{
    assert.equal(budgetFromError(e),null);return e.message==="recommendation_auth_changed";
  });
});
test("oversized response bodies are rejected without another request",async()=>{
  const preview=summarizeAdviceRecords(records(),date);let calls=0;
  await assert.rejects(generateAdvice(identity(),preview,async()=>preview,async()=>{calls++;return Response.json({text:"x".repeat(65537)});}),/invalid_response/);
  assert.equal(calls,1);
});
