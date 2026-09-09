import subprocess, time, json, pathlib
PSQL=['/usr/local/bin/psql','-h','/tmp/stableflow-rls-check/socket','-p','58473','-U','postgres','-d','stableflow_next_proposal_20260908','-X','-qAt','-v','ON_ERROR_STOP=1']
results=[]
def run(sql, ok=True):
    p=subprocess.run(PSQL,input=sql,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if ok and p.returncode: raise AssertionError(p.stderr)
    return p

def check(name, condition, detail=''):
    if not condition: raise AssertionError(name+': '+detail)
    results.append({'test':name,'result':'PASS','detail':detail})
    print('PASS '+name,flush=True)

def fixture(label):
    sid="test_id('"+label+"')"
    run(f"insert into profiles(id) values(test_id('{label}:owner1')),(test_id('{label}:owner2')),(test_id('{label}:staff')),(test_id('{label}:guest')); insert into stables(id,name,created_by) values({sid},'{label}',test_id('{label}:owner1')); insert into stable_members(stable_id,user_id,role,access) values({sid},test_id('{label}:owner1'),'admin','owner'),({sid},test_id('{label}:owner2'),'admin','owner'),({sid},test_id('{label}:staff'),'staff','view'),({sid},test_id('{label}:guest'),'guest','view');")
    return sid

def auth(label,user='owner1'):
    return f"set local role authenticated; select set_config('request.jwt.claim.sub',test_id('{label}:{user}')::text,true);"

def booking(label,bid,start='10:00',end='11:00',date='2026-09-08'):
    return f"insert into arena_bookings(id,stable_id,date,start_time,end_time,purpose) values(test_id('{label}:{bid}'),test_id('{label}'),'{date}','{start}','{end}','QA');"

class Session:
    def __init__(self):
        self.p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
        self.lines=[]
        self.send('\\set VERBOSITY verbose\n')
    def send(self,sql):
        self.p.stdin.write(sql+'\n');self.p.stdin.flush()
    def marker(self,tag):
        self.send("select '"+tag+"';")
        while True:
            line=self.p.stdout.readline()
            self.lines.append(line)
            if line.strip()==tag:return
            if not line: raise AssertionError('session ended early: '+''.join(self.lines))
    def finish(self):
        self.p.stdin.close();self.p.stdin=None
        output=self.p.communicate(timeout=12)[0]
        return self.p.returncode,''.join(self.lines)+output

def race(label,iso,sqlA,sqlB,expected):
    a=Session();b=Session()
    try:
        for session in [a,b]:
            session.send(f'begin isolation level {iso}; '+auth(label)+"set local statement_timeout='10s'; set local lock_timeout='8s'; select count(*) from arena_bookings; select count(*) from stable_members;")
            session.marker('SNAPSHOT')
        a.send(sqlA);a.marker('FIRST_WRITTEN')
        b.send(sqlB+' commit;');time.sleep(.3)
        check(label+' waiter blocks',b.p.poll() is None)
        a.send('commit;');rcA,outA=a.finish()
        rcB,outB=b.finish()
        check(label+' exactly one commit',rcA==0 and rcB!=0,outB.strip().splitlines()[-1] if outB else '')
        check(label+' expected conflict',expected in outB,outB)
    finally:
        for session in [a,b]:
            if session.p.poll() is None:session.p.kill();session.p.wait()

# Reset only this dedicated fixture database; never app/live data.
run('truncate arena_bookings, stable_members, stables, profiles cascade; alter policy arena_select on arena_bookings using (is_stable_member(stable_id));')
for iso in ['read committed','repeatable read']:
    short='rc' if iso=='read committed' else 'rr'
    for operation in ['insert','update']:
        label='arena-'+short+'-'+operation;sid=fixture(label)
        if operation=='insert':a,b=booking(label,'a'),booking(label,'b','10:30','11:30')
        else:
            run(booking(label,'a','08:00','09:00')+booking(label,'b','12:00','13:00'))
            a=f"update arena_bookings set start_time='10:00',end_time='11:00' where id=test_id('{label}:a');"
            b=f"update arena_bookings set start_time='10:30',end_time='11:30' where id=test_id('{label}:b');"
        race(label,iso,a,b,'23P01' if short=='rc' else '40001')
        remaining=run(f"select count(*) from arena_bookings a join arena_bookings b on a.id<b.id and a.stable_id=b.stable_id and a.date=b.date where a.stable_id={sid} and a.start_time::time < b.end_time::time and b.start_time::time < a.end_time::time;").stdout.strip()
        check(label+' no committed overlap',remaining=='0',remaining)
    for operation in ['delete','demote']:
        label='owner-'+short+'-'+operation;sid=fixture(label)
        if operation=='delete':
            a=f"delete from stable_members where stable_id={sid} and user_id=test_id('{label}:owner2');"
            b=f"delete from stable_members where stable_id={sid} and user_id=test_id('{label}:owner1');"
        else:
            a=f"update stable_members set role='staff',access='edit' where stable_id={sid} and user_id=test_id('{label}:owner2');"
            b=f"update stable_members set role='staff',access='edit' where stable_id={sid} and user_id=test_id('{label}:owner1');"
        race(label,iso,a,b,'23514' if short=='rc' else '40001')
        remaining=run(f"select count(*) from stable_members where stable_id={sid} and role='admin' and access='owner';").stdout.strip()
        check(label+' owner remains',remaining=='1',remaining)

label='allowed';sid=fixture(label)
p=run('begin;'+auth(label,'staff')+booking(label,'a')+booking(label,'adjacent','11:00','12:00')+booking(label,'other-day','10:00','11:00','2026-09-09')+'commit;')
check('staff with view access may book adjacent and different dates',p.returncode==0)
other=fixture('other-stable');run(booking('other-stable','a'));check('same time other stable allowed',True)
for title,sql in [
    ('guest insert denied','begin;'+auth(label,'guest')+booking(label,'guest','14:00','15:00')+'commit;'),
    ('anon cannot insert',"begin; set local role anon; "+booking(label,'anon','14:00','15:00')+'commit;'),
    ('authenticated trigger function execute denied','begin;'+auth(label)+"select public.guard_last_stable_owner(); commit;"),
    ('null stable denied',"insert into arena_bookings(date,start_time,end_time,purpose) values('2026-09-08','16:00','17:00','QA');"),
    ('invalid clock denied',booking(label,'invalid','25:00','26:00')),
    ('overnight interval denied',booking(label,'overnight','23:00','01:00')),
]:
    p=run(sql,False);check(title,p.returncode!=0,p.stderr.strip())
# RLS hides this booking even from the staff role; trigger must still see it.
run("alter policy arena_select on arena_bookings using (is_stable_member(stable_id) and purpose <> 'hidden');")
run(f"update arena_bookings set purpose='hidden' where id=test_id('{label}:a');")
visible=run('begin;'+auth(label,'staff')+f"select count(*) from arena_bookings where id=test_id('{label}:a'); rollback;").stdout.strip().splitlines()[-1]
check('hidden fixture invisible to caller',visible=='0',visible)
p=run('begin;'+auth(label,'staff')+booking(label,'hidden-conflict','10:15','10:45')+'commit;',False)
check('security definer rejects invisible conflict',p.returncode!=0 and 'Tiden är redan bokad' in p.stderr,p.stderr.strip())
run('alter policy arena_select on arena_bookings using (is_stable_member(stable_id));')

label='owner-static';sid=fixture(label)
# Atomic multirow statement must roll back its first deletion when the second is forbidden.
p=run('begin;'+auth(label)+f"delete from stable_members where stable_id={sid} and role='admin'; commit;",False)
check('bulk owner delete rejected',p.returncode!=0,p.stderr.strip())
count=run(f"select count(*) from stable_members where stable_id={sid} and access='owner';").stdout.strip()
check('bulk rejection preserves both owners',count=='2',count)
run(f"delete from stable_members where stable_id={sid} and user_id=test_id('{label}:owner2');")
for title,sql in [
    ('last owner null access denied',f"update stable_members set access=null where stable_id={sid} and access='owner';"),
    ('last owner moved to another stable denied',f"update stable_members set stable_id={other} where stable_id={sid} and access='owner';"),
    ('last owner profile cascade denied',f"delete from profiles where id=test_id('{label}:owner1');")
]:
    p=run(sql,False);check(title,p.returncode!=0,p.stderr.strip())
# Promote first, then remove old owner: same-transaction writes must be visible.
run(f"begin; update stable_members set role='admin',access='owner' where stable_id={sid} and user_id=test_id('{label}:staff'); delete from stable_members where stable_id={sid} and user_id=test_id('{label}:owner1'); commit;")
check('promote then demote transfer allowed',True)
run(booking(label,'cascade','17:00','18:00'))
run('begin;'+auth(label)+f"delete from stables where id={sid}; commit;")
count=run(f"select (select count(*) from stable_members where stable_id={sid})+(select count(*) from arena_bookings where stable_id={sid});").stdout.strip()
check('creator stable delete cascade allowed',count=='0',count)
# New stables may still bootstrap in separate statements.
run("insert into stables(id,name,created_by) values(test_id('bootstrap'),'bootstrap',test_id('allowed:owner1'));")
run("begin;"+auth('allowed')+"insert into stable_members(stable_id,user_id,role,access) values(test_id('bootstrap'),test_id('allowed:owner1'),'admin','owner'); commit;")
check('first owner bootstrap still allowed',True)
vol=run("select provolatile from pg_proc where oid='public.generate_join_code()'::regprocedure;").stdout.strip()
check('join generator volatile',vol=='v',vol)
# 32 independent invocations: collisions remain theoretically possible, and UNIQUE protects DB rows.
p=run("select count(distinct public.generate_join_code()) from generate_series(1,32);")
check('join generator evaluated per input row in sample',int(p.stdout.strip())>1,p.stdout.strip()+' distinct samples / 32')
pathlib.Path('/tmp/stableflow-next-db-test-results.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
print('TOTAL '+str(len(results))+' PASS',flush=True)
