import pathlib,json,subprocess,time
source=pathlib.Path('/tmp/stableflow-next-db-tests.py').read_text().split('# Reset only')[0]
exec(source)
prior=json.loads(pathlib.Path('/tmp/stableflow-next-db-test-results.json').read_text())
for iso in ['read committed','repeatable read']:
    short='rc' if iso=='read committed' else 'rr'
    for variant in ['rollback','nonoverlap']:
        label='extra-'+short+'-'+variant;fixture(label)
        a,b=Session(),Session()
        for session in [a,b]:
            session.send(f'begin isolation level {iso};'+auth(label)+"set local statement_timeout='8s'; select count(*) from arena_bookings;")
            session.marker('SNAPSHOT')
        a.send(booking(label,'a'));a.marker('FIRST_WRITTEN')
        b.send(booking(label,'b','10:00' if variant=='rollback' else '11:00','11:00' if variant=='rollback' else '12:00')+'commit;')
        time.sleep(.2)
        check(label+' waits for parent',b.p.poll() is None)
        a.send('rollback;' if variant=='rollback' else 'commit;')
        rcA,outA=a.finish();rcB,outB=b.finish()
        if variant=='nonoverlap' and short=='rr':
            check(label+' conservative RR retry',rcA==0 and rcB!=0 and '40001' in outB)
            run('begin;'+auth(label)+booking(label,'b','11:00','12:00')+'commit;')
            check(label+' fresh retry allowed',True)
        else:check(label+' succeeds after correct visibility',rcA==0 and rcB==0,outB)

label='extra-bulk';sid=fixture(label)
p=run(booking(label,'a')[:-1]+",(test_id('extra-bulk:b'),test_id('extra-bulk'),'2026-09-08','10:30','11:30','QA');",False)
check('multirow overlapping arena insert rejected',p.returncode!=0 and 'Tiden är redan bokad' in p.stderr,p.stderr)
check('multirow rejection leaves no booking',run(f'select count(*) from arena_bookings where stable_id={sid};').stdout.strip()=='0')
p=run(f"update stable_members set role='staff',access='edit' where stable_id={sid} and role='admin';",False)
check('bulk owner demotion rejected',p.returncode!=0 and 'minst en ägare' in p.stderr,p.stderr)
check('bulk demotion rolls back both',run(f"select count(*) from stable_members where stable_id={sid} and role='admin' and access='owner';").stdout.strip()=='2')
run("insert into stables(id,name) values(test_id('historic-ownerless'),'historical test fixture');")
p=subprocess.run(PSQL+['-f','/tmp/stableflow-next-db-proposal.sql'],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
check('revised proposal applies with historical ownerless stable',p.returncode==0,p.stderr)
check('preflight emits ownerless notice', '1 befintliga stall saknar' in p.stderr,p.stderr)
check('historical ownerless row unchanged',run("select name from stables where id=test_id('historic-ownerless');").stdout.strip()=='historical test fixture')
check('both direct trigger EXECUTE grants denied',run("select (has_function_privilege('authenticated','public.guard_last_stable_owner()','execute') or has_function_privilege('authenticated','public.guard_arena_booking_overlap()','execute') or has_function_privilege('anon','public.guard_last_stable_owner()','execute'))::text;").stdout.strip()=='false')
# Fail closed if an existing parent BEFORE trigger suppresses the mutex update.
run("create function public.qa_suppress_parent() returns trigger language plpgsql as $$begin return null; end$$; create trigger qa_suppress_parent before update on stables for each row execute function qa_suppress_parent();")
p=run(f"delete from stable_members where stable_id={sid} and role='admin';",False)
check('suppressed parent mutex fails closed',p.returncode!=0 and 'Stallåset kunde inte tas' in p.stderr,p.stderr)
run('drop trigger qa_suppress_parent on stables; drop function public.qa_suppress_parent();')
# Actual multirow INSERT after volatility fix, not merely SELECT sampling.
run("insert into stables(id,name) select test_id('joinbatch:'||n), 'join batch' from generate_series(1,8) n;")
check('join codes in actual multirow insert',run("select count(distinct join_code) from stables where name='join batch';").stdout.strip()=='8')
allresults=prior+results
pathlib.Path('/tmp/stableflow-next-db-test-results.json').write_text(json.dumps(allresults,indent=2,ensure_ascii=False))
print('EXTRA '+str(len(results))+' PASS; TOTAL '+str(len(allresults))+' PASS',flush=True)
