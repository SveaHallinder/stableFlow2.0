import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import test from 'node:test';
const sourceRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const dependencyRoot=existsSync(join(sourceRoot,'package.json'))?sourceRoot:JSON.parse(await readFile(join(sourceRoot,'../source-metadata.json'),'utf8')).repo;
const require=createRequire(join(dependencyRoot,'package.json')),ts=require('typescript'),{createClient}=require('@supabase/supabase-js');
const baseline=process.env.STABLEFLOW_CHAT_BASELINE==='1';
const chosen=baseline?join(sourceRoot,'../base'):sourceRoot;
const chatChosen=process.env.STABLEFLOW_CHAT_REV1==='1'?join(sourceRoot,'../history/rev1/source'):chosen;
const context=await readFile(join(chosen,'context/AppDataContext.tsx'),'utf8');
const ast=ts.createSourceFile('Context.tsx',context,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const provider=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AppDataProvider');
const callback=name=>provider.body.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(ast)===name).initializer.arguments[0].getText(ast);
const reducerSource=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='reducer').getText(ast);
const effect=provider.body.statements.find(n=>ts.isExpressionStatement(n)&&n.getText(ast).includes(".channel('messages-realtime')")).expression.arguments[0].getText(ast);
const compile=async code=>(await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64')));
const helper=await compile(await readFile(join(sourceRoot,'lib/chatReadReceipts.ts'),'utf8'));
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const A=uid(101),B=uid(102),CHAT=uid(201),OTHER_CHAT=uid(202),M1=uid(301),M2=uid(302),M3=uid(303),OWN=uid(304),NULL=uid(305),UNKNOWN=uid(309);
const messages=[{id:M1,conversationId:CHAT,authorId:B,text:'First',timestamp:'2026-10-07T12:00:00Z'}, {id:M2,conversationId:CHAT,authorId:B,text:'Latest',timestamp:'2026-10-07T12:05:00Z'}, {id:OWN,conversationId:CHAT,authorId:A,text:'Own',timestamp:'2026-10-07T12:01:00Z'}, {id:NULL,conversationId:CHAT,authorId:'',text:'Unknown author',timestamp:'2026-10-07T12:02:00Z'}];
const initial=()=>({sessionUserId:A,currentUserId:A,blockedUserIds:[],users:{},messages:[{id:CHAT,title:'Chat',description:'Latest',readMessageIds:[],unreadMessageIds:[M1,M2,NULL,UNKNOWN],unreadCount:4}],conversations:{[CHAT]:globalThis.structuredClone(messages)}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async predicate=>{for(let i=0;i<40&&!predicate();i++)await tick();assert.ok(predicate(),'Synthetic callback did not reach test gate');};
const defer=()=>{let resolve;const promise=new Promise(finish=>{resolve=finish;});return {promise,resolve};};
let clientNumber=0;
const jwt=id=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+36000})).toString('base64url')}.synthetic-signature`;
const session=id=>JSON.stringify({access_token:jwt(id),refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+36000,user:{id,aud:'authenticated',role:'authenticated'}});
async function sdkFixture({sharedReads=new Map(),serverMessages=[...messages,{id:UNKNOWN,authorId:B}],storageUser=A}={}){
 const controls={storageUser,delay:null,fail:false,lost:false,alter:null,storageError:null,storageDelay:null,active:true,loadMode:false,loadedMessages:null,delayLoad:null};
 const requests=[],writes=[];
 const sdk=createClient('https://sf-chat-read.example.test','synthetic-public-key',{auth:{storageKey:'sf-synthetic-chat-'+(++clientNumber),autoRefreshToken:false,detectSessionInUrl:false,persistSession:true,storage:{getItem(){if(controls.storageError)throw controls.storageError;if(controls.storageDelay)return controls.storageDelay.promise.then(()=>session(controls.storageUser));return session(controls.storageUser)},setItem(){},removeItem(){}}},global:{fetch:async(input,options)=>{
  const url=new URL(input);assert.equal(url.hostname,'sf-chat-read.example.test');assert.ok(url.pathname.startsWith('/rest/v1/'));
  if(controls.loadMode && !url.pathname.endsWith('own_chat_read_state') && !url.pathname.endsWith('mark_chat_messages_read')) {
    const rows = url.pathname.endsWith('/stable_members') ? [{id:uid(10),stable_id:uid(1),user_id:A,role:'admin',access:'owner'}]
      : url.pathname.endsWith('/stables') ? [{id:uid(1),name:'Synthetic stable'}]
      : url.pathname.endsWith('/conversations') ? [{id:CHAT,stable_id:uid(1),is_group:true,title:'Synthetic group'}]
      : url.pathname.endsWith('/messages') ? (controls.loadedMessages??messages).map(message=>({id:message.id,conversation_id:CHAT,author_id:message.authorId||null,text:message.text,created_at:message.timestamp}))
      : url.pathname.endsWith('/get_member_directory') ? [{id:A,full_name:'Anna'},{id:B,full_name:'Bo'}] : [];
    return new globalThis.Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});
  }
  assert.ok(['/rest/v1/rpc/own_chat_read_state','/rest/v1/rpc/mark_chat_messages_read'].includes(url.pathname));
  const body=JSON.parse(options.body),token=new globalThis.Headers(options.headers).get('authorization').split(' ')[1],caller=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub;
  requests.push({rpc:url.pathname.split('/').at(-1),caller,body});
  if(controls.delay)await controls.delay.promise;
  if(controls.delayLoad&&url.pathname.endsWith('own_chat_read_state'))await controls.delayLoad.promise;
  if(body.expected_user_id!==caller||!controls.active)return new globalThis.Response(JSON.stringify({code:'42501',message:'Rejected'}),{status:403,headers:{'content-type':'application/json'}});
  if(controls.fail)return new globalThis.Response(JSON.stringify({code:'PRIVATE response detail',message:'PRIVATE provider detail'}),{status:500,headers:{'content-type':'application/json'}});
  const read=sharedReads.get(caller)||new Set();
  if(url.pathname.endsWith('mark_chat_messages_read')){for(const id of body.message_ids)read.add(id);sharedReads.set(caller,read);writes.push({caller,ids:[...body.message_ids]});}
  if(controls.lost)return new globalThis.Response(JSON.stringify({code:'08006',message:'Receipt lost'}),{status:503,headers:{'content-type':'application/json'}});
  let data={user_id:caller,conversation_id:body.target_conversation_id,complete:true,requested_message_ids:body.message_ids,read_message_ids:body.message_ids.filter(id=>read.has(id)),known_read_message_ids:serverMessages.filter(message=>message.authorId!==caller&&read.has(message.id)).map(message=>message.id).sort(),unread_message_ids:serverMessages.filter(message=>message.authorId!==caller&&!read.has(message.id)).map(message=>message.id).sort()};
  if(controls.alter)data=controls.alter(data);
  return new globalThis.Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 }}});
 await sdk.auth.getSession();
 return {sdk,controls,requests,writes,sharedReads};
}
async function contextFixture(options={}){
 const transport=await sdkFixture(options),stateRef={current:initial()},chatReadScope={current:{userId:A,epoch:0}},pendingDataWrites={current:new Set()},dataWriteVersion={current:0},dispatched=[];
 let reducer;
 const dependencies={...helper,ensureSystemGroups:groups=>groups??[],resolveStableSettings:stable=>stable.settings,user:{id:A},stateRef,chatReadScope,pendingDataWrites,dataWriteVersion,isQaDemoMode:false,supabase:transport.sdk,dispatch:action=>{dispatched.push(action);stateRef.current=reducer(stateRef.current,action)},generateId:()=>uid(900),formatTimeAgo:()=> 'Now',persistConversationMessage:async message=>({success:true,data:message})};
 const loaded=(await compile(`export default ({${Object.keys(dependencies).join(',')}})=>{${reducerSource};return {reducer,mark:(${callback('markConversationRead')}),send:(${callback('sendConversationMessage')})};};`)).default(dependencies);
 reducer=loaded.reducer;return {...transport,dependencies,stateRef,chatReadScope,pendingDataWrites,dataWriteVersion,dispatched,...loaded};
}

test('no local clear before the actual SDK returns a verified own exact-ID receipt',async()=>{
 const f=await contextFixture();f.controls.delay=defer();const pending=f.mark(CHAT,[M1,NULL]);assert.equal(f.dispatched.length,0);await until(()=>f.requests.length===1);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.equal(f.dispatched.length,0);f.controls.delay.resolve();assert.equal((await pending).success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,2);assert.deepEqual(f.requests[0].body.message_ids,[M1,NULL]);assert.equal(f.pendingDataWrites.current.size,0);
});
test('failed/uncertain HTTP retains local unread and same-ID retry confirms already-stored receipts',async()=>{
 const f=await contextFixture();f.controls.lost=true;assert.equal((await f.mark(CHAT,[M1])).success,false);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.deepEqual([...f.sharedReads.get(A)],[M1]);f.controls.lost=false;assert.equal((await f.mark(CHAT,[M1])).success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,3);assert.deepEqual(f.requests.map(r=>r.body.message_ids),[[M1],[M1]]);
});
test('malformed/caller/chat/partial/truncated receipt never clears a badge',async()=>{
 for(const alter of [data=>({...data,user_id:B}),data=>({...data,conversation_id:OTHER_CHAT}),data=>({...data,complete:false}),data=>({...data,requested_message_ids:[]}),data=>({...data,read_message_ids:[]}),data=>({...data,unread_message_ids:[M1]}),data=>({...data,unread_message_ids:null}),data=>({...data,known_read_message_ids:null}),data=>({...data,known_read_message_ids:[]}),data=>({...data,known_read_message_ids:[M1,M2]})]){const f=await contextFixture();f.controls.alter=alter;assert.equal((await f.mark(CHAT,[M1])).success,false);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.equal(f.dispatched.length,0);}
});
test('actual SDK global stored session B is rejected by expected-UID fence before any read write for A',async()=>{
 const f=await contextFixture();f.controls.storageUser=B;assert.equal((await f.mark(CHAT,[M1])).success,false);assert.equal(f.requests[0].caller,B);assert.equal(f.requests[0].body.expected_user_id,A);assert.equal(f.writes.length,0);assert.equal(f.dispatched.length,0);
});
test('late A receipt after A→B→A cannot alter a newer account epoch',async()=>{
 const f=await contextFixture();f.controls.delay=defer();const pending=f.mark(CHAT,[M1]);await until(()=>f.requests.length===1);f.chatReadScope.current={userId:B,epoch:1};f.stateRef.current={...initial(),currentUserId:B,sessionUserId:B};f.chatReadScope.current={userId:A,epoch:2};f.stateRef.current=initial();const before=globalThis.structuredClone(f.stateRef.current);f.controls.delay.resolve();assert.equal((await pending).success,false);assert.deepEqual(f.stateRef.current,before);assert.equal(f.dispatched.length,0);
});
test('stale account callback and own/unloaded/blocked IDs dispatch no RPC',async()=>{
 const f=await contextFixture();for(const ids of [[OWN],[UNKNOWN],[]])assert.equal((await f.mark(CHAT,ids)).success,false);f.stateRef.current.blockedUserIds=[B];assert.equal((await f.mark(CHAT,[M1])).success,false);f.chatReadScope.current={userId:B,epoch:1};assert.equal((await f.mark(CHAT,[NULL])).success,false);assert.equal(f.requests.length,0);
});
test('complete SDK JSON metadata retains >1000 unknown history IDs; false complete is rejected',async()=>{
 const serverMessages=Array.from({length:2005},(_,i)=>({id:uid(10000+i),authorId:B}));const f=await sdkFixture({serverMessages});let r=await helper.requestChatReadReceipt(f.sdk,'load',A,CHAT,[]);assert.equal(r.success,true);assert.equal(r.data.unreadMessageIds.length,2005);f.controls.alter=data=>({...data,complete:false,unread_message_ids:[]});r=await helper.requestChatReadReceipt(f.sdk,'load',A,CHAT,[]);assert.equal(r.success,false);
});
test('two actual SDK clients and reload resolve overlapping/disjoint durable read sets',async()=>{
 const sharedReads=new Map(),one=await sdkFixture({sharedReads}),two=await sdkFixture({sharedReads});await helper.requestChatReadReceipt(one.sdk,'mark',A,CHAT,[M1,NULL]);await helper.requestChatReadReceipt(two.sdk,'mark',A,CHAT,[M1,M2]);const reload=await sdkFixture({sharedReads});const r=await helper.requestChatReadReceipt(reload.sdk,'load',A,CHAT,[M1,M2,NULL]);assert.equal(r.success,true);assert.deepEqual(r.data.readMessageIds,[M1,M2,NULL]);assert.deepEqual(r.data.unreadMessageIds,[UNKNOWN]);
});
test('out-of-order unique peer updates unread independently of preview ordering; duplicate/read echo do not increment',async()=>{
 const f=await contextFixture({serverMessages:[...messages,{id:UNKNOWN,authorId:B},{id:M3,authorId:B}]});const old={id:M3,conversationId:CHAT,authorId:B,text:'Older arrival',timestamp:'2026-10-07T11:00:00Z'};const action={type:'CONVERSATION_APPEND',payload:{conversationId:CHAT,message:old,preview:{...f.stateRef.current.messages[0],description:old.text,unreadCount:99}}};f.dependencies.dispatch(action);assert.equal(f.stateRef.current.messages[0].description,'Latest');assert.equal(f.stateRef.current.messages[0].unreadCount,5);f.dependencies.dispatch(action);assert.equal(f.stateRef.current.messages[0].unreadCount,5);await f.mark(CHAT,[M3]);f.dependencies.dispatch(action);assert.equal(f.stateRef.current.messages[0].unreadCount,4);
});
test('send acknowledgement retains concurrent read/unread state instead of zero or captured preview',async()=>{
 const f=await contextFixture(),operation=defer();f.dependencies.persistConversationMessage=()=>operation.promise;
 const load=(await compile(`export default ({${Object.keys(f.dependencies).join(',')}})=>(${callback('sendConversationMessage')});`)).default;
 const send=load(f.dependencies);const result=send(CHAT,'New own',uid(900));await f.mark(CHAT,[M1]);f.dependencies.dispatch({type:'CONVERSATION_APPEND',payload:{conversationId:CHAT,message:{id:M3,authorId:B,text:'Incoming',timestamp:'2026-10-07T13:00:00Z'},preview:{...f.stateRef.current.messages[0],description:'Incoming'}}});operation.resolve({success:true,data:{id:uid(900),authorId:A,text:'New own',timestamp:'2026-10-07T12:59:00Z'}});assert.equal((await result).success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.equal(f.stateRef.current.messages[0].description,'Incoming');assert.ok(f.stateRef.current.messages[0].readMessageIds.includes(M1));
});
test('new local incoming after a server snapshot remains unread exactly once through read acknowledgement',async()=>{
 const f=await contextFixture();f.controls.delay=defer();const pending=f.mark(CHAT,[M1]);await until(()=>f.requests.length===1);f.dependencies.dispatch({type:'CONVERSATION_APPEND',payload:{conversationId:CHAT,message:{id:M3,authorId:B,text:'Incoming later',timestamp:'2026-10-07T13:00:00Z'},preview:{...f.stateRef.current.messages[0],description:'Incoming later'}}});f.controls.delay.resolve();assert.equal((await pending).success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.equal(new Set(helper.chatUnreadIds(f.stateRef.current.messages[0],f.stateRef.current.conversations[CHAT],A,[])).size,4);
});
test('known blocked/own messages are removed from stale metadata while nullable author remains peer',()=>{
 assert.deepEqual(helper.chatUnreadIds({readMessageIds:[],unreadMessageIds:[M1,OWN,NULL,UNKNOWN]},messages,A,[B]),[NULL,UNKNOWN]);
});
test('viewport intersection excludes layout-only/offscreen/clipped rows and supports a fully visible tall text row',()=>{
 const layouts=new Map([[M1,{y:0,height:30}],[M2,{y:120,height:30}],[M3,{y:40,height:300}]]);assert.deepEqual(helper.visibleMessageIds(layouts,{y:0,height:100},[M1,M2]),[M1]);assert.deepEqual(helper.visibleMessageIds(layouts,{y:120,height:20,fullHeight:500},[M2]),[]);assert.deepEqual(helper.visibleMessageIds(layouts,{y:160,height:100},[M3]),[M3]);assert.deepEqual(helper.visibleMessageIds(layouts,{y:160,height:20,fullHeight:100},[M3]),[]);assert.deepEqual(helper.visibleMessageIds(layouts,{y:0,height:0},[M1]),[]);
});

async function componentFixture({focused=true,foreground=true,windowTop=0,windowHeight=500,windowLeft=0,windowWidth=500,web=false,parentClip=null,visualViewport=null}={}){
 const source=await readFile(join(chatChosen,'app/chat/[id].tsx'),'utf8'),treeAst=ts.createSourceFile('Chat.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const body=treeAst.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(treeAst).replace(/^export default /,'')).join('\n');
 const hooks=[],effects=[],requests=[],listeners=new Set(),webListeners=new Map(),afterUnmountSetters=[];let cursor=0,dirty=true,tree,mounted=true;const config={focused,foreground,windowTop,windowHeight,windowLeft,windowWidth,measureHeight:100,measureDelay:false,measureCallbacks:[],parentClip,visualViewport,response:async()=>({success:true})};
 const app={state:initial(),actions:{markConversationRead:async(chat,ids)=>{requests.push({chat,ids});return config.response(chat,ids)},sendConversationMessage:async()=>({success:true})}};
 const memo=(fn,deps)=>{const n=cursor++,previous=hooks[n];if(!previous||deps.some((v,i)=>v!==previous.deps[i]))hooks[n]={deps,value:fn()};return hooks[n].value};
 const React={createElement:(tag,props,...children)=>({tag,props:props||{},children:children.flat(Infinity).filter(v=>v!==null&&v!==false&&v!==undefined)}),useState:initial=>{const n=cursor++;if(!hooks[n])hooks[n]={value:typeof initial==='function'?initial():initial};return [hooks[n].value,value=>{if(!mounted){afterUnmountSetters.push(n);return;}const next=typeof value==='function'?value(hooks[n].value):value;if(!Object.is(next,hooks[n].value)){hooks[n].value=next;dirty=true}}]},useRef:initial=>{const n=cursor++;if(!hooks[n])hooks[n]={value:{current:initial}};return hooks[n].value},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect:(fn,deps)=>{const n=cursor++,previous=hooks[n];if(!previous||deps.some((v,i)=>v!==previous.deps[i])){hooks[n]={deps,cleanup:previous?.cleanup};effects.push(()=>{previous?.cleanup?.();hooks[n].cleanup=fn()})}}};
 const auth={user:{id:A}};
 const dependencies={React,AppState:{get currentState(){return config.foreground?'active':'background'},addEventListener:(_event,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)}}},Dimensions:{get:()=>({height:config.windowHeight,width:config.windowWidth}),addEventListener:()=>({remove(){}})},KeyboardAvoidingView:'View',Platform:{OS:web?'web':'ios'},document:{get visibilityState(){return config.foreground?'visible':'hidden'},addEventListener(){},removeEventListener(){}},window:{get visualViewport(){return config.visualViewport},addEventListener:(event,fn)=>{if(!webListeners.has(event))webListeners.set(event,new Set());webListeners.get(event).add(fn)},removeEventListener:(event,fn)=>webListeners.get(event)?.delete(fn),getComputedStyle:element=>({overflowY:element.overflowY??'hidden',overflowX:element.overflowX??'visible'})},ScrollView:'ScrollView',StyleSheet:{create:value=>value},Text:'Text',TextInput:'TextInput',TouchableOpacity:'Button',View:'View',SafeAreaView:'View',useLocalSearchParams:()=>({id:app.state.messages[0].id}),useRouter:()=>({back(){}}),useIsFocused:()=>config.focused,LinearGradient:'View',theme:{colors:{},gradients:{background:[]}},radius:{},space:{},HeaderIconButton:'Button',ScreenHeader:'Header',Avatar:'Avatar',DesktopNav:'Nav',useAppData:()=>app,useIsDesktopWeb:()=>false,UserGroupsIcon:'Icon',useToast:()=>({showToast(){}}),generateId:()=>uid(800),...helper,useAuth:()=>auth};
 const component=(await compile(`export default ({${Object.keys(dependencies).join(',')}})=>{${body};return ChatScreen;};`)).default(dependencies);
 const nodes=node=>typeof node==='object'&&node?[node,...node.children.flatMap(nodes)]:[];
 const render=()=>{cursor=0;dirty=false;tree=component();const scroll=nodes(tree).find(node=>node.tag==='ScrollView');if(scroll?.props.ref)scroll.props.ref.current={scrollToEnd(){},getNativeScrollRef:()=>({get parentElement(){return config.parentClip},measureInWindow:callback=>{const run=()=>callback(config.windowLeft,config.windowTop,400,config.measureHeight);if(config.measureDelay)config.measureCallbacks.push(run);else run()}})};while(effects.length)effects.shift()();};
 const flush=async()=>{for(let i=0;i<12;i++){if(dirty)render();await tick();}if(dirty)render();};
 render();await flush();
 const scroll=()=>nodes(tree).find(node=>node.tag==='ScrollView');
 const layout=(id,y,height=30)=>nodes(tree).find(node=>node.props.key===id)?.props.onLayout?.({nativeEvent:{layout:{y,height}}});
 const viewport=(y=0,height=100)=>{config.measureHeight=height;scroll().props.onLayout?.({nativeEvent:{layout:{height}}});scroll().props.onScroll?.({nativeEvent:{contentOffset:{y}}});};
 const text=node=>typeof node==='object'&&node?node.children.map(text).join(' '):String(node??'');
 return {app,auth,config,requests,webListeners,afterUnmountSetters,flush,layout,viewport,scroll,render,rerender:()=>{dirty=true},foreground:value=>{config.foreground=value;for(const fn of listeners)fn(value?'active':'background')},get text(){return text(tree)},get nodes(){return nodes(tree)},dispose(){mounted=false;for(const hook of hooks)hook.cleanup?.()}};
}

test('actual chat route/render/layout alone causes no read dispatch; focused visible peer IDs only',async()=>{
 const f=await componentFixture();assert.equal(f.requests.length,0);f.config.response=()=>new Promise(()=>{});f.layout(M1,0);f.layout(M2,120);f.layout(OWN,30);f.layout(NULL,60);f.viewport();await f.flush();assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].ids,[M1,NULL]);f.dispose();
});
test('actual chat background/unfocused observers cannot dispatch and become valid only after fresh focused measurement',async()=>{
 const f=await componentFixture({focused:false});f.layout(M1,0);f.viewport();await f.flush();assert.equal(f.requests.length,0);f.config.focused=true;f.foreground(false);f.rerender();await f.flush();assert.equal(f.requests.length,0);f.config.response=()=>new Promise(()=>{});f.foreground(true);f.rerender();await f.flush();assert.equal(f.requests.length,1);f.dispose();
});
test('actual browser-window clip rejects rows inside ScrollView but below visible window',async()=>{
 const f=await componentFixture({windowTop:490,windowHeight:500});f.layout(M1,0,30);f.viewport(0,100);await f.flush();assert.equal(f.requests.length,0);f.config.windowTop=400;f.config.response=()=>new Promise(()=>{});f.viewport();await f.flush();assert.deepEqual(f.requests[0].ids,[M1]);f.dispose();
});
test('late viewport measurement and old focus/account/chat layout callback cannot create read dispatch',async()=>{
 const f=await componentFixture();f.config.measureDelay=true;f.layout(M1,0);f.viewport();const callbacks=f.config.measureCallbacks.splice(0),oldLayout=f.nodes.find(n=>n.props.key===M1).props.onLayout;f.config.focused=false;f.rerender();await f.flush();for(const run of callbacks)run();oldLayout({nativeEvent:{layout:{y:0,height:30}}});await f.flush();assert.equal(f.requests.length,0);f.auth.user={id:B};f.app.state={...initial(),currentUserId:B,sessionUserId:B};f.rerender();await f.flush();oldLayout({nativeEvent:{layout:{y:0,height:30}}});for(const run of f.config.measureCallbacks.splice(0))run();await f.flush();assert.equal(f.requests.length,0);f.dispose();
});
test('uncertain save keeps retry visible; fresh verified own read state clears obsolete failure copy',async()=>{
 const f=await componentFixture();f.config.response=async()=>({success:false,reason:'Läskvittensen kunde inte bekräftas. Olästmarkeringen finns kvar här. Försök igen.'});f.layout(M1,0);f.viewport();await f.flush();assert.match(f.text,/kunde inte bekräftas/);assert.equal(f.requests.length,1);f.app.state.messages[0]={...f.app.state.messages[0],readMessageIds:[M1],unreadMessageIds:[M2,NULL,UNKNOWN],unreadCount:3};f.rerender();await f.flush();assert.doesNotMatch(f.text,/kunde inte bekräftas/);f.dispose();
});
for(const change of ['scroll','viewport','repeated failure'])test(`actual explicit retry retains failed IDs after ${change}; automatic read uses new visible IDs`,async()=>{
 const f=await componentFixture();f.config.response=async()=>({success:false,reason:'Syntetiskt fel. Försök igen.'});f.layout(M1,0);f.layout(M2,120);f.viewport();await f.flush();
 assert.deepEqual(f.requests.map(request=>request.ids),[[M1]]);
 if(change==='viewport')f.viewport(500,20);else f.viewport(120,100);await f.flush();
 assert.equal(f.requests.length,1);let retry=f.nodes.find(node=>node.props.accessibilityLabel==='Försök spara läskvittensen igen');assert.equal(retry.props.disabled,false);
 if(change==='repeated failure'){await retry.props.onPress();await f.flush();assert.deepEqual(f.requests.map(request=>request.ids),[[M1],[M1]]);retry=f.nodes.find(node=>node.props.accessibilityLabel==='Försök spara läskvittensen igen');}
 f.config.response=async(_chat,ids)=>{const preview=f.app.state.messages[0];f.app.state.messages[0]={...preview,readMessageIds:[...new Set([...preview.readMessageIds,...ids])],unreadMessageIds:preview.unreadMessageIds.filter(id=>!ids.includes(id))};return {success:true};};
 await retry.props.onPress();await f.flush();assert.deepEqual(f.requests[change==='repeated failure'?2:1].ids,[M1]);
 if(change!=='viewport')assert.deepEqual(f.requests.at(-1).ids,[M2]);else assert.equal(f.requests.length,2);
 assert.doesNotMatch(f.text,/Syntetiskt fel/);f.dispose();
});
test('late A error after A→B→A does not show a toast/error or clear a newer pending UI state',async()=>{
 const f=await componentFixture(),pending=defer();f.config.response=()=>pending.promise;f.layout(M1,0);f.viewport();await f.flush();assert.equal(f.requests.length,1);f.auth.user={id:B};f.app.state={...initial(),currentUserId:B,sessionUserId:B};f.rerender();await f.flush();f.auth.user={id:A};f.app.state=initial();f.rerender();await f.flush();pending.resolve({success:false,reason:'OLD_ACCOUNT_ERROR'});await f.flush();assert.doesNotMatch(f.text,/OLD_ACCOUNT_ERROR/);f.dispose();
});
test('unloaded singular empty state remains outside the scroll history, without marking its ID',async()=>{
 const f=await componentFixture();const scroll=f.scroll();const text=node=>typeof node==='object'&&node?node.children.map(text).join(' '):String(node??'');assert.doesNotMatch(text(scroll),/utanför den historik/);assert.match(f.text,/1 oläst meddelande finns utanför den historik/);assert.equal(f.requests.length,0);f.dispose();
});
test('actual message-list click navigates without any local mark/reset',async()=>{
 const source=await readFile(join(chosen,'app/(tabs)/messages.tsx'),'utf8'),a=ts.createSourceFile('Messages.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),screen=a.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='MessagesScreen');
 const declaration=screen.body.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(a)==='handleOpenConversation');const marks=[],navigations=[];
 const open=(await compile(`export default ({actions,router})=>(${declaration.initializer.getText(a)});`)).default({actions:{markConversationRead:chat=>marks.push(chat)},router:{push:value=>navigations.push(value)}});open({id:CHAT,title:'Peer'});assert.equal(marks.length,0);assert.equal(navigations[0].params.id,CHAT);
});


test('actual realtime effect preserves cleanup/session guards, nullable peer and duplicate IDs',async()=>{
 const f=await contextFixture();let receive;const channel={on(_event,_filter,fn){receive=fn;return this},subscribe(){return this}};
 const deps={...f.dependencies,supabase:{channel:()=>channel,removeChannel:()=>{}}};
 const subscription=(await compile(`export default ({${Object.keys(deps).join(',')}})=>(${effect});`)).default(deps)();
 const emit=author=>receive({new:{id:M3,conversation_id:CHAT,author_id:author,text:'Older nullable peer',created_at:'2026-10-07T11:00:00Z',status:null}});
 emit(null);emit(null);emit(A);assert.equal(f.stateRef.current.messages[0].unreadCount,5);assert.equal(f.stateRef.current.messages[0].description,'Latest');assert.equal(f.stateRef.current.conversations[CHAT].find(message=>message.id===M3).authorId,'');subscription();f.stateRef.current={...f.stateRef.current,currentUserId:B,sessionUserId:B};f.stateRef.current={...f.stateRef.current,currentUserId:A,sessionUserId:A};const before=globalThis.structuredClone(f.stateRef.current);emit(B);assert.deepEqual(f.stateRef.current,before);
});
test('SDK HTTP/storage exceptions log only feature and safe class/code, without private details',async()=>{
 const f=await contextFixture(),warnings=[];const original=console.warn;console.warn=(...values)=>warnings.push(values);
 try{f.controls.fail=true;assert.equal((await f.mark(CHAT,[M1])).success,false);f.controls.fail=false;f.controls.storageError=new Error('PRIVATE storage/session detail');assert.equal((await f.mark(CHAT,[M1])).success,false);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.doesNotMatch(JSON.stringify(warnings),/PRIVATE|session detail|synthetic-signature/);assert.ok(warnings.every(values=>values[0].startsWith('[chat read]')));}finally{console.warn=original;}
});
async function loadFixture(){
 const f=await contextFixture();f.controls.loadMode=true;f.stateRef.current.currentStableId=uid(1);
 const deps={...f.dependencies,refreshRequestId:{current:0},setHydrating(){},setRefreshing(){},setRefreshError(){},setLastRefreshedAt(){},loadPendingOwnerStable:async()=>null,loadPendingJoinCode:async()=>null,loadDefaultPassDraft:async()=>[],fetchPaddocks:async()=>({data:[],error:null}),defaultPassesStableId:{current:''},autoAssignmentAttempts:{current:new Map()},showToast(){},POSTS_PAGE_SIZE:50,resolvePostsCursor:()=>null};
 const load=(await compile(`export default ({${Object.keys(deps).join(',')}})=>(${callback('loadAppData')});`)).default(deps);
 return {...f,load};
}
test('actual hydration reads complete own receipt instead of zeroing unread after reload',async()=>{
 const f=await loadFixture();f.sharedReads.set(A,new Set([M1]));const result=await f.load();assert.equal(result.success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,3);assert.deepEqual(f.stateRef.current.messages[0].unreadMessageIds,[M2,NULL,UNKNOWN]);assert.ok(f.requests.some(request=>request.rpc==='own_chat_read_state'));
});
test('failed complete read metadata preserves prior data with an explicit refresh error',async()=>{
 const f=await loadFixture();f.controls.alter=data=>({...data,complete:false,unread_message_ids:[]});const before=globalThis.structuredClone(f.stateRef.current);assert.equal((await f.load()).success,false);assert.deepEqual(f.stateRef.current,before);assert.equal(f.dispatched.length,0);
});
test('actual refresh/writeVersion guard rejects a stale read snapshot after a confirmed read acknowledgement',async()=>{
 const f=await loadFixture();f.controls.delayLoad=defer();const refresh=f.load();await until(()=>f.requests.some(request=>request.rpc==='own_chat_read_state'));assert.equal((await f.mark(CHAT,[M1])).success,true);const before=globalThis.structuredClone(f.stateRef.current);f.controls.delayLoad.resolve();assert.equal((await refresh).success,false);assert.deepEqual(f.stateRef.current,before);assert.equal(f.dispatched.filter(action=>action.type==='STATE_HYDRATE').length,0);
});


test('actual web ancestor clip, not just window/native layout height, fences unread rows',async()=>{
 const parent={parentElement:null,clientTop:0,clientHeight:50,getBoundingClientRect:()=>({top:0})};
 const f=await componentFixture({web:true,parentClip:parent});f.layout(M1,60);f.viewport();await f.flush();assert.equal(f.requests.length,0);parent.clientHeight=100;f.config.response=()=>new Promise(()=>{});f.viewport();await f.flush();assert.deepEqual(f.requests[0].ids,[M1]);f.dispose();
});
test('a later scroll measurement wins over an older native measurement callback',async()=>{
 const f=await componentFixture();f.config.measureDelay=true;f.config.response=()=>new Promise(()=>{});f.layout(M1,0);f.layout(M2,120);f.viewport(0,100);const old=f.config.measureCallbacks.splice(0);f.viewport(120,100);const current=f.config.measureCallbacks.splice(0);for(const run of current)run();for(const run of old)run();await f.flush();assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].ids,[M2]);f.dispose();
});


for(const change of ['focus','chat','unmount'])test(`old failed retry callback after ${change} change cannot dispatch or mutate state`,async()=>{
 const f=await componentFixture();f.config.response=async()=>({success:false,reason:'Syntetiskt fel. Försök igen.'});f.layout(M1,0);f.viewport();await f.flush();const retry=f.nodes.find(n=>n.props.accessibilityLabel==='Försök spara läskvittensen igen').props.onPress;assert.equal(f.requests.length,1);
 if(change==='focus'){f.config.focused=false;f.rerender();await f.flush();}else if(change==='chat'){f.app.state={...initial(),messages:[{...initial().messages[0],id:OTHER_CHAT}],conversations:{[OTHER_CHAT]:[]}};f.rerender();await f.flush();}else f.dispose();
 const before=f.requests.length;await retry();await f.flush();assert.equal(f.requests.length,before);assert.equal(f.afterUnmountSetters.length,0);if(change!=='unmount')f.dispose();
});
test('old failed retry after focus ABA cannot reuse a newer render epoch',async()=>{
 const f=await componentFixture();f.config.response=async()=>({success:false,reason:'Syntetiskt fel. Försök igen.'});f.layout(M1,0);f.viewport();await f.flush();const retry=f.nodes.find(n=>n.props.accessibilityLabel==='Försök spara läskvittensen igen').props.onPress;f.config.focused=false;f.rerender();await f.flush();f.config.focused=true;f.rerender();await f.flush();const before=f.requests.length;await retry();await f.flush();assert.equal(f.requests.length,before);f.dispose();
});
test('actual visual viewport zoom/pan rejects layout-only rows and fresh visual events accept visible peers',async()=>{
 const events=new Map(),visualViewport={width:500,offsetLeft:0,height:250,offsetTop:100,scale:2,addEventListener:(event,fn)=>{if(!events.has(event))events.set(event,new Set());events.get(event).add(fn)},removeEventListener:(event,fn)=>events.get(event)?.delete(fn)};
 const f=await componentFixture({web:true,windowHeight:500,visualViewport});f.layout(M1,400);f.viewport(0,500);await f.flush();assert.equal(f.requests.length,0);f.config.response=()=>new Promise(()=>{});visualViewport.offsetTop=250;for(const fn of events.get('scroll')??[])fn();await f.flush();assert.deepEqual(f.requests,[{chat:CHAT,ids:[M1]}]);f.dispose();assert.ok([...events.values()].every(set=>set.size===0));
});
test('old window viewport listener after focus ABA cannot begin a fresh native measurement',async()=>{
 const f=await componentFixture({web:true});const previous=[...f.webListeners.get('scroll')][0];f.config.focused=false;f.rerender();await f.flush();f.config.focused=true;f.rerender();await f.flush();f.config.measureDelay=true;f.config.measureCallbacks=[];previous();await f.flush();assert.equal(f.config.measureCallbacks.length,0);f.dispose();
});

test('late INSERT for an already-read peer outside the loaded cap does not recreate unread after complete hydration',async()=>{
 const serverMessages=[...messages,{id:M3,authorId:B}],sharedReads=new Map([[A,new Set([M3])]]),f=await contextFixture({serverMessages,sharedReads});
 const loaded=await helper.requestChatReadReceipt(f.sdk,'load',A,CHAT,helper.peerMessageIds(messages,A,[]));assert.equal(loaded.success,true);f.stateRef.current.messages[0]={...f.stateRef.current.messages[0],...loaded.data,unreadCount:loaded.data.unreadMessageIds.length};assert.equal(f.stateRef.current.messages[0].unreadCount,3);
 f.dependencies.dispatch({type:'CONVERSATION_APPEND',payload:{conversationId:CHAT,message:{id:M3,authorId:B,text:'Synthetic delayed already-read peer',timestamp:'2026-10-07T13:00:00Z'},preview:{...f.stateRef.current.messages[0],description:'Synthetic delayed already-read peer'}}});assert.equal(f.stateRef.current.messages[0].unreadCount,3);
});

test('block hydrate recomputes known peer unread and rollback retains concurrent receipt metadata',async()=>{
 const f=await contextFixture();f.dependencies.dispatch({type:'STATE_HYDRATE',payload:{blockedUserIds:[B]}});assert.equal(f.stateRef.current.messages[0].unreadCount,2);f.dependencies.dispatch({type:'STATE_HYDRATE',payload:{blockedUserIds:[]}});assert.equal(f.stateRef.current.messages[0].unreadCount,4);
});
test('actual Chat hides blocked known peers without calling them unloaded history',async()=>{
 const f=await componentFixture();f.app.state.conversations[CHAT]=messages.filter(message=>message.id!==NULL);f.app.state.messages[0]={...f.app.state.messages[0],unreadMessageIds:[M1,M2,UNKNOWN],unreadCount:3};f.app.state.blockedUserIds=[B];f.rerender();await f.flush();assert.match(f.text,/1 oläst meddelande finns utanför den historik/);assert.doesNotMatch(f.text,/3 olästa meddelanden finns utanför/);assert.equal(f.requests.length,0);f.dispose();
});


test('real SDK storage preflight is bounded at fifteen seconds and late success cannot clear before an explicit retry',async()=>{
 const f=await contextFixture(),gate=defer();f.controls.storageDelay=gate;const started=Date.now();const result=await f.mark(CHAT,[M1]);assert.equal(result.success,false);assert.match(result.reason,/kunde inte bekräftas/);assert.ok(Date.now()-started>=14_900);assert.ok(Date.now()-started<25_000);assert.equal(f.requests.length,0);assert.equal(f.dispatched.length,0);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.equal(f.pendingDataWrites.current.size,0);
 gate.resolve();await until(()=>f.writes.length===1);await tick();assert.equal(f.dispatched.length,0);assert.equal(f.stateRef.current.messages[0].unreadCount,4);f.controls.storageDelay=null;assert.equal((await f.mark(CHAT,[M1])).success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,3);assert.deepEqual(f.requests.map(request=>request.body.message_ids),[[M1],[M1]]);
});


test('actual horizontal visual viewport excludes a completely sideways-clipped chat and accepts fresh overlap',async()=>{
 const events=new Map(),visualViewport={width:200,offsetLeft:0,height:100,offsetTop:0,scale:5,addEventListener:(event,fn)=>{if(!events.has(event))events.set(event,new Set());events.get(event).add(fn)},removeEventListener:(event,fn)=>events.get(event)?.delete(fn)};const f=await componentFixture({web:true,windowWidth:1000,windowLeft:250,visualViewport});f.layout(M1,0);f.viewport();await f.flush();assert.equal(f.requests.length,0);f.config.response=()=>new Promise(()=>{});visualViewport.offsetLeft=200;for(const fn of events.get('scroll')??[])fn();await f.flush();assert.deepEqual(f.requests,[{chat:CHAT,ids:[M1]}]);f.dispose();
});
test('actual horizontal clipping ancestor also excludes a sideways-hidden ScrollView',async()=>{
 const parent={parentElement:null,overflowX:'hidden',overflowY:'visible',clientLeft:0,clientWidth:200,getBoundingClientRect:()=>({left:0,top:0})};const f=await componentFixture({web:true,windowLeft:250,windowWidth:1000,parentClip:parent});f.layout(M1,0);f.viewport();await f.flush();assert.equal(f.requests.length,0);parent.clientWidth=700;f.config.response=()=>new Promise(()=>{});f.viewport();await f.flush();assert.deepEqual(f.requests,[{chat:CHAT,ids:[M1]}]);f.dispose();
});

test('recovered private creation keeps unread explicitly unknown until own complete hydration after a lost membership receipt',async()=>{
 const requests=[],server={conversation:false,members:false,peer:false,lost:true},response=(data,status=200)=>new globalThis.Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 const sdk=createClient('https://sf-private-bootstrap.example.test','synthetic-public-key',{auth:{storageKey:'sf-synthetic-private',autoRefreshToken:false,detectSessionInUrl:false,persistSession:true,storage:{getItem:()=>session(A),setItem(){},removeItem(){}}},global:{fetch:async(input,options)=>{const url=new URL(input),method=options.method??'GET',body=options.body?JSON.parse(options.body):null;assert.equal(url.hostname,'sf-private-bootstrap.example.test');requests.push({path:url.pathname,method,body});if(url.pathname==='/rest/v1/conversations'){const row={id:CHAT,created_by_user_id:A,is_group:false,stable_id:null};if(method==='POST'){if(server.conversation)return response({code:'23505'},409);server.conversation=true;return response(row)}return response(row)}if(url.pathname==='/rest/v1/conversation_members'){if(method==='POST'){if(server.members)return response({code:'23505'},409);server.members=true;return new globalThis.Response(null,{status:201})}if(server.lost){server.lost=false;server.peer=true;return response({code:'08006'},503)}return response([{conversation_id:CHAT,user_id:A},{conversation_id:CHAT,user_id:B}])}if(url.pathname.endsWith('/rpc/own_chat_read_state'))return response({user_id:A,conversation_id:CHAT,complete:true,requested_message_ids:body.message_ids,read_message_ids:[],known_read_message_ids:[],unread_message_ids:server.peer?[M1]:[]});throw new Error('Unexpected synthetic endpoint');}}});await sdk.auth.getSession();
 const stateRef={current:{...initial(),currentStableId:uid(1),users:{[B]:{id:B,name:'Synthetic peer'}},messages:[],conversations:{}}},privateConversationAttempts={current:new Map()},pendingDataWrites={current:new Set()},dataWriteVersion={current:0};let reducer;const deps={...helper,stateRef,privateConversationAttempts,pendingDataWrites,dataWriteVersion,isQaDemoMode:false,supabase:sdk,generateId:()=>CHAT,ensureSystemGroups:g=>g??[],resolveStableSettings:s=>s.settings,dispatch:action=>{stateRef.current=reducer(stateRef.current,action)}};const actual=(await compile(`export default ({${Object.keys(deps).join(',')}})=>{${reducerSource};return {reducer,create:(${callback('createPrivateConversation')})};};`)).default(deps);reducer=actual.reducer;assert.equal((await actual.create(B)).success,false);assert.equal(server.peer,true);assert.equal(stateRef.current.messages.length,0);assert.equal((await actual.create(B)).success,true);const preview=stateRef.current.messages[0];assert.equal(preview.id,CHAT);assert.equal(preview.unreadCount,undefined);assert.equal(preview.readMessageIds,undefined);assert.equal(preview.unreadMessageIds,undefined);assert.match(preview.description,/Historiken behöver uppdateras/);assert.equal(requests.filter(r=>r.path.endsWith('/rpc/own_chat_read_state')).length,0);assert.equal(pendingDataWrites.current.size,0);
});


test('actual hydration with no loaded message rows keeps complete unread and neutral history copy',async()=>{
 const f=await loadFixture();f.controls.loadedMessages=[];assert.equal((await f.load()).success,true);assert.equal(f.stateRef.current.messages[0].unreadCount,4);assert.equal(f.stateRef.current.messages[0].description,'Ingen meddelandehistorik har laddats');assert.deepEqual(f.stateRef.current.conversations[CHAT]??[],[]);assert.deepEqual(f.requests.find(request=>request.rpc==='own_chat_read_state').body.message_ids,[]);
});
