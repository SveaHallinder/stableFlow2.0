from pathlib import Path
import subprocess, tempfile, os, json, hashlib, shutil, time, queue, threading, sys
root=Path(__file__).resolve().parent
fixtures=root/'fixtures'
bindings=json.loads((fixtures/'bindings.json').read_text())
schema=(fixtures/'full-schema.sql').read_text()
stage=sys.argv[1] if len(sys.argv)>1 else 'after'
assert stage in ('before','after')
expected='PT429' if stage=='before' else '23505'
proposal=(fixtures/('rate-negative-quota-recheck.sql' if stage=='before' else 'rate.sql')).read_text()
assert hashlib.sha256(schema.encode()).hexdigest()==bindings['schema_sha256'],'[proposal rate] Full schema fixture hash mismatch.'
expected_hash=bindings['rate']['negative_quota_recheck_sql_sha256' if stage=='before' else 'sql_sha256']
assert hashlib.sha256(proposal.encode()).hexdigest()==expected_hash,'[proposal rate] SQL proposal fixture hash mismatch.'
assert sys.platform=='linux','[proposal rate] Runtime requires an isolated non-root Linux runner.'
assert os.getuid()!=0,'[proposal rate] initdb requires a non-root user.'
reports=Path(os.environ.get('STABLEFLOW_REPLAY_REPORT_DIR',root/'reports'))
reports.mkdir(parents=True,exist_ok=True)
pg=Path(subprocess.check_output(['pg_config','--bindir'],text=True).strip())
assert all((pg/tool).is_file() for tool in ('initdb','pg_ctl','psql')),'[proposal rate] PostgreSQL tools are required.'
work=Path(tempfile.mkdtemp(prefix='sf-ri-'))
socket=work/'socket';socket.mkdir();data=work/'data'
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
base=[str(pg/'psql'),'-h',str(socket),'-p','58519','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-d','postgres']
a='00000000-0000-4000-8000-000000000101';b='00000000-0000-4000-8000-000000000102';s='00000000-0000-4000-8000-000000000110';chat='00000000-0000-4000-8000-000000000120';post='00000000-0000-4000-8000-000000000130'
results=[];children=[];started=False

def run(q,code=None):
    r=subprocess.run(base,input=q,text=True,capture_output=True,env=env,timeout=15)
    if code: assert r.returncode!=0 and code in r.stderr,(code,r.stdout,r.stderr)
    else: assert r.returncode==0,r.stderr
    return r.stdout.strip()

def claims(q,uid=a):
    return f"begin;set local role authenticated;set local request.jwt.claim.sub='{uid}';set local request.jwt.claim.role='authenticated';{q};commit;"

def tx(name,q):
    p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,env=env)
    children.append(p);stdout=queue.Queue();errors=[]
    def readout():
        for line in p.stdout: stdout.put(line.strip())
    def readerr():
        for line in p.stderr:errors.append(line)
    threading.Thread(target=readout,daemon=True).start();threading.Thread(target=readerr,daemon=True).start()
    p.stdin.write(f"set application_name='{name}';"+q+'\n');p.stdin.flush()
    return p,stdout,errors

def wait_marker(worker,marker):
    end=time.monotonic()+5
    while time.monotonic()<end:
        try:
            if worker[1].get(timeout=.1)==marker:return
        except queue.Empty:pass
    raise AssertionError('Missing synthetic transaction marker '+marker)

def lock(name):
    end=time.monotonic()+5
    while time.monotonic()<end:
        if run(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock'")=='1':return
        time.sleep(.025)
    raise AssertionError('No observed real row lock '+name)

def finish(worker,command='commit;'):
    if command:
        worker[0].stdin.write(command+'\n');worker[0].stdin.flush()
    try: worker[0].stdin.close()
    except BrokenPipeError: pass
    worker[0].wait(timeout=8)
    return worker[0].returncode,''.join(worker[2])

def set_counter(feature,count):
    run(f"insert into private.social_write_counters values('{a}','{feature}',clock_timestamp(),{count}) on conflict(user_id,feature) do update set window_started_at=excluded.window_started_at,write_count=excluded.write_count")

def message(i):return f"insert into public.messages(id,conversation_id,author_id,text) values('00000000-0000-4000-8000-{i:012d}','{chat}','{a}','Synthetic exact receipt')"
def alert(i):return f"insert into public.alerts(id,stable_id,message,type) values('00000000-0000-4000-8000-{i:012d}','{s}','Synthetic operational notice','info')"
def record(name,**extra):results.append({'name':name,**extra})
try:
    boot=subprocess.run([str(pg/'initdb'),'-D',str(data),'-U','postgres','--auth=trust','--no-locale','-E','UTF8'],capture_output=True,text=True,env=env,timeout=20)
    assert boot.returncode==0,(boot.stdout,boot.stderr)
    boot=subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-l',str(work/'postgres.log'),'-o',f"-k {socket} -p 58519 -c listen_addresses=''",'-w','start'],capture_output=True,text=True,env=env,timeout=20)
    assert boot.returncode==0,(boot.stdout,boot.stderr,(work/'postgres.log').read_text())
    started=True
    assert run('show listen_addresses;')=='','[proposal rate] TCP must be disabled.'
    run("create role authenticated nologin;create role anon nologin;create role service_role nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb,deleted_at timestamptz,banned_until timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;")
    run(schema+'\n'+proposal)
    run('grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;')
    run(f"insert into auth.users(id) values('{a}'),('{b}');insert into public.stables(id,name,created_by) values('{s}','Synthetic stable','{b}');insert into public.stable_members(stable_id,user_id,role,access) values('{s}','{a}','admin','owner'),('{s}','{b}','admin','owner');insert into public.conversations(id,stable_id,title,is_group,created_by_user_id) values('{chat}','{s}','Synthetic group',true,'{b}');insert into public.posts(id,stable_id,user_id,content) values('{post}','{s}','{b}','Synthetic other post');")
    record('actual full-schema + revised draft SQL compile',result='PASS')
    set_counter('messages',59)
    wa=tx('independent-same-id-a',claims(message(501)).removesuffix('commit;')+'\n\\echo SAME_ID_READY')
    wait_marker(wa,'SAME_ID_READY')
    wb=tx('independent-same-id-b',claims(message(501)))
    lock('independent-same-id-b');assert finish(wa)[0]==0
    code,error=finish(wb,'')
    assert code!=0 and expected in error,(code,error)
    assert run("select write_count from private.social_write_counters where feature='messages'")=='60'
    assert run("select count(*) from public.messages where text='Synthetic exact receipt'")=='1'
    record('same new message ID concurrently at last quota slot',result=('CONFIRMED FINDING' if stage=='before' else 'PASS'),expected_duplicate='23505',actual_sqlstate=expected,committed_rows=1,counter=60,observed_lock=True)
    run(claims(message(501)),'23505')
    record('already committed message ID reaches existing receipt recovery',result='PASS')
    set_counter('likes',119)
    q=f"insert into public.likes(user_id,post_id) values('{a}','{post}')"
    wa=tx('independent-same-pair-a',claims(q).removesuffix('commit;')+'\n\\echo SAME_PAIR_READY')
    wait_marker(wa,'SAME_PAIR_READY')
    wb=tx('independent-same-pair-b',claims(q));lock('independent-same-pair-b');assert finish(wa)[0]==0
    code,error=finish(wb,'');assert code!=0 and expected in error,(code,error)
    assert run(f"select count(*) from public.likes where user_id='{a}' and post_id='{post}'")=='1'
    record('same like pair concurrently at last quota slot',result=('CONFIRMED FINDING' if stage=='before' else 'PASS'),expected_duplicate='23505',actual_sqlstate=expected,committed_rows=1,counter=120,observed_lock=True)
    wa=tx('independent-profile-write',claims(alert(503)).removesuffix('commit;')+'\n\\echo PROFILE_HELD')
    wait_marker(wa,'PROFILE_HELD')
    wb=tx('independent-profile-cascade',f"begin;delete from auth.users where id='{a}';commit;")
    lock('independent-profile-cascade');assert finish(wa)[0]==0
    code,error=finish(wb,'');assert code==0,(code,error)
    assert run(f"select count(*) from public.profiles where id='{a}'")=='0'
    assert run(f"select count(*) from private.social_write_counters where user_id='{a}'")=='0'
    run(claims(alert(504)),'42501')
    record('KEY SHARE holds own profile until legacy alert commit; Auth cascade then removes own counters; stale caller rejected',result='PASS',observed_lock=True)
    run(f"insert into auth.users(id) values('{a}');insert into public.stable_members(stable_id,user_id,role,access) values('{s}','{a}','admin','owner');")
    wa=tx('independent-delete-first',f"begin;delete from auth.users where id='{a}';\n\\echo DELETE_HELD")
    wait_marker(wa,'DELETE_HELD')
    wb=tx('independent-write-after-delete',claims(alert(505)))
    lock('independent-write-after-delete');assert finish(wa)[0]==0
    code,error=finish(wb,'');assert code!=0 and '42501' in error,(code,error)
    assert run("select count(*) from public.alerts where id='00000000-0000-4000-8000-000000000505'")=='0'
    record('profile deletion locks first; legacy alert waits and fails closed after delete commit',result='PASS',observed_lock=True)
finally:
    for p in children:
        if p.poll() is None:
            p.kill();p.wait(timeout=5)
    try:
        if started or (data/'postmaster.pid').exists():
            subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,capture_output=True,env=env,timeout=20)
    finally:
        shutil.rmtree(work)
    receipt={'result':'FAIL' if sys.exc_info()[0] else 'PASS','status':'PROPOSAL FIXTURE REPLAY ONLY; no Hosted installation','stage':stage,'source_head':bindings['source_head'],'driver_source_sha256':bindings['rate']['source_concurrency_driver_sha256'],'schema_sha256':hashlib.sha256(schema.encode()).hexdigest(),'sql_sha256':hashlib.sha256(proposal.encode()).hexdigest(),'postgres_version':subprocess.check_output([str(pg/'postgres'),'--version'],text=True).strip(),'provider_requests':0,'tcp_enabled':False,'cluster_removed':True,'children_stopped':all(p.poll() is not None for p in children),'checks':results}
    (reports/f'rate-concurrency-{stage}-result.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'checks':len(results),'findings':sum(r['result']=='CONFIRMED FINDING' for r in results),'sql_sha256':receipt['sql_sha256'],'schema_sha256':receipt['schema_sha256'],'all_processes_stopped':receipt['children_stopped']}))
