import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const pgBin = pgConfig.stdout?.trim() || '/usr/local/bin';
const available = ['darwin', 'linux'].includes(process.platform) && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(join(pgBin, name)));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const S = id(1), OTHER = id(2), OWNER = id(101), H1 = id(11), H2 = id(12), H3 = id(13), H4 = id(14);
const P1 = id(21), P2 = id(22), P3 = id(23);
const literal = value => value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;

// Every connection targets this test's own Unix socket. No app environment or URL.
test('canonical paddock IDs enforce atomic saves, migration approval and concurrent cascades', {
  skip: available ? false : 'A non-root Unix user and preinstalled PostgreSQL are required.',
  timeout: 120_000,
}, async t => {
  const directory = await mkdtemp('/tmp/sf-paddock-ids-');
  const data = join(directory, 'data'), socket = join(directory, 'socket'), port = '58485';
  const command = (name, args, input) => execFileSync(join(pgBin, name), args, {
    encoding: 'utf8', input, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const connection = ['-h', socket, '-p', port, '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  const sql = (db, input) => command('psql', [...connection, '-d', db], input).trim();
  const asyncSql = (db, input) => {
    const child = spawn(join(pgBin, 'psql'), [...connection, '-d', db], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.stdin.end(input);
    return new Promise(resolve => child.on('close', code => resolve({ code, output: output.trim(), error })));
  };
  const expectError = (db, input, code, message) => {
    let error;
    try { sql(db, input); } catch (caught) { error = String(caught.stderr); }
    assert.ok(error?.includes(code) && error?.includes(message), error || 'Expected rejection');
  };
  const clone = (db, template = 'legacy_seed') => sql('postgres', `create database ${db} template ${template};`);
  const asCaller = input => `set role authenticated; set request.jwt.claim.sub='${OWNER}'; ${input}`;
  const save = (pad, horses, revision, request, name = 'Fixture') => `select public.save_paddock('${pad}','${S}',${literal(name)},array[${horses.map(x => `'${x}'::uuid`).join(',')}]::uuid[],'yearRound',null,${revision === null ? 'null' : revision},'${request}');`;
  const waitFor = async (db, predicate) => {
    for (let i = 0; i < 80; i++) {
      if (sql(db, `select exists(select 1 from pg_stat_activity where ${predicate});`) === 't') return;
      await delay(20);
    }
    assert.fail(`Timed out waiting for ${predicate}`);
  };
  let started = false;
  try {
    await mkdir(socket);
    command('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
    command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql('postgres', 'create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls; create database canonical; create database legacy_base;');
    assert.equal(sql('postgres', 'show listen_addresses;'), '');
    const auth = `create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb, deleted_at timestamptz, banned_until timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$; create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('role',true),'none'))$$; create schema storage; create table storage.buckets(id text primary key, name text not null, public boolean default false); create table storage.objects(id uuid primary key, bucket_id text, name text, owner uuid, owner_id text, version text, metadata jsonb, updated_at timestamptz); alter table storage.objects enable row level security;`;
    const schema = await readFile(join(root, 'supabase/schema.sql'), 'utf8');
    const migration = await readFile(join(root, 'supabase/migrations/20261006_paddock_horse_ids.sql'), 'utf8');
    const checks = await readFile(join(root, 'supabase/tests/paddock_horse_ids.sql'), 'utf8');
    const grants = `grant usage on schema public,auth to authenticated,anon;
      do $$declare target text; begin for target in select tablename from pg_tables where schemaname='public' and tablename<>'paddock_deleted_ids' loop execute format('grant select on table public.%I to authenticated',target); end loop; end$$;
      grant insert,update,delete on public.horses to authenticated;`;
    sql('canonical', auth); sql('canonical', schema); sql('canonical', grants);
    const result = sql('canonical', checks);
    assert.match(result, /48 canonical paddock ID tests passed/);
    t.diagnostic('48 rollback-only role/model/RPC assertions passed against the complete schema.');

    // Compile the same historic core without the new bootstrap/ID block, never Git or live DB.
    sql('legacy_base', auth);
    sql('legacy_base', schema.slice(schema.indexOf('-- Core schema for StableFlow'), schema.indexOf('-- Canonical paddock horse IDs (20261006).')));
    clone('legacy_empty', 'legacy_base'); sql('legacy_empty', migration);
    assert.equal(sql('legacy_empty', "select to_regclass('public.paddock_horses') is not null;"), 't');
    clone('legacy_seed', 'legacy_base');
    sql('legacy_seed', 'grant update(horse_names,name),insert(stable_id,name) on public.paddocks to authenticated,anon,service_role;');
    sql('legacy_seed', `insert into auth.users(id) values('${OWNER}'); insert into public.stables(id,name,created_by) values('${S}','Fixture stable','${OWNER}'),('${OTHER}','Fixture other','${OWNER}'); insert into public.stable_members(stable_id,user_id,role,access) values('${S}','${OWNER}','admin','owner'); insert into public.horses(id,stable_id,name) values('${H1}','${S}','Saga'),('${H2}','${S}','Mira'),('${H3}','${OTHER}','Saga'),('${H4}','${S}','Tab fixture'); insert into public.paddocks(id,stable_id,name,horse_names) values('${P1}','${S}','Legacy A',array['Saga','Original unmatched text',chr(9)]),('${P2}','${S}','Legacy B',array['Saga']),('${P3}','${OTHER}','Legacy other',array['Saga']);`);
    const mappings = [[P1, 1, H1, 'Saga'], [P1, 2, H2, 'Original unmatched text'], [P1, 3, H4, '\t'], [P2, 1, H1, 'Saga'], [P3, 1, H3, 'Saga']];
    const mapped = (rows = mappings) => migration.replace('-- APPROVED_MAPPING_INSERTS (empty intentionally; no production identifiers here).', `insert into pg_temp.approved_horse_mapping values ${rows.map(([p, n, h, raw]) => `('${p}',${n},'${h}',${literal(raw)})`).join(',')};`);
    const before = sql('legacy_seed', 'select jsonb_agg(to_jsonb(p) order by id) from public.paddocks p;');
    for (const [db, setup, input, message] of [
      ['unapproved', '', migration, 'unapproved entries'],
      ['partial', '', mapped(mappings.slice(0, 1)), 'unapproved entries'],
      ['cross_mapping', '', mapped(mappings.map(row => row[0] === P1 && row[1] === 1 ? [P1, 1, H3, 'Saga'] : row)), 'invalid/cross-stable'],
      ['bad_position', '', mapped([...mappings, [P1, 99, H1, null]]), 'invalid/cross-stable'],
      ['stale_source', `update public.paddocks set horse_names[1]='Changed' where id='${P1}';`, mapped(), 'stale-source'],
      ['reordered_source', `update public.paddocks set horse_names=array['Original unmatched text','Saga',chr(9)] where id='${P1}';`, mapped(), 'stale-source'],
      ['null_scope', `insert into public.horses(id,name) values('${id(15)}','No stable fixture');`, mapped(), 'null stable_id'],
      ['repeated_link', '', mapped(mappings.map(row => row[0] === P1 && row[1] === 2 ? [P1, 2, H1, 'Original unmatched text'] : row)), 'repeated entries'],
    ]) {
      clone(db); if (setup) sql(db, setup);
      const rawBefore = sql(db, 'select jsonb_agg(to_jsonb(p) order by id) from public.paddocks p;');
      expectError(db, input, '23514', message);
      assert.equal(sql(db, "select to_regclass('public.paddock_horses') is null;"), 't');
      assert.equal(sql(db, "select count(*) from information_schema.columns where table_schema='public' and table_name='paddocks' and column_name='revision';"), '0');
      assert.equal(sql(db, 'select jsonb_agg(to_jsonb(p) order by id) from public.paddocks p;'), rawBefore);
    }
    clone('mapped'); sql('mapped', mapped()); sql('mapped', grants);
    assert.equal(sql('mapped', 'select count(*) from public.paddock_horses;'), '5');
    assert.equal(sql('mapped', `select count(*) from public.paddock_horses where horse_id='${H1}';`), '2');
    assert.equal(sql('mapped', 'select jsonb_agg(to_jsonb(p) - \'revision\' - \'last_save_request_id\' order by id) from public.paddocks p;'), before);
    assert.equal(sql('mapped', `select ascii(horse_names[3]) from public.paddocks where id='${P1}';`), '9');
    assert.match(sql('mapped', checks), /48 canonical paddock ID tests passed/);
    for (const role of ['authenticated', 'anon', 'service_role']) {
      assert.equal(sql('mapped', `select has_column_privilege('${role}','public.paddocks','horse_names','UPDATE') or has_column_privilege('${role}','public.paddocks','name','INSERT');`), 'f');
    }
    clone('null_source'); sql('null_source', `update public.paddocks set horse_names[3]=null where id='${P1}';`);
    sql('null_source', mapped(mappings.map(row => row[0] === P1 && row[1] === 3 ? [P1, 3, H4, null] : row)));
    assert.equal(sql('null_source', `select horse_names[3] is null from public.paddocks where id='${P1}';`), 't');
    clone('bootstrap_guard'); expectError('bootstrap_guard', schema, '23514', '[paddock migration]');
    assert.equal(sql('bootstrap_guard', "select to_regclass('public.paddock_horses') is null;"), 't');
    t.diagnostic('Empty install, exact approved backfill, null/tab preservation and 9 fail-closed migration/bootstrap cases passed.');

    clone('races', 'canonical');
    sql('races', `insert into auth.users(id) values('${OWNER}'); insert into public.stables(id,name,created_by) values('${S}','Race fixture','${OWNER}'); insert into public.stable_members(stable_id,user_id,role,access) values('${S}','${OWNER}','admin','owner'); insert into public.horses(id,stable_id,name) values('${H1}','${S}','A'),('${H2}','${S}','B');`);
    const race = async (label, first, second, expectedCode, expectedPrefix, isolation = '') => {
      const a = asyncSql('races', `set application_name='${label}_a'; begin ${isolation}; ${asCaller(first)} select pg_sleep(0.8); commit;`);
      await waitFor('races', `application_name='${label}_a' and wait_event='PgSleep'`);
      const b = asyncSql('races', `set application_name='${label}_b'; begin ${isolation}; ${asCaller(second)} commit;`);
      const [ra, rb] = await Promise.all([a, b]);
      assert.equal(ra.code, 0, ra.error);
      if (expectedCode) { assert.notEqual(rb.code, 0, `${label}: second connection must reject`); assert.ok(rb.error.includes(expectedCode) && rb.error.includes(expectedPrefix), rb.error); }
      else assert.equal(rb.code, 0, rb.error);
      return [ra, rb];
    };
    for (const [offset, isolation] of [[0, ''], [10, 'isolation level repeatable read']]) {
      const p = id(200 + offset); sql('races', asCaller(save(p, [H1, H2], null, id(300 + offset))));
      await race(`cas${offset}`, save(p, [H1], 1, id(301 + offset), 'First'), save(p, [H2], 1, id(302 + offset), 'Second'), '40001', '[paddock save]', isolation);
      assert.equal(sql('races', `select name||':'||revision from public.paddocks where id='${p}';`), 'First:2');
    }
    const [ca, cb] = await race('same_create', save(id(220), [H1, H2], null, id(320)), save(id(220), [H2, H1], null, id(320)), null);
    assert.deepEqual(JSON.parse(ca.output), JSON.parse(cb.output));
    await race('different_create', save(id(221), [H1], null, id(321)), save(id(221), [H1], null, id(321), 'Changed'), '22023', '[paddock save]');
    sql('races', asCaller(save(id(230), [H1, H2], null, id(330))));
    await race('save_delete', save(id(230), [H1, H2], 1, id(331)), `select public.delete_paddock('${id(230)}','${S}',1);`, '40001', '[paddock delete]');
    sql('races', asCaller(save(id(231), [H1], null, id(332))));
    await race('delete_create_retry', `select public.delete_paddock('${id(231)}','${S}',1);`, save(id(231), [H1], null, id(332)), 'P0002', '[paddock save]');
    assert.equal(sql('races', `select exists(select 1 from public.paddock_deleted_ids where paddock_id='${id(231)}') and not exists(select 1 from public.paddocks where id='${id(231)}');`), 't');
    sql('races', asCaller(save(id(232), [H1], null, id(333))));
    await race('create_retry_delete', save(id(232), [H1], null, id(333)), `select public.delete_paddock('${id(232)}','${S}',1);`, null);
    expectError('races', asCaller(save(id(232), [H1], null, id(333))), 'P0002', '[paddock save]');

    for (const [offset, isolation] of [[0, ''], [10, 'isolation level repeatable read']]) {
      const p = id(260 + offset), request = id(360 + offset);
      await race(`create_delete_uncommitted${offset}`, `${save(p, [H1], null, request)} select public.delete_paddock('${p}','${S}',1);`, save(p, [H1], null, request), isolation ? '40001' : 'P0002', '[paddock save]', isolation);
      assert.equal(sql('races', `select exists(select 1 from public.paddock_deleted_ids where paddock_id='${p}') and not exists(select 1 from public.paddocks where id='${p}');`), 't');
    }

    // Limit the next horse cascade to this one paddock, so lock outcomes are deterministic.
    sql('races', 'delete from public.paddocks;');
    sql('races', asCaller(save(id(240), [H1, H2], null, id(340))));
    await race('save_horse_delete', save(id(240), [H1, H2], 1, id(341)), `delete from public.horses where id='${H1}';`, '40001', '[paddock save]');
    assert.equal(sql('races', `select exists(select 1 from public.horses where id='${H1}');`), 't');
    assert.equal(sql('races', `select revision=2 and last_save_request_id='${id(341)}' from public.paddocks where id='${id(240)}';`), 't');
    await race('horse_delete_save', `delete from public.horses where id='${H1}';`, save(id(240), [H2], 2, id(342)), '40001', '[paddock save]');
    assert.equal(sql('races', `select revision=3 and last_save_request_id is null from public.paddocks where id='${id(240)}';`), 't');
    assert.equal(sql('races', `select count(*) from public.paddock_horses where paddock_id='${id(240)}';`), '1');
    sql('races', asCaller(save(id(250), [H2], null, id(350))));
    await race('delete_stable_cascade', `select public.delete_paddock('${id(250)}','${S}',1);`, `reset role; delete from public.stables where id='${S}';`, null);
    assert.equal(sql('races', `select not exists(select 1 from public.stables where id='${S}') and not exists(select 1 from public.paddock_deleted_ids where stable_id='${S}');`), 't');
    t.diagnostic('12 real two-connection races passed: RC/RR CAS, retries, delete/create ordering, passive cascades and stable cleanup.');
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
});
