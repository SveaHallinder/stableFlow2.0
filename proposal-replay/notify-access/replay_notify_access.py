#!/usr/bin/env python3
"""Exact push ACL fixture replay; safe default never discovers or starts PostgreSQL."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent
ACL_SHA = "62f019bffbd6073503cd9beeaf07d594293e500988439cbd59fc3c7b129d8653"
BASELINE = {
    "baseline-notify-vault.sql": "7381fd137ad3e8e5bcebb9baa7d726cdf324a9dc51eea52f184f634cd2654aad",
    "baseline-triggers.sql": "1a4ff8a5bf891a2ecb23ee01f9354fed9d2eba1071073da7a3fbc6fd9b5d4e93",
    "baseline-alert-trigger.sql": "1ed9476fe6d1ffd165b68fafbe317fa8f4bbb0b064a3292819a292c537c5d3e7",
}
TRIGGER_NAMES = (
    "trigger_push_new_message", "trigger_push_assignment_change",
    "trigger_push_new_post", "trigger_push_new_stable_alert",
)
ROLES = {"sf_fixture_admin", "postgres", "anon", "authenticated", "service_role"}
PORT = "58523"
PLANNED_CHECKS = 20


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extracted_blocks():
    notify = (ROOT / "fixtures/baseline-notify-vault.sql").read_text()
    triggers = (ROOT / "fixtures/baseline-triggers.sql").read_text()
    alert = (ROOT / "fixtures/baseline-alert-trigger.sql").read_text()
    return {
        "notify": notify[notify.index("create or replace function public.notify_push("):],
        "three_triggers": triggers[triggers.index("-- Trigger: new chat message"):],
        "alert_trigger": alert[alert.index("create or replace function public.trigger_push_new_stable_alert()"):],
    }


def source_check():
    binding = json.loads((ROOT / "bindings.json").read_text())
    expected = {**BASELINE, "acl.sql": ACL_SHA}
    assert set(binding["fixtures"]) == {*expected, "fixture.sql"}, "[push acl replay] Unexpected fixture inventory."
    for name, sha in expected.items():
        assert binding["fixtures"][name] == sha, "[push acl replay] Source binding changed: " + name
    actual = {name: digest(ROOT / "fixtures" / name) for name in binding["fixtures"]}
    assert actual == binding["fixtures"], "[push acl replay] Fixture hash mismatch."
    candidate = (ROOT / "fixtures/acl.sql").read_text()
    mutations = [line.strip() for line in candidate.splitlines()
                 if re.match(r"^(revoke|grant|create|alter|drop|insert|update|delete|truncate)\b", line.strip(), re.I)]
    assert mutations == [
        "revoke execute on function public.notify_push(text,jsonb,jsonb) from public,anon,authenticated;",
        "grant execute on function public.notify_push(text,jsonb,jsonb) to service_role;",
    ], "[push acl replay] ACL scope differs."
    blocks = extracted_blocks()
    assert blocks["notify"].count("create or replace function") == 1
    assert blocks["three_triggers"].count("create or replace function") == 3
    assert blocks["alert_trigger"].count("create or replace function") == 1
    assert "create extension" not in "\n".join(blocks.values()).lower()
    for name in TRIGGER_NAMES:
        assert f"create or replace function public.{name}()" in "\n".join(blocks.values())
    fixture = (ROOT / "fixtures/fixture.sql").read_text()
    assert "create extension" not in fixture.lower()
    assert "returns bigint language plpgsql" in fixture and "current_user,session_user" in fixture
    assert all("[push access]" in line for line in candidate.splitlines() if "raise exception" in line)
    return {
        "status": "SOURCE_CHECK_PASS_RUNTIME_NOT_RUN",
        "acl_sql_sha256": ACL_SHA,
        "fixture_sha256": actual,
        "extracted_block_sha256": {name: hashlib.sha256(value.encode()).hexdigest() for name, value in blocks.items()},
        "source_base_head": binding["source_base_head"],
        "checks": 8,
        "planned_runtime_checks": PLANNED_CHECKS,
        "sql_runtime_calls": 0,
        "provider_requests": 0,
    }


def uid(value):
    return f"00000000-0000-4000-8000-{value:012d}"


def run_runtime(receipt_path, binding):
    if sys.platform != "linux" or os.geteuid() == 0:
        raise SystemExit("[push acl replay] Runtime requires Linux and a non-root user; no PostgreSQL was started.")
    if receipt_path == ROOT or ROOT in receipt_path.parents:
        raise SystemExit("[push acl replay] Runtime receipt must be outside the source package.")
    environment = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C", "LC_ALL": "C"}
    configured = os.environ.get("STABLEFLOW_TEST_PG_BIN")
    pg = Path(configured or subprocess.check_output(
        ["pg_config", "--bindir"], text=True, env=environment, timeout=5).strip()).resolve()
    for tool in ("initdb", "pg_ctl", "psql", "postgres"):
        assert (pg / tool).is_file() and os.access(pg / tool, os.X_OK), "[push acl replay] Existing PostgreSQL binaries are required."
    version = subprocess.check_output([str(pg / "postgres"), "--version"], text=True, env=environment, timeout=5).strip()
    major = re.search(r"PostgreSQL\) (\d+)", version)
    assert major and int(major.group(1)) >= 16, "[push acl replay] Preinstalled PostgreSQL 16+ is required."
    directory = Path(tempfile.mkdtemp(prefix="sf-acl-", dir="/tmp"))
    socket, data = directory / "socket", directory / "data"
    socket.mkdir(mode=0o700)
    environment["PGPASSFILE"] = str(directory / "no-credentials")
    report = {
        "status": "RUNNING_SYNTHETIC_LOCAL_ONLY", "acl_sql_sha256": ACL_SHA,
        "packaged_driver_sha256": digest(Path(__file__)), "source_binding": binding,
        "postgres_version": version, "checks": [], "tcp_enabled": False, "provider_requests": 0,
        "role_model": "postgres NOSUPERUSER/BYPASSRLS owns all fixture functions; direct LOGIN clients; fixture admin only bootstrap/owner-guard",
        "cluster_stopped": False, "cluster_removed": False, "sql_under_test_rewritten": False,
    }
    started = False

    def command(tool, args, text=None, timeout=20):
        return subprocess.run([str(pg / tool), *args], input=text, text=True,
                              capture_output=True, env=environment, timeout=timeout)

    def sql(database, statement, role="postgres", error=None, message=None):
        assert role in ROLES and re.fullmatch(r"(postgres|sf_acl_[a-z]+)", database)
        guard = "do $$begin if current_user <> '" + role + "' then raise exception '[push acl replay] Wrong LOGIN role.'; end if; end$$;\n"
        settings = ("set statement_timeout='10s'; set lock_timeout='5s'; "
                    "set app.settings.supabase_url='https://synthetic-dispatch.invalid'; "
                    "set app.settings.service_role_key='synthetic-fallback-only-key';\n")
        result = command("psql", ["-h", str(socket), "-p", PORT, "-U", role, "-d", database,
                                  "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
                         guard + settings + statement)
        if error:
            assert result.returncode != 0 and re.search(r"\b" + error + r"\b", result.stderr), (
                "[push acl replay] Exact SQLSTATE missing.", result.returncode, result.stdout, result.stderr)
            if message:
                assert message in result.stderr, "[push acl replay] Feature error was not observed."
        else:
            assert result.returncode == 0, result.stderr
        return result.stdout.strip()

    def passed(name, **facts):
        report["checks"].append({"name": name, "result": "PASS", **facts})
        print("[push acl replay] PASS " + name, flush=True)

    def permissions(database):
        return json.loads(sql(database, """select json_build_object(
          'anon',has_function_privilege('anon','public.notify_push(text,jsonb,jsonb)','EXECUTE'),
          'authenticated',has_function_privilege('authenticated','public.notify_push(text,jsonb,jsonb)','EXECUTE'),
          'service_role',has_function_privilege('service_role','public.notify_push(text,jsonb,jsonb)','EXECUTE'),
          'postgres',has_function_privilege('postgres','public.notify_push(text,jsonb,jsonb)','EXECUTE'),
          'public',exists(select 1 from pg_proc p,
            lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            where p.oid='public.notify_push(text,jsonb,jsonb)'::regprocedure
              and a.grantee=0 and a.privilege_type='EXECUTE'));"""))

    def acl(database):
        return sql(database, "select coalesce(array_to_json(proacl)::text,'null') from pg_proc where oid='public.notify_push(text,jsonb,jsonb)'::regprocedure;")

    def bodies(database):
        return sql(database, """select coalesce(json_agg(json_build_object(
          'name',p.proname,'owner',r.rolname,'definer',p.prosecdef,'body',md5(p.prosrc),'config',p.proconfig)
          order by p.proname)::text,'[]') from pg_proc p join pg_roles r on r.oid=p.proowner
          where p.pronamespace='public'::regnamespace and p.proname in
          ('notify_push','trigger_push_new_message','trigger_push_assignment_change','trigger_push_new_post','trigger_push_new_stable_alert');""")

    def clone(name):
        sql("postgres", f"create database {name} owner postgres template sf_acl_base;", role="sf_fixture_admin")

    def clear_calls(database):
        sql(database, "truncate private.synthetic_http_calls restart identity;")

    def call_count(database):
        return int(sql(database, "select count(*) from private.synthetic_http_calls;"))

    def assert_dispatch(database, kind, login_role, record=None, old_record=None, fallback=False):
        row = json.loads(sql(database, """select json_build_object(
          'payload',payload,'executing_role',executing_role,'login_role',login_role,
          'vault',authorization_is_vault,'fallback',authorization_is_fallback,
          'content_type',content_type,'timeout',timeout_ms)
          from private.synthetic_http_calls order by id desc limit 1;"""))
        assert row["executing_role"] == "postgres" and row["login_role"] == login_role
        assert row["vault"] is (not fallback) and row["fallback"] is fallback
        assert row["content_type"] == "application/json" and row["timeout"] == 5000
        assert set(row["payload"]) == {"type", "record", "old_record"}
        assert row["payload"]["type"] == kind
        if record is not None:
            assert row["payload"]["record"] == record
        assert row["payload"]["old_record"] == old_record

    candidate = (ROOT / "fixtures/acl.sql").read_text()
    direct = "select public.notify_push('message','{\"text\":\"Synthetic direct\"}'::jsonb);"
    try:
        initialized = command("initdb", ["-D", str(data), "-U", "sf_fixture_admin",
                                         "--auth=trust", "--no-locale", "-E", "UTF8"])
        assert initialized.returncode == 0, initialized.stderr
        startup = command("pg_ctl", ["-D", str(data), "-l", str(directory / "postgres.log"), "-o",
                                     f"-k {socket} -p {PORT} -c listen_addresses=''", "-w", "-t", "15", "start"])
        assert startup.returncode == 0, startup.stderr
        started = True
        sql("postgres", """create role postgres login nosuperuser nocreaterole nocreatedb bypassrls;
          create role anon login nosuperuser nocreaterole nocreatedb;
          create role authenticated login nosuperuser nocreaterole nocreatedb;
          create role service_role login nosuperuser nocreaterole nocreatedb bypassrls;
          create role sf_acl_inherited nologin;
          grant sf_acl_inherited to authenticated;
          create database sf_acl_base owner postgres;""", role="sf_fixture_admin")
        assert sql("sf_acl_base", "show listen_addresses;") == ""
        assert sql("sf_acl_base", "select not rolsuper and rolbypassrls from pg_roles where rolname=current_user;") == "t"
        assert sql("sf_acl_base", "select bool_and(rolcanlogin and not rolsuper) from pg_roles where rolname in ('anon','authenticated','service_role');") == "t"
        sql("sf_acl_base", (ROOT / "fixtures/fixture.sql").read_text())
        blocks = extracted_blocks()
        sql("sf_acl_base", "\n".join(blocks.values()))
        assert sql("sf_acl_base", "select count(*) from pg_extension where extname='pg_net';") == "0"
        passed("ordinary postgres owner; real client LOGIN roles; no TCP or pg_net extension")
        catalog = json.loads(sql("sf_acl_base", """select json_agg(json_build_object(
          'name',p.proname,'owner',r.rolname,'definer',p.prosecdef,'enabled',t.tgenabled,
          'table',c.relname) order by p.proname)
          from pg_trigger t join pg_proc p on p.oid=t.tgfoid
          join pg_roles r on r.oid=p.proowner join pg_class c on c.oid=t.tgrelid
          where not t.tgisinternal and c.relnamespace='public'::regnamespace;"""))
        assert len(catalog) == 4 and {r["name"] for r in catalog} == set(TRIGGER_NAMES)
        assert all(r["owner"] == "postgres" and r["definer"] and r["enabled"] == "O" for r in catalog)
        assert {r["table"] for r in catalog} == {"messages", "assignments", "posts", "stable_alerts"}
        passed("four original SECURITY DEFINER trigger functions really attached and enabled", triggers=catalog)
        assert all(permissions("sf_acl_base").values())
        passed("baseline PUBLIC/anon/authenticated/service/owner EXECUTE is present")
        for role in ("anon", "authenticated"):
            sql("sf_acl_base", direct, role=role)
            assert_dispatch("sf_acl_base", "message", role, {"text": "Synthetic direct"})
            passed(role + " baseline direct invocation reaches only synthetic dispatch")
        clone("sf_acl_allowed")
        clear_calls("sf_acl_allowed")
        original_bodies = bodies("sf_acl_allowed")
        sql("sf_acl_allowed", candidate)
        expected_rights = {"anon": False, "authenticated": False, "service_role": True, "postgres": True, "public": False}
        assert permissions("sf_acl_allowed") == expected_rights
        assert bodies("sf_acl_allowed") == original_bodies
        passed("exact ACL SQL applies as NOSUPERUSER owner; rights narrowed and five function bodies unchanged")
        for role in ("anon", "authenticated"):
            before = call_count("sf_acl_allowed")
            sql("sf_acl_allowed", direct, role=role, error="42501")
            assert call_count("sf_acl_allowed") == before
            passed(role + " actual SQL42501 before any dispatch", actual_sqlstate="42501", dispatches=0)
        for role in ("service_role", "postgres"):
            before = call_count("sf_acl_allowed")
            sql("sf_acl_allowed", direct, role=role)
            assert call_count("sf_acl_allowed") == before + 1
            assert_dispatch("sf_acl_allowed", "message", role, {"text": "Synthetic direct"})
            passed(role + " direct execution remains owner-run and synthetic only")
        clear_calls("sf_acl_allowed")
        message = {"id": uid(101), "conversation_id": uid(201), "author_id": uid(1), "text": "Synthetic message"}
        sql("sf_acl_allowed", f"insert into public.messages values('{message['id']}','{message['conversation_id']}','{message['author_id']}','Synthetic message');", role="authenticated")
        assert call_count("sf_acl_allowed") == 1
        assert_dispatch("sf_acl_allowed", "message", "authenticated", message)
        passed("authenticated message INSERT retains original owner-run trigger and payload")
        assignment = {"id": uid(102), "assignee_id": uid(1), "label": "Synthetic pass", "date": "2099-01-01", "time": "07:00"}
        sql("sf_acl_allowed", f"insert into public.assignments values('{assignment['id']}','{uid(1)}','Synthetic pass','2099-01-01','07:00');", role="authenticated")
        assert call_count("sf_acl_allowed") == 1
        sql("sf_acl_allowed", f"update public.assignments set assignee_id='{uid(2)}' where id='{assignment['id']}';", role="authenticated")
        changed = {**assignment, "assignee_id": uid(2)}
        assert call_count("sf_acl_allowed") == 2
        assert_dispatch("sf_acl_allowed", "assignment", "authenticated", changed, assignment)
        sql("sf_acl_allowed", f"update public.assignments set label='Synthetic edited pass' where id='{assignment['id']}';", role="authenticated")
        assert call_count("sf_acl_allowed") == 2
        passed("assignment UPDATE retains changed-assignee guard and exact old_record")
        post = {"id": uid(103), "user_id": uid(1), "stable_id": uid(301), "content": "Synthetic feed"}
        sql("sf_acl_allowed", f"insert into public.posts values('{post['id']}','{uid(1)}','{uid(301)}','Synthetic feed');", role="authenticated")
        assert call_count("sf_acl_allowed") == 3
        assert_dispatch("sf_acl_allowed", "post", "authenticated", post)
        passed("authenticated post INSERT retains original owner-run trigger and payload")
        alert = {"id": uid(104), "stable_id": uid(301), "created_by_user_id": uid(1), "severity": "urgent", "title": "Synthetic alert", "body": "Synthetic detail"}
        sql("sf_acl_allowed", f"insert into public.stable_alerts values('{alert['id']}','{uid(301)}','{uid(1)}','urgent','Synthetic alert','Synthetic detail');", role="authenticated")
        assert call_count("sf_acl_allowed") == 4
        assert_dispatch("sf_acl_allowed", "alert", "authenticated", alert)
        passed("authenticated stable alert INSERT retains original owner-run trigger and payload")
        existing_acl = acl("sf_acl_allowed")
        sql("sf_acl_allowed", candidate)
        assert acl("sf_acl_allowed") == existing_acl and bodies("sf_acl_allowed") == original_bodies
        assert permissions("sf_acl_allowed") == expected_rights and call_count("sf_acl_allowed") == 4
        passed("exact second apply is idempotent and causes no dispatch")
        sql("sf_acl_allowed", "delete from vault.decrypted_secrets where name='service_role_key';")
        sql("sf_acl_allowed", direct, role="service_role")
        assert_dispatch("sf_acl_allowed", "message", "service_role", {"text": "Synthetic direct"}, fallback=True)
        passed("unchanged notify body retains synthetic Vault-missing GUC fallback")
        for database, mutation, description in (
            ("sf_acl_definer", "alter function public.notify_push(text,jsonb,jsonb) security invoker;", "target SECURITY DEFINER"),
            ("sf_acl_trigger", "alter function public.trigger_push_new_message() security invoker;", "required trigger SECURITY DEFINER"),
            ("sf_acl_owner", "alter function public.notify_push(text,jsonb,jsonb) owner to sf_fixture_admin;", "target postgres owner"),
        ):
            clone(database)
            sql(database, mutation, role="sf_fixture_admin" if database == "sf_acl_owner" else "postgres")
            previous_acl, previous_bodies = acl(database), bodies(database)
            before = call_count(database)
            sql(database, candidate, error="P0001", message="[push access]")
            assert acl(database) == previous_acl and bodies(database) == previous_bodies and call_count(database) == before
            assert permissions(database)["anon"] and permissions(database)["authenticated"]
            passed(description + " preflight failure leaves entire ACL unchanged", actual_sqlstate="P0001", feature_error="[push access]")
        clone("sf_acl_inherited")
        sql("sf_acl_inherited", "grant execute on function public.notify_push(text,jsonb,jsonb) to sf_acl_inherited;")
        inherited_acl, inherited_bodies = acl("sf_acl_inherited"), bodies("sf_acl_inherited")
        before = call_count("sf_acl_inherited")
        assert sql("sf_acl_inherited", "select pg_has_role('authenticated','sf_acl_inherited','USAGE');") == "t"
        sql("sf_acl_inherited", candidate, error="P0001", message="[push access] Push dispatch permissions failed verification.")
        assert acl("sf_acl_inherited") == inherited_acl and bodies("sf_acl_inherited") == inherited_bodies
        assert call_count("sf_acl_inherited") == before and all(permissions("sf_acl_inherited").values())
        passed("inherited client EXECUTE forces real postcheck failure and full transaction rollback", actual_sqlstate="P0001", feature_error="[push access]", acl_restored=True)
        assert len(report["checks"]) == PLANNED_CHECKS, "[push acl replay] Planned runtime checks are missing."
        report["status"] = "PASS_SYNTHETIC_LOCAL_REPLAY_ONLY"
    except BaseException as error:
        report["status"] = "FAIL_SYNTHETIC_LOCAL_REPLAY"
        report["failure"] = str(error)
        raise
    finally:
        try:
            if started or (data / "postmaster.pid").exists():
                stopped = command("pg_ctl", ["-D", str(data), "-m", "fast", "-w", "-t", "10", "stop"])
                if stopped.returncode != 0 and (data / "postmaster.pid").exists():
                    stopped = command("pg_ctl", ["-D", str(data), "-m", "immediate", "-w", "-t", "10", "stop"])
                if stopped.returncode != 0 or (data / "postmaster.pid").exists():
                    report["status"] = "FAIL_CLEANUP"
                    report["cleanup_error"] = stopped.stderr
                else:
                    report["cluster_stopped"] = True
            else:
                report["cluster_stopped"] = True
        except BaseException as error:
            report["status"] = "FAIL_CLEANUP"
            report["cleanup_error"] = str(error)
        if report["cluster_stopped"]:
            shutil.rmtree(directory)
            report["cluster_removed"] = not directory.exists()
        else:
            report["retained_owned_cluster"] = str(directory)
        report["check_count"] = len(report["checks"])
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"status": report["status"], "checks": report["check_count"],
                          "acl_sql_sha256": ACL_SHA, "receipt": str(receipt_path),
                          "cluster_removed": report["cluster_removed"]}), flush=True)
    assert report["cluster_stopped"] and report["cluster_removed"], "[push acl replay] Own cluster cleanup failed."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--source-check", action="store_true", help="Safe default: no PostgreSQL discovery/start or SQL.")
    mode.add_argument("--runtime", action="store_true", help="Opt in only on non-root Linux with existing PostgreSQL16+.")
    parser.add_argument("--receipt", type=Path, help="Runtime JSON output outside the source package.")
    args = parser.parse_args()
    binding = source_check()
    if args.runtime:
        if not args.receipt:
            parser.error("Runtime requires --receipt outside the source package.")
        run_runtime(args.receipt.resolve(), binding)
    else:
        if args.receipt:
            parser.error("--receipt is only used with --runtime.")
        print(json.dumps(binding, indent=2))


if __name__ == "__main__":
    main()
