import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkpoint = join(root, 'docs/checkpoints/2026-09-09-restart');
const migration = join(root, 'supabase/migrations/20261001_guard_arena_and_last_owner.sql');
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const pgBin = process.env.STABLEFLOW_TEST_PG_BIN || pgConfig.stdout?.trim() || '/usr/local/bin';
const available = ['darwin', 'linux'].includes(process.platform) && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every((name) => existsSync(join(pgBin, name)))
  && spawnSync('python3', ['--version']).status === 0;

test('database guards enforce arena and owner invariants in the schema and approved migration', {
  skip: available ? false : 'A non-root Unix user, local PostgreSQL and Python 3 are required; set STABLEFLOW_TEST_PG_BIN if needed.',
  timeout: 120_000,
}, async (t) => {
  // A new Unix socket and cluster, with TCP disabled: never read app connection settings.
  const directory = await mkdtemp('/tmp/sf-db-guards-');
  const data = join(directory, 'data');
  const socket = join(directory, 'socket');
  const port = '58479';
  let started = false;
  const command = (name, args, input) => execFileSync(join(pgBin, name), args, {
    encoding: 'utf8', input, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const connection = ['-h', socket, '-p', port, '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
  const sql = (database, input) => command('psql', [...connection, '-d', database], input);
  try {
    await mkdir(socket);
    command('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
    command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql('postgres', 'create role authenticated nologin; create role anon nologin; create role service_role nologin; create database guards_schema; create database guards_migration;');

    // Compile the whole checked-in schema with local equivalents of Supabase auth.
    sql('guards_schema', `
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb, deleted_at timestamptz, banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('role', true), 'none'))$$;
      create schema storage;
      create table storage.objects(id uuid primary key, owner uuid, owner_id text);
      alter table storage.objects enable row level security;
    `);
    sql('guards_schema', await readFile(join(root, 'supabase/schema.sql'), 'utf8'));
    sql('guards_schema', 'grant usage on schema public, auth to authenticated, anon; grant select, insert, update, delete on all tables in schema public to authenticated;');
    const schemaResult = sql('guards_schema', await readFile(join(root, 'supabase/tests/guard_arena_and_last_owner.sql'), 'utf8'));
    assert.match(schemaResult, /20 schema guard tests passed/);
    t.diagnostic('20 rollback-only checks passed against the complete schema.');

    const privateChatTests = await readFile(join(root, 'supabase/tests/private_chat_bootstrap.sql'), 'utf8');
    assert.match(sql('guards_schema', privateChatTests), /14 private chat checks passed/);
    sql('guards_schema', 'drop policy "conversations_private_creator_select" on public.conversations; drop policy "conversations_private_insert_self" on public.conversations;');
    const privateChatMigration = await readFile(join(root, 'supabase/migrations/20261007173218_private_chat_bootstrap.sql'), 'utf8');
    sql('guards_schema', privateChatMigration);
    sql('guards_schema', privateChatMigration);
    assert.match(sql('guards_schema', privateChatTests), /14 private chat checks passed/);
    t.diagnostic('28 rollback-only private chat checks passed against the schema and twice-replayed migration.');

    sql('guards_migration', await readFile(join(checkpoint, 'stableflow-next-db-setup.sql'), 'utf8'));
    const migrationSql = await readFile(migration, 'utf8');
    sql('guards_migration', migrationSql);
    // Preserve all archived assertions, adapting only the isolated target/file paths.
    const args = [join(pgBin, 'psql'), ...connection, '-d', 'guards_migration'];
    for (const name of ['stableflow-next-db-tests.py', 'stableflow-next-db-tests-extra.py']) {
      const source = (await readFile(join(checkpoint, name), 'utf8'))
        .replace(/^PSQL=.*$/m, `PSQL=${JSON.stringify(args)}`)
        .replaceAll('/tmp/stableflow-next-db', join(directory, 'stableflow-next-db'));
      await writeFile(join(directory, name), source);
    }
    await writeFile(join(directory, 'stableflow-next-db-proposal.sql'), migrationSql);
    for (const name of ['stableflow-next-db-tests.py', 'stableflow-next-db-tests-extra.py']) {
      execFileSync('python3', [join(directory, name)], { encoding: 'utf8', timeout: 45_000 });
    }
    const results = JSON.parse(await readFile(join(directory, 'stableflow-next-db-test-results.json'), 'utf8'));
    assert.equal(results.length, 71);
    assert.ok(results.every((result) => result.result === 'PASS'));
    t.diagnostic('71 archived checks passed, including 8 real two-connection RC/RR races.');
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
});
