#!/usr/bin/env python3
"""Portable, synthetic-only rate regression; default mode never starts PostgreSQL.

Runtime opt-in is allowed only on an isolated, non-root Linux runner with existing
PostgreSQL binaries. Two authenticated writer backends use a separate scheduling
and observation session. The SQL under test is never rewritten or instrumented.
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
SOURCES = {
    "original.sql": ROOT / "fixtures/rate-negative-duplicate-target.sql",
    "social_rate_limits.sql": ROOT / "fixtures/rate.sql",
    "fixture-schema.sql": ROOT / "fixtures/full-schema.sql",
}
EXPECTED = {
    "original.sql": "8b3723c3797fe271908bd70aa11b33966c38a8bb83158230816b15d0f24140a6",
    "social_rate_limits.sql": "f3c695cbcc5aa858feec8afa82870f8638145e5ab424f60e57027432033fa61d",
    "fixture-schema.sql": "2265a4c22cfdf6eebb30e6abea1f808cf5187eb6e5ddab4eb55e6001a8f3d18b",
}
TABLES = ("posts", "comments", "likes", "messages", "stable_alerts", "alerts")
GATE = 730008
PORT = "58510"
WAIT_SECONDS = 8


def uid(number):
    return f"00000000-0000-4000-8000-{number:012d}"


A, B, STABLE, FOREIGN, VIEW_STABLE, POST, CHAT = map(uid, (1, 2, 10, 11, 12, 100, 200))


def check_source():
    sources = {name: SOURCES[name].read_text() for name in EXPECTED}
    hashes = {name: hashlib.sha256(SOURCES[name].read_bytes()).hexdigest() for name in EXPECTED}
    assert hashes == EXPECTED, {"expected": EXPECTED, "actual": hashes}
    expected = sources["original.sql"].replace(
        "  -- Recheck only after the quota lock.",
        "  -- Hold the matching duplicate through unique-check; DELETE cannot turn retry into new write.\n"
        "  -- Recheck only after the quota lock.",
        1,
    )
    matches = {
        "posts": "p.id = NEW.id and p.user_id = caller",
        "comments": "c.id = NEW.id and c.user_id = caller",
        "likes": "l.post_id = NEW.post_id and l.user_id = caller",
        "messages": "m.id = NEW.id and m.author_id = caller",
        "stable_alerts": "a.id = NEW.id and a.created_by_user_id = caller",
        "alerts": "a.id = NEW.id",
    }
    aliases = {"posts": "p", "comments": "c", "likes": "l", "messages": "m", "stable_alerts": "a", "alerts": "a"}
    for table, predicate in matches.items():
        old = f"      select exists(select 1 from public.{table} {aliases[table]} where {predicate}) into duplicate_row;"
        assert expected.count(old) == 1, table
        if table == "alerts":
            predicate += " and a.stable_id = NEW.stable_id\n        and public.can_manage_day_events(a.stable_id)"
        new = f"      perform 1 from public.{table} {aliases[table]} where {predicate} for key share;\n      duplicate_row := FOUND;"
        expected = expected.replace(old, new, 1)
    assert expected == sources["social_rate_limits.sql"], "Candidate includes changes outside the six duplicate locks/comment"
    candidate = sources["social_rate_limits.sql"]
    assert candidate.index("Missing counter") < candidate.index("Hold the matching duplicate") < candidate.index("if duplicate_row then return new") < candidate.index("if used >= quota")
    assert candidate.count("duplicate_row := FOUND;") == 6
    assert candidate.count("create trigger social_write_limit_") == 6
    return {"state": "SOURCE_CHECK_PASS; SQL_RUNTIME_NOT_RUN", "hashes": hashes,
            "checks": ["exact bound sources", "only six scoped duplicate-lock replacements/comment",
                       "counter lock precedes duplicate match and quota check", "six BEFORE INSERT triggers unchanged"],
            "sql_runtime_calls": 0, "provider_requests": 0}


class Session:
    """One persistent observer session; its advisory lease cannot disappear early."""

    def __init__(self, args, env):
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, bufsize=1, env=env)
        self.lines = queue.Queue()
        self.errors = []
        self.serial = 0
        self.readers = [threading.Thread(target=self._read, daemon=True),
                        threading.Thread(target=self._read_errors, daemon=True)]
        for reader in self.readers:
            reader.start()

    def _read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip("\n"))
        self.lines.put(None)

    def _read_errors(self):
        self.errors.extend(self.process.stderr)

    def query(self, statement):
        self.serial += 1
        marker = f"SF_OBSERVER_END_{self.serial}"
        self.process.stdin.write(statement.rstrip(";\n") + f";\nselect '{marker}';\n")
        self.process.stdin.flush()
        output = []
        deadline = time.monotonic() + WAIT_SECONDS
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError("Observer response exceeded bounded deadline")
            try:
                line = self.lines.get(timeout=remaining)
            except queue.Empty as error:
                raise AssertionError("Observer response exceeded bounded deadline") from error
            if line is None:
                self.process.wait(timeout=2)
                raise AssertionError("Observer exited: " + "".join(self.errors))
            if line == marker:
                return "\n".join(item for item in output if item).strip()
            output.append(line)

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write("\\q\n")
                self.process.stdin.flush()
                self.process.wait(timeout=2)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.process.kill()
                self.process.wait(timeout=2)
        for reader in self.readers:
            reader.join(timeout=2)


class Worker:
    def __init__(self, args, env, statement):
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, env=env)
        self.process.stdin.write(statement)
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


def claim(statement, name):
    return (f"set application_name='{name}'; set statement_timeout='12s'; "
            "do $$begin if current_user <> 'authenticated' then raise exception using "
            "errcode='42501', message='[social rate replay] Authenticated writer login required.'; end if; end$$; "
            "begin; set local role authenticated; "
            f"set local request.jwt.claim.sub='{A}'; "
            "set local request.jwt.claim.role='authenticated'; " + statement + "; commit;\n")


def feature(table):
    return "alerts" if table in ("stable_alerts", "alerts") else table


def insertion(table, identifier, *, seed=False, stable=STABLE, post=POST):
    if table == "posts":
        return f"insert into public.posts(id,user_id,stable_id,content) values('{identifier}','{A}','{stable}','Synthetic retry')"
    if table == "comments":
        return f"insert into public.comments(id,user_id,post_id,content) values('{identifier}','{A}','{post}','Synthetic retry')"
    if table == "likes":
        # The production SDK inserts this pair without an id; use the actual default.
        columns = "id,user_id,post_id" if seed else "user_id,post_id"
        values = f"'{identifier}','{A}','{post}'" if seed else f"'{A}','{post}'"
        return f"insert into public.likes({columns}) values({values})"
    if table == "messages":
        return f"insert into public.messages(id,author_id,conversation_id,text) values('{identifier}','{A}','{CHAT}','Synthetic retry')"
    if table == "stable_alerts":
        return f"insert into public.stable_alerts(id,created_by_user_id,stable_id,title) values('{identifier}','{A}','{stable}','Synthetic retry')"
    return f"insert into public.alerts(id,stable_id,message,type) values('{identifier}','{stable}','Synthetic retry','info')"


def run_replay(receipt_path, binding):
    # Reject accidental execution on the currently blocked workstation or as root.
    if sys.platform != "linux" or os.getuid() == 0:
        raise SystemExit("[social rate replay] Runtime requires a separate non-root isolated Linux runner; no PostgreSQL was started.")
    if ROOT == receipt_path.parent or ROOT in receipt_path.parents:
        raise SystemExit("[social rate replay] Write runtime receipt outside the frozen source bundle.")
    environment = {name: os.environ[name] for name in ("PATH", "LANG", "LC_ALL") if name in os.environ}
    pg_bin = os.environ.get("STABLEFLOW_TEST_PG_BIN")
    if not pg_bin:
        pg_bin = subprocess.check_output(["pg_config", "--bindir"], text=True, env=environment, timeout=5).strip()
    pg = Path(pg_bin)
    assert all((pg / name).is_file() for name in ("psql", "initdb", "pg_ctl")), "Existing PostgreSQL binaries required; nothing is installed"
    directory = Path(tempfile.mkdtemp(prefix="sf-rate-race-", dir="/tmp"))
    socket = directory / "socket"
    data = directory / "data"
    socket.mkdir()
    children = []
    initialized = False
    started = False
    report = {"state": "RUNNING_SYNTHETIC_LOCAL_ONLY", "hashes": binding["hashes"],
              "driver_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "checks": [], "authenticated_writer_backends": 2, "observer_lease_backend": 1,
              "tcp_enabled": False, "provider_requests": 0,
              "claim_model": "synthetic auth GUCs, not signed JWT or Hosted/PostgREST acceptance",
              "role_model": "postgres NOSUPERUSER/BYPASSRLS owns public/private; separate Auth owner with SELECT-only to postgres",
              "test_quota": 2, "product_limits_approved": False, "cluster_cleaned": False}

    def command(name, args, input=None, timeout=20):
        return subprocess.run([str(pg / name), *args], input=input, text=True, capture_output=True,
                              env=environment, timeout=timeout)

    def connection(database, role="postgres"):
        return [str(pg / "psql"), "-h", str(socket), "-p", PORT, "-U", role, "-d", database,
                "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]

    def sql(database, statement, *, role="postgres", error=None):
        done = subprocess.run(connection(database, role), input=statement, text=True, capture_output=True,
                              env=environment, timeout=20)
        if error:
            assert done.returncode != 0 and re.search(r"\b" + re.escape(error) + r"\b", done.stderr), (error, done.stdout, done.stderr)
        else:
            assert done.returncode == 0, done.stderr
        return done.stdout.strip()

    def passed(name, **facts):
        report["checks"].append({"name": name, "result": "PASS", **facts})

    def full_counter(database, table):
        sql(database, "truncate private.social_write_counters; "
            f"insert into private.social_write_counters values('{A}','{feature(table)}',clock_timestamp(),2);")

    def assert_count(database, table):
        assert sql(database, f"select write_count from private.social_write_counters where user_id='{A}' and feature='{feature(table)}';") == "2"

    def observer(database):
        session = Session(connection(database), environment)
        children.append(session)
        return session

    def worker(database, statement):
        process = Worker(connection(database, "authenticated"), environment, statement)
        children.append(process)
        return process

    def await_value(session, expression, predicate, process):
        deadline = time.monotonic() + WAIT_SECONDS
        while time.monotonic() < deadline:
            value = session.query("select pg_stat_clear_snapshot(); " + expression)
            if predicate(value):
                return value
            if process.process.poll() is not None:
                raise AssertionError(("Writer exited before required lock observation", process.finish()))
            time.sleep(0.01)
        raise AssertionError("Required real backend lock was not observed before deadline")

    def concurrent_case(database, table, index, repaired):
        row = uid(1000 + index)
        sql(database, insertion(table, row, seed=True) + ";")
        full_counter(database, table)
        lease = observer(database)
        a = b = None
        released = False
        try:
            controller_pid = int(lease.query("select pg_backend_pid()"))
            lease.query(f"select pg_advisory_lock({GATE}::bigint)")
            a = worker(database, claim(insertion(table, row), "sf-rate-race-a"))
            a_pid = int(await_value(lease,
                "select a.pid from pg_stat_activity a where a.application_name='sf-rate-race-a' "
                f"and {controller_pid}=any(pg_blocking_pids(a.pid)) "
                "and exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory' and not l.granted);",
                lambda value: value.isdigit(), a))
            delete = f"with removed as (delete from public.{table} where id='{row}' returning 1) select count(*) from removed"
            b = worker(database, claim(delete, "sf-rate-race-b"))
            if repaired:
                b_pid = int(await_value(lease,
                    "select b.pid from pg_stat_activity b where b.application_name='sf-rate-race-b' "
                    f"and {a_pid}=any(pg_blocking_pids(b.pid));", lambda value: value.isdigit(), b))
                assert b.process.poll() is None, "DELETE must remain blocked by the duplicate target, not the quota counter"
            else:
                b_pid = None
                code, output, errors = b.finish()
                assert code == 0 and output.strip() == "1", (output, errors)
                assert lease.query(f"select count(*) from public.{table} where id='{row}'") == "0"
            assert lease.query(f"select pg_advisory_unlock({GATE}::bigint)") == "t"
            released = True
            a_code, a_output, a_error = a.finish()
            b_code, b_output, b_error = b.finish()
            assert b_code == 0 and b_output.strip() == "1", (b_output, b_error)
            assert_count(database, table)
            if repaired:
                assert a_code != 0 and re.search(r"\b23505\b", a_error), (a_output, a_error)
                assert sql(database, f"select count(*) from public.{table} where " +
                           (f"user_id='{A}' and post_id='{POST}'" if table == "likes" else f"id='{row}'")) == "0"
                passed(f"REV2 {table}: real target lock blocks DELETE, INSERT retains 23505; no uncounted replacement",
                       observed_a_pid=a_pid, observed_b_pid=b_pid, actual_delete_blocked_by_insert=True)
            else:
                assert a_code == 0, a_error
                predicate = f"user_id='{A}' and post_id='{POST}'" if table == "likes" else f"id='{row}'"
                assert sql(database, f"select count(*) from public.{table} where {predicate}") == "1"
                if table == "likes":
                    assert sql(database, f"select id <> '{row}'::uuid from public.likes where {predicate}") == "t"
                passed(f"Original {table}: negative baseline reproduces uncounted INSERT after committed DELETE",
                       expected_vulnerable_baseline=True, baseline_new_write_at_full_counter=True)
        finally:
            if not released and lease.process.poll() is None:
                lease.query(f"select pg_advisory_unlock({GATE}::bigint)")
            for process in (a, b):
                if process:
                    process.close()
            lease.close()

    def legacy_scope_case(database, *, same_stable):
        row = uid(2101 if same_stable else 2102)
        existing_stable = VIEW_STABLE if same_stable else FOREIGN
        incoming_stable = VIEW_STABLE if same_stable else STABLE
        sql(database, insertion("alerts", row, seed=True, stable=existing_stable) + ";")
        full_counter(database, "alerts")
        hold = observer(database)
        a = None
        try:
            hold.query(f"begin; select id from public.alerts where id='{row}' for update")
            a = worker(database, claim(insertion("alerts", row, stable=incoming_stable), "sf-rate-scope-a"))
            code, output, errors = a.finish()
            assert code != 0 and re.search(r"\bPT429\b", errors), (output, errors)
            assert_count(database, "alerts")
            assert sql(database, f"select count(*) from public.alerts where id='{row}' and stable_id='{existing_stable}'") == "1"
            passed("REV2 legacy alerts: " + ("same stable without manage permission" if same_stable else "different stable") +
                   " does not lock the foreign target; full quota rejects without waiting")
        finally:
            if a:
                a.close()
            if hold.process.poll() is None:
                hold.query("rollback")
            hold.close()

    try:
        done = command("initdb", ["-D", str(data), "-U", "sf_fixture_admin", "--auth=trust", "--no-locale", "-E", "UTF8"])
        assert done.returncode == 0, done.stderr
        initialized = True
        done = command("pg_ctl", ["-D", str(data), "-l", str(directory / "postgres.log"), "-o",
                                  f"-k {socket} -p {PORT} -c listen_addresses=''", "-w", "start"])
        assert done.returncode == 0, done.stderr
        started = True
        sql("postgres", "create role postgres login superuser;", role="sf_fixture_admin")
        report["postgres_version"] = sql("postgres", "show server_version;")
        sql("postgres", "create role authenticated login; create role anon nologin; "
            "create role service_role nologin bypassrls; "
            "create database full_fixture;")
        sql("full_fixture", """
          create schema auth;
          create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb,
                                  deleted_at timestamptz, banned_until timestamptz);
          create function auth.uid() returns uuid language sql stable as
            $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
          create function auth.role() returns text language sql stable as
            $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
          create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
        """)
        sql("full_fixture", SOURCES["fixture-schema.sql"].read_text())
        sql("full_fixture", f"""
          insert into auth.users(id) values('{A}'),('{B}');
          update public.profiles set username='synthetic-a',full_name='Synthetic A' where id='{A}';
          update public.profiles set username='synthetic-b',full_name='Synthetic B' where id='{B}';
          insert into public.stables(id,name,created_by) values
            ('{STABLE}','Synthetic own','{A}'),('{FOREIGN}','Synthetic foreign','{B}'),('{VIEW_STABLE}','Synthetic view','{B}');
          insert into public.stable_members(stable_id,user_id,role,access) values
            ('{STABLE}','{A}','admin','owner'),('{STABLE}','{B}','admin','owner'),
            ('{FOREIGN}','{B}','admin','owner'),('{VIEW_STABLE}','{B}','admin','owner'),
            ('{VIEW_STABLE}','{A}','spectator','view');
          insert into public.posts(id,user_id,stable_id,content) values('{POST}','{A}','{STABLE}','Synthetic parent');
          insert into public.conversations(id,title,is_group,stable_id,created_by_user_id)
            values('{CHAT}','Synthetic group',true,'{STABLE}','{A}');
          grant usage on schema public,auth to authenticated,anon,service_role;
          grant select,insert,update,delete on all tables in schema public to authenticated;
          alter table auth.users owner to sf_fixture_admin;
          grant select on auth.users to postgres;
        """)
        sql("postgres", "alter role postgres nosuperuser bypassrls;", role="sf_fixture_admin")
        for database, path in (("baseline", "original.sql"), ("repaired", "social_rate_limits.sql")):
            sql("postgres", f"create database {database} owner postgres template full_fixture;", role="sf_fixture_admin")
            assert sql(database, "select not rolsuper and rolbypassrls from pg_roles where rolname=current_user;") == "t"
            assert sql(database, "select has_table_privilege(current_user,'auth.users','SELECT') and not has_table_privilege(current_user,'auth.users','UPDATE');") == "t"
            sql(database, "begin;\n" + SOURCES[path].read_text() + "\ncommit;")
            sql(database, "update private.social_write_limits set max_writes=2; grant usage on schema private to authenticated;")
            # This independent trigger sorts AFTER every product rate trigger.
            # It changes scheduling only; it never edits NEW or calls the helper.
            sql(database, f"""
              create function public.test_pause_after_rate() returns trigger language plpgsql security definer
                set search_path=pg_catalog as $$begin
                  if current_setting('application_name')='sf-rate-race-a' then
                    perform pg_advisory_xact_lock({GATE}::bigint);
                  end if;
                  return NEW;
                end;$$;
              revoke all on function public.test_pause_after_rate() from public,anon,authenticated,service_role;
            """)
            for table in TABLES:
                sql(database, f"create trigger zz_test_pause_after_rate before insert on public.{table} for each row execute function public.test_pause_after_rate();")
                triggers = sql(database, f"select tgname from pg_trigger where tgrelid='public.{table}'::regclass and not tgisinternal and (tgtype & 7)=7 order by tgname;")
                assert len(triggers.splitlines()) == 2 and triggers.splitlines()[0].startswith("social_write_limit_") and triggers.splitlines()[-1] == "zz_test_pause_after_rate", triggers
            passed(database + ": exact SQL compiles under ordinary migration role; independent pause is strictly after all six rate checks",
                   source_sha256=binding["hashes"][path])
            for index, table in enumerate(TABLES):
                concurrent_case(database, table, index, database == "repaired")
        for index, table in enumerate(TABLES):
            row = uid(3000 + index)
            sql("repaired", insertion(table, row, seed=True) + ";")
            full_counter("repaired", table)
            sql("repaired", claim(insertion(table, row), "sf-rate-ordinary-retry"), role="authenticated", error="23505")
            assert_count("repaired", table)
            sql("repaired", claim(f"delete from public.{table} where id='{row}'", "sf-rate-completed-delete"), role="authenticated")
            sql("repaired", claim(insertion(table, row), "sf-rate-after-delete"), role="authenticated", error="PT429")
            assert_count("repaired", table)
            assert sql("repaired", f"select count(*) from public.{table} where id='{row}'") == "0"
            passed(f"REV2 {table}: ordinary duplicate still returns 23505; already-committed DELETE returns PT429 without new row or count change")
        legacy_scope_case("repaired", same_stable=False)
        legacy_scope_case("repaired", same_stable=True)
        report["state"] = "PASS_SYNTHETIC_LOCAL_REPLAY_ONLY"
    except BaseException as error:
        report["state"] = "FAIL_SYNTHETIC_LOCAL_REPLAY"
        report["failure"] = str(error)
        raise
    finally:
        for child in reversed(children):
            child.close()
        if started or initialized and (data / "postmaster.pid").exists():
            stopped = command("pg_ctl", ["-D", str(data), "-m", "immediate", "-w", "stop"])
            if stopped.returncode != 0:
                report["state"] = "FAIL_CLEANUP"
                report["cleanup_error"] = stopped.stderr
            else:
                report["cluster_cleaned"] = True
        else:
            report["cluster_cleaned"] = True
        if report["cluster_cleaned"]:
            shutil.rmtree(directory)
        report["check_count"] = len(report["checks"])
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_text(json.dumps(report, indent=2) + "\n")
    assert report["cluster_cleaned"], "Owned cluster cleanup failed; inspect the synthetic receipt"
    print(json.dumps({"state": report["state"], "checks": report["check_count"], "receipt": str(receipt_path), "provider_requests": 0}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-source", action="store_true", help="Safe default: hash/minimal-scope validation only; no subprocess or SQL")
    parser.add_argument("--run-local-replay", action="store_true", help="Explicit opt-in for a separate isolated non-root Linux runner")
    parser.add_argument("--receipt", type=Path, help="Runtime output JSON outside this frozen source bundle")
    args = parser.parse_args()
    if args.check_source and args.run_local_replay:
        parser.error("Choose source-only or local runtime")
    binding = check_source()
    if args.run_local_replay:
        if not args.receipt:
            parser.error("Runtime requires an explicit --receipt path outside the source bundle")
        run_replay(args.receipt.resolve(), binding)
    else:
        print(json.dumps(binding, indent=2))


if __name__ == "__main__":
    main()
