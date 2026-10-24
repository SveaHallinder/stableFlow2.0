import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pgBin = process.env.STABLEFLOW_TEST_PG_BIN || spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout?.trim() || '/usr/local/bin';
const available = ['darwin', 'linux'].includes(process.platform) && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(join(pgBin, name)));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const S = id(1), T = id(2), A = id(101), B = id(102), E = id(103), C = id(104), D = id(105), OWNER = id(106), PENDING = id(107), INACTIVE = id(108), G = id(401);
const literal = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const uuidArray = values => `array[${values.map(literal).join(',')}]::uuid[]`;
const caller = (user, input) => `set role authenticated; set request.jwt.claim.sub='${user}'; set request.jwt.claim.role='authenticated'; ${input}`;
const create = (request = G, title = 'Foderteamet', participants = [B, E], user = A, stable = S) =>
  `select public.create_member_group('${user}','${request}','${stable}',${literal(title)},${uuidArray(participants)});`;
const manage = ({ user = A, group = G, title = null, add = [], remove = [], transfer = null } = {}) =>
  `select public.manage_member_group('${user}','${group}',${literal(title)},${uuidArray(add)},${uuidArray(remove)},${literal(transfer)}::uuid);`;
const leave = (user = A, transfer = null, group = G, confirmDelete = false) => `select public.leave_member_group('${user}','${group}',${literal(transfer)}::uuid,${confirmDelete});`;

// Disposable Unix-socket cluster only: no .env, hosted credentials, Docker or provider API.
test('custom groups: real PostgreSQL authority, legacy compatibility, lifecycle and races', {
  skip: available ? false : 'Preinstalled local PostgreSQL and a non-root Unix user are required.', timeout: 180_000,
}, async t => {
  const directory = await mkdtemp('/tmp/sf-custom-chat-db-');
  const data = join(directory, 'data'), socket = join(directory, 'socket'), port = '58493';
  const command = (name, args, input) => execFileSync(join(pgBin, name), args, {
    encoding: 'utf8', input, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const connection = ['-h', socket, '-p', port, '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  const sql = (db, input) => command('psql', [...connection, '-d', db], input).trim();
  const json = (db, user, input) => JSON.parse(sql(db, caller(user, input)));
  const expectError = (db, user, input, code = '42501', message = '[chat group]') => {
    let error; try { sql(db, user ? caller(user, input) : input); } catch (caught) { error = String(caught.stderr); }
    assert.ok(error?.includes(code) && error?.includes(message), error || 'Expected rejection');
    return error;
  };
  const clone = (db, template = 'base') => sql('postgres', `create database ${db} template ${template};`);
  const asyncSql = (db, input) => {
    const child = spawn(join(pgBin, 'psql'), [...connection, '-d', db], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; }); child.stdin.end(input);
    return new Promise(resolve => child.on('close', code => resolve({ code, output: output.trim(), error })));
  };
  const waitForSleep = async (db, application) => {
    for (let i = 0; i < 80; i++) {
      if (sql(db, `select exists(select 1 from pg_stat_activity where application_name='${application}' and wait_event='PgSleep');`) === 't') return;
      await delay(20);
    }
    assert.fail('First transaction did not reach its lock hold.');
  };
  let started = false;
  try {
    await mkdir(socket); command('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
    command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']); started = true;
    sql('postgres', 'create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls; create database base;');
    sql('base', `create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb,deleted_at timestamptz,banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('role',true),'none'))$$;
      create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean default false);
      create table storage.objects(id uuid primary key,bucket_id text,name text,owner uuid,owner_id text,version text,metadata jsonb,updated_at timestamptz); alter table storage.objects enable row level security;`);
    const schema = await readFile(join(root, 'supabase/schema.sql'), 'utf8');
    sql('base', schema.split('-- Custom member group chats; migration 20261024122050.')[0]);
    sql('base', `grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on all tables in schema public to authenticated;
      grant select on public.conversations,public.conversation_members,public.messages to anon;
      insert into auth.users(id) values ${[A, B, E, C, D, OWNER, PENDING, INACTIVE].map(user => `('${user}')`).join(',')};
      insert into public.stables(id,name,created_by) values('${S}','Fixture','${OWNER}'),('${T}','Other','${OWNER}');
      insert into public.stable_members(stable_id,user_id,role,access) values
        ('${S}','${OWNER}','admin','owner'),('${T}','${OWNER}','admin','owner'),('${S}','${A}','rider','view'),('${T}','${A}','rider','view'),
        ('${S}','${B}','staff','edit'),('${S}','${E}','rider','view'),('${S}','${C}','rider','view'),('${T}','${D}','rider','view'),('${S}','${INACTIVE}','rider','view');
      update auth.users set banned_until='infinity' where id='${INACTIVE}';
      insert into public.conversations(id,stable_id,is_group,created_by_user_id,title) values('${id(201)}','${S}',true,'${A}','Stallchatten'),('${id(202)}',null,false,'${A}','Privat');
      insert into public.conversation_members(conversation_id,user_id) values('${id(202)}','${A}'),('${id(202)}','${B}');
      insert into public.messages(id,conversation_id,author_id,text) values('${id(301)}','${id(202)}','${B}','Befintlig historik');`);
    // Exact deployed legacy message trigger; pg_net is a local spy, never a real HTTP sender.
    const legacyPush = await readFile(join(root, 'supabase/migrations/20250313_push_notification_triggers.sql'), 'utf8');
    sql('base', `create schema net; create table net.test_push_calls(body jsonb not null);
      create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
      begin
        if url<>'https://push.example.invalid/functions/v1/send-push-notification' then raise exception 'Unexpected synthetic push URL'; end if;
        insert into net.test_push_calls values(body); return 1;
      end $$;`);
    sql('base', legacyPush.slice(legacyPush.indexOf('create or replace function public.trigger_push_new_message()'), legacyPush.indexOf('-- Trigger: assignment updated')));
    const migration = await readFile(join(root, 'supabase/migrations/20261024122050_custom_member_group_chats.sql'), 'utf8');
    clone('before_migration');
    sql('base', migration);
    assert.equal(sql('base', "select to_regprocedure('public.create_member_group(uuid,uuid,uuid,text,uuid[])') is not null;"), 't', 'Approved custom-group RPC is missing.');

    await t.test('legacy IDs/history and inserts without chat_kind remain compatible', async () => {
      assert.equal(sql('base', `select chat_kind from public.conversations where id='${id(201)}';`), 'stable');
      assert.equal(sql('base', `select text from public.messages where id='${id(301)}';`), 'Befintlig historik');
      assert.equal(sql('base', caller(A, `insert into public.conversations(id,is_group,created_by_user_id) values('${id(203)}',false,'${A}') returning chat_kind;`)), 'direct');
      assert.match(sql('base', await readFile(join(root, 'supabase/tests/private_chat_bootstrap.sql'), 'utf8')), /14 private chat checks passed/);
    });

    await t.test('operator smoke is rollback-only and never fires a message webhook', async () => {
      const counts = sql('base', 'select (select count(*) from auth.users),(select count(*) from public.conversations);');
      const smoke = await readFile(join(root, 'supabase/tests/custom_member_groups.sql'), 'utf8');
      assert.doesNotMatch(smoke, /insert\s+into\s+public\.messages/i);
      assert.match(sql('base', smoke), /24 custom member group rollback checks passed/);
      assert.equal(sql('base', 'select (select count(*) from auth.users),(select count(*) from public.conversations);'), counts);
    });

    await t.test('create is atomic, deduplicated and same-ID receipt is authoritative', () => {
      const receipt = json('base', A, create(G, '  Foderteamet  ', [B, E, B, A]));
      assert.deepEqual(receipt, { id: G, chatKind: 'custom', stableId: S, title: 'Foderteamet', createdByUserId: A,
        participantIds: [A, B, E].sort(), participantRoles: { [A]: 'owner', [B]: 'member', [E]: 'member' } });
      assert.deepEqual(json('base', A, create()), receipt);
      expectError('base', A, create(G, 'Ändrat namn'), '40001');
      expectError('base', A, create(G, 'Foderteamet', [B, C]), '40001');
      for (const [n, peers] of [[410, [B, D]], [411, [B, PENDING]], [412, [B, INACTIVE]], [413, [B]]]) {
        expectError('base', A, create(id(n), 'Otillåten', peers), peers.length < 2 ? '22023' : '42501');
        assert.equal(sql('base', `select count(*) from public.conversations where id='${id(n)}';`), '0');
      }
      expectError('base', A, create(id(414), 'X'), '22023');
      sql('base', `insert into public.blocked_users(blocker_user_id,blocked_user_id) values('${C}','${A}');`);
      expectError('base', A, create(id(415), 'Blockerad', [B, C]));
      sql('base', `delete from public.blocked_users where blocker_user_id='${C}';`);
    });

    await t.test('only actual participants see metadata, roster, messages and receipts', () => {
      sql('base', caller(B, `insert into public.messages(id,conversation_id,author_id,text) values('${id(302)}','${G}','${B}','Gruppens historik');`));
      for (const user of [A, B, E]) {
        assert.equal(sql('base', caller(user, `select count(*) from public.conversations where id='${G}';`)), '1');
        assert.equal(sql('base', caller(user, `select count(*) from public.conversation_members where conversation_id='${G}';`)), '3');
      }
      for (const user of [C, D, OWNER, INACTIVE]) {
        assert.equal(sql('base', caller(user, `select count(*) from public.conversations where id='${G}';`)), '0');
        assert.equal(sql('base', caller(user, `select count(*) from public.conversation_members where conversation_id='${G}';`)), '0');
        assert.equal(sql('base', caller(user, `select count(*) from public.messages where conversation_id='${G}';`)), '0');
        expectError('base', user, `select public.own_chat_read_state('${user}','${G}','{}');`, '42501', '[chat read]');
        expectError('base', user, `insert into public.messages(conversation_id,author_id,text) values('${G}','${user}','Nekat');`, '42501', user === INACTIVE ? 'social_write_auth_required' : 'row-level security');
      }
      const read = json('base', A, `select public.mark_chat_messages_read('${A}','${G}',${uuidArray([id(302)])});`);
      assert.deepEqual(read.read_message_ids, [id(302)]);
      expectError('base', A, `select public.mark_chat_messages_read('${B}','${G}',${uuidArray([id(302)])});`, '42501', '[chat read]');
      expectError('base', null, `set role anon; ${create()}`, '42501', 'permission denied');
      assert.equal(sql('base', `set role anon; select count(*) from public.conversations where id='${G}';`), '0');
      assert.equal(sql('base', `set role anon; select count(*) from public.messages where conversation_id='${G}';`), '0');
      expectError('base', null, `set role service_role; ${create()}`, '42501', 'permission denied');
      expectError('base', A, `select * from public.chat_message_reads;`, '42501', 'permission denied');
      expectError('base', C, create(id(416)));
      expectError('base', INACTIVE, create(id(417), 'Inaktiv', [B, E], INACTIVE));
      const departed = json('base', C, leave(C));
      assert.equal(departed.title, null); assert.equal(departed.stableId, null); assert.deepEqual(departed.participantIds, []);
    });

    await t.test('REST cannot inject membership, ownership or mutate identity columns', () => {
      expectError('base', C, `insert into public.conversation_members(conversation_id,user_id) values('${G}','${C}');`, '42501', 'row-level security');
      expectError('base', A, `insert into public.conversation_members(conversation_id,user_id,member_role) values('${G}','${C}','owner');`, '42501', 'row-level security');
      for (const update of [`update public.conversations set chat_kind='stable' where id='${G}'`, `update public.conversations set stable_id='${T}' where id='${G}'`, `update public.conversations set created_by_user_id='${B}' where id='${G}'`, `update public.conversation_members set member_role='owner' where user_id='${B}'`, `update public.messages set author_id='${A}' where id='${id(302)}'`, `update public.messages set conversation_id='${id(201)}' where id='${id(302)}'`]) {
        expectError('base', A, `${update};`, '42501', 'permission denied');
      }
      assert.equal(sql('base', caller(A, `delete from public.conversation_members where conversation_id='${G}'; select count(*) from public.conversation_members where conversation_id='${G}';`)), '3');
      expectError('base', A, `insert into public.conversations(is_group,chat_kind,stable_id,created_by_user_id,title) values(true,'custom','${S}','${A}','REST');`, '42501', 'row-level security');
    });

    await t.test('manage is owner-only; transfer, removal and new history access are exact', () => {
      clone('manage');
      expectError('manage', B, manage({ user: B, title: 'Inte min grupp' }));
      expectError('manage', OWNER, manage({ user: OWNER, title: 'Stallägare har ingen insyn' }));
      expectError('manage', A, manage({ remove: [A] }), '22023');
      expectError('manage', A, manage({ add: [D] }));
      const updated = json('manage', A, manage({ title: 'Kvällsteamet', add: [C], remove: [E], transfer: B }));
      assert.equal(updated.title, 'Kvällsteamet'); assert.equal(updated.participantRoles[B], 'owner'); assert.equal(updated.createdByUserId, A);
      assert.deepEqual(updated.participantIds, [A, B, C]);
      assert.equal(sql('manage', caller(C, `select count(*) from public.messages where conversation_id='${G}';`)), '1');
      assert.equal(sql('manage', caller(E, `select count(*) from public.messages where conversation_id='${G}';`)), '0');
      expectError('manage', E, `select public.mark_chat_messages_read('${E}','${G}',${uuidArray([id(302)])});`, '42501', '[chat read]');
      expectError('manage', A, manage({ title: 'Gamla ägaren' }));
      assert.equal(json('manage', B, manage({ user: B, title: 'Ny ansvarig' })).title, 'Ny ansvarig');
    });

    await t.test('leave requires successor, is idempotent and deletes only the last group', () => {
      clone('leaving'); expectError('leaving', A, leave(), '22023');
      expectError('leaving', A, leave(A, null, id(201)));
      const handed = json('leaving', A, leave(A, B)); assert.equal(handed.left, true); assert.equal(handed.participantRoles[B], 'owner');
      assert.equal(json('leaving', A, leave()).left, true);
      assert.equal(sql('leaving', caller(A, `select count(*) from public.conversations where id='${G}';`)), '0');
      json('leaving', E, leave(E)); const last = json('leaving', B, leave(B, null, G, true)); assert.equal(last.deleted, true);
      assert.equal(sql('leaving', `select count(*) from public.conversations where id='${G}';`), '0');
      assert.equal(sql('leaving', `select count(*) from public.messages where conversation_id='${G}';`), '0');
      assert.equal(json('leaving', B, leave(B)).left, true);
      assert.equal(sql('leaving', `select count(*) from public.conversations where id='${id(201)}';`), '1');
    });

    await t.test('becoming the last participant never deletes without an explicit server-confirmed choice', () => {
      clone('confirm_delete'); json('confirm_delete', A, manage({ remove: [B, E] }));
      expectError('confirm_delete', A, leave(), '40001');
      assert.equal(sql('confirm_delete', `select count(*) from public.conversations where id='${G}';`), '1');
      assert.equal(sql('confirm_delete', `select count(*) from public.messages where conversation_id='${G}';`), '1');
    });

    await t.test('guessed inaccessible legacy IDs reveal no more than a missing or departed custom group', () => {
      for (const [user, legacy] of [[C, id(202)], [D, id(201)]]) {
        const missing = json('base', user, leave(user, null, id(9999)));
        const inaccessible = json('base', user, leave(user, null, legacy));
        assert.deepEqual({ ...inaccessible, id: missing.id }, missing);
      }
      expectError('base', A, leave(A, null, id(201)));
      expectError('base', A, leave(A, null, id(202)));
    });

    await t.test('inactive remaining roster produces a typed deletion-confirmation fence', () => {
      clone('inactive_roster');
      sql('inactive_roster', `update auth.users set banned_until='infinity' where id in ('${B}','${E}');`);
      const error = expectError('inactive_roster', A, leave(), '40001');
      assert.match(error, /requiresDeletionConfirmation.*true/);
      assert.equal(sql('inactive_roster', `select count(*) from public.conversations where id='${G}';`), '1');
      assert.equal(json('inactive_roster', A, leave(A, null, G, true)).deleted, true);
    });

    await t.test('stable membership deletion removes group access and transfers oldest accepted owner', () => {
      clone('removed');
      sql('removed', `update public.conversation_members set joined_at=case when user_id='${E}' then '2000-01-01'::timestamptz else '2001-01-01'::timestamptz end where conversation_id='${G}'; delete from public.stable_members where stable_id='${S}' and user_id='${A}';`);
      assert.equal(sql('removed', `select user_id from public.conversation_members where conversation_id='${G}' and member_role='owner';`), E);
      assert.equal(sql('removed', caller(A, `select count(*) from public.messages where conversation_id='${G}';`)), '0');
      assert.equal(sql('removed', `select count(*) from public.conversation_members where conversation_id='${G}' and user_id='${A}';`), '0');
    });

    await t.test('profile and Auth account cleanup cannot orphan or block group ownership', () => {
      clone('account');
      expectError('account', null, `delete from public.profiles where id='${A}';`, 'P0001', '[account delete]');
      assert.equal(sql('account', `select user_id from public.conversation_members where conversation_id='${G}' and member_role='owner';`), A);
      // Existing account media/deletion guards remain authoritative and must still be prepared.
      sql('account', `select public.prepare_account_deletion('${A}',null); delete from auth.users where id='${A}';`);
      assert.equal(sql('account', `select count(*) from public.profiles where id='${A}';`), '0');
      assert.equal(sql('account', `select count(*) from public.conversation_members where conversation_id='${G}' and member_role='owner';`), '1');
      assert.equal(sql('account', `select count(*) from public.conversation_members where conversation_id='${G}' and user_id='${A}';`), '0');
    });

    await t.test('last participant account deletion removes the group and its messages', () => {
      clone('last_account'); json('last_account', A, manage({ remove: [B, E] }));
      sql('last_account', `select public.prepare_account_deletion('${A}',null); delete from auth.users where id='${A}';`);
      assert.equal(sql('last_account', `select count(*) from public.conversations where id='${G}';`), '0');
      assert.equal(sql('last_account', `select count(*) from public.messages where conversation_id='${G}';`), '0');
    });

    await t.test('membership identity changes revoke the previous participant and deleted stables stay inaccessible', () => {
      clone('moved');
      sql('moved', `update public.stable_members set user_id='${PENDING}' where stable_id='${S}' and user_id='${A}';`);
      assert.equal(sql('moved', `select count(*) from public.conversation_members where conversation_id='${G}' and user_id='${A}';`), '0');
      assert.equal(sql('moved', `select count(*) from public.conversation_members where conversation_id='${G}' and member_role='owner';`), '1');
      sql('moved', `delete from public.stables where id='${S}';`);
      for (const user of [B, E, OWNER]) assert.equal(sql('moved', caller(user, `select count(*) from public.conversations where id='${G}';`)), '0');
    });

    await t.test('blocked-sender exact-ID receipts are rejected and prior receipts are unchanged', () => {
      clone('blocked');
      sql('blocked', `insert into public.blocked_users(blocker_user_id,blocked_user_id) values('${A}','${B}');`);
      expectError('blocked', A, `select public.mark_chat_messages_read('${A}','${G}',${uuidArray([id(302)])});`, '42501', '[chat read]');
      assert.equal(sql('blocked', `select count(*) from public.chat_message_reads where user_id='${A}' and message_id='${id(302)}';`), '1');
      assert.deepEqual(json('blocked', A, `select public.own_chat_read_state('${A}','${G}','{}');`).unread_message_ids, []);
      assert.equal(sql('blocked', caller(B, `select count(*) from public.conversations where id='${G}';`)), '1');
    });

    await t.test('one to fifty participants after creation, with no partial oversized changes', () => {
      clone('limits');
      const peers = Array.from({ length: 50 }, (_, n) => id(2000 + n));
      sql('limits', `insert into auth.users(id) values ${peers.map(user => `('${user}')`).join(',')}; insert into public.stable_members(stable_id,user_id) values ${peers.map(user => `('${S}','${user}')`).join(',')};`);
      const fifty = json('limits', A, create(id(430), 'Femtio', peers.slice(0, 49)));
      assert.equal(fifty.participantIds.length, 50);
      expectError('limits', A, create(id(431), 'Femtioen', peers), '22023');
      expectError('limits', A, manage({ group: id(430), title: 'Ska inte sparas', add: peers.slice(49) }), '22023');
      assert.equal(sql('limits', `select title from public.conversations where id='${id(430)}';`), 'Femtio');
      const one = json('limits', A, manage({ group: id(430), remove: peers.slice(0, 49) }));
      assert.deepEqual(one.participantIds, [A]); assert.equal(one.participantRoles[A], 'owner');
      assert.equal(json('limits', A, leave(A, null, id(430), true)).deleted, true);
    });

    await t.test('migration rejects ambiguous old rows instead of rewriting history', () => {
      clone('bad_history', 'before_migration');
      sql('bad_history', `insert into public.conversations(stable_id,is_group,created_by_user_id) values('${S}',false,'${A}');`);
      expectError('bad_history', null, migration, '55000');
      assert.equal(sql('bad_history', "select count(*) from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='chat_kind';"), '0');
      clone('bad_policy', 'before_migration');
      sql('bad_policy', 'create policy unreviewed_messages_access on public.messages for select using(true);');
      expectError('bad_policy', null, migration, '55000');
      clone('bad_push_trigger', 'before_migration');
      sql('bad_push_trigger', 'create or replace function public.trigger_push_new_message() returns trigger language plpgsql as $$begin return NEW; end $$;');
      expectError('bad_push_trigger', null, migration, '55000');
    });

    await t.test('only audited wrappers and caller-bound boolean helpers are executable by clients', () => {
      for (const role of ['anon', 'service_role']) {
        for (const signature of ['public.create_member_group(uuid,uuid,uuid,text,uuid[])', 'private.create_member_group(uuid,uuid,uuid,text,uuid[])', 'private.member_group_receipt(uuid)', 'private.chat_account_active(uuid)']) {
          assert.equal(sql('base', `select has_function_privilege('${role}','${signature}','EXECUTE');`), 'f');
        }
      }
      assert.equal(sql('base', "select has_function_privilege('authenticated','private.member_group_receipt(uuid)','EXECUTE');"), 'f');
      assert.equal(sql('base', "select has_function_privilege('authenticated','private.can_access_chat(uuid)','EXECUTE');"), 't');
      assert.equal(sql('base', "select bool_and(not prosecdef) from pg_proc where oid in ('public.create_member_group(uuid,uuid,uuid,text,uuid[])'::regprocedure,'public.manage_member_group(uuid,uuid,text,uuid[],uuid[],uuid)'::regprocedure,'public.leave_member_group(uuid,uuid,uuid,boolean)'::regprocedure);"), 't');
      assert.equal(sql('base', "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('can_access_chat','create_member_group','manage_member_group','leave_member_group') and not 'search_path=pg_catalog'=any(proconfig);"), '0');
    });

    await t.test('service-only push eligibility excludes outsiders, inactive accounts, deletion intents and blocks', () => {
      assert.equal(sql('base', "select to_regprocedure('public.chat_push_recipients(uuid,uuid)') is not null;"), 't', 'Authoritative active-account push RPC is missing.');
      clone('push');
      const recipients = (author = A, group = G) => JSON.parse(sql('push', `set role service_role; set request.jwt.claim.role='service_role'; select to_jsonb(public.chat_push_recipients('${group}','${author}'));`));
      assert.deepEqual(recipients(), [B, E]);
      assert.deepEqual(recipients(D), []);
      expectError('push', A, `select public.chat_push_recipients('${G}','${A}');`, '42501', 'permission denied');
      expectError('push', null, `set role anon; select public.chat_push_recipients('${G}','${A}');`, '42501', 'permission denied');
      sql('push', `update auth.users set banned_until='infinity' where id='${B}';`);
      assert.deepEqual(recipients(), [E]);
      sql('push', `insert into public.account_deletion_intents(user_id) values('${E}');`);
      assert.deepEqual(recipients(), []);
      sql('push', `delete from public.account_deletion_intents where user_id='${E}'; update auth.users set banned_until=null where id='${B}';
        insert into public.blocked_users(blocker_user_id,blocked_user_id) values('${B}','${A}'),('${A}','${E}');`);
      assert.deepEqual(recipients(), []);
      sql('push', `delete from public.blocked_users; update auth.users set banned_until='infinity' where id='${A}';`);
      assert.deepEqual(recipients(), []);
      sql('push', `update auth.users set banned_until=null where id='${A}'; insert into public.account_deletion_intents(user_id) values('${A}');`);
      assert.deepEqual(recipients(), []);
      sql('push', `delete from public.account_deletion_intents where user_id='${A}'; delete from public.stable_members where stable_id='${S}' and user_id='${A}';`);
      assert.deepEqual(recipients(), []);
    });

    await t.test('temporary push guard suppresses custom only and preserves exact stable/direct notification payloads', () => {
      clone('push_guard');
      const settings = "set app.settings.supabase_url='https://push.example.invalid'; set app.settings.service_role_key='synthetic-local-test-key';";
      sql('push_guard', caller(A, `${settings} insert into public.messages(id,conversation_id,author_id,text) values('${id(450)}','${G}','${A}','Custom stays in app');`));
      assert.equal(sql('push_guard', 'select count(*) from net.test_push_calls;'), '0', 'Custom chat must never reach the old pg_net webhook.');
      sql('push_guard', caller(A, `${settings} insert into public.messages(id,conversation_id,author_id,text) values('${id(451)}','${id(201)}','${A}','Stable unchanged'),('${id(452)}','${id(202)}','${A}','Direct unchanged');`));
      assert.equal(sql('push_guard', 'select count(*) from net.test_push_calls;'), '2');
      assert.equal(sql('push_guard', `select count(*) from net.test_push_calls p join public.messages m on m.id::text=p.body->'record'->>'id'
        where p.body->>'type'='message' and p.body->'record'=to_jsonb(m) and m.id in ('${id(451)}','${id(452)}');`), '2');
      assert.equal(sql('push_guard', `select count(*) from public.messages where id='${id(450)}';`), '1', 'Suppressing push must retain the custom message.');
    });

    await t.test('simultaneous same-ID creates return one group, never partial participants', async () => {
      clone('races');
      const first = asyncSql('races', caller(A, `set application_name='create_chat_hold'; begin; ${create(id(420))} select pg_sleep(0.6); commit;`));
      await waitForSleep('races', 'create_chat_hold');
      const second = asyncSql('races', caller(A, create(id(420))));
      const results = await Promise.all([first, second]); assert.ok(results.every(result => result.code === 0), JSON.stringify(results));
      assert.equal(sql('races', `select count(*) from public.conversations where id='${id(420)}';`), '1');
      assert.equal(sql('races', `select count(*) from public.conversation_members where conversation_id='${id(420)}';`), '3');
    });

    await t.test('serialized management and stable removal cannot restore removed membership', async () => {
      clone('remove_race');
      const first = asyncSql('remove_race', `set application_name='member_delete_hold'; begin; delete from public.stable_members where stable_id='${S}' and user_id='${E}'; select pg_sleep(0.6); commit;`);
      await waitForSleep('remove_race', 'member_delete_hold');
      const second = asyncSql('remove_race', caller(A, manage({ add: [E] })));
      const [removed, add] = await Promise.all([first, second]); assert.equal(removed.code, 0, removed.error); assert.notEqual(add.code, 0);
      assert.equal(sql('remove_race', `select count(*) from public.conversation_members where conversation_id='${G}' and user_id='${E}';`), '0');
    });

    await t.test('repeatable-read concurrent management fails stale membership instead of restoring it', async () => {
      clone('rr_race');
      const first = asyncSql('rr_race', caller(A, `set application_name='chat_manage_hold'; begin; ${manage({ remove: [E] })} select pg_sleep(0.6); commit;`));
      await waitForSleep('rr_race', 'chat_manage_hold');
      const second = asyncSql('rr_race', caller(A, `begin isolation level repeatable read; select count(*) from public.conversation_members where conversation_id='${G}'; ${manage({ add: [C] })} commit;`));
      const [removed, stale] = await Promise.all([first, second]); assert.equal(removed.code, 0, removed.error); assert.notEqual(stale.code, 0); assert.match(stale.error, /40001/);
      assert.equal(sql('rr_race', `select count(*) from public.conversation_members where conversation_id='${G}' and user_id in ('${E}','${C}');`), '0');
    });
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
});
