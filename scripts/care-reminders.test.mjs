import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import process from 'node:process';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const root = new URL('../', import.meta.url);
const code = async path => readFile(new URL(path, root), 'utf8');
const helperSource = await code('lib/careReminders.ts');
const uiSource = process.env.STABLEFLOW_CARE_UI_SOURCE ? await readFile(process.env.STABLEFLOW_CARE_UI_SOURCE, 'utf8') : await code('components/CareReminder.tsx');
const workerSource = process.env.STABLEFLOW_CARE_WORKER_SOURCE ? await readFile(process.env.STABLEFLOW_CARE_WORKER_SOURCE, 'utf8') : await code('supabase/functions/care-reminders/index.ts');
const receiptSource = await code('supabase/functions/_shared/push-receipts.ts');
const dateSource = await code('lib/dateValidation.ts');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const S = '00000000-0000-4000-8000-000000000003', H = '00000000-0000-4000-8000-000000000004';
const E = '00000000-0000-4000-8000-000000000005', R = '00000000-0000-4000-8000-000000000006';
const T = '00000000-0000-4000-8000-000000000007', G = '00000000-0000-4000-8000-000000000008';
const ATTEMPT = '00000000-0000-4000-8000-000000000009';
const scope = { accountId: A, sessionEpoch: 1, stableId: S, horseId: H };
const anchor = { id: E, stableId: S, horseIds: [H], title: 'synthetic-private-care-title', date: '2026-10-07', status: 'done', revision: '2026-10-07T12:00:00+00:00' };
const recipients = [{ id: A, stableId: S, name: 'Demo medlem' }];
const plan = { ...scope, requestId: R, careEventId: E, sourceEventDate: anchor.date, sourceEventRevision: anchor.revision,
  expectedRevision: null, nextDate: '2026-11-15', reminderDate: '2026-11-15', recipientUserIds: [A] };
const snapshot = { accountId: A, stableId: S, horseId: H, anchor, recipients, plan: null };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function module(source, deps, names) {
 const ast = ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
 const result = ts.transpileModule(`export default ({${Object.keys(deps).join(',')}})=>{${body};return {${names.join(',')}};};`, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 return (await import(`data:text/javascript;base64,${Buffer.from(result).toString('base64')}`)).default(deps);
}
const date = await module(dateSource, {}, ['isValidISODate']);
const token = id => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ sub:id, exp:4e9 })).toString('base64url'), Buffer.from('synthetic-signature').toString('base64url')].join('.');
const body = value => new globalThis.Response(JSON.stringify(value), { status:200, headers:{'content-type':'application/json'} });
async function fixture(options={}) {
 const calls=[], logs=[], provider=[]; let handler;
 const transport = async (input, init={}) => {
  const url = new URL(input instanceof globalThis.Request ? input.url : input);
  const payload = init.body ? JSON.parse(init.body) : null;
  calls.push({path:url.pathname,payload,method:init.method||'GET',search:url.search});
  if(url.pathname === '/auth/v1/user') {
   const authorization = new globalThis.Headers(init.headers).get('Authorization');
   const id = JSON.parse(Buffer.from(authorization.split(' ')[1].split('.')[1], 'base64url')).sub;
   return body({id,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid'});
  }
  if(url.hostname === 'exp.host') {
   provider.push(...payload); if(options.providerFailure) throw new Error('synthetic-private-token-provider-secret');
   return body({data:payload.map((_,i)=>({status:'ok',id:`ticket-${i}`}))});
  }
  if(url.pathname.endsWith('/care_reminder_read')) return body(options.readBody ?? snapshot);
  if(url.pathname.endsWith('/care_reminder_save')) {
   if(options.saveGate) await options.saveGate.promise;
   if(options.saveStatus) return new globalThis.Response(JSON.stringify({code:'42501',message:'synthetic-private-care-token',details:'synthetic-private-provider'}),{status:options.saveStatus,headers:{'content-type':'application/json'}});
   return body(options.saveBody ?? {success:true,data:payload.p_plan});
  }
  if(url.pathname.endsWith('/care_reminder_claim_due')) return body({items:options.claimItems ?? [{planId:E,requestId:R,attemptId:ATTEMPT,stableId:S,recipientUserIds:[A]}]});
  if(url.pathname === '/rest/v1/push_tokens') {
   const rows=options.tokenRows ?? [{id:T,user_id:A,token:'synthetic-private-push-token',registration_generation:G}];
   return new globalThis.Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json',...(options.tokenCount===null?{}:{'content-range':`0-${rows.length-1}/${options.tokenCount??rows.length}`})}});
  }
  if(url.pathname === '/rest/v1/notification_preferences') {
   if(options.preferenceFailure) return new globalThis.Response(JSON.stringify({code:'PGRST000',message:'synthetic-private-preference'}), {status:503,headers:{'content-type':'application/json'}});
   const all=options.preferences ?? [],rows=all.slice(0,options.preferenceRowCap??Number.POSITIVE_INFINITY);
   return new globalThis.Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json',...(options.preferenceCount===null?{}:{'content-range':`0-${rows.length-1}/${options.preferenceCount??all.length}`})}});
  }
  if(url.pathname.endsWith('/push_device_active_registrations')) return body(options.activeBody ?? {registrations:payload.p_registrations});
  if(url.pathname.endsWith('/push_receipts_prepare')) return body({attempt_id:payload.p_attempt_id,started:options.prepareStarted ?? true});
  if(url.pathname.endsWith('/push_receipts_record_tickets')) return body({attempt_id:payload.p_attempt_id,recorded_count:options.badTicketAck ? 0 : payload.p_results.length});
  if(url.pathname.endsWith('/care_reminder_finish')) return body(options.finishBody ?? {planId:payload.p_plan_id,requestId:payload.p_request_id,attemptId:payload.p_attempt_id,state:payload.p_state});
  throw new Error('Unexpected synthetic transport endpoint '+url.pathname);
 };
 const sdk = createClient('https://care.invalid','synthetic-anon',{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:transport}});
 const setUser = id => sdk.auth.setSession({access_token:token(id),refresh_token:'synthetic-refresh'});
 await setUser(A);
 const warnings = {warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args)};
 const helper=await module(helperSource,{supabase:sdk,...date,console:warnings},['emptyCareReminderDraft','careReminderPreview','careReminderScopeKey','matchesCareReminderReceipt','saveCareReminder','readCareReminder','stockholmToday']);
 const shared=await module(receiptSource,{fetch:transport},['activePushRegistrations','isUuid','registration','sendPushTargets']);
 await module(workerSource,{...shared,createClient:()=>sdk,Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://care.invalid':'synthetic-service'},serve:fn=>{handler=fn;}},console:warnings},[]);
 const request = (authorization='Bearer synthetic-service', method='POST')=>handler(new globalThis.Request('https://local.invalid/care-reminders',{method,headers:{Authorization:authorization}}));
 return {helper,sdk,calls,logs,provider,setUser,request};
}
function find(tree,predicate){if(!tree)return null;if(Array.isArray(tree)){for(const child of tree){const found=find(child,predicate);if(found)return found;}return null;}if(typeof tree==='object'){if(predicate(tree))return tree;return find(tree.props?.children,predicate);}return null;}
const text = tree=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(text).join(' '):tree&&typeof tree==='object'?text(tree.props?.children):'';
async function reactFixture(f, name='CareReminderForm', overrides={}) {
 const values=[], effects=new Map(), commits=[];let cursor=0,tree,authUser=A,requestCount=0;
 const depsEqual=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!depsEqual(values[i]?.deps,deps))values[i]={deps,value:fn()};return values[i].value;};
 const effect=(fn,deps)=>{const i=cursor++;if(!depsEqual(values[i]?.deps,deps)){values[i]={deps};commits.push(()=>{effects.get(i)?.cleanup?.();effects.set(i,{setup:fn,cleanup:fn()});});}};
 const React={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState:initial=>{const i=cursor++;values[i]??={value:typeof initial==='function'?initial():initial};return[values[i].value,next=>{values[i].value=typeof next==='function'?next(values[i].value):next;}];},
  useRef:current=>{const i=cursor++;values[i]??={current};return values[i];},useMemo:memo,useEffect:effect,useLayoutEffect:effect};
 const data={state:{currentUserId:A,sessionUserId:A,currentStableId:S,users:{[A]:{membership:[{stableId:S}]},[B]:{membership:[{stableId:S}]}}},derived:{permissions:{canManageCareEvents:true}}};
 const dependencies={React,StyleSheet:{create:x=>x},Text:'Text',TouchableOpacity:'TouchableOpacity',View:'View',Card:'Card',DateTimeField:'DateTimeField',theme:{colors:{}},radius:{},generateId:()=>`00000000-0000-4000-8000-${String(6+requestCount++).padStart(12,'0')}`,console:{warn:(...args)=>f.logs.push(args)},...f.helper,
  useAppData:()=>data,useAuth:()=>({user:{id:authUser},loading:false,pendingAccountDeletionId:null}),supabase:f.sdk,isQaDemoMode:false};
 const api=await module(uiSource,dependencies,['CareReminderForm','CareReminderFields','CareReminder']);
 const props=name==='CareReminderForm'?{scope,event:anchor,horseName:'Demo häst',recipients,canEdit:true,today:'2026-10-08',onSave:p=>f.helper.saveCareReminder(p,()=>true),...overrides}:{event:anchor,horseId:H,horseName:'Demo häst',...overrides};
 const render=()=>{cursor=0;tree=api[name](props);for(const fn of commits.splice(0))fn();return tree;};render();
 const button=regex=>find(tree,x=>x.type==='TouchableOpacity'&&regex.test(text(x)));
 const field=()=>find(tree,x=>x.type==='DateTimeField');
 const fill=()=>{field().props.onChangeText(plan.nextDate);render();find(tree,x=>x.props?.accessibilityLabel==='Mottagare Demo medlem').props.onPress();render();};
 return{render,button,field,fill,content:()=>text(tree),setProps:next=>{Object.assign(props,next);render();},data,setUser:async id=>{await f.setUser(id);authUser=id;data.state.currentUserId=id;data.state.sessionUserId=id;render();},get tree(){return tree;},unmount:()=>{for(const effect of effects.values())effect.cleanup?.();},strictReplay:()=>{for(const effect of effects.values()){effect.cleanup?.();effect.cleanup=effect.setup();}}};
}
const settle = async (driver)=>{for(let i=0;i<6;i++){await setImmediate();driver.render();}};

test('approved model is blank date/recipients with no days-before input or implied medical interval',async()=>{const f=await fixture();assert.deepEqual(f.helper.emptyCareReminderDraft(),{nextDate:'',recipientUserIds:[]});const ui=await reactFixture(f);assert.equal(ui.field().props.value,'');assert.doesNotMatch(ui.content(),/Antal dagar före/);assert.match(ui.content(),/09.00 Europe\/Stockholm/);await ui.button(/Spara påminnelse/).props.onPress();assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_save')).length,0);});
test('Stockholm calendar date respects local midnight in summer/winter without prescribing a care interval',async()=>{const f=await fixture();assert.equal(f.helper.stockholmToday(new Date('2026-07-01T22:30:00Z')),'2026-07-02');assert.equal(f.helper.stockholmToday(new Date('2026-01-01T23:30:00Z')),'2026-01-02');});
test('preview refuses cancelled anchor, cross-stable recipients and invalid dates before transport',async()=>{const f=await fixture();for(const [event,draft,list] of [[{...anchor,status:'cancelled'},{nextDate:plan.nextDate,recipientUserIds:[A]},recipients],[anchor,{nextDate:'2026-02-30',recipientUserIds:[A]},recipients],[anchor,{nextDate:plan.nextDate,recipientUserIds:[B]},recipients]])assert.equal(f.helper.careReminderPreview(scope,event,draft,list,'2026-10-08').success,false);});
test('actual installed SDK sends exact request snapshot and validates matching receipt',async()=>{const f=await fixture();const result=await f.helper.saveCareReminder(plan,()=>true);assert.equal(result.success,true);assert.deepEqual(f.calls.find(x=>x.path.endsWith('care_reminder_save')).payload,{p_plan:plan});assert.notEqual(result.data.recipientUserIds,plan.recipientUserIds);});
for(const [status,outcome] of [[403,'rejected'],[500,'uncertain'],[408,'uncertain']])test(`actual SDK ${status} is ${outcome} with no raw provider details`,async()=>{const f=await fixture({saveStatus:status});assert.equal((await f.helper.saveCareReminder(plan,()=>true)).outcome,outcome);assert.doesNotMatch(JSON.stringify(f.logs),/synthetic-private/);});
test('malformed positive save acknowledgement stays uncertain',async()=>{const f=await fixture({saveBody:{success:true,data:{...plan,recipientUserIds:[B]}}});assert.equal((await f.helper.saveCareReminder(plan,()=>true)).outcome,'uncertain');});
test('current UID mismatch or caller invalidation during session await dispatches no RPC',async()=>{const f=await fixture();await f.setUser(B);assert.equal((await f.helper.saveCareReminder(plan,()=>true)).outcome,'rejected');assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_save')).length,0);await f.setUser(A);let current=true;const gate=deferred(),original=f.sdk.auth.getSession.bind(f.sdk.auth);f.sdk.auth.getSession=async()=>{const answer=await original();await gate.promise;return answer;};const pending=f.helper.saveCareReminder(plan,()=>current);await setImmediate();current=false;gate.resolve();assert.equal((await pending).outcome,'rejected');assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_save')).length,0);});
test('late SDK save response after account fence loss cannot yield current success',async()=>{const gate=deferred(),f=await fixture({saveGate:gate});let current=true;const pending=f.helper.saveCareReminder(plan,()=>current);await setImmediate();await setImmediate();current=false;await f.setUser(B);gate.resolve();assert.equal((await pending).outcome,'uncertain');});
test('actual form preserves immutable same-ID retry after callback mutation and unknown outcome',async()=>{const f=await fixture(),plans=[];const ui=await reactFixture(f,'CareReminderForm',{onSave:async value=>{plans.push(globalThis.structuredClone(value));if(plans.length===1){value.requestId=B;value.recipientUserIds.push(B);return{success:false,outcome:'uncertain'};}return{success:true,data:value};}});ui.fill();await ui.button(/Spara påminnelse/).props.onPress();ui.render();assert.equal(ui.field().props.editable,false);await ui.button(/Försök igen/).props.onPress();ui.render();assert.deepEqual(plans[0],plans[1]);assert.match(ui.content(),/Påminnelseplanen är sparad/);});
test('actual form blocks double click, preserves known-failure draft and advances revision only after ack',async()=>{const f=await fixture(),held=deferred(),plans=[];const ui=await reactFixture(f,'CareReminderForm',{onSave:value=>{plans.push(value);return held.promise;}});ui.fill();const click=ui.button(/Spara påminnelse/).props.onPress;const pending=click();await click();await Promise.resolve();assert.equal(plans.length,1);held.resolve({success:false,outcome:'rejected'});await pending;ui.render();assert.equal(ui.field().props.value,plan.nextDate);assert.equal(ui.field().props.editable,true);});
test('StrictMode replay allows current form while queued dispatch after unmount is stopped',async()=>{const f=await fixture();let calls=0;const ui=await reactFixture(f,'CareReminderForm',{onSave:async value=>{calls++;return{success:true,data:value};}});ui.strictReplay();ui.fill();const pending=ui.button(/Spara påminnelse/).props.onPress();ui.unmount();await pending;assert.equal(calls,0);});
test('connected UI read error shows retry rather than an unverified default form',async()=>{const f=await fixture({readBody:{}}),ui=await reactFixture(f,'CareReminder');ui.button(/Nästa datum/).props.onPress();ui.render();await settle(ui);assert.match(ui.content(),/kunde inte läsas/);assert.ok(ui.button(/Försök läsa igen/));assert.equal(find(ui.tree,x=>x.type?.name==='CareReminderFields'),null);ui.unmount();});
test('connected current load exposes blank form and empty recipients explicitly',async()=>{const f=await fixture({readBody:{...snapshot,recipients:[]}}),ui=await reactFixture(f,'CareReminder');ui.button(/Nästa datum/).props.onPress();ui.render();await settle(ui);const fields=find(ui.tree,x=>x.type?.name==='CareReminderFields');assert.ok(fields);assert.deepEqual(fields.props.recipients,[]);ui.unmount();});
test('connected account A/B/A and close/reopen invalidate captured save callbacks even at identical values',async()=>{const f=await fixture(),ui=await reactFixture(f,'CareReminder');ui.button(/Nästa datum/).props.onPress();ui.render();await settle(ui);let fields=find(ui.tree,x=>x.type?.name==='CareReminderFields');const old=fields.props.onSave;await ui.setUser(B);await ui.setUser(A);await settle(ui);assert.equal((await old(plan)).outcome,'rejected');assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_save')).length,0);fields=find(ui.tree,x=>x.type?.name==='CareReminderFields');const beforeClose=fields.props.onSave;ui.button(/Stäng påminnelse/).props.onPress();ui.render();ui.button(/Nästa datum/).props.onPress();ui.render();await settle(ui);assert.equal((await beforeClose(plan)).outcome,'rejected');ui.unmount();});
test('unmount invalidates connected save callback without dispatch',async()=>{const f=await fixture(),ui=await reactFixture(f,'CareReminder');ui.button(/Nästa datum/).props.onPress();ui.render();await settle(ui);const fields=find(ui.tree,x=>x.type?.name==='CareReminderFields');ui.unmount();assert.equal((await fields.props.onSave(plan)).outcome,'rejected');assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_save')).length,0);});
test('worker rejects unauthorized or wrong method before RPC',async()=>{const f=await fixture();assert.equal((await f.request('wrong')).status,401);assert.equal((await f.request(undefined,'GET')).status,405);assert.equal(f.calls.filter(x=>x.path.includes('/rpc/')).length,0);});
test('worker reserves durable attempt before provider and uses generic content with recipient routing guard',async()=>{const f=await fixture();assert.equal((await f.request()).status,200);assert.equal(f.provider.length,1);assert.deepEqual(f.provider[0].data,{screen:'home',recipientUserId:A});assert.doesNotMatch(JSON.stringify(f.provider),/care-title|horse|event|date/i);const prepare=f.calls.findIndex(x=>x.path.endsWith('push_receipts_prepare')),provider=f.calls.findIndex(x=>x.path==='/--/api/v2/push/send');assert.ok(prepare>=0&&prepare<provider);assert.equal(f.calls.find(x=>x.path.endsWith('care_reminder_finish')).payload.p_state,'submitted');assert.deepEqual(f.logs,[]);});
for(const [name,options]of[['malformed claim',{claimItems:[{planId:E,requestId:R,attemptId:ATTEMPT,stableId:S,recipientUserIds:[]}] }],['preference read error',{preferenceFailure:true}],['malformed preferences',{preferences:[{user_id:A,reminders:'true'}]}],['malformed binding ack',{activeBody:{registrations:[{token_id:T,user_id:B,registration_generation:G}]}}]])test(`worker ${name} fails closed before provider`,async()=>{const f=await fixture(options);assert.equal((await f.request()).status,500);assert.equal(f.provider.length,0);assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_finish')).length,0);assert.doesNotMatch(JSON.stringify(f.logs),/synthetic-private/);});
for(const [name,options]of[['opt-out',{preferences:[{user_id:A,reminders:false}]}],['no active bound device',{activeBody:{registrations:[]}}],['no token',{tokenRows:[]}]])test(`worker ${name} records held, never sends or broadens recipients`,async()=>{const f=await fixture(options);assert.equal((await f.request()).status,200);assert.equal(f.provider.length,0);assert.equal(f.calls.find(x=>x.path.endsWith('care_reminder_finish')).payload.p_state,'held');});
for(const [name,options]of[['lost provider ack',{providerFailure:true}],['bad ticket save ack',{badTicketAck:true}]])test(`worker ${name} stays unknown rather than claiming completion`,async()=>{const f=await fixture(options);assert.equal((await f.request()).status,500);assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_finish')).length,0);assert.doesNotMatch(JSON.stringify(f.logs),/synthetic-private/);});

test('actual form next explicit edit uses acknowledged revision and a new request, preserving one-current-plan CAS',async()=>{const f=await fixture(),plans=[];const ui=await reactFixture(f,'CareReminderForm',{onSave:async value=>{plans.push(globalThis.structuredClone(value));return{success:true,data:value};}});ui.fill();await ui.button(/Spara påminnelse/).props.onPress();ui.render();ui.field().props.onChangeText('2026-11-16');ui.render();await ui.button(/Spara påminnelse/).props.onPress();ui.render();assert.equal(plans[0].expectedRevision,null);assert.equal(plans[1].expectedRevision,plans[0].requestId);assert.notEqual(plans[1].requestId,plans[0].requestId);});
test('mutated positive receipt cannot replace canonical UI choices',async()=>{const f=await fixture();const ui=await reactFixture(f,'CareReminderForm',{onSave:async value=>{value.nextDate='2029-01-01';value.recipientUserIds.push(B);return{success:true,data:value};}});ui.fill();await ui.button(/Spara påminnelse/).props.onPress();ui.render();assert.equal(ui.field().props.value,plan.nextDate);assert.equal(ui.field().props.editable,false);assert.doesNotMatch(ui.content(),/Påminnelseplanen är sparad/);});
test('recipient list loss under pending keeps draft and uncertain receipt without another send',async()=>{const f=await fixture(),held=deferred();let sent;const ui=await reactFixture(f,'CareReminderForm',{onSave:value=>{sent=value;return held.promise;}});ui.fill();const pending=ui.button(/Spara påminnelse/).props.onPress();await Promise.resolve();ui.setProps({recipients:[]});held.resolve({success:true,data:sent});await pending;ui.render();assert.equal(ui.field().props.value,plan.nextDate);assert.equal(ui.field().props.editable,false);assert.match(ui.content(),/Sparandet är inte bekräftat/);});
test('worker mismatched finish receipt cannot report success after provider submission',async()=>{const f=await fixture({finishBody:{planId:B,requestId:R,attemptId:ATTEMPT,state:'submitted'}});assert.equal((await f.request()).status,500);assert.equal(f.provider.length,1);assert.doesNotMatch(JSON.stringify(f.logs),/synthetic-private/);});

test('current view member may read a saved next date while edit and save remain forbidden',async()=>{const saved={requestId:R,nextDate:plan.nextDate,recipientUserIds:[A],state:'scheduled'};const f=await fixture({readBody:{...snapshot,plan:saved}}),ui=await reactFixture(f,'CareReminder');ui.data.derived.permissions.canManageCareEvents=false;ui.render();assert.equal(ui.button(/Nästa datum/).props.disabled,false);ui.button(/Nästa datum/).props.onPress();ui.render();await settle(ui);const fields=find(ui.tree,x=>x.type?.name==='CareReminderFields');assert.ok(fields);assert.equal(fields.props.canEdit,false);assert.equal(fields.props.initialPlan.nextDate,plan.nextDate);assert.equal((await fields.props.onSave(plan)).outcome,'rejected');assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_save')).length,0);ui.unmount();});

test('already reserved ledger attempt cannot claim a new accepted ticket',async()=>{const f=await fixture({prepareStarted:false});assert.equal((await f.request()).status,500);assert.equal(f.provider.length,0);assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_finish')).length,0);assert.doesNotMatch(JSON.stringify(f.logs),/synthetic-private/);});

const clippedUsers=Array.from({length:1001},(_,i)=>`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
for(const [label,options] of [['clipped preference list including omitted opt-out',{claimItems:[{planId:E,requestId:R,attemptId:ATTEMPT,stableId:S,recipientUserIds:clippedUsers}],tokenRows:[{id:T,user_id:clippedUsers[1000],token:'synthetic-private-push-token',registration_generation:G}],preferences:clippedUsers.map((user_id,i)=>({user_id,reminders:i!==1000})),preferenceRowCap:1000}],['unknown preference row count',{preferenceCount:null}],['unknown token row count',{tokenCount:null}],['clipped token list',{tokenCount:1001}]]) test(`worker rejects ${label} before provider`,async()=>{const f=await fixture(options);assert.equal((await f.request()).status,500);assert.equal(f.provider.length,0);assert.equal(f.calls.filter(x=>x.path.endsWith('care_reminder_finish')).length,0);assert.doesNotMatch(JSON.stringify(f.logs),/synthetic-private/);});
