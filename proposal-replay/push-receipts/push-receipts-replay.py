#!/usr/bin/env python3
"""Source checking by default; --runtime is opt-in non-root Linux only.

Uses the existing stdlib-only rate replay observer/worker pattern. It starts one
owned Unix-socket cluster, never TCP/Hosted, with ordinary actual LOGIN workers.
No sleeps order backend races: a persistent advisory-lock controller observes
pg_blocking_pids/pg_locks before releasing a barrier. Poll backoff is not a race
ordering assumption. Runtime receipts must be outside this frozen sql/ bundle.

Setup: --schema /exact/b0b5ee71/supabase/schema.sql --runtime --receipt /proof.json.
fixture-auth-net -> full schema -> demote migration owner -> schema-append ->
rollback regression, four separate mutated DB clones, CAS/deadline and SKIP LOCKED races.
Nothing installs dependencies or performs real Auth/Vault/Expo/provider calls.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent
SCHEMA_SHA = "2265a4c22cfdf6eebb30e6abea1f808cf5187eb6e5ddab4eb55e6001a8f3d18b"
PUSH_SCHEMA_SHA = "2a887c0b9e516d5fb8720e940b55879316c6cbb99b7045192ca4818d9b065a32"
NOTIFY_BASE_SHA = "bc653d5d0bf17ba15579945015e4290c0d20d543b2e35309275cd9ac1df60a40"
EXPECTED = {
    '20261008_push_receipt_ledger.sql': '052bcb979a86d4c41247ab059049fe99efa121991f86b425be9d5ba32ffd5f68',
    'fixture-auth-net.sql': '2efc9d104839eeb19b63045199d6297435d1bb7973536c2280ca4562740da9ce',
    'negative-cas-deadline.sql': '91559ef63259b2924a3d68fe2ee6642f06dc16fa37eeaff6d3b02a5bb4c9cda8',
    'negative-cas-generation.sql': 'f9f7deec5d58ebcff936ee7711f2faec4a735579c8faea45b2339c5e09d4125c',
    'negative-generation.sql': '438e319e15707c1d15722764dd985bdef9b8a16aeaa2fa507ae0506913a0212e',
    'negative-notify-client-execute.sql': '7f870ff167499cdbd6a8235bc296cb309ab47f79274b3b43aa4205f731176680',
    'push-receipts-regression.sql': '52a535fce285f4d536a36d41a9b03923ee461edfaa1490278dfcc559c3981380',
    'race-cas-a.sql': '95fed595d83a9f1fbf796119c8246b68b0ffaffb788136af88e47146d739e3d3',
    'race-cas-b.sql': 'a18fab0dd7b4b712223963ae2a43375c5fd3c8f72f56e6cc1b6da27b99fa69b9',
    'race-expiry-a.sql': 'ddc7409d89232463e5140ea185befd8aec85d3172060c10c0f14907392b1e87d',
    'race-expiry-b.sql': 'b02416a41f39496587b5d557221d7b8c2fb7623bdf4688933078479a8940d8dd',
    'race-setup.sql': 'bbd4db36123588aa5ecd8543e2add05898d7a53db95e2e2ee6c5985e9084c356',
    'race-skip-a.sql': '9f8cbeac27a67389adbe64a1382f66c61eb63b30010a645159995e004c1cc712',
    'race-skip-b.sql': 'cdf622ca69c2b98bb4ff7dd6d5f8c4fdb465396fe8cfa97e2860e9211089ab49',
    'schema-append.sql': '5e5590c7c2b6bb58920539ed9f7588d995d97c7b085033c25cbda86d24cf951e'
}
WAIT_SECONDS = 8
MARK = "set stableflow.test_fixture='push_receipts';\n"


def source_check(schema_path):
    hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in EXPECTED}
    assert hashes == EXPECTED, "Frozen proposal source hash mismatch"
    assert hashlib.sha256(schema_path.read_bytes()).hexdigest() == SCHEMA_SHA, "Full baseline schema hash mismatch"
    candidate = (ROOT / "20261008_push_receipt_ledger.sql").read_text()
    prefix, append = (ROOT / "schema-append.sql").read_bytes().split(
        b'\n-- Receipt ledger append; original push migration bytes are preserved above.\n', 1)
    assert hashlib.sha256(prefix).hexdigest() == PUSH_SCHEMA_SHA
    assert append == (ROOT / "20261008_push_receipt_ledger.sql").read_bytes()
    start = candidate.index('create or replace function public.notify_push(')
    end = candidate.index('$$;', start) + len('$$;')
    notify = candidate[start:end] + '\n'
    addition = "    'request_id', gen_random_uuid(),\n"
    assert notify.count(addition) == 1
    assert hashlib.sha256(notify.replace(addition, '').encode()).hexdigest() == NOTIFY_BASE_SHA
    assert candidate.count('create table if not exists private.push_delivery_') == 2
    assert set(re.findall(r'create or replace function public\.(push_receipts_\w+)\(', candidate)) == {
        'push_receipts_prepare', 'push_receipts_record_tickets', 'push_receipts_claim_due', 'push_receipts_apply'}
    assert candidate.count("if auth.role() is distinct from 'service_role'") == 4
    assert candidate.count('for update skip locked') == 2
    assert 'where id = p_token_id and user_id = p_user_id and registration_generation = p_generation;' in candidate
    assert 'clock_timestamp() >= p_deadline' in candidate
    assert 'v_ticket.registration_generation,v_ticket.lease_expires_at)' in candidate
    assert "new.registration_generation := gen_random_uuid();" in candidate
    assert 'next_check_at=least(v_now+interval \'15 minutes\',t.expires_at)' in candidate
    assert 'from public,anon,authenticated,service_role;' in candidate
    assert 'grant execute on function public.notify_push(text,jsonb,jsonb) to service_role;' in candidate
    ledger = candidate[candidate.index('create table if not exists private.push_delivery_attempts'):candidate.index('create index if not exists')]
    assert not re.search(r'\b(token|body|title|email|profile)\s+(text|jsonb)\b', ledger)
    checks = re.findall(r"pg_temp\.check_(?:ok|error)\('([^']+)'", (ROOT / 'push-receipts-regression.sql').read_text())
    assert len(checks) == len(set(checks)) and len(checks) >= 40
    return {'state': 'SOURCE_CHECK_PASS; SQL_RUNTIME_NOT_RUN', 'hashes': hashes,
            'schema_sha256': SCHEMA_SHA, 'driver_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'expected_regression_labels': checks, 'source_checks': [
                'exact frozen SQL hashes', 'full baseline schema hash', 'original push schema prefix bytes',
                'schema append equals candidate', 'only request_id changed in original notify body',
                'four service-only RPCs', 'protected generation and exact CAS', 'claim retry/lease source fences',
                'no raw token/message/profile ledger fields'], 'sql_runtime_calls': 0, 'provider_requests': 0}


class Session:
    def __init__(self, args, environment):
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, bufsize=1, env=environment)
        self.lines = queue.Queue()
        self.errors = []
        self.serial = 0
        self.readers = [threading.Thread(target=self._read, daemon=True), threading.Thread(target=self._read_errors, daemon=True)]
        for reader in self.readers:
            reader.start()

    def _read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip('\n'))
        self.lines.put(None)

    def _read_errors(self):
        self.errors.extend(self.process.stderr)

    def query(self, statement):
        self.serial += 1
        marker = f'SF_PUSH_OBSERVER_END_{self.serial}'
        self.process.stdin.write(statement.rstrip(';\n') + f";\nselect '{marker}';\n")
        self.process.stdin.flush()
        output = []
        deadline = time.monotonic() + WAIT_SECONDS
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError('Observer response exceeded bounded deadline')
            try:
                line = self.lines.get(timeout=remaining)
            except queue.Empty as caught:
                raise AssertionError('Observer response exceeded bounded deadline') from caught
            if line is None:
                raise AssertionError('Observer exited: ' + ''.join(self.errors))
            if line == marker:
                return '\n'.join(item for item in output if item).strip()
            output.append(line)

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write('\\q\n')
                self.process.stdin.flush()
                self.process.wait(timeout=2)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.process.kill()
                self.process.wait(timeout=2)
        for reader in self.readers:
            reader.join(timeout=2)


class Worker:
    def __init__(self, args, environment, statement):
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, env=environment)
        self.process.stdin.write(MARK + statement)
        self.process.stdin.close()
        self.output = None

    def finish(self):
        if self.output is None:
            self.process.wait(timeout=WAIT_SECONDS)
            self.output = (self.process.returncode, self.process.stdout.read(), self.process.stderr.read())
        return self.output

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
            self.process.wait(timeout=2)


def runtime(schema_path, receipt_path, port, binding):
    if sys.platform != 'linux' or os.getuid() == 0:
        raise SystemExit('[push receipts replay] Runtime requires an isolated non-root Linux runner; no PostgreSQL started.')
    if ROOT == receipt_path.parent or ROOT in receipt_path.parents:
        raise SystemExit('[push receipts replay] Runtime receipt must be outside the frozen source bundle.')
    # A minimal allowlist also strips EVERY PG* override, including service,
    # password, host, .pgpass, SSL and alternate connection string configuration.
    environment = {name: os.environ[name] for name in ('PATH', 'LANG', 'LC_ALL') if name in os.environ}
    pg_bin = os.environ.get('STABLEFLOW_TEST_PG_BIN') or subprocess.check_output(
        ['pg_config', '--bindir'], text=True, env=environment, timeout=5).strip()
    pg = Path(pg_bin)
    assert all((pg / name).is_file() for name in ('initdb', 'pg_ctl', 'psql')), 'Preinstalled PostgreSQL binaries required'
    directory = Path(tempfile.mkdtemp(prefix='sf-push-receipts-', dir='/tmp'))
    socket = directory / 'socket'
    socket.mkdir()
    data = directory / 'data'
    children = []
    started = False
    report = {'state': 'RUNNING_SYNTHETIC_LOCAL_ONLY', 'source_head': 'b0b5ee71a9577d3ae2b7605874befc76f55efc7f',
              'hashes': binding['hashes'], 'schema_sha256': SCHEMA_SHA, 'driver_sha256': binding['driver_sha256'],
              'checks': [], 'provider_requests': 0, 'tcp_enabled': False, 'cluster_cleaned': False,
              'role_model': 'postgres NOSUPERUSER/BYPASSRLS owns application tables; separately owned Auth SELECT+REFERENCES only; workers direct LOGIN authenticated/service_role NOSUPERUSER',
              'jwt_model': 'synthetic SQL GUC claims, never signed JWT/PostgREST/provider acceptance'}

    def command(name, args, input=None, timeout=30):
        return subprocess.run([str(pg / name), *args], input=input, text=True, capture_output=True,
                              env=environment, timeout=timeout)

    def connection(database, role='postgres'):
        return [str(pg / 'psql'), '-h', str(socket), '-p', str(port), '-U', role, '-d', database,
                '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']

    def execute(database, statement, role='postgres'):
        return subprocess.run(connection(database, role), input=MARK+statement, text=True,
                              capture_output=True, env=environment, timeout=40)

    def sql(database, statement, role='postgres'):
        result = execute(database, statement, role)
        assert result.returncode == 0, result.stderr
        return result.stdout.strip()

    def script(name):
        return (ROOT / name).read_text()

    def clone(database):
        sql('postgres', f'create database {database} template push_seed owner postgres;', 'sf_fixture_admin')
        assert sql(database, "select current_setting('stableflow.test_fixture')='push_receipts';") == 't'
        return database

    def passed(name, **facts):
        report['checks'].append({'name': name, 'result': 'PASS', **facts})

    def worker(database, filename, role):
        child = Worker(connection(database, role), environment, script(filename))
        children.append(child)
        return child

    def observe_until(session, query, predicate, child):
        deadline = time.monotonic() + WAIT_SECONDS
        while time.monotonic() < deadline:
            value = session.query('select pg_stat_clear_snapshot(); '+query)
            if predicate(value):
                return value
            if child.process.poll() is not None:
                raise AssertionError(('Worker exited before required backend lock observation', child.finish()))
            time.sleep(0.01)  # Only bounded observer polling; never race ordering.
        raise AssertionError('Real backend barrier/row lock was not observed')

    def race(database, kind, negative=False):
        gate = {'cas': 8071001, 'skip': 8071002, 'expiry': 8071003}[kind]
        control = Session(connection(database), environment)
        children.append(control)
        a = b = None
        released = False
        try:
            control.query(MARK)
            controller_pid = int(control.query('select pg_backend_pid();'))
            assert control.query(f'select pg_advisory_lock({gate});') == ''
            b = worker(database, f'race-{kind}-b.sql', 'authenticated' if kind != 'skip' else 'service_role')
            b_pid = int(observe_until(control,
                f"select a.pid from pg_stat_activity a where a.application_name='sf_push_{kind}_b' "
                f"and {controller_pid}=any(pg_blocking_pids(a.pid)) and exists(select 1 from pg_locks l "
                "where l.pid=a.pid and l.locktype='advisory' and not l.granted);", str.isdigit, b))
            deadline = None
            if kind == 'expiry':
                # Only set the short synthetic deadline after B provably holds
                # the unchanged token row. A must then be observed waiting for
                # B while this lease is still valid, before DBclock expires it.
                deadline = control.query("update private.push_delivery_tickets "
                    "set lease_expires_at=clock_timestamp()+interval '4 seconds' "
                    "where attempt_id=push_fixture.pid('cas-attempt') returning lease_expires_at::text;")
            a = worker(database, f'race-{kind}-a.sql', 'service_role')
            if kind in ('cas', 'expiry'):
                a_pid = int(observe_until(control,
                    f"select a.pid from pg_stat_activity a where a.application_name='sf_push_{kind}_a' "
                    f"and {b_pid}=any(pg_blocking_pids(a.pid));", str.isdigit, a))
                assert a_pid != b_pid and a_pid != controller_pid
                if kind == 'expiry':
                    assert observe_until(control,
                        "select clock_timestamp()>=lease_expires_at from private.push_delivery_tickets "
                        "where attempt_id=push_fixture.pid('cas-attempt');", lambda value: value == 't', a) == 't'
                assert control.query(f'select pg_advisory_unlock({gate});') == 't'
                released = True
                a_code, _, a_errors = a.finish()
                b_code, _, b_errors = b.finish()
                assert b_code == 0, b_errors
                if negative:
                    failure = ('FAIL old DNR deleted a concurrent fresh registration' if kind == 'cas'
                        else 'FAIL expired collector finalized unchanged registration after lock wait')
                    assert a_code != 0 and failure in a_errors, a_errors
                else:
                    assert a_code == 0, a_errors
                    assert sql(database, "select exists(select 1 from public.push_tokens where id=push_fixture.pid('cas-token')); ") == 't'
                    if kind == 'expiry':
                        assert sql(database, "select t.registration_generation=d.registration_generation "
                            "and d.receipt_status='pending' "
                            "and d.lease_id=(r.receipt->>'lease_id')::uuid "
                            "from public.push_tokens t join private.push_delivery_tickets d on d.token_id=t.id "
                            "join push_fixture.race_state r on r.label='cas-claim' "
                            "where d.attempt_id=push_fixture.pid('cas-attempt');") == 't'
                name = ('negative CAS sensitivity' if negative else 'old DNR vs concurrent fresh registration') if kind == 'cas' else (
                    'negative deadline sensitivity' if negative else 'expired lease rolls back unchanged token cleanup after lock wait')
                passed(name,
                       actual_a_pid=a_pid, actual_b_pid=b_pid, controller_pid=controller_pid,
                       observed_old_dnr_waits_for_token_row=True, expected_negative=negative,
                       observed_db_deadline=deadline)
            else:
                a_code, _, a_errors = a.finish()
                assert a_code == 0, a_errors
                assert b.process.poll() is None, 'First collector must still hold its row lock'
                assert control.query(f"select {controller_pid}=any(pg_blocking_pids(pid)) from pg_stat_activity "
                                     "where application_name='sf_push_skip_b';") == 't'
                assert control.query(f'select pg_advisory_unlock({gate});') == 't'
                released = True
                b_code, _, b_errors = b.finish()
                assert b_code == 0, b_errors
                passed('SKIP LOCKED second actual collector finishes before first barrier release',
                       actual_b_pid=b_pid, controller_pid=controller_pid, independent_other_due_ticket=True)
        finally:
            if not released and control.process.poll() is None:
                control.query(f'select pg_advisory_unlock({gate});')
            for child in (a, b):
                if child:
                    child.close()
            control.close()

    try:
        result = command('initdb', ['-D', str(data), '-U', 'sf_fixture_admin', '--auth=trust', '--no-locale', '-E', 'UTF8'])
        assert result.returncode == 0, result.stderr
        result = command('pg_ctl', ['-D', str(data), '-l', str(directory / 'postgres.log'), '-o',
                                   f"-k {socket} -p {port} -c listen_addresses='' -c shared_buffers=16MB -c max_connections=30", '-w', 'start'])
        assert result.returncode == 0, result.stderr
        started = True
        sql('postgres', 'create role postgres login superuser; '
            'create role authenticated login nosuperuser nocreatedb nocreaterole; '
            'create role anon login nosuperuser nocreatedb nocreaterole; '
            'create role service_role login nosuperuser nocreatedb nocreaterole bypassrls; '
            'grant authenticated,anon,service_role to postgres; '
            'grant pg_read_all_stats to postgres; create database push_seed owner postgres;', 'sf_fixture_admin')
        sql('push_seed', script('fixture-auth-net.sql'))
        sql('push_seed', schema_path.read_text())
        sql('push_seed', 'alter table auth.users owner to sf_fixture_admin; '
            'grant select,references on auth.users to postgres; '
            'alter function push_fixture.synthetic_auth_user(uuid) owner to sf_fixture_admin; '
            'alter function push_fixture.synthetic_auth_delete(uuid) owner to sf_fixture_admin; '
            'grant execute on function push_fixture.synthetic_auth_user(uuid),push_fixture.synthetic_auth_delete(uuid) to postgres;', 'sf_fixture_admin')
        sql('postgres', 'alter role postgres nosuperuser nocreatedb nocreaterole bypassrls;', 'sf_fixture_admin')
        assert sql('push_seed', "select not rolsuper and rolbypassrls from pg_roles where rolname=current_user;") == 't'
        assert sql('push_seed', "select has_table_privilege(current_user,'auth.users','SELECT') "
                   "and has_table_privilege(current_user,'auth.users','REFERENCES') "
                   "and not has_table_privilege(current_user,'auth.users','INSERT,UPDATE,DELETE');") == 't'
        assert sql('push_seed', 'show listen_addresses;') == ''
        sql('push_seed', script('schema-append.sql'))
        sql('push_seed', script('20261008_push_receipt_ledger.sql'))
        passed('ordinary migration owner applies full exact append and idempotent ledger replay',
               postgres_version=sql('push_seed', 'show server_version;'), auth_dml_denied=True)
        for role in ('authenticated', 'service_role'):
            role_value = sql('push_seed', 'select session_user=current_user and not rolsuper and rolcanlogin '
                             'and not rolcreatedb and not rolcreaterole from pg_roles where rolname=current_user;', role)
            assert role_value == 't'
        passed('actual LOGIN worker roles are never superuser or bootstrap actor')
        positive = clone('push_positive')
        result = execute(positive, script('push-receipts-regression.sql'))
        assert result.returncode == 0, result.stderr
        labels = [line.removeprefix('PASS ') for line in result.stdout.splitlines() if line.startswith('PASS ')]
        assert set(labels) == set(binding['expected_regression_labels']) and len(labels) == len(set(labels))
        passed('complete-schema actual SQL RPC regression', passed_labels=labels, count=len(labels), failed=0)
        for index, (file, failure) in enumerate((
            ('negative-generation.sql', 'DB ignores supplied generation on INSERT'),
            ('negative-cas-generation.sql', 'old direct DNR cannot remove new registration'),
            ('negative-cas-deadline.sql', 'expired internal deadline fails before token deletion'),
            ('negative-notify-client-execute.sql', 'authenticated cannot dispatch notify_push'),
        )):
            db = clone(f'push_negative_{index}')
            sql(db, script(file))
            result = execute(db, script('push-receipts-regression.sql'))
            assert result.returncode != 0 and 'FAIL '+failure in result.stderr, result.stderr
            passed('negative control '+file, expected_negative=True, observed_expected_FAIL=failure)
        for name, kind, negative in (('push_cas','cas',False),('push_cas_negative','cas',True),
                                    ('push_expiry','expiry',False),('push_expiry_negative','expiry',True),
                                    ('push_skip','skip',False)):
            db = clone(name)
            sql(db, script('race-setup.sql'))
            if kind != 'skip':
                # Only the already-leased CAS ticket participates in this race.
                sql(db, "update private.push_delivery_tickets set next_check_at=expires_at "
                        "where attempt_id=push_fixture.pid('skip-attempt');")
            else:
                # Explicitly exclude CAS state from either collector's due set.
                sql(db, "update private.push_delivery_tickets set next_check_at=expires_at "
                        "where attempt_id=push_fixture.pid('cas-attempt');")
            if negative:
                sql(db, script('negative-cas-generation.sql' if kind == 'cas' else 'negative-cas-deadline.sql'))
            race(db, kind, negative)
        report['state'] = 'PASS_SYNTHETIC_SQL_ONLY; HOSTED_PROVIDER_PHONE_NOT_TESTED'
    except Exception as caught:
        report['state'] = 'FAILED_SYNTHETIC_SQL_REPLAY'
        report['failure'] = {'type': type(caught).__name__, 'message': str(caught)}
        raise
    finally:
        for child in reversed(children):
            child.close()
        if started or (data / 'postmaster.pid').exists():
            stop = command('pg_ctl', ['-D', str(data), '-m', 'immediate', '-w', 'stop'])
            report['cluster_cleaned'] = stop.returncode == 0
            if stop.returncode != 0:
                report['cleanup_failure'] = stop.stderr
        else:
            report['cluster_cleaned'] = True
        if report['cluster_cleaned']:
            shutil.rmtree(directory)
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema', type=Path, default=os.environ.get('STABLEFLOW_PUSH_SCHEMA'))
    parser.add_argument('--runtime', action='store_true')
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--port', type=int, default=58631)
    args = parser.parse_args()
    if args.schema is None:
        parser.error('Exact baseline full schema is required via --schema or STABLEFLOW_PUSH_SCHEMA')
    binding = source_check(Path(args.schema).resolve())
    if args.runtime:
        if args.receipt is None:
            parser.error('--runtime requires --receipt outside the frozen sql/ source directory')
        assert 1024 <= args.port <= 65535
        report = runtime(Path(args.schema).resolve(), args.receipt.resolve(), args.port, binding)
        print(json.dumps({'state': report['state'], 'check_groups': len(report['checks']),
                          'provider_requests': 0, 'cluster_cleaned': report['cluster_cleaned']}))
    else:
        print(json.dumps(binding, indent=2))


if __name__ == '__main__':
    main()
