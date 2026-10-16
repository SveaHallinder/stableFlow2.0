import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {setTimeout,clearTimeout} from 'node:timers';
import ts from 'typescript';
import {createClient,processLock,navigatorLock} from '@supabase/supabase-js';
const {Request,Response}=globalThis;
const root=new URL('../',import.meta.url),A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const G='00000000-0000-4000-8000-000000000090',NG='00000000-0000-4000-8000-000000000091';
const P='00000000-0000-4000-8000-000000000020',I='00000000-0000-4000-8000-000000000021',O='00000000-0000-4000-8000-000000000022',S='00000000-0000-4000-8000-000000000010';
const path=S+'/'+O+'.jpg',dest=S+'/'+I+'.jpg';
const helperCode=await readFile(new URL('lib/accountMedia.ts',root),'utf8');
const sharedCode=await readFile(new URL('supabase/functions/_shared/account-media.ts',root),'utf8');
const edgeCode=await readFile(new URL('supabase/functions/delete-account/index.ts',root),'utf8');
const compile=(code,filename)=>{const ast=ts.createSourceFile(filename,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);return ts.transpileModule(ast.statements.filter(x=>!ts.isImportDeclaration(x)).map(x=>x.getText(ast)).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;};
const execute=(code,deps)=>{const exports={};new Function('exports',...Object.keys(deps),compile(code,'source.ts'))(exports,...Object.values(deps));return exports;};
const jwt=uid=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const plan={plan_id:P,plan_generation:G,reselect_allowed:true,reselect_blocked_reason:null,replacement_user_id:B,state:'pending',delete_count:1,transfer_count:1,copied_count:0,removed_count:0,next_copy_item_id:I,next_remove_item_id:null};
const receipt={user_id:A,complete:true,blocked_count:0,requires_owner:true,affected_stable_count:1,replacement_owners:[{user_id:B,display_name:'Demo Bo'}],own:plan,incoming:[]};
async function fixture(options={}){
 const calls=[],logs=[],copyRequest={action:'transfer_shared_media',expected_user_id:B,replacement_user_id:B,media_plan_id:P,media_item_id:I,media_plan_generation:G,expected_replacement_user_id:B,next_plan_generation:null},removeRequest={action:'remove_own_media',expected_user_id:A,replacement_user_id:B,media_plan_id:P,media_item_id:I,media_plan_generation:G,expected_replacement_user_id:B,next_plan_generation:null};
 let uid=A,handler,copyDone=false,removeDone=false;
 const fetcher=role=>async(raw,init={})=>{const u=new URL(typeof raw==='string'?raw:raw.url),payload=init.body?JSON.parse(init.body):null;calls.push({role,path:u.pathname,payload,method:init.method});
  if(u.pathname==='/auth/v1/user')return Response.json({id:role==='user-B'?B:uid});
  if(u.pathname.includes('/admin/users/'))throw new Error('Unexpected real Auth path in fixture');
  if(u.pathname==='/rest/v1/rpc/own_account_media_status')return Response.json(options.statusBody??receipt);
  if((u.pathname==='/rest/v1/rpc/prepare_account_media_deletion'||u.pathname==='/rest/v1/rpc/reselect_account_media_owner'))return Response.json(options.prepareBody??{prepared:true,user_id:A,plan:u.pathname.endsWith('reselect_account_media_owner')?{...plan,plan_generation:NG}:plan});
  if(u.pathname==='/rest/v1/rpc/account_media_step'){
   const action=payload.p_action,copy=action.includes('copy');
   if(options.reservationError&&!action.startsWith('confirm'))return Response.json({code:'P0001',message:'[account media] source_changed'},{status:400});
   const data={plan_id:P,plan_generation:G,item_id:I,caller_id:copy?B:A,replacement_user_id:B};
   if(action.startsWith('claim'))return Response.json({...data,confirmed:false,action:copy?'copy':options.verifyRemove?'verify_remove':'remove',bucket_id:options.bucket??'avatars',source_path:options.path??path,destination_path:dest,source_id:O,...options.claimOverride});
   if(options.confirmError||copy&&!copyDone||!copy&&!removeDone)return Response.json({code:'P0001',message:'[account media] receipt_unconfirmed'},{status:400});
   return Response.json({...data,confirmed:true,state:copy?'copied':'removed',...options.confirmOverride});
  }
  if(u.pathname==='/storage/v1/object/copy'){
   if(options.copyGate)await options.copyGate.promise;
   copyDone=true;
   if(options.copyThrow)throw new Error('fixture-private-marker');
   if(options.copyConflict)return Response.json({statusCode:'409',message:'duplicate fixture-private-marker'},{status:409});
   return Response.json({Key:'avatars/'+dest});
  }
  if(u.pathname==='/storage/v1/object/avatars'){
   removeDone=true;
   if(options.removeThrow)throw new Error('fixture-private-marker');
   return Response.json(options.removeBody??[{id:O,name:path}]);
  }
  if(u.pathname==='/storage/v1/object/info/avatars/'+path){
   if(options.infoStatus===200)return Response.json({id:O,name:path});
   if(options.infoStatus===500)return Response.json({message:'fixture-private-marker'},{status:500});
   removeDone=true;return Response.json({statusCode:String(options.infoStatus??404),message:'missing'},{status:options.infoStatus??404});
  }
  if(u.pathname==='/functions/v1/delete-account'){
   if(options.invokeGate)await options.invokeGate.promise;
   return Response.json(options.invokeBody??(['prepare_media','reselect_media_owner'].includes(payload.action)?{prepared:true,user_id:A,plan}:{confirmed:true,user_id:payload.expected_user_id,plan_id:P,plan_generation:G,item_id:I,state:payload.action==='transfer_shared_media'?'copied':'removed'}));
  }
  throw new Error('Unknown synthetic route: '+u.pathname);
 };
 const config=role=>({global:{fetch:fetcher(role)},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const sdk=createClient('https://fixture.supabase.co','fixture-key',config('ui'));
 await sdk.auth.setSession({access_token:jwt(A),refresh_token:'fixture-refresh'});
 const admin=createClient('https://fixture.supabase.co','fixture-service-key',config('service'));
 const user=createClient('https://fixture.supabase.co','fixture-key',{...config('user-B'),global:{fetch:fetcher('user-B'),headers:{Authorization:'Bearer '+jwt(B)}}});
 const safeConsole={warn:(...v)=>logs.push(v),error:(...v)=>logs.push(v)};
 const shared=execute(sharedCode,{console:safeConsole});
 const client=execute(helperCode,{supabase:sdk,supabaseConfig:{url:'https://fixture.supabase.co'},console:safeConsole,setTimeout:(fn,ms)=>setTimeout(fn,options.fastDeadline?Math.min(ms,20):ms),clearTimeout});
 execute(edgeCode,{createClient:(url,key,opts)=>opts?.global?.headers?.Authorization?user:admin,accountMediaAction:shared.accountMediaAction,Deno:{env:{get:key=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key',SUPABASE_ANON_KEY:'fixture-key'})[key]},serve:fn=>{handler=fn;}},console:safeConsole});
 calls.length=0;
 return{calls,logs,shared,client,admin,user,sdk,copyRequest,removeRequest,setUid:async id=>{uid=id;await sdk.auth.setSession({access_token:jwt(id),refresh_token:'fixture-refresh'});},action:(body,actor=body.expected_user_id,timeout=10000)=>shared.accountMediaAction(admin,user,actor,body,'https://fixture.supabase.co',timeout),edge:body=>handler(new Request('https://fixture.supabase.co/functions/v1/delete-account',{method:'POST',headers:{Authorization:'Bearer fixture-user','Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
const providerCalls=f=>f.calls.filter(x=>x.path.startsWith('/storage/'));
test('complete caller-bound aggregate validates; missing/partial metadata never means zero',async()=>{const f=await fixture();assert.equal(f.client.validAccountMediaStatus(receipt,A),true);for(const x of [{...receipt,complete:false},{...receipt,user_id:B},{...receipt,blocked_count:undefined},{...receipt,own:{...plan,copied_count:2}},{...receipt,replacement_owners:[...receipt.replacement_owners,...receipt.replacement_owners]}])assert.equal(f.client.validAccountMediaStatus(x,A),false);});
test('actual SDK read uses only project URL; no raw expected UID authority argument',async()=>{const f=await fixture();assert.deepEqual(await f.client.readOwnAccountMediaStatus(A),receipt);assert.deepEqual(f.calls[0].payload,{p_project_url:'https://fixture.supabase.co'});});
test('B copy is reserved before provider, uses B SDK and exact DB destination, never service-copy/owner metadata',async()=>{const f=await fixture();assert.equal((await f.action(f.copyRequest)).status,200);const c=providerCalls(f);assert.equal(c.length,1);assert.equal(c[0].role,'user-B');assert.deepEqual(c[0].payload,{bucketId:'avatars',sourceKey:path,destinationKey:dest});assert.equal(f.calls[0].payload.p_action,'claim_copy');assert.equal(f.calls.at(-1).payload.p_action,'confirm_copy');assert.equal(f.calls.filter(x=>x.path.includes('/auth/')).length,0);});
test('same destination duplicate SDK reply can confirm a previously committed B copy',async()=>{const f=await fixture({copyConflict:true});assert.equal((await f.action(f.copyRequest)).status,200);assert.equal(providerCalls(f).length,1);});
test('lost copy reply reconciles only after exact SQL metadata and retries same immutable target',async()=>{const f=await fixture({copyThrow:true});assert.equal((await f.action(f.copyRequest)).status,200);assert.equal((await f.action(f.copyRequest)).status,200);assert.deepEqual(providerCalls(f)[0].payload,providerCalls(f)[1].payload);assert.doesNotMatch(JSON.stringify(f.logs),/fixture-private-marker/);});
test('unconfirmed source generation/role reservation fails before Storage',async()=>{const f=await fixture({reservationError:true});assert.equal((await f.action(f.copyRequest)).status,409);assert.equal(providerCalls(f).length,0);});
for(const [label,options]of[['wrong caller',{claimOverride:{caller_id:A}}],['wrong item',{claimOverride:{item_id:O}}],['raw legacy path',{path:'legacy/photo.jpg'}],['wrong bucket',{bucket:'private-other'}],['changed frozen owner',{claimOverride:{replacement_user_id:A}}]])test('malformed reservation '+label+' fails before provider',async()=>{const f=await fixture(options);assert.equal((await f.action(f.copyRequest)).status,409);assert.equal(providerCalls(f).length,0);});
test('A remove uses service SDK exactly one frozen path after durable reservation; metadata deletion is not an app query',async()=>{const f=await fixture();assert.equal((await f.action(f.removeRequest)).status,200);const c=providerCalls(f);assert.deepEqual(c.map(x=>({role:x.role,path:x.path,method:x.method,payload:x.payload})),[{role:'service',path:'/storage/v1/object/avatars',method:'DELETE',payload:{prefixes:[path]}}]);assert.equal(f.calls.at(-1).payload.p_storage_receipt,'removed');});
test('empty remove acknowledgement and fresh HTTP404 absence can reconcile the same retired source',async()=>{const f=await fixture({removeBody:[]});assert.equal((await f.action(f.removeRequest)).status,200);assert.equal(f.calls.at(-1).payload.p_storage_receipt,'absent');});
test('retry after already-dispatched removal uses verify-only and never a new path',async()=>{const f=await fixture({verifyRemove:true});assert.equal((await f.action(f.removeRequest)).status,200);assert.equal(providerCalls(f).filter(x=>x.method==='DELETE').length,0);assert.ok(providerCalls(f)[0].path.endsWith(path));});
for(const status of [200,400,500])test('empty remove and info '+status+' stay unknown, no SQL clear',async()=>{const f=await fixture({removeBody:[],infoStatus:status});assert.equal((await f.action(f.removeRequest)).status,409);assert.equal(f.calls.filter(x=>x.payload?.p_action==='confirm_remove').length,0);});
test('404 alone cannot clear a source that SQL still sees; positive receipt tuple mismatch stays unknown',async()=>{for(const options of [{verifyRemove:true,confirmError:true},{confirmOverride:{item_id:O}}]){const f=await fixture(options);assert.equal((await f.action(f.removeRequest)).status,409);}});
test('wrong actor and spoofed request cannot dispatch another user transfer or removal',async()=>{const f=await fixture();assert.equal((await f.action(f.copyRequest,A)).status,409);assert.equal(providerCalls(f).length,0);});
test('actual entire Edge B branch identifies JWT user and returns without any Auth deletion',async()=>{const f=await fixture();const answer=await f.edge(f.copyRequest);assert.equal(answer.status,200);assert.equal(f.calls[0].path,'/auth/v1/user');assert.equal(f.calls[0].role,'user-B');assert.equal(f.calls.filter(x=>x.path.includes('/admin/users/')).length,0);});
test('unknown Edge action fails before prepare/Auth/Storage',async()=>{const f=await fixture();assert.equal((await f.edge({...f.copyRequest,action:'unknown'})).status,400);assert.equal(providerCalls(f).length,0);});
test('bounded Storage wait does not confirm late copy or expose provider details',async()=>{const gate=deferred(),f=await fixture({copyGate:gate});const result=await f.action(f.copyRequest,B,20);assert.equal(result.status,409);assert.equal(f.calls.filter(x=>x.payload?.p_action==='confirm_copy').length,0);gate.resolve();await Promise.resolve();});
test('current SDK user mismatch blocks request before Edge dispatch',async()=>{const f=await fixture();await f.setUid(B);assert.equal((await f.client.runAccountMediaRequest({...f.removeRequest},()=>true)).outcome,'rejected');assert.equal(f.calls.filter(x=>x.path.startsWith('/functions/')).length,0);});
test('SDK invoke receipt after A/B/A epoch loss cannot return current success',async()=>{const gate=deferred(),f=await fixture({invokeGate:gate});let current=true;const pending=f.client.runAccountMediaRequest(f.removeRequest,()=>current);await new Promise(r=>setTimeout(r,5));current=false;await f.setUid(B);await f.setUid(A);gate.resolve();assert.equal((await pending).outcome,'uncertain');});
test('SDK storage wait is bounded and never starts Edge after timeout',async()=>{const f=await fixture({fastDeadline:true}),gate=deferred(),original=f.sdk.auth.getSession.bind(f.sdk.auth);f.sdk.auth.getSession=async()=>{const r=await original();await gate.promise;return r;};const result=await f.client.runAccountMediaRequest(f.removeRequest,()=>true);assert.equal(result.outcome,'uncertain');gate.resolve();await new Promise(r=>setTimeout(r,5));assert.equal(f.calls.filter(x=>x.path.startsWith('/functions/')).length,0);});
test('mutated positive Edge receipt cannot acknowledge a different target or owner',async()=>{const f=await fixture({invokeBody:{confirmed:true,user_id:A,plan_id:P,item_id:O,state:'removed'}});assert.equal((await f.client.runAccountMediaRequest(f.removeRequest,()=>true)).outcome,'uncertain');});
test('B exact same-user replacement is valid for transfer while A cannot name itself successor',async()=>{const f=await fixture();await f.setUid(B);assert.equal((await f.client.runAccountMediaRequest(f.copyRequest,()=>true)).success,true);await f.setUid(A);assert.equal((await f.client.runAccountMediaRequest({...f.removeRequest,action:'prepare_media',replacement_user_id:A,media_plan_id:null,media_item_id:null},()=>true)).outcome,'rejected');});

test('same plan reselect RPC binds old/new generation and owner before any Storage',async()=>{const f=await fixture();const req={...f.removeRequest,action:'reselect_media_owner',media_item_id:null,next_plan_generation:NG};const answer=await f.action(req);assert.equal(answer.status,200);assert.equal(providerCalls(f).length,0);assert.deepEqual(f.calls[0].payload,{p_user_id:A,p_plan_id:P,p_expected_generation:G,p_expected_owner:B,p_replacement_user_id:B,p_next_generation:NG});});
test('old generation reservation/positive receipt cannot dispatch or acknowledge later ABA plan',async()=>{for(const options of [{claimOverride:{plan_generation:NG}},{confirmOverride:{plan_generation:NG}}]){const f=await fixture(options);assert.equal((await f.action(f.copyRequest)).status,409);if(options.claimOverride)assert.equal(providerCalls(f).length,0);}});
test('prepare missing or changed generation stays rejected/unknown before Storage',async()=>{const f=await fixture({prepareBody:{prepared:true,user_id:A,plan:{...plan,plan_generation:NG}}});const req={...f.removeRequest,action:'prepare_media',media_plan_id:null,media_item_id:null};assert.equal((await f.action(req)).status,409);assert.equal((await f.action({...req,media_plan_generation:null})).status,409);assert.equal(providerCalls(f).length,0);});
test('strict aggregate never treats missing epoch or owner-change eligibility as known',async()=>{const f=await fixture();for(const own of [{...plan,plan_generation:null},{...plan,reselect_allowed:undefined},{...plan,reselect_allowed:true,copied_count:1,next_copy_item_id:null,next_remove_item_id:I}])assert.equal(f.client.validAccountMediaStatus({...receipt,own},A),false);});

const C='00000000-0000-4000-8000-000000000003';
const resumeCode=await readFile(new URL('lib/accountDeletionResume.ts',root),'utf8');
function journalFixture(){const map=new Map(),control={drop:false,throw:false},exports={};const SecureStore={getItemAsync:async key=>map.get(key)??null,setItemAsync:async(key,value)=>{if(control.throw)throw new Error('fixture');if(!control.drop)map.set(key,value);}};
 new Function('exports','Platform','SecureStore','processLock','navigatorLock','authStorageKey','supabase','readOwnAccountMediaStatus',compile(resumeCode,'resume.ts'))(exports,{OS:'ios'},SecureStore,processLock,navigatorLock,'fixture',{},async()=>{throw new Error('unexpected transport');});return{helper:exports,map,control};}
const reselectJournalRequest={planId:P,expectedGeneration:G,expectedOwner:B,nextGeneration:NG,nextOwner:C};
const journalMedia=(owner=B,generation=G)=>({user_id:A,complete:true,blocked_count:0,own:{plan_id:P,plan_generation:generation,replacement_user_id:owner}});
test('first media journal generation is durable/readback before dispatch and reload preserves same nonce',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);assert.equal((await f.helper.readAccountDeletionPlan(A)).mediaGeneration,G);assert.deepEqual(await f.helper.persistAccountMediaJournal(A,B,G),await f.helper.readAccountDeletionPlan(A));});
test('changed generation or owner never resets a previously dispatched media journal',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);await assert.rejects(f.helper.persistAccountMediaJournal(A,B,NG));await assert.rejects(f.helper.persistAccountMediaJournal(A,C,G));assert.equal((await f.helper.readAccountDeletionPlan(A)).ownerId,B);});
test('journal write/drop-readback errors are surfaced without memory fallback',async()=>{for(const failure of ['throw','drop']){const f=journalFixture();f.control[failure]=true;await assert.rejects(f.helper.persistAccountMediaJournal(A,B,G));assert.equal(f.map.size,0);}});
test('explicit pending reselect persists exact old/new owner and nonce before RPC',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);const p=await f.helper.persistAccountMediaReselect(A,reselectJournalRequest);assert.equal(p.ownerId,B);assert.deepEqual(p.mediaReselect,reselectJournalRequest);});
test('lost reselect acknowledgement and old server receipt keep same immutable pending tuple',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);await f.helper.persistAccountMediaReselect(A,reselectJournalRequest);const p=await f.helper.reconcileAccountMediaJournal(A,journalMedia());assert.equal(p.ownerId,B);assert.deepEqual(p.mediaReselect,reselectJournalRequest);await assert.rejects(f.helper.persistAccountMediaReselect(A,{...reselectJournalRequest,nextOwner:B}));});
test('only exact new server plan/owner/generation receipt commits local new choice',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);await f.helper.persistAccountMediaReselect(A,reselectJournalRequest);await assert.rejects(f.helper.reconcileAccountMediaJournal(A,journalMedia(B,NG)));const p=await f.helper.reconcileAccountMediaJournal(A,journalMedia(C,NG));assert.equal(p.ownerId,C);assert.equal(p.mediaGeneration,NG);assert.equal(p.mediaReselect,undefined);});
test('old Auth attempt or unjournalled differing server choice does not silently unlock owner',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);await f.helper.reserveAccountDeletionAttempt(await f.helper.readAccountDeletionPlan(A));await assert.rejects(f.helper.persistAccountMediaReselect(A,reselectJournalRequest));await assert.rejects(f.helper.reconcileAccountMediaJournal(A,journalMedia(C,NG)));assert.equal((await f.helper.readAccountDeletionPlan(A)).ownerId,B);});

test('foreign caller receipt cannot change an own journal',async()=>{const f=journalFixture();await f.helper.persistAccountMediaJournal(A,B,G);await assert.rejects(f.helper.reconcileAccountMediaJournal(A,{...journalMedia(C,NG),user_id:B}));assert.equal((await f.helper.readAccountDeletionPlan(A)).ownerId,B);});

test('wrong reselect plan acknowledgement cannot clear original UI attempt',async()=>{const f=await fixture({invokeBody:{prepared:true,user_id:A,plan:{...plan,plan_id:O,plan_generation:NG}}});const req={...f.removeRequest,action:'reselect_media_owner',media_item_id:null,next_plan_generation:NG};assert.equal((await f.client.runAccountMediaRequest(req,()=>true)).outcome,'uncertain');});
