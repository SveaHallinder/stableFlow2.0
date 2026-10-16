import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U=id(1), S=id(2), P=id(3), T=id(4);
const module = { exports: {} };
const warnings=[];
function load(path, globals={}) {
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+out+'\n})',{Date,Intl,AbortController,setTimeout,clearTimeout,console:{warn:(...a)=>warnings.push(a)},...globals}, {filename:path})(name=> {
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts',globals);
    throw new Error('Unexpected runtime import '+name);
  },m,m.exports);
  return m.exports;
}
Object.assign(module.exports,load('lib/seasonSchedule.ts'));
const api=module.exports;
const template={id:T,name:'Morgonfodring',startTime:'07:00',instructions:'Fodra och släpp ut',sortOrder:0};
const period={id:P,stable_id:S,name:'Vinter',date_from:'2099-11-01',date_to:'2100-10-31',revision:1,generation_revision:1,status:'generating'};
const scope={userId:U,stableId:S};
function client(reply) {
  const calls=[];
  const sdk=createClient('https://season-fixture.invalid','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
    calls.push({url:new URL(url),body:options.body?JSON.parse(options.body):null});
    const result=await reply(calls.length,calls.at(-1));
    return new Response(JSON.stringify(result.body??result),{status:result.status??200,headers:{'content-type':'application/json'}});
  }}});
  return {sdk,calls};
}
test('season: inclusive calendar dates count actual days through DST and five distinct templates',()=>{
  const result=api.previewSchedule('2026-03-28','2026-03-30',Array.from({length:5},(_,n)=>({...template,id:id(10+n)})));
  assert.equal(result.error,null); assert.equal(result.days,3); assert.equal(result.total,15);
});
test('season: future preview uses Stockholm time even when the device is elsewhere',()=>{
 const assignment={date:'2026-10-12',time:'09:00',status:'open'};
 assert.equal(api.isFutureSeasonAssignment(assignment,new Date('2026-10-12T06:00:00Z')),true);
 assert.equal(api.isFutureSeasonAssignment(assignment,new Date('2026-10-12T07:00:00Z')),false);
 assert.equal(api.isFutureSeasonAssignment({...assignment,status:'completed'},new Date('2026-10-12T06:00:00Z')),false);
 assert.equal(api.isFutureSeasonAssignment({...assignment,date:'2026-10-25',time:'03:30'},new Date('2026-10-25T02:00:00Z')),true);
});
test('season: reject invalid dates, empty templates and backwards end time before a write',()=>{
  for (const change of [{dateFrom:'2026-02-30'},{dateTo:'2099-10-01'},{templates:[]},{templates:[{...template,endTime:'06:00'}]}]) {
    assert.equal(typeof api.validateSchedulePeriod({id:P,expectedRevision:0,name:'Vinter',dateFrom:'2099-11-01',dateTo:'2100-10-31',templates:[template],...change}),'string');
  }
});
test('season: selected-from rule preserves earlier weeks and owner priority remains explicit',()=>{
  const rules=[{id:id(5),templateId:T,weekday:1,effectiveFrom:'2099-11-01',assigneeId:U,ownerControlled:false,revision:1},
    {id:id(6),templateId:T,weekday:1,effectiveFrom:'2100-01-01',ownerControlled:true,revision:2}];
  assert.equal(api.resolveWeeklyRule(rules,T,1,'2099-12-28').assigneeId,U);
  assert.equal(api.resolveWeeklyRule(rules,T,1,'2100-01-04').ownerControlled,true);
  assert.equal(api.resolveWeeklyRule(rules,id(99),1,'2100-01-04'),undefined);
});
test('season: refuse another user or stable receipt and malformed cross-period templates',async()=>{
  for(const body of [{user_id:id(99),stable_id:S,periods:[],templates:[],weekly_assignments:[]},
    {user_id:U,stable_id:S,periods:[period],templates:[{id:T,period_id:id(99)}],weekly_assignments:[]}]) {
    const c=client(()=>body); const result=await api.loadSeasonSchedule(c.sdk,scope); assert.equal(result.success,false);
  }
});
test('season: generation verifies ready and proceeds through more than 1000 rows in bounded receipts',async()=>{
  const c=client(n=>({user_id:U,stable_id:S,period:{...period,status:n===5?'ready':'generating'},changed_count:365,total_count:1825,generated_count:n*365}));
  const progress=[];
  const result=await api.generateSeasonPeriod(c.sdk,scope,api.mapSchedulePeriod(period),value=>progress.push(value));
  assert.equal(result.success,true); assert.equal(result.data.status,'ready'); assert.equal(c.calls.length,5);
  assert.equal(c.calls[4].body.p_expected_revision,1); assert.equal(progress.at(-1).done,1825);
});
test('season: an interrupted batch returns failure, retry reuses saved identity/revision',async()=>{
  const c=client(n=> n===1?{status:503,body:{message:'offline'}}:{user_id:U,stable_id:S,period:{...period,status:'ready'},changed_count:0,total_count:1825,generated_count:1825});
  const p=api.mapSchedulePeriod(period);
  assert.equal((await api.generateSeasonPeriod(c.sdk,scope,p)).success,false);
  assert.equal((await api.generateSeasonPeriod(c.sdk,scope,p)).success,true);
  assert.equal(c.calls[0].body.p_period_id,c.calls[1].body.p_period_id);
});
test('season: partial or oversized generation receipt must never report completion',async()=>{
  for(const reply of [{changed_count:366,total_count:1825,generated_count:366,status:'ready'},
    {changed_count:0,total_count:1825,generated_count:365,status:'generating'},
    {changed_count:365,total_count:1825,generated_count:365,status:'ready'}]) {
    const c=client(()=>({user_id:U,stable_id:S,period:{...period,status:reply.status},...reply}));
    assert.equal((await api.generateSeasonPeriod(c.sdk,scope,api.mapSchedulePeriod(period))).success,false);
  }
});
test('season: assignment loading reaches >1000 rows rather than accepting a truncated year',async()=>{
  const rows=Array.from({length:1825},(_,n)=>({id:id(100+n),stable_id:S})).sort((a,b)=>a.id.localeCompare(b.id));
  const c=client((n,call)=>{if(call.url.pathname.endsWith('/schedule_periods'))return [];const after=call.url.searchParams.get('id')?.replace(/^gt\./,'');return rows.filter(row=>!after||row.id>after).slice(0,500);});
  const result=await api.fetchAllAssignments(c.sdk,[S]);
  assert.equal(result.error,null); assert.equal(result.data.length,1825); assert.equal(c.calls.filter(call=>call.url.pathname.endsWith('/assignments')).length,4);
});
test('season: external owner changing the period between assignment pages cannot publish partial coverage',async()=>{
 const rows=Array.from({length:500},(_,n)=>({id:id(100+n),stable_id:S}));
 let changed=false;
 const c=client((n,call)=>{
  if(call.url.pathname.endsWith('/schedule_periods'))return [{id:P,stable_id:S,revision:changed?2:1,generation_revision:1,status:changed?'generating':'ready'}];
  if(!call.url.searchParams.has('id')){changed=true;return rows;}
  return [];
 });
 const result=await api.fetchAllAssignments(c.sdk,[S]);
 assert.equal(result.data,null);assert.ok(result.error);
});
test('season: one-date receipt retains original identity and override, no fake foreign-stable row accepted',async()=>{
  const row={id:id(9),stable_id:S,template_id:T,original_date:'2099-11-03',date:'2099-11-04',label:'Morgon',time:'07:00',slot:'Morning',icon:'sun',status:'open',is_schedule_override:true,updated_at:'2099-01-01T00:00:00Z'};
  for(const foreign of [false,true]) {
    const c=client(()=>({user_id:U,stable_id:S,assignment:{...row,stable_id:foreign?id(99):S}}));
    const result=await api.editSeasonOccurrence(c.sdk,scope,{id:id(9),templateId:T,originalDate:'2099-11-03',updatedAt:'2098-01-01T00:00:00Z'}, {date:'2099-11-04'});
    assert.equal(result.success,!foreign); if(!foreign)assert.equal(result.data.originalDate,'2099-11-03');
  }
});

test('season: a freshly saved generating period with generation_revision zero remains resumable', async()=> {
 const c=client(()=>({user_id:U,stable_id:S,periods:[{...period,generation_revision:0}],templates:[],weekly_assignments:[]}));
 const result=await api.loadSeasonSchedule(c.sdk,scope);
 assert.equal(result.success,true); assert.equal(result.data.periods[0].generationRevision,0);
});

test('season: unchanged save revision cannot acknowledge a requested definition edit', async()=>{
 const c=client(()=>({user_id:U,stable_id:S,period}));
 assert.equal((await api.saveSeasonPeriod(c.sdk,scope,{id:P,expectedRevision:1,name:'Vinter',dateFrom:period.date_from,dateTo:period.date_to,templates:[template]})).success,false);
});
test('season: weekly acknowledgement must advance revision and retain requested owner authority', async()=>{
 for(const change of [{revision:1,owner_controlled:true},{revision:2,owner_controlled:false}]) {
  const c=client(()=>({user_id:U,stable_id:S,rule:{id:id(5),template_id:T,weekday:1,effective_from:'2099-11-01',assignee_id:U,...change},updated_count:52}));
  assert.equal((await api.setSeasonWeekly(c.sdk,scope,{templateId:T,weekday:1,effectiveFrom:'2099-11-01',assigneeId:U,ownerControlled:true,expectedRevision:1})).success,false);
 }
});
test('season: one-date acknowledgement cannot silently ignore requested content or override',async()=>{
 const row={id:id(9),stable_id:S,template_id:T,original_date:'2099-11-03',date:'2099-11-03',label:'Morgon',time:'07:00',slot:'Morning',icon:'sun',status:'open',is_schedule_override:false,updated_at:'2099-01-01T00:00:00Z'};
 const c=client(()=>({user_id:U,stable_id:S,assignment:row}));
 assert.equal((await api.editSeasonOccurrence(c.sdk,scope,{id:id(9),templateId:T,originalDate:'2099-11-03',updatedAt:row.updated_at},{label:'Morgon med extra vatten',time:'08:00'})).success,false);
});
test('season: instructions-only edit verifies content independently of the optional end time',async()=>{
 const row={id:id(9),stable_id:S,template_id:T,original_date:'2099-11-03',date:'2099-11-03',label:'Morgon',time:'07:00',slot:'Morning',icon:'sun',status:'open',is_schedule_override:true,updated_at:'2099-01-02T00:00:00Z'};
 for(const note of ['', 'Nya instruktioner', 'Nya instruktioner\nSlut: 08:00']) {
  const c=client(()=>({user_id:U,stable_id:S,assignment:{...row,note}}));
  const result=await api.editSeasonOccurrence(c.sdk,scope,{id:id(9),templateId:T,originalDate:'2099-11-03',updatedAt:'2099-01-01T00:00:00Z'},{instructions:'Nya instruktioner'});
  assert.equal(result.success,note!=='');
 }
});
test('season: clearing optional end time sends null rather than a rejected empty SQL time',async()=>{
 const row={id:id(9),stable_id:S,template_id:T,original_date:'2099-11-03',date:'2099-11-03',label:'Morgon',time:'07:00',slot:'Morning',icon:'sun',status:'open',note:'Extra vatten',is_schedule_override:true,updated_at:'2099-01-02T00:00:00Z'};
 const c=client(()=>({user_id:U,stable_id:S,assignment:row}));
 const result=await api.editSeasonOccurrence(c.sdk,scope,{id:id(9),templateId:T,originalDate:'2099-11-03',updatedAt:'2099-01-01T00:00:00Z'},{endTime:'',instructions:'Extra vatten'});
 assert.equal(result.success,true); assert.equal(c.calls[0].body.p_changes.end_time,null);
});

test('season: malformed time receipt returns a failure instead of leaving loading rejected',async()=>{
 const c=client(()=>({user_id:U,stable_id:S,periods:[period],templates:[{id:T,period_id:P,name:'Morgon',start_time:123,end_time:null,instructions:'',sort_order:0,archived:false}],weekly_assignments:[]}));
 assert.equal((await api.loadSeasonSchedule(c.sdk,scope)).success,false);
});

test('season demo: generation markers and clock categories match the database contract',()=>{
 const demo=load('lib/seasonScheduleDemo.ts');
 const input={id:P,expectedRevision:0,name:'Vinter',dateFrom:'2099-11-01',dateTo:'2099-11-02',
  templates:[{...template,startTime:'10:30'}]};
 const saved=demo.saveDemoPeriod(scope,input,true);
 assert.equal(saved.success,true);assert.equal(saved.data.generationRevision,0);
 const first=demo.generateDemoBatch(scope,saved.data);
 assert.equal(first.data.generationRevision,1);assert.equal(demo.readDemoSchedule(scope).assignments[0].slot,'Lunch');
 const updated=demo.saveDemoPeriod(scope,{...input,expectedRevision:1,templates:[{...template,startTime:'15:30'}]},true);
 assert.equal(updated.data.generationRevision,1);
 const next=demo.generateDemoBatch(scope,updated.data);
 assert.equal(next.data.generationRevision,2);assert.equal(demo.readDemoSchedule(scope).assignments[0].slot,'Evening');
});
test('season demo: rapid occurrence changes advance version and recompute the clock category',()=>{
 class FixedDate extends Date {
  constructor(value='2026-10-12T06:00:00Z'){super(value);}
  static now(){return Date.parse('2026-10-12T06:00:00Z');}
 }
 const demo=load('lib/seasonScheduleDemo.ts',{Date:FixedDate});
 const saved=demo.saveDemoPeriod(scope,{id:P,expectedRevision:0,name:'Vinter',dateFrom:'2099-11-01',dateTo:'2099-11-02',templates:[template]},true);
 demo.generateDemoBatch(scope,saved.data);
 const original=demo.readDemoSchedule(scope).assignments[0];
 const edited=demo.editDemoOccurrence(scope,original,{time:'16:00'},true,[U]);
 assert.equal(edited.success,true);assert.notEqual(edited.data.updatedAt,original.updatedAt);
 assert.equal(edited.data.slot,'Evening');assert.equal(edited.data.icon,'moon');
 assert.equal(demo.editDemoOccurrence(scope,original,{label:'Old draft'},true,[U]).success,false);
 const reset=demo.editDemoOccurrence(scope,edited.data,{resetOverride:true},true,[U]);
 assert.equal(reset.success,true);assert.equal(reset.data.slot,'Morning');assert.equal(reset.data.icon,'sun');
});
test('season demo: reconciliation verifies every clock category before publishing a multi-batch year',()=>{
 const demo=load('lib/seasonScheduleDemo.ts');
 const input={id:P,expectedRevision:0,name:'Vinter',dateFrom:'2099-01-01',dateTo:'2099-12-31',
  templates:[{...template,startTime:'10:30'},{...template,id:id(5),startTime:'10:30',sortOrder:1}]};
 const saved=demo.saveDemoPeriod(scope,input,true);
 let result;
 do{result=demo.generateDemoBatch(scope,saved.data);}while(result.data.status!=='ready');
 // An earlier synthetic QA store used a different clock/category threshold.
 demo.readDemoSchedule(scope).assignments.forEach(row=>{row.slot='Morning';row.icon='sun';});
 const updated=demo.saveDemoPeriod(scope,{...input,expectedRevision:1,name:'Vinter justerad'},true);
 result=demo.generateDemoBatch(scope,updated.data);
 assert.equal(result.data.status,'generating');assert.equal(result.data.generationRevision,1);
 do{result=demo.generateDemoBatch(scope,updated.data);}while(result.data.status!=='ready');
 assert.equal(demo.readDemoSchedule(scope).assignments.every(row=>row.slot==='Lunch'&&row.icon==='clock'),true);
});


test('season: actual PostgreSQL RPC receipts round-trip through the Supabase SDK client', async()=> {
 // Captured from the private local PostgreSQL contract test; all identities are synthetic.
 const receipts={
  "saved": {
    "period": {
      "id": "00000000-0000-0000-0000-000000000201",
      "name": "Vinter",
      "status": "generating",
      "date_to": "2099-01-07",
      "revision": 1,
      "date_from": "2099-01-01",
      "stable_id": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-10-12T19:58:16.302691+02:00",
      "updated_at": "2026-10-12T19:58:16.302691+02:00",
      "generation_revision": 0
    },
    "user_id": "00000000-0000-0000-0000-000000000101",
    "stable_id": "00000000-0000-0000-0000-000000000001"
  },
  "generated": {
    "period": {
      "id": "00000000-0000-0000-0000-000000000201",
      "name": "Vinter",
      "status": "ready",
      "date_to": "2099-01-07",
      "revision": 1,
      "date_from": "2099-01-01",
      "stable_id": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-10-12T19:58:16.302691+02:00",
      "updated_at": "2026-10-12T19:58:16.554986+02:00",
      "generation_revision": 1
    },
    "user_id": "00000000-0000-0000-0000-000000000101",
    "stable_id": "00000000-0000-0000-0000-000000000001",
    "total_count": 7,
    "changed_count": 7,
    "generated_count": 7
  },
  "assigned": {
    "rule": {
      "id": "a6389812-4a6a-4848-a2e2-b982265a2d1d",
      "weekday": 0,
      "revision": 1,
      "assignee_id": "00000000-0000-0000-0000-000000000102",
      "template_id": "00000000-0000-0000-0000-000000000301",
      "effective_from": "2099-01-01",
      "owner_controlled": true,
      "changed_by_user_id": "00000000-0000-0000-0000-000000000101"
    },
    "user_id": "00000000-0000-0000-0000-000000000101",
    "stable_id": "00000000-0000-0000-0000-000000000001",
    "updated_count": 1
  },
  "read": {
    "periods": [
      {
        "id": "00000000-0000-0000-0000-000000000201",
        "name": "Vinter",
        "status": "ready",
        "date_to": "2099-01-07",
        "revision": 1,
        "date_from": "2099-01-01",
        "stable_id": "00000000-0000-0000-0000-000000000001",
        "created_at": "2026-10-12T19:58:16.302691+02:00",
        "updated_at": "2026-10-12T19:58:16.554986+02:00",
        "generation_revision": 1
      }
    ],
    "user_id": "00000000-0000-0000-0000-000000000102",
    "stable_id": "00000000-0000-0000-0000-000000000001",
    "templates": [
      {
        "id": "00000000-0000-0000-0000-000000000301",
        "name": "Morgon",
        "archived": false,
        "end_time": null,
        "period_id": "00000000-0000-0000-0000-000000000201",
        "stable_id": "00000000-0000-0000-0000-000000000001",
        "sort_order": 0,
        "start_time": "07:00",
        "instructions": ""
      }
    ],
    "weekly_assignments": [
      {
        "id": "a6389812-4a6a-4848-a2e2-b982265a2d1d",
        "weekday": 0,
        "revision": 1,
        "assignee_id": "00000000-0000-0000-0000-000000000102",
        "template_id": "00000000-0000-0000-0000-000000000301",
        "effective_from": "2099-01-01",
        "owner_controlled": true,
        "changed_by_user_id": "00000000-0000-0000-0000-000000000101"
      }
    ]
  },
  "edited": {
    "user_id": "00000000-0000-0000-0000-000000000101",
    "stable_id": "00000000-0000-0000-0000-000000000001",
    "assignment": {
      "id": "82db808f-9d84-4f08-97c6-3ffe2341a08d",
      "date": "2099-01-05",
      "icon": "sun",
      "note": "",
      "slot": "Morning",
      "time": "08:30",
      "label": "Ett datum",
      "status": "assigned",
      "series_id": null,
      "stable_id": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-10-12T19:58:16.482059+02:00",
      "updated_at": "2026-10-12T19:58:17.236631+02:00",
      "assignee_id": "00000000-0000-0000-0000-000000000102",
      "template_id": "00000000-0000-0000-0000-000000000301",
      "assigned_via": "manual",
      "completed_at": null,
      "original_date": "2099-01-05",
      "declined_by_user_ids": [],
      "is_schedule_override": true
    }
  }
};
 const owner={userId:receipts.saved.user_id,stableId:receipts.saved.stable_id};
 const member={userId:receipts.read.user_id,stableId:receipts.read.stable_id};
 const raw=receipts.read.templates[0];
 const input={id:receipts.saved.period.id,expectedRevision:0,name:receipts.saved.period.name,
  dateFrom:receipts.saved.period.date_from,dateTo:receipts.saved.period.date_to,
  templates:[{id:raw.id,name:raw.name,startTime:raw.start_time,instructions:raw.instructions,sortOrder:raw.sort_order}]};
 const c=client((n,call)=> {
  const name=call.url.pathname.split('/').at(-1);
  return ({save_schedule_period:receipts.saved,generate_schedule_batch:receipts.generated,
   set_schedule_weekly_assignment:receipts.assigned,get_season_schedule:receipts.read,
   update_schedule_occurrence:receipts.edited})[name];
 });
 const saved=await api.saveSeasonPeriod(c.sdk,owner,input);
 assert.equal(saved.success,true); assert.equal(saved.data.generationRevision,0);
 const generated=await api.generateSeasonPeriod(c.sdk,owner,saved.data);
 assert.equal(generated.success,true); assert.equal(generated.data.status,'ready');
 const rule=receipts.assigned.rule;
 assert.equal((await api.setSeasonWeekly(c.sdk,owner,{templateId:rule.template_id,weekday:rule.weekday,
  effectiveFrom:rule.effective_from,assigneeId:rule.assignee_id,ownerControlled:true,expectedRevision:0})).success,true);
 const read=await api.loadSeasonSchedule(c.sdk,member);
 assert.equal(read.success,true); assert.equal(read.data.templates[0].endTime,undefined);
 const edited=receipts.edited.assignment;
 const result=await api.editSeasonOccurrence(c.sdk,owner,{id:edited.id,templateId:edited.template_id,
  originalDate:edited.original_date,updatedAt:receipts.saved.period.updated_at},
  {label:edited.label,time:edited.time,instructions:'',endTime:''});
 assert.equal(result.success,true); assert.equal(result.data.isScheduleOverride,true);
 assert.equal(c.calls.length,5); assert.equal(c.calls.at(-1).body.p_changes.end_time,null);
});
