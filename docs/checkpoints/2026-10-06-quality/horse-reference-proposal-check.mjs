import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp('/tmp/sf-horse-ref-');
const data = join(directory, 'data'), socket = join(directory, 'socket'), port = '58483';
const results = [];
const command = (name, args, input) => execFileSync(`/usr/local/bin/${name}`, args, { encoding: 'utf8', input, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
const args = ['-h', socket, '-p', port, '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = (db, input) => command('psql', [...args, '-d', db], input).trim();
const proposal = await readFile(join(root, 'docs/checkpoints/2026-10-06-quality/horse-paddock-reference-proposal.sql'), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const S1=id(1), S2=id(2), H1=id(11), H2=id(12), H3=id(13), P1=id(21), P2=id(22), P3=id(23);
const record = (name, details) => results.push({name, result:'PASS', ...details});
const clone = db => sql('postgres', `create database ${db} template reference_base;`);
const expectStop = (db, marker, draft=proposal) => {
  let error;
  try { sql(db, draft); } catch (e) { error=String(e.stderr); }
  assert.ok(error?.includes(marker), error || 'expected rejection');
  assert.equal(sql(db, "select to_regclass('public.paddock_horses') is null;"), 't');
  return error.trim().split('\n').filter(l => l.includes('ERROR:'))[0];
};
const asyncSql = (db, input) => {
  const proc = spawn('/usr/local/bin/psql', [...args, '-d', db], {stdio:['pipe','pipe','pipe']});
  let output='', error=''; proc.stdout.on('data', c=>output+=c); proc.stderr.on('data',c=>error+=c); proc.stdin.end(input);
  return new Promise((resolve,reject)=>proc.on('exit',code=>code===0?resolve(output.trim()):reject(Error(error))));
};
const asUser = (user, statement) => `set role authenticated; select set_config('request.jwt.claim.sub','${id(user)}',false); ${statement}`;
const fixtureMappings = [[P1,1,H1,' Saga '],[P1,2,H2,'Mira'],[P2,1,H1,'saga'],[P3,1,H3,'Saga']];
const literal = value => value===null?'null':`'${value.replaceAll("'","''")}'`;
const mappedDraft = (mappings=fixtureMappings) => proposal.replace('-- APPROVED_MAPPING_INSERTS (empty intentionally; no production identifiers here).', `insert into pg_temp.approved_horse_mapping values ${mappings.map(([pad,pos,horse,source])=>`('${pad}',${pos},'${horse}',${literal(source)})`).join(',')};`);
const mapping = (pad, pos, horse, source=fixtureMappings.find(([p,n])=>p===pad&&n===pos)?.[3]??null) => mappedDraft([...fixtureMappings.filter(([p,n])=>p!==pad||n!==pos),[pad,pos,horse,source]]);
let started=false;
try {
  await mkdir(socket);
  command('initdb', ['-D',data,'-U','postgres','--auth=trust','--no-locale','-E','UTF8']);
  command('pg_ctl', ['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${socket} -p ${port} -c listen_addresses=''`,'-w','start']); started=true;
  sql('postgres', 'create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls; create database reference_base;');
  sql('reference_base', `create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$; create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;`);
  sql('reference_base', await readFile(join(root,'supabase/schema.sql'),'utf8'));
  sql('reference_base', `grant usage on schema public,auth to authenticated,anon,service_role; grant select,insert,update,delete on all tables in schema public to authenticated; alter default privileges in schema public grant all on tables to authenticated,anon,service_role; insert into auth.users(id) values ${[101,102,103,104,105,106].map(n=>`('${id(n)}')`).join(',')}; insert into public.stables(id,name) values ('${S1}','Fixture stable A'),('${S2}','Fixture stable B'); insert into public.stable_members(stable_id,user_id,role,access) values ('${S1}','${id(101)}','admin','owner'),('${S1}','${id(102)}','staff','edit'),('${S1}','${id(103)}','staff','view'),('${S1}','${id(104)}','guest','view'),('${S1}','${id(105)}','rider','view'),('${S2}','${id(106)}','staff','edit'); insert into public.horses(id,stable_id,name) values ('${H1}','${S1}','Saga'),('${H2}','${S1}','Mira'),('${H3}','${S2}','Saga'); insert into public.paddocks(id,stable_id,name,horse_names) values ('${P1}','${S1}','Fixture paddock A',array[' Saga ','Mira']),('${P2}','${S1}','Fixture paddock B',array['saga']),('${P3}','${S2}','Fixture paddock C',array['Saga']);`);
  record('whole checked-in schema compiles locally', {postgres:sql('reference_base','show server_version;'),tcp:sql('reference_base','show listen_addresses;')});
  clone('reference_ok');
  const original=sql('reference_ok','select jsonb_agg(jsonb_build_array(id,horse_names) order by id) from public.paddocks;');
  sql('reference_ok', mappedDraft());
  assert.equal(sql('reference_ok','select count(*) from public.paddock_horses;'),'4');
  assert.equal(sql('reference_ok','select jsonb_agg(jsonb_build_array(id,horse_names) order by id) from public.paddocks;'),original);
  assert.equal(sql('reference_ok',`select count(*) from public.paddock_horses where horse_id='${H1}';`),'2');
  record('draft with explicit fixture mappings compiles; preserves raw spelling/order and two paddocks per horse',{links:4});
  clone('reference_empty_mapping'); record('empty approval table rejects every source entry before DDL',{error:expectStop('reference_empty_mapping','unapproved entries')});
  clone('reference_partial_mapping'); record('partial approval table rejects all remaining entries before DDL',{error:expectStop('reference_partial_mapping','unapproved entries',mappedDraft([fixtureMappings[0]]))});
  for(const [db, setup, marker, draft=proposal] of [
    ['reference_unknown',`update public.paddocks set horse_names=array['Original unmatched text'] where id='${P1}';`,'unapproved entries'],
    ['reference_ambiguous',`insert into public.horses(id,stable_id,name) values ('${id(14)}','${S1}','SAGA');`,'unapproved entries'],
    ['reference_null_horse',`insert into public.horses(id,stable_id,name) values ('${id(14)}',null,'Fixture null');`,'null stable_id'],
    ['reference_null_paddock',`insert into public.paddocks(id,stable_id,name) values ('${id(24)}',null,'Fixture null');`,'null stable_id'],
    ['reference_repeated',`update public.paddocks set horse_names=array['Saga',' saga '] where id='${P1}';`,'repeated entries',mappedDraft([...fixtureMappings.filter(([pad])=>pad!==P1),[P1,1,H1,'Saga'],[P1,2,H1,' saga ']])],
    ['reference_null_entry',`update public.paddocks set horse_names=array[null::text] where id='${P1}';`,'unapproved entries'],
    ['reference_blank_entry',`update public.paddocks set horse_names=array['  '] where id='${P1}'; insert into public.horses(id,stable_id,name) values ('${id(14)}','${S1}',' ');`,'unapproved entries']
  ]) {
    clone(db); sql(db,setup); const before=sql(db,'select jsonb_agg(jsonb_build_array(id,horse_names) order by id) from public.paddocks;');
    const error=expectStop(db,marker,draft); assert.equal(sql(db,'select jsonb_agg(jsonb_build_array(id,horse_names) order by id) from public.paddocks;'),before);
    record(db,{error,ddlCreated:false,originalArraysUnchanged:true});
  }
  clone('reference_mapped'); sql('reference_mapped',`update public.paddocks set horse_names=array['Original unmatched text','Mira'] where id='${P1}';`);
  sql('reference_mapped',mapping(P1,1,H1,'Original unmatched text'));
  assert.equal(sql('reference_mapped',`select horse_names[1] from public.paddocks where id='${P1}';`),'Original unmatched text');
  assert.equal(sql('reference_mapped',`select count(*) from public.paddock_horses where paddock_id='${P1}' and horse_id='${H1}';`),'1');
  record('explicit positional unknown mapping keeps original text',{autoGuess:false});
  clone('reference_bad_mapping'); record('cross-stable approved mapping fails before DDL',{error:expectStop('reference_bad_mapping','invalid/cross-stable',mapping(P1,1,H3))});
  clone('reference_bad_position'); record('nonexistent original position fails before DDL',{error:expectStop('reference_bad_position','invalid/cross-stable',mapping(P1,99,H1))});
  clone('reference_duplicate_mapped'); sql('reference_duplicate_mapped',`insert into public.horses(id,stable_id,name) values ('${id(14)}','${S1}','MIRA');`); sql('reference_duplicate_mapped',mapping(P1,2,H2)); record('ambiguous name resolves only via explicit original-position mapping',{});
  clone('reference_null_array'); sql('reference_null_array',`update public.paddocks set horse_names=null where id='${P1}';`); sql('reference_null_array',mappedDraft(fixtureMappings.filter(([pad])=>pad!==P1)));  assert.equal(sql('reference_null_array',`select horse_names is null from public.paddocks where id='${P1}';`),'t'); record('null array preserved as null',{});
  clone('reference_tab_duplicate');
  sql('reference_tab_duplicate',`insert into public.horses(id,stable_id,name) values ('${id(14)}','${S1}','Saga'||chr(9));`);
  assert.equal(sql('reference_tab_duplicate',`select ascii(right(name,1)) from public.horses where id='${id(14)}';`),'9');
  const uiCount=['Saga','Saga\t'].filter(name=>name.trim().toLowerCase()==='saga').length; assert.equal(uiCount,2);
  record('Saga and SagaTAB cannot autoassign the remaining unapproved original position',{uiCount,error:expectStop('reference_tab_duplicate','unapproved entries',mappedDraft(fixtureMappings.slice(1)))});
  clone('reference_tab_only');
  sql('reference_tab_only',`update public.paddocks set horse_names=array[chr(9)] where id='${P1}'; insert into public.horses(id,stable_id,name) values ('${id(14)}','${S1}',chr(9));`);
  assert.equal(sql('reference_tab_only',`select ascii(horse_names[1])=9 from public.paddocks where id='${P1}';`),'t');
  assert.equal(sql('reference_tab_only',`select ascii(name)=9 from public.horses where id='${id(14)}';`),'t');
  record('tab-only source and horse name cannot autoassign a missing approval',{error:expectStop('reference_tab_only','unapproved entries',mappedDraft(fixtureMappings.filter(([pad])=>pad!==P1)))});
  clone('reference_stale_text'); sql('reference_stale_text',`update public.paddocks set horse_names=array['Changed after approval','Mira'] where id='${P1}';`);
  record('stale reviewed original text fails before DDL',{error:expectStop('reference_stale_text','stale-source',mappedDraft())});
  clone('reference_reordered'); sql('reference_reordered',`update public.paddocks set horse_names=array['Mira',' Saga '] where id='${P1}';`);
  record('reordered original positions fail before DDL',{error:expectStop('reference_reordered','stale-source',mappedDraft())});
  clone('reference_null_approved'); sql('reference_null_approved',`update public.paddocks set horse_names=array[null::text,'Mira'] where id='${P1}';`);
  sql('reference_null_approved',mapping(P1,1,H1,null));
  assert.equal(sql('reference_null_approved',`select horse_names[1] is null from public.paddocks where id='${P1}';`),'t');
  assert.equal(sql('reference_null_approved',`select count(*) from public.paddock_horses where paddock_id='${P1}' and horse_id='${H1}';`),'1');
  record('explicit exact null source approval preserves null and chosen ID',{});
  clone('reference_tab_approved'); sql('reference_tab_approved',`update public.paddocks set horse_names=array[chr(9),'Mira'] where id='${P1}';`);
  sql('reference_tab_approved',mapping(P1,1,H1,'\t'));
  assert.equal(sql('reference_tab_approved',`select ascii(horse_names[1])=9 from public.paddocks where id='${P1}';`),'t');
  assert.equal(sql('reference_tab_approved',`select count(*) from public.paddock_horses where paddock_id='${P1}' and horse_id='${H1}';`),'1');
  record('explicit exact database chr(9) source approval preserves whitespace and chosen ID',{});
  for(const insert of [`('${S1}','${P1}','${H3}')`,`('${S1}','${P3}','${H1}')`]) { let rejected=false; try{sql('reference_ok',`insert into public.paddock_horses values ${insert};`);}catch(e){rejected=String(e.stderr).includes('foreign key constraint');}assert.ok(rejected); }
  record('native composite FK rejects either cross-stable endpoint',{});
  for(const user of [101,102,103,104,105,106,107]) {
    const count=sql('reference_ok',asUser(user,'select count(*) from public.paddock_horses;')).split('\n').at(-1); assert.equal(count,user===106?'1':user===107?'0':'3');
  }
  record('admin/staff-edit/staff-view/guest/rider see only their stable; nonmember sees zero',{stableA:3,stableB:1,nonmember:0});
  for(const role of ['authenticated','anon','service_role']) {
    assert.equal(sql('reference_ok',`select has_table_privilege('${role}','public.paddock_horses','INSERT') or has_table_privilege('${role}','public.paddock_horses','UPDATE') or has_table_privilege('${role}','public.paddock_horses','DELETE');`),'f');
    let denied=false; try{sql('reference_ok',`set role ${role}; delete from public.paddock_horses;`);}catch(e){denied=String(e.stderr).includes('permission denied');}assert.ok(denied);
  }
  assert.equal(sql('reference_ok',"select has_table_privilege('anon','public.paddock_horses','SELECT');"),'f');
  assert.equal(sql('reference_ok',"select count(*) from pg_proc where proname like '%horse_reference%';"),'0');
  record('default broad grants removed on new table; client/service writes and anonymous reads denied; no helpers added',{});
  const beforeRace=sql('reference_ok','select jsonb_agg(to_jsonb(p) order by paddock_id,horse_id) from public.paddock_horses p;');
  const rename=asyncSql('reference_ok',`begin; update public.horses set name='Saga Nytt' where id='${H1}'; select pg_sleep(0.6); commit;`);
  const stale=asyncSql('reference_ok',`update public.paddocks set horse_names=array['Saga','Mira'] where id='${P1}';`);
  await Promise.all([rename,stale]);
  assert.equal(sql('reference_ok','select jsonb_agg(to_jsonb(p) order by paddock_id,horse_id) from public.paddock_horses p;'),beforeRace);
  assert.equal(sql('reference_ok',`select string_agg(h.name,',' order by p.paddock_id) from public.paddock_horses p join public.horses h on h.id=p.horse_id where h.id='${H1}';`),'Saga Nytt,Saga Nytt');
  record('two real sessions: rename plus stale legacy array write preserves both ID links',{currentName:'Saga Nytt',uiCompatible:false,writerContractProven:false});
  const output={scope:'local synthetic fixture only; no live connection, no UI/write-RPC acceptance',proposalFile:'docs/checkpoints/2026-10-06-quality/horse-paddock-reference-proposal.sql',tcpDisabled:true,results};
  await writeFile('/tmp/stableflow-horse-reference-proposal-20261006-results.json',JSON.stringify(output,null,2));
  process.stdout.write(JSON.stringify({passed:results.length,tcpDisabled:true,resultsFile:'/tmp/stableflow-horse-reference-proposal-20261006-results.json'})+'\n');
} finally {
  if(started) command('pg_ctl',['-D',data,'-m','fast','-w','stop']);
  await rm(directory,{recursive:true,force:true});
}
