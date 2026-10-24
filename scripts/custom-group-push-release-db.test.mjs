import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pgBin = process.env.STABLEFLOW_TEST_PG_BIN || spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout?.trim() || '/usr/local/bin';
const available = ['darwin', 'linux'].includes(process.platform) && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(join(pgBin, name)));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// Disposable Unix-socket PostgreSQL only. notify_push is a local spy: no env,
// hosted credentials, pg_net, HTTP transport or provider API exists here.
test('custom group push release preserves the existing trigger and notification contract', {
  skip: available ? false : 'Preinstalled local PostgreSQL and a non-root Unix user are required.', timeout: 60_000,
}, async t => {
  const directory = await mkdtemp('/tmp/sf-group-push-release-');
  const data = join(directory, 'data'), socket = join(directory, 'socket'), port = '58494';
  const command = (name, args, input) => execFileSync(join(pgBin, name), args, {
    encoding: 'utf8', input, timeout: 20_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const sql = input => command('psql', ['-h', socket, '-p', port, '-U', 'postgres', '-d', 'postgres',
    '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], input).trim();
  const notify = (kind, messageId) => sql(`insert into public.messages(id,conversation_id,author_id,text,created_at)
    select '${id(messageId)}',id,'${id(100)}','${kind} message','2026-10-24T12:00:00Z' from public.conversations where chat_kind='${kind}';`);
  const calls = () => JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('type',type,'record',record-'id','old_record',old_record) order by position),'[]'::jsonb) from public.push_spy_calls;`));
  const metadata = () => JSON.parse(sql(`select jsonb_build_object(
    'function',jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig,
      'language',p.prolang,'returns',p.prorettype,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel),
    'trigger',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,
    'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity) order by c.relname)
      from pg_class c where c.oid in ('public.messages'::regclass,'public.conversations'::regclass)))
    from pg_proc p join pg_trigger t on t.tgfoid=p.oid
    where p.oid='public.trigger_push_new_message()'::regprocedure and t.tgname='on_new_message_push';`));
  let started = false;
  try {
    await mkdir(socket);
    command('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
    command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`create role service_role nologin; create role push_function_owner nologin;
      create table public.conversations(id uuid primary key,chat_kind text not null);
      create table public.messages(id uuid primary key,conversation_id uuid references public.conversations(id),author_id uuid,text text,created_at timestamptz);
      create table public.push_spy_calls(position bigserial primary key,type text,record jsonb,old_record jsonb);
      create function public.notify_push(p_type text,p_record jsonb,p_old_record jsonb default null) returns void
        language sql security definer set search_path=pg_catalog as $$
        insert into public.push_spy_calls(type,record,old_record) values(p_type,p_record,p_old_record); $$;
      grant select on public.conversations to push_function_owner;
      insert into public.conversations values('${id(1)}','custom'),('${id(2)}','stable'),('${id(3)}','direct');`);
    const previousMigration = await readFile(join(root, 'supabase/migrations/20261024122050_custom_member_group_chats.sql'), 'utf8');
    const guard = previousMigration.match(/create or replace function public\.trigger_push_new_message\(\)[\s\S]*?\$function\$;/i)?.[0];
    assert.ok(guard, 'The previously approved guarded trigger must exist.');
    sql(guard);
    sql(`alter function public.trigger_push_new_message() owner to push_function_owner;
      revoke all on function public.trigger_push_new_message() from public;
      grant execute on function public.trigger_push_new_message() to service_role;
      create trigger on_new_message_push after insert on public.messages for each row execute function public.trigger_push_new_message();`);
    notify('custom', 10);
    assert.deepEqual(calls(), [], 'The installed baseline must suppress custom push.');
    notify('stable', 11); notify('direct', 12);
    const legacyCalls = calls();
    assert.equal(legacyCalls.length, 2);
    const before = metadata();
    const migration = await readFile(join(root, 'supabase/migrations/20261024193534_enable_custom_group_push.sql'), 'utf8');
    sql(migration);

    await t.test('custom messages call notify_push once with the exact inserted row', () => {
      sql('truncate public.push_spy_calls;');
      notify('custom', 20);
      assert.equal(calls().length, 1, 'A custom message must now reach the existing notification dispatcher.');
      assert.equal(sql(`select count(*) from public.push_spy_calls s join public.messages m on m.id::text=s.record->>'id'
        where m.id='${id(20)}' and s.type='message' and s.record=to_jsonb(m) and s.old_record is null;`), '1');
      assert.equal(sql(`select count(*) from public.messages where id='${id(20)}';`), '1');
    });

    await t.test('stable and direct payloads remain identical to the guarded baseline', () => {
      sql('truncate public.push_spy_calls;');
      notify('stable', 21); notify('direct', 22);
      assert.deepEqual(calls(), legacyCalls);
      assert.equal(sql(`select count(*) from public.push_spy_calls s join public.messages m on m.id::text=s.record->>'id'
        where m.id in ('${id(21)}','${id(22)}') and s.record=to_jsonb(m);`), '2');
    });

    await t.test('function identity, owner, ACL, execution settings and trigger binding stay unchanged', () => {
      assert.deepEqual(metadata(), before);
    });

    await t.test('an unexpected trigger body aborts the migration without changing it', () => {
      sql(guard.replace('begin\n', "begin\n  perform pg_catalog.set_config('chat.group_push_probe','changed',false);\n"));
      const changed = sql("select pg_get_functiondef('public.trigger_push_new_message()'::regprocedure);");
      let failure;
      try { sql(migration); } catch (error) { failure = String(error.stderr); }
      assert.match(failure ?? '', /55000.*\[chat group push\]/s, 'Changed trigger logic must require a fresh review.');
      assert.equal(sql("select pg_get_functiondef('public.trigger_push_new_message()'::regprocedure);"), changed);
      assert.deepEqual(metadata(), before);
    });

    await t.test('restoring the captured guard suppresses custom push while retaining stable and direct', () => {
      sql(guard);
      sql('truncate public.push_spy_calls;');
      notify('custom', 30); notify('stable', 31); notify('direct', 32);
      assert.deepEqual(calls(), legacyCalls);
      assert.equal(sql(`select count(*) from public.messages where id='${id(30)}';`), '1');
      assert.deepEqual(metadata(), before);
    });
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
});
