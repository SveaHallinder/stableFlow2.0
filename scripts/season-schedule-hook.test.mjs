import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../hooks/useSeasonSchedule.ts',import.meta.url),'utf8');
const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),get resolve(){return resolve;}};};
const U='owner',S='stable-a';
const period={id:'period',stableId:S,name:'Vinter',dateFrom:'2099-11-01',dateTo:'2100-04-30',revision:2,generationRevision:1,status:'generating'};
function fixture() {
 let active, renders;
 const syncCalls=[], syncReplies=[], reads=[], saved=deferred();
 const bundle={periods:[{...period,status:'ready',revision:1}],templates:[{id:'template',periodId:period.id}],rules:[]};
 const sync=async(...args)=>{syncCalls.push(args);return syncReplies.shift()??{success:true};};
 const api={loadSeasonSchedule:async()=> reads.length?reads.shift():{success:true,data:bundle},saveSeasonPeriod:()=>saved.promise};
 const react={
  useState:initial=>active.state(initial),useRef:initial=>active.ref(initial),
  useMemo:(fn,deps)=>active.memo(fn,deps),useCallback:(fn,deps)=>active.memo(()=>fn,deps),useEffect:(fn,deps)=>active.effect(fn,deps),
 };
 const m={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+out+'\n})',{console:{warn:()=>{}},setTimeout,clearTimeout}, {filename:'hooks/useSeasonSchedule.ts'})(name=>{
  if(name==='react')return react;
  if(name==='react-native')return {AppState:{addEventListener:()=>({remove(){}})}};
  if(name==='@/context/AuthContext')return {useAuth:()=>({user:{id:U}})};
  if(name==='@/context/AppDataContext')return {useAppData:()=>({state:{currentUserId:U,currentStableId:active.stable,users:{[U]:{id:U,membership:[{stableId:active.stable,role:'admin',access:'owner'}]}}},actions:{syncSeasonAssignments:sync}})};
  if(name==='@/lib/qaDemo')return {isQaDemoMode:false};
  if(name==='@/lib/supabase')return {supabase:{}};
  if(name==='@/lib/seasonSchedule')return api;
  if(name==='@/lib/seasonScheduleDemo')return {};
  throw new Error(name);
 },m,m.exports);
 class Driver {
  constructor(){this.stable=S;this.slots=[];this.render();}
  state(initial){const n=this.cursor++,slot=this.slots[n]??={value:initial};return [slot.value,value=>{slot.value=typeof value==='function'?value(slot.value):value;}];}
  ref(initial){const n=this.cursor++;return this.slots[n]??={current:initial};}
  memo(fn,deps){const n=this.cursor++,old=this.slots[n];if(!old||deps.some((v,i)=>v!==old.deps[i]))this.slots[n]={deps,value:fn()};return this.slots[n].value;}
  effect(fn,deps){const n=this.cursor++,old=this.slots[n];if(!old||deps.some((v,i)=>v!==old.deps[i])){this.slots[n]={deps,cleanup:old?.cleanup};this.effects.push(()=>{this.slots[n].cleanup?.();this.slots[n].cleanup=fn();});}}
  render(){active=this;this.cursor=0;this.effects=[];this.value=m.exports.useSeasonSchedule();for(const run of this.effects)run();renders=this.value;return this.value;}
 }
 const driver=new Driver();
 return {driver,saved,reads,syncCalls,syncReplies,get value(){return renders;}};
}
test('season hook: late save from stable A is rejected after A to B to A transition',async()=>{
 const f=fixture();await tick();f.driver.render();
 const saving=f.value.savePeriod({id:period.id,templates:[{id:'template'}]});
 f.driver.stable='stable-b';f.driver.render();await tick();
 f.driver.stable=S;f.driver.render();await tick();
 f.saved.resolve({success:true,data:period});
 const result=await saving;assert.equal(result.success,false);assert.match(result.reason,/Stallet|kontot/);
 assert.equal(f.syncCalls.length,0,'The old write must never hydrate another active scope');
});
test('season hook: saved generating period invalidates concrete duties even when bundle reload fails',async()=>{
 const f=fixture();await tick();f.driver.render();f.reads.push({success:false,reason:'Synthetic read failed'});
 const saving=f.value.savePeriod({id:period.id,templates:[{id:'template'}]});
 f.saved.resolve({success:true,data:period});
 const result=await saving;assert.equal(result.success,false);assert.equal(result.reason,'Synthetic read failed');
 assert.equal(f.syncCalls.length,1);assert.ok(f.syncCalls[0][1].includes('template'));
});
test('season hook: acknowledged incomplete setup reloads its resumable status despite assignment sync failure',async()=>{
 const f=fixture();await tick();f.driver.render();
 f.syncReplies.push({success:false,reason:'Synthetic assignment read failed'});
 f.reads.push({success:true,data:{periods:[period],templates:[{id:'template',periodId:period.id}],rules:[]}});
 const saving=f.value.savePeriod({id:period.id,templates:[{id:'template'}]});
 f.saved.resolve({success:true,data:period});
 const result=await saving;f.driver.render();
 assert.equal(result.success,false);assert.equal(result.reason,'Synthetic assignment read failed');
 assert.equal(f.value.periods[0].status,'generating');assert.equal(f.value.error,'Synthetic assignment read failed');
});

function assignmentSyncFixture() {
 const context=readFileSync(new URL('../context/AppDataContext.tsx',import.meta.url),'utf8');
 const start=context.indexOf('  const syncSeasonAssignments = React.useCallback(');
 const end=context.indexOf('\n  const logNextAssignment =',start);
 assert.ok(start>=0&&end>start,'Extract the actual production assignment sync callback.');
 const compiled=ts.transpileModule(context.slice(start,end)+'\nexport {syncSeasonAssignments};',
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const old={id:'pass',stableId:'stable',templateId:'template',status:'open',updatedAt:'token1'};
 const stateRef={current:{currentUserId:'owner',currentStableId:'stable',assignments:[old]}};
 const dataWriteVersion={current:0},pendingDataWrites={current:new Set()},reads=[];
 const m={exports:{}};
 vm.runInNewContext(compiled,{module:m,exports:m.exports,React:{useCallback:fn=>fn},stateRef,
  recurringScopeRef:{current:{}},dataWriteVersion,pendingDataWrites,isQaDemoMode:false,supabase:{},
  fetchAllAssignments:()=>{const request=deferred();reads.push(request);return request.promise;},
  mapSeasonAssignment:row=>row,dispatch:action=>Object.assign(stateRef.current,action.payload)});
 return {old,stateRef,dataWriteVersion,pendingDataWrites,reads,sync:m.exports.syncSeasonAssignments};
}
test('season sync: delayed assignment read cannot revert a newer completed write',async()=>{
 const f=assignmentSyncFixture(),pending=f.sync();
 f.dataWriteVersion.current++;
 f.stateRef.current.assignments=[{...f.old,status:'completed',updatedAt:'token2'}];
 f.reads[0].resolve({data:[f.old],error:null});
 assert.equal((await pending).success,false);
 assert.equal(f.stateRef.current.assignments[0].status,'completed');
 assert.equal(f.stateRef.current.assignments[0].updatedAt,'token2');
});
test('season sync: a write already pending at read start cannot be hidden by finishing before the reply',async()=>{
 const f=assignmentSyncFixture();f.pendingDataWrites.current.add('assignment:pass');
 const pending=f.sync();f.pendingDataWrites.current.clear();
 f.stateRef.current.assignments=[{...f.old,status:'completed',updatedAt:'token2'}];
 f.reads[0].resolve({data:[f.old],error:null});
 assert.equal((await pending).success,false);assert.equal(f.stateRef.current.assignments[0].updatedAt,'token2');
});
test('season sync: newer reads win and failed reads keep acknowledged generating duties hidden',async()=>{
 const f=assignmentSyncFixture(),first=f.sync(),second=f.sync();
 f.reads[1].resolve({data:[{...f.old,status:'assigned',updatedAt:'token3'}],error:null});
 assert.equal((await second).success,true);
 f.reads[0].resolve({data:[f.old],error:null});
 assert.equal((await first).success,false);assert.equal(f.stateRef.current.assignments[0].updatedAt,'token3');
 const hidden=f.sync(undefined,['template']);
 assert.equal(f.stateRef.current.assignments.length,0);
 f.reads[2].resolve({data:null,error:new Error('Synthetic read failed')});
 assert.equal((await hidden).success,false);assert.equal(f.stateRef.current.assignments.length,0);
});
