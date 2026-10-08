#!/usr/bin/env python3
"""Static default; opt-in isolated non-root Linux runtime with installed PG only.

Requires --schema exact ef793f4 full schema and --receipt-sql the frozen prior
receipt sql/ bundle. Claims are synthetic GUCs, not JWT/PostgREST acceptance.
Uses the prior driver Session/Worker pattern without changing its files.
"""
import argparse, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parent
MARK="set stableflow.test_fixture='push_receipts';\n"
BASE_HASHES={
 '20261008_push_receipt_ledger.sql':'052bcb979a86d4c41247ab059049fe99efa121991f86b425be9d5ba32ffd5f68',
 'schema-append.sql':'5e5590c7c2b6bb58920539ed9f7588d995d97c7b085033c25cbda86d24cf951e',
 'fixture-auth-net.sql':'2efc9d104839eeb19b63045199d6297435d1bb7973536c2280ca4562740da9ce',
 'push-receipts-replay.py':'6b85f5dd8629bb209a8b15c7fc7d8fdf13e2ec26d668434251e0e4144686b3a1'}
SCHEMA_SHA='2265a4c22cfdf6eebb30e6abea1f808cf5187eb6e5ddab4eb55e6001a8f3d18b'

def static(schema,base):
 assert hashlib.sha256(schema.read_bytes()).hexdigest()==SCHEMA_SHA
 for name,digest in BASE_HASHES.items(): assert hashlib.sha256((base/name).read_bytes()).hexdigest()==digest,name
 text=(ROOT/'20261008_push_device_ownership.sql').read_text()
 assert set(re.findall(r'create or replace function public\.(push_device_\w+)\(',text))=={
  'push_device_state','push_device_claim','push_device_release','push_device_active_registrations'}
 assert 'binding.binding_generation is distinct from p_expected_binding_generation' in text
 assert 'on delete set null' in text and 'on delete cascade' not in text[:text.index('-- Exact additive')]
 assert 'sha256(convert_to' in text and 'create extension' not in text
 assert 'Registration is not the active device owner.' in text
 assert 'clock_timestamp()>=p_deadline' in text
 assert 'from auth.users u where u.id=uid for key share' in text
 assert 'order by value loop' in text
 for name in ('push_device_state','push_device_claim','push_device_release','push_receipts_prepare','push_receipts_record_tickets','push_receipts_apply'):
  start=text.index('create or replace function public.'+name+'(');end=text.index('$$;',start);function=text[start:end]
  first=function.index('perform private.lock_push_auth_users(auth_users)')
  if name=='push_device_state': child=function.index('insert into private.push_device_bindings')
  elif name in ('push_device_claim','push_device_release'): child=function.index('from private.push_device_bindings where token_hash=hashed for update')
  elif name=='push_receipts_prepare': child=function.index('insert into private.push_delivery_attempts')
  else: child=function.index('for update')
  assert first<child and 'when deadlock_detected' in function,name
 labels=re.findall(r"pg_temp\.(?:ok|err)\('([^']+)'",(ROOT/'ownership-regression.sql').read_text())
 assert len(labels)==len(set(labels)) and len(labels)>=25
 for file in ROOT.glob('*.py'): compile(file.read_text(),str(file),'exec')
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.iterdir()) if p.is_file()}
 return {'state':'STATIC_PASS; SQL_RUNTIME_NOT_RUN','hashes':hashes,'base_hashes':BASE_HASHES,
  'schema_sha256':SCHEMA_SHA,'expected_labels':labels,'provider_requests':0}

def runtime(schema,base,receipt,binding):
 if sys.platform!='linux' or os.getuid()==0: raise SystemExit('Runtime requires isolated non-root Linux; no PG started.')
 if ROOT==receipt.parent or ROOT in receipt.parents: raise SystemExit('Receipt must be outside frozen sql/.')
 spec=importlib.util.spec_from_file_location('sf_prior_driver',base/'push-receipts-replay.py')
 previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
 env={k:os.environ[k] for k in ('PATH','LANG','LC_ALL') if k in os.environ}
 bin=Path(os.environ.get('STABLEFLOW_TEST_PG_BIN') or subprocess.check_output(['pg_config','--bindir'],text=True,env=env,timeout=5).strip())
 directory=Path(tempfile.mkdtemp(prefix='sf-device-ownership-',dir='/tmp'));data=directory/'data';socket=directory/'socket';socket.mkdir()
 children=[];started=False
 report={**binding,'state':'RUNNING_SYNTHETIC','checks':[],'cluster_cleaned':False,'tcp_enabled':False,
  'auth_model':'actual LOGIN NOSUPERUSER; synthetic GUC auth.uid/role, not signed JWT',
  'proof_limits':'no Hosted DDL, real Expo, device possession, queued-message revocation or phone proof'}
 def command(name,args): return subprocess.run([str(bin/name),*args],capture_output=True,text=True,env=env,timeout=30)
 def connection(db,role='postgres'): return [str(bin/'psql'),'-h',str(socket),'-p','58641','-U',role,'-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1']
 def execute(db,text,role='postgres'): return subprocess.run(connection(db,role),input=MARK+text,text=True,capture_output=True,env=env,timeout=40)
 def sql(db,text,role='postgres'):
  result=execute(db,text,role);assert result.returncode==0,result.stderr;return result.stdout.strip()
 def clone(db): sql('postgres',f'create database {db} template device_seed owner postgres;','sf_fixture_admin');return db
 def check(name,**facts): report['checks'].append({'name':name,'result':'PASS',**facts})
 def poll(session,query,child):
  end=time.monotonic()+8
  while time.monotonic()<end:
   value=session.query('select pg_stat_clear_snapshot(); '+query)
   if value.isdigit(): return int(value)
   if child.process.poll() is not None: raise AssertionError(('Worker exited before barrier',child.finish()))
   time.sleep(.01) # Observer backoff only; backend ordering is an observed lock.
  raise AssertionError('Backend barrier not observed')
 def race(db,kind,negative=False,epoch=False):
  sql(db,(ROOT/'race-setup.sql').read_text())
  if epoch:
   sql(db,'grant insert on push_fixture.race_state to authenticated;')
   sql(db,(ROOT/'race-epoch-setup.sql').read_text(),'authenticated')
   assert sql(db,"select current_user_id=push_fixture.pid('B') and binding_generation=(select (receipt->>'binding_generation')::uuid from push_fixture.race_state where label='initial-B') from private.push_device_bindings where token_hash=sha256(convert_to('fiction-race-shared','UTF8'));")=='t'
  if negative: sql(db,(ROOT/'negative-epoch.sql').read_text())
  control=previous.Session(connection(db),env);children.append(control)
  control.query(MARK);pid=int(control.query('select pg_backend_pid();'))
  assert control.query('select pg_advisory_lock(8072001);')==''
  b=previous.Worker(connection(db,'authenticated'),env,(ROOT/('race-epoch-b.sql' if epoch else 'race-b.sql')).read_text());children.append(b)
  bp=poll(control,f"select pid from pg_stat_activity where application_name='sf_device_b' and {pid}=any(pg_blocking_pids(pid)) and exists(select 1 from pg_locks l where l.pid=pg_stat_activity.pid and l.locktype='advisory' and not l.granted);",b)
  a=previous.Worker(connection(db,'authenticated' if kind=='claim' else 'service_role'),env,(ROOT/f'race-{kind}-a.sql').read_text());children.append(a)
  ap=poll(control,f"select pid from pg_stat_activity where application_name='sf_device_a' and {bp}=any(pg_blocking_pids(pid));",a)
  assert control.query('select pg_advisory_unlock(8072001);')=='t'
  ac,_,ae=a.finish();bc,_,be=b.finish();assert bc==0,be
  observed=[]
  for line in ae.splitlines():
   # JSONB canonical key order is not fixed; find the NOTICE JSON object.
   marker=line.find('{') if '"push_fixture_outcome"' in line else -1
   if marker>=0: observed.append(json.loads(line[marker:]))
  assert len(observed)==1 and observed[0]['push_fixture_outcome']==kind,ae
  if not negative:
   if kind=='claim':
    assert observed[0]['code']=='40001' and observed[0]['message'] in (
     '[push device] Device ownership changed; read fresh state.',
     '[push device] Account scope changed; read fresh state.'),observed
   else:
    assert (observed[0]['code'],observed[0]['message']) in (
     ('23514','[push receipts] Registration is not the active device owner.'),
     ('40001','[push receipts] Account scope changed; reservation unconfirmed.')),observed
  if negative: assert ac!=0 and 'FAIL dispatched old A claim replaced committed B ownership' in ae,ae
  else:
   assert ac==0,ae
   assert sql(db,"select current_user_id=push_fixture.pid('B') from private.push_device_bindings where token_hash=sha256(convert_to('fiction-race-shared','UTF8'));")=='t'
   if kind=='prepare': assert sql(db,"select not exists(select 1 from private.push_delivery_attempts where attempt_id=push_fixture.pid('stale-attempt'));")=='t'
  if epoch:
   if negative:
    assert observed[0]['code'] is None and observed[0]['receipt']['user_id']==sql(db,"select push_fixture.pid('A');"),observed
    assert sql(db,"select current_user_id=push_fixture.pid('B') from private.push_device_bindings where token_hash=sha256(convert_to('fiction-race-shared','UTF8'));")=='t'
   else: assert observed[0]['message']=='[push device] Device ownership changed; read fresh state.',observed
  name='negative known-B epoch race' if negative else 'positive known-B epoch race' if epoch else f'{kind} waits on B then rejects stale snapshot'
  check(name,a_pid=ap,b_pid=bp,controller_pid=pid,expected_negative=negative,observed_outcome=observed[0])
  control.close()
 def auth_race(db,negative=False):
  sql(db,(ROOT/'race-setup.sql').read_text())
  if negative: sql(db,(ROOT/'negative-auth-order.sql').read_text())
  control=previous.Session(connection(db),env);children.append(control)
  control.query(MARK);pid=int(control.query('select pg_backend_pid();'))
  assert control.query('select pg_advisory_lock(8072002);')==''
  b=previous.Worker(connection(db),env,MARK+(ROOT/'race-auth-b.sql').read_text());children.append(b)
  bp=poll(control,f"select pid from pg_stat_activity where application_name='sf_device_auth_delete' and {pid}=any(pg_blocking_pids(pid)) and exists(select 1 from pg_locks l where l.pid=pg_stat_activity.pid and l.locktype='advisory' and not l.granted);",b)
  a=previous.Worker(connection(db,'service_role'),env,MARK+(ROOT/('race-auth-a-negative.sql' if negative else 'race-auth-a.sql')).read_text());children.append(a)
  ap=poll(control,f"select pid from pg_stat_activity where application_name='sf_device_auth_prepare' and {bp}=any(pg_blocking_pids(pid));",a)
  if not negative:
   assert control.query(f"select not exists(select 1 from pg_locks where pid={ap} and relation in ('private.push_device_bindings'::regclass,'public.push_tokens'::regclass,'private.push_delivery_attempts'::regclass,'private.push_delivery_tickets'::regclass) and mode in ('RowShareLock','RowExclusiveLock')); ")=='t'
  assert control.query('select pg_advisory_unlock(8072002);')=='t'
  if negative:
   # The negative preserves the new deadlock->40001 catch; only the early
   # Auth-parent lock was removed. Require both real wait-graph edges.
   cycle=poll(control,f"select {ap} where {bp}=any(pg_blocking_pids({ap})) and {ap}=any(pg_blocking_pids({bp}));",a)
   assert cycle==ap
  ac,ao,ae=a.finish();bc,bo,be=b.finish()
  if negative:
   assert ac!=0 and 'FAIL missing Auth-parent fence produced child-before-parent cycle' in ae,ae
   assert bc==0 or 'deadlock detected' in be,(bc,be)
   check('negative Auth-order actual two-way wait graph',expected_negative=True,observed_expected_FAIL=True,a_pid=ap,b_pid=bp)
  else:
   assert ac==0 and bc==0,(ae,be)
   assert sql(db,"select not exists(select 1 from private.push_delivery_attempts where attempt_id=push_fixture.pid('auth-delete-attempt')) and not exists(select 1 from auth.users where id=push_fixture.pid('A'));")=='t'
   assert sql(db,"select current_user_id is null and token_id is null and registration_generation is null from private.push_device_bindings where token_hash=sha256(convert_to('fiction-race-shared','UTF8'));")=='t'
   check('Auth-parent-first waits before child locks, delete completes, prepare rolls back40001',a_pid=ap,b_pid=bp,controller_pid=pid)
  control.close()
 try:
  result=command('initdb',['-D',str(data),'-U','sf_fixture_admin','--auth=trust','--no-locale','-E','UTF8']);assert result.returncode==0,result.stderr
  result=command('pg_ctl',['-D',str(data),'-l',str(directory/'postgres.log'),'-o',f"-k {socket} -p 58641 -c listen_addresses='' -c shared_buffers=16MB -c max_connections=30",'-w','start']);assert result.returncode==0,result.stderr;started=True
  sql('postgres','create role postgres login superuser; create role authenticated login nosuperuser nocreatedb nocreaterole; create role anon login nosuperuser; create role service_role login nosuperuser nocreatedb nocreaterole bypassrls; grant authenticated,anon,service_role,pg_read_all_stats to postgres; create database device_seed owner postgres;','sf_fixture_admin')
  sql('device_seed',(base/'fixture-auth-net.sql').read_text());sql('device_seed',schema.read_text())
  sql('device_seed','alter table auth.users owner to sf_fixture_admin; grant select,references,update on auth.users to postgres; alter function push_fixture.synthetic_auth_user(uuid) owner to sf_fixture_admin; alter function push_fixture.synthetic_auth_delete(uuid) owner to sf_fixture_admin; grant execute on function push_fixture.synthetic_auth_user(uuid),push_fixture.synthetic_auth_delete(uuid) to postgres;','sf_fixture_admin')
  sql('device_seed',(ROOT/'race-auth-fixture.sql').read_text(),'sf_fixture_admin')
  sql('postgres','alter role postgres nosuperuser nocreatedb nocreaterole bypassrls;','sf_fixture_admin')
  assert sql('device_seed',"select not rolsuper and rolbypassrls from pg_roles where rolname=current_user;")=='t'
  assert sql('device_seed',"select has_table_privilege(current_user,'auth.users','SELECT') and has_table_privilege(current_user,'auth.users','REFERENCES') and has_table_privilege(current_user,'auth.users','UPDATE') and has_column_privilege(current_user,'auth.users','id','UPDATE') and not has_table_privilege(current_user,'auth.users','INSERT,DELETE');")=='t'
  sql('device_seed',(base/'schema-append.sql').read_text())
  sql('device_seed',(ROOT/'20261008_push_device_ownership.sql').read_text())
  sql('device_seed',(ROOT/'20261008_push_device_ownership.sql').read_text())
  check('ordinary owner applies exact additive candidate and idempotent replay')
  for role in ('authenticated','service_role'):
   assert sql('device_seed','select session_user=current_user and rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole from pg_roles where rolname=current_user;',role)=='t'
  positive=clone('device_positive');result=execute(positive,(ROOT/'ownership-regression.sql').read_text());assert result.returncode==0,result.stderr
  labels=[v[5:] for v in result.stdout.splitlines() if v.startswith('PASS ')];assert set(labels)==set(binding['expected_labels']) and len(labels)==len(set(labels))
  check('full-schema ownership SQL',count=len(labels),labels=labels)
  for i,(file,expected) in enumerate((('negative-epoch.sql','lost claim acknowledgement cannot replay the old epoch'),('negative-prepare-active.sql','prepare rejects a formerly eligible inactive tuple under binding lock'))):
   db=clone(f'device_negative_{i}');sql(db,(ROOT/file).read_text());result=execute(db,(ROOT/'ownership-regression.sql').read_text())
   assert result.returncode!=0 and 'FAIL '+expected in result.stderr,result.stderr
   check('negative '+file,observed_expected_FAIL=expected)
  race(clone('device_claim'),'claim');race(clone('device_epoch_positive'),'claim',epoch=True);race(clone('device_epoch_negative'),'claim',True,True);race(clone('device_prepare'),'prepare')
  auth_race(clone('device_auth_delete'));auth_race(clone('device_auth_delete_negative'),True)
  report['state']='PASS_SYNTHETIC_SQL_ONLY; HOSTED_PROVIDER_PHONE_NOT_TESTED'
 except Exception as caught:
  report['state']='FAILED_SYNTHETIC_REPLAY';report['failure']={'type':type(caught).__name__,'message':str(caught)};raise
 finally:
  for child in reversed(children): child.close()
  if started or (data/'postmaster.pid').exists():
   stopped=command('pg_ctl',['-D',str(data),'-m','immediate','-w','stop']);report['cluster_cleaned']=stopped.returncode==0
  else: report['cluster_cleaned']=True
  if report['cluster_cleaned']: shutil.rmtree(directory)
  receipt.parent.mkdir(parents=True,exist_ok=True);receipt.write_text(json.dumps(report,indent=2)+'\n')
 return report

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--schema',type=Path,required=True);parser.add_argument('--receipt-sql',type=Path,required=True);parser.add_argument('--runtime',action='store_true');parser.add_argument('--receipt',type=Path)
 args=parser.parse_args();binding=static(args.schema.resolve(),args.receipt_sql.resolve())
 if args.runtime:
  if args.receipt is None: parser.error('--runtime requires external --receipt')
  report=runtime(args.schema.resolve(),args.receipt_sql.resolve(),args.receipt.resolve(),binding)
  print(json.dumps({'state':report['state'],'cluster_cleaned':report['cluster_cleaned'],'provider_requests':0}))
 else: print(json.dumps(binding,indent=2))
if __name__=='__main__': main()
