import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pgBin = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout?.trim() || '/usr/local/bin';
const available = ['darwin', 'linux'].includes(process.platform) && process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(join(pgBin, name)));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const S = id(1), OTHER = id(2), OWNER = id(101), A = id(102), B = id(103), OUT = id(104), EDIT = id(105);
const PERIOD = id(201), TEMPLATE = id(301);
const literal = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const templates = Array.from({ length: 5 }, (_, n) => ({ id: id(301 + n), name: ['Morgon', 'Lunch', 'Eftermiddag', 'Kväll', 'Vatten'][n],
  start_time: ['07:00', '12:00', '14:00', '17:00', '21:00'][n], end_time: n === 4 ? null : ['08:00', '13:00', '15:00', '18:00'][n],
  instructions: `Instruktion ${n}`, sort_order: n, archived: false }));
const caller = (user, input) => `set role authenticated; set request.jwt.claim.sub='${user}'; set request.jwt.claim.role='authenticated'; ${input}`;
const save = (revision = 0, values = templates, from = '2099-01-01', to = '2099-12-31', period = PERIOD, name = 'Vinter') =>
  `select public.save_schedule_period('${OWNER}','${S}','${period}',${revision},${literal(name)},'${from}','${to}',${literal(JSON.stringify(values))}::jsonb);`;
const generate = (revision = 1) => `select public.generate_schedule_batch('${OWNER}','${S}','${PERIOD}',${revision});`;
const weekly = (user = A, assignee = user, controlled = false, revision = 0, from = '2099-01-01', weekday = 0, template = TEMPLATE) =>
  `select public.set_schedule_weekly_assignment('${user}','${S}','${template}',${weekday},'${from}',${literal(assignee)}::uuid,${controlled},${revision});`;

// Deliberately uses a private local Unix socket, never environment credentials or a live database.
test('season schedule real PostgreSQL contract, coverage, authority and cleanup', {
  skip: available ? false : 'A non-root Unix user and preinstalled PostgreSQL are required.', timeout: 180_000,
}, async t => {
  const directory = await mkdtemp('/tmp/sf-season-db-');
  const data = join(directory, 'data'), socket = join(directory, 'socket'), port = '58486';
  const command = (name, args, input) => {
    try { return execFileSync(join(pgBin, name), args, {
      encoding: 'utf8', input, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
    }); } catch (error) { error.message += '\n' + String(error.stderr || ''); throw error; }
  };
  const connection = ['-h', socket, '-p', port, '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  const sql = (db, input) => command('psql', [...connection, '-d', db], input).trim();
  const json = (db, user, input) => JSON.parse(sql(db, caller(user, input)));
  const expectError = (db, user, input, code, message = '[season schedule]') => {
    let error; try { sql(db, user ? caller(user, input) : input); } catch (caught) { error = String(caught.stderr); }
    assert.ok(error?.includes(code) && error?.includes(message), error || 'Expected rejection');
  };
  const clone = (db, template = 'annual') => sql('postgres', `create database ${db} template ${template};`);
  const asyncSql = (db, input) => {
    const child = spawn(join(pgBin, 'psql'), [...connection, '-d', db], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
    child.stdin.end(input);
    return new Promise(resolve => child.on('close', code => resolve({ code, output: output.trim(), error })));
  };
  const waitForSleep = async (db, application) => {
    for (let i = 0; i < 80; i++) {
      if (sql(db, `select exists(select 1 from pg_stat_activity where application_name='${application}' and wait_event='PgSleep');`) === 't') return;
      await delay(20);
    }
    assert.fail('First transaction did not reach its lock hold.');
  };
  const assignment = (db, date = '2099-01-05') => JSON.parse(sql(db, `select to_jsonb(a) from public.assignments a where template_id='${TEMPLATE}' and original_date='${date}';`));
  const occurrence = (db, user, row, changes) => json(db, user,
    `select public.update_schedule_occurrence('${user}','${S}','${row.id}',${literal(row.updated_at)},${literal(JSON.stringify(changes))}::jsonb);`);
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
    sql('base', await readFile(join(root, 'supabase/schema.sql'), 'utf8'));
    const file = (await readdir(join(root, 'supabase/migrations'))).find(name => name.endsWith('_seasonal_duty_schedule.sql'));
    if (file) sql('base', await readFile(join(root, 'supabase/migrations', file), 'utf8'));
    assert.equal(sql('base', "select to_regclass('public.schedule_periods') is not null;"), 't', 'Season schedule schema is not implemented.');
    sql('base', `grant usage on schema public,auth to authenticated,anon;
      grant select on all tables in schema public to authenticated; grant insert,update,delete on public.assignments,public.stable_members to authenticated;
      insert into auth.users(id) values ${[OWNER, A, B, OUT, EDIT].map(user => `('${user}')`).join(',')};
      insert into public.stables(id,name,created_by) values('${S}','Fixture','${OWNER}'),('${OTHER}','Other','${OWNER}');
      insert into public.stable_members(stable_id,user_id,role,access) values('${S}','${OWNER}','admin','owner'),('${S}','${A}','rider','view'),('${S}','${B}','staff','view'),('${S}','${EDIT}','staff','edit');`);

    await t.test('definitions are owner-only, replayable and guarded by stable/date/template identity', () => {
      clone('definitions', 'base');
      expectError('definitions', EDIT, save().replace(OWNER, EDIT), '42501');
      const saved = json('definitions', OWNER, save());
      assert.equal(saved.user_id, OWNER); assert.equal(saved.stable_id, S); assert.equal(saved.period.status, 'generating'); assert.equal(saved.period.revision, 1);
      assert.deepEqual(json('definitions', OWNER, save()), saved, 'Lost receipt retry must acknowledge the same definition.');
      expectError('definitions', OWNER, save(0, templates, '2099-01-01', '2099-12-31', PERIOD, 'Conflicting body'), '40001');
      expectError('definitions', OWNER, save(0, templates.map((v, n) => ({ ...v, id: id(401 + n) })), '2099-12-31', '2100-01-02', id(202)), '23P01');
      expectError('definitions', OWNER, save(0, templates, '2099-12-31', '2099-01-01'), '22023');
      expectError('definitions', OWNER, save(1, templates, '2099-01-01', '2100-01-02'), '22023');
      expectError('definitions', null, `insert into public.schedule_periods(id,stable_id,name,date_from,date_to) values('${id(207)}','${S}','För långt','2100-01-01','2101-01-02');`, '23514', 'schedule_periods_duration_check');
      const invalid = templates.map(v => ({ ...v, end_time: '06:00' }));
      expectError('definitions', OWNER, save(1, invalid), '22023');
      expectError('definitions', null, `insert into public.assignments(stable_id,date,slot,label,icon,time,status,template_id,original_date) values('${OTHER}','2099-01-01','Morning','Foreign','sun','07:00','open','${TEMPLATE}','2099-01-01');`, '23503', 'assignments_schedule_template_fkey');
      const read = json('definitions', A, `select public.get_season_schedule('${A}','${S}');`);
      assert.equal(read.templates.length, 5); assert.equal(new Set(read.templates.map(v => v.id)).size, 5);
    });

    await t.test('355 and 365 concrete mutations are complete, 1825 resumably converges and remains invisible until verified', () => {
      for (const [db, to, count] of [['boundary355', '2099-03-12', 355], ['boundary365', '2099-03-14', 365]]) {
        clone(db, 'base'); json(db, OWNER, save(0, templates, '2099-01-01', to)); const result = json(db, OWNER, generate());
        assert.equal(result.changed_count, count); assert.equal(result.total_count, count); assert.equal(result.generated_count, count); assert.equal(result.period.status, 'ready');
      }
      clone('leap366', 'base'); json('leap366', OWNER, save(0, templates.slice(0, 1), '2096-01-01', '2096-12-31'));
      const leap = json('leap366', OWNER, generate()); assert.equal(leap.total_count, 366); assert.equal(leap.period.status, 'generating');
      assert.equal(json('leap366', OWNER, generate()).period.status, 'ready');
      clone('annual', 'base'); json('annual', OWNER, save()); const first = json('annual', OWNER, generate());
      assert.equal(first.changed_count, 365); assert.equal(first.total_count, 1825); assert.equal(first.generated_count, 365); assert.equal(first.period.status, 'generating');
      assert.equal(sql('annual', caller(A, 'select count(*) from public.assignments;')), '0', 'Partial generation must stay invisible after a fresh connection.');
      expectError('annual', A, weekly(), '55000');
      const replay = json('annual', OWNER, generate()); // first response may be lost; no duplicate inserts.
      assert.equal(replay.generated_count, 730);
      let result = replay; let calls = 2;
      while (result.period.status !== 'ready' && calls++ < 10) {
        result = json('annual', OWNER, generate()); assert.ok(result.changed_count <= 365);
      }
      assert.equal(result.period.status, 'ready'); assert.equal(result.generated_count, 1825);
      assert.equal(sql('annual', 'select count(*) from public.assignments;'), '1825');
      assert.equal(sql('annual', caller(A, 'select count(*) from public.assignments;')), '1825');
      assert.equal(sql('annual', 'select count(distinct (template_id,original_date)) from public.assignments;'), '1825');
      assert.equal(json('annual', OWNER, generate()).changed_count, 0);
      assert.equal(sql('annual', "select min(date)||':'||max(date) from public.assignments;"), '2099-01-01:2099-12-31');
      t.diagnostic('Five independent templates; 1825 server rows verified beyond the API 1000-row cap; each batch <=365.');
    });

    await t.test('weekday segments retain earlier intervals, reject stale owners and preserve owner-empty authority', () => {
      clone('rules'); const first = json('rules', A, weekly()); assert.equal(first.rule.revision, 1); assert.ok(first.updated_count >= 52);
      const next = json('rules', OWNER, weekly(OWNER, B, true, 1, '2099-06-01')); assert.equal(next.rule.revision, 2);
      assert.equal(sql('rules', `select count(*) from public.assignments where template_id='${TEMPLATE}' and extract(isodow from original_date)=1 and ((original_date<'2099-06-01' and assignee_id is distinct from '${A}'::uuid) or (original_date>='2099-06-01' and assignee_id is distinct from '${B}'::uuid));`), '0');
      expectError('rules', A, weekly(A, A, false, 1), '40001');
      expectError('rules', A, weekly(A, A, false, 2, '2099-01-01'), '42501');
      const empty = json('rules', OWNER, weekly(OWNER, null, true, 2, '2099-06-01')); assert.equal(empty.rule.assignee_id, null); assert.equal(empty.rule.owner_controlled, true);
      expectError('rules', EDIT, weekly(EDIT, EDIT, false, 3, '2099-06-01'), '42501');
      json('rules', OWNER, weekly(OWNER, null, false, 3, '2099-06-01'));
      const claimed = json('rules', A, weekly(A, A, false, 4, '2099-06-01')); assert.equal(claimed.rule.revision, 5);
      expectError('rules', OWNER, weekly(OWNER, B, true, 4), '40001');
      expectError('rules', A, weekly(A, B, false, 5), '42501');
      const untouchedTemplate = sql('rules', `select count(*) from public.assignments where template_id='${id(303)}' and assignee_id is not null;`); assert.equal(untouchedTemplate, '0');
    });

    await t.test('two real concurrent member claims have exactly one winner', async () => {
      clone('race');
      const first = asyncSql('race', `set application_name='season_first'; begin; ${caller(A, weekly())} select pg_sleep(0.4); commit;`);
      await waitForSleep('race', 'season_first');
      const second = asyncSql('race', `begin; ${caller(B, weekly(B))} commit;`);
      const [a, b] = await Promise.all([first, second]); assert.equal(a.code, 0, a.error); assert.notEqual(b.code, 0); assert.match(b.error, /40001.*\[season schedule\]/s);
      assert.equal(sql('race', `select count(*) from public.schedule_weekly_assignments where template_id='${TEMPLATE}' and weekday=0 and assignee_id='${A}';`), '1');
    });

    await t.test('single occurrence release, moved original identity and later rules cannot overwrite exceptions', () => {
      clone('exceptions'); json('exceptions', A, weekly());
      const before = assignment('exceptions'); const released = occurrence('exceptions', A, before, { assignee_id: null }).assignment;
      assert.equal(released.is_schedule_override, true); assert.equal(released.status, 'open');
      const moved = occurrence('exceptions', OWNER, assignment('exceptions', '2099-01-12'), { date: '2099-01-13', time: '08:30', label: 'Ett eget datum', end_time: '09:30', instructions: 'Engångsinstruktion' }).assignment;
      assert.equal(moved.original_date, '2099-01-12'); assert.equal(moved.template_id, TEMPLATE); assert.equal(moved.is_schedule_override, true);
      json('exceptions', OWNER, weekly(OWNER, B, true, 1));
      assert.deepEqual(assignment('exceptions'), released); assert.deepEqual(assignment('exceptions', '2099-01-12'), moved);
      const changedTemplates = templates.map(v => ({ ...v, name: v.name + ' ny', instructions: 'Ny standard' }));
      json('exceptions', OWNER, save(1, changedTemplates)); let result;
      do { result = json('exceptions', OWNER, generate(2)); } while (result.period.status !== 'ready');
      assert.deepEqual(assignment('exceptions'), released); assert.deepEqual(assignment('exceptions', '2099-01-12'), moved);
      assert.equal(sql('exceptions', `select count(*) from public.assignments where template_id='${TEMPLATE}' and original_date='2099-01-12';`), '1');
      assert.equal(occurrence('exceptions', OWNER, released, { reset_override: true }).assignment.assignee_id, B);
      expectError('exceptions', OWNER, `select public.update_schedule_occurrence('${OWNER}','${S}','${released.id}',${literal(released.updated_at)},'{"assignee_id":null}');`, '40001');
    });

    await t.test('definition reconciliation removes future extras while preserving completed, started, history and one-offs', () => {
      clone('reconcile'); const completed = assignment('reconcile', '2099-01-05'), past = assignment('reconcile', '2099-01-06');
      sql('reconcile', `update public.assignments set status='completed',assignee_id='${A}',completed_at='2099-01-05' where id='${completed.id}';
        update public.assignments set date='2000-01-01',time='07:00' where id='${past.id}';
        insert into public.assignment_history(assignment_id,stable_id,label,action) values('${completed.id}','${S}','Historiskt original','completed');
        insert into public.assignments(id,stable_id,date,slot,label,icon,time,status) values('${id(501)}','${S}','2099-12-31','Morning','Manuellt','sun','07:00','open');`);
      const before = [assignment('reconcile', '2099-01-05'), assignment('reconcile', '2099-01-06')];
      const values = templates.map((v, n) => ({ ...v, name: `${v.name} ny`, archived: n === 4 }));
      json('reconcile', OWNER, save(1, values, '2099-02-01', '2099-11-30')); let result;
      do { result = json('reconcile', OWNER, generate(2)); assert.ok(result.changed_count <= 365); } while (result.period.status !== 'ready');
      assert.deepEqual([assignment('reconcile', '2099-01-05'), assignment('reconcile', '2099-01-06')], before);
      assert.equal(sql('reconcile', 'select count(*) from public.assignment_history;'), '1');
      assert.equal(sql('reconcile', `select count(*) from public.assignments where id='${id(501)}';`), '1');
      assert.equal(sql('reconcile', `select count(*) from public.assignments where template_id='${id(305)}';`), '0');
      assert.equal(sql('reconcile', `select count(*) from public.assignments where template_id is not null and status<>'completed' and date>='2099-01-01' and (original_date<'2099-02-01' or original_date>'2099-11-30');`), '0');
      assert.equal(result.total_count, 1212); assert.equal(result.generated_count, 1212);
    });

    await t.test('direct and legacy writes cannot bypass ownership, own claim/release/complete remain usable', () => {
      clone('direct'); json('direct', OWNER, weekly(OWNER, null, true)); const row = assignment('direct');
      expectError('direct', EDIT, `update public.assignments set assignee_id='${EDIT}',status='assigned',assigned_via='default' where id='${row.id}';`, '42501');
      expectError('direct', EDIT, `update public.assignments set label='Forged label' where id='${row.id}';`, '42501');
      assert.equal(sql('direct', caller(OWNER, `delete from public.assignments where id='${row.id}' returning id;`)), '', 'Direct delete is blocked even for editors.');
      const open = assignment('direct', '2099-01-07');
      sql('direct', caller(A, `update public.assignments set assignee_id='${A}',status='assigned',assigned_via='manual',updated_at=clock_timestamp() where id='${open.id}';`));
      assert.equal(assignment('direct', '2099-01-07').is_schedule_override, true);
      sql('direct', caller(A, `update public.assignments set assignee_id=null,status='open',assigned_via=null,declined_by_user_ids=array['${A}'::uuid],updated_at=clock_timestamp() where id='${open.id}';`));
      sql('direct', caller(A, `update public.assignments set assignee_id='${A}',status='assigned',assigned_via='manual',declined_by_user_ids='{}',updated_at=clock_timestamp() where id='${open.id}';`));
      sql('direct', caller(A, `update public.assignments set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp() where id='${open.id}';`));
      assert.equal(assignment('direct', '2099-01-07').status, 'completed');
      expectError('direct', A, `update public.assignments set status='open',completed_at=null where id='${open.id}';`, '23514');
      const legacy = id(502), series = id(503);
      sql('direct', `insert into public.assignments(id,stable_id,date,slot,label,icon,time,status,series_id) values('${legacy}','${S}','2099-01-01','Morning','Äldre','sun','07:00','open','${series}');`);
      const legacyEdit = json('direct', EDIT, `select public.update_future_open_assignment_series('${EDIT}','${S}','${series}','Äldre nytt','09:00','10:00');`);
      assert.equal(legacyEdit.updated_count, 1);
      assert.equal(sql('direct', 'select count(*) from public.feed_checks;'), '0');
    });

    await t.test('an owner-empty weekly cell still allows an explicit single-date claim without unlocking recurrence', () => {
      clone('single_claim'); json('single_claim', OWNER, weekly(OWNER, null, true));
      const row = assignment('single_claim');
      const claimed = occurrence('single_claim', A, row, { assignee_id: A }).assignment;
      assert.equal(claimed.assignee_id, A); assert.equal(claimed.is_schedule_override, true);
      const direct = assignment('single_claim', '2099-01-12');
      sql('single_claim', caller(B, `update public.assignments set assignee_id='${B}',status='assigned',assigned_via='manual',updated_at=clock_timestamp() where id='${direct.id}';`));
      assert.equal(assignment('single_claim', '2099-01-12').is_schedule_override, true);
      assert.equal(sql('single_claim', `select owner_controlled and assignee_id is null from public.schedule_weekly_assignments where template_id='${TEMPLATE}' and weekday=0;`), 't');
      expectError('single_claim', A, weekly(A, A, false, 1), '42501');
    });

    await t.test('changing a future shift definition cannot move the current-day occurrence into the past', () => {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const part = name => parts.find(v => v.type === name).value;
      if (part('hour') === '23' && part('minute') === '59') return;
      const today = `${part('year')}-${part('month')}-${part('day')}`;
      const values = [{ ...templates[0], start_time: '23:59', end_time: null }];
      clone('current_day', 'base'); json('current_day', OWNER, save(0, values, today, today)); json('current_day', OWNER, generate());
      expectError('current_day', OWNER, save(1, [{ ...values[0], start_time: '00:00' }], today, today), '23514');
      assert.equal(sql('current_day', 'select time from public.assignments;'), '23:59');
    });

    await t.test('a concurrently banned assignee cannot be restored by a one-date reset', async () => {
      clone('reset_ban'); json('reset_ban', OWNER, weekly(OWNER, A, true));
      const row = occurrence('reset_ban', OWNER, assignment('reset_ban'), { assignee_id: null }).assignment;
      const ban = asyncSql('reset_ban', `set application_name='season_ban'; begin; update auth.users set banned_until='2200-01-01' where id='${A}'; select pg_sleep(0.4); commit;`);
      await waitForSleep('reset_ban', 'season_ban');
      const reset = asyncSql('reset_ban', caller(OWNER, `select public.update_schedule_occurrence('${OWNER}','${S}','${row.id}',${literal(row.updated_at)},'{"reset_override":true}');`));
      const [a, b] = await Promise.all([ban, reset]); assert.equal(a.code, 0, a.error);
      if (b.code !== 0) assert.match(b.error, /42501.*\[season schedule\]/s);
      assert.equal(assignment('reset_ban').assignee_id, null, 'An old rule must never restore a banned user.');
    });

    await t.test('outsider, revoked member, inactive/banned accounts and cross-stable targets fail closed', () => {
      clone('identity');
      for (const user of [OUT, A]) {
        if (user === A) sql('identity', `delete from public.stable_members where user_id='${A}' and stable_id='${S}';`);
        expectError('identity', user, `select public.get_season_schedule('${user}','${S}');`, '42501');
        expectError('identity', user, weekly(user), '42501');
        assert.equal(sql('identity', caller(user, 'select count(*) from public.schedule_periods;')), '0');
      }
      expectError('identity', OWNER, `select public.get_season_schedule('${B}','${S}');`, '42501');
      expectError('identity', OWNER, weekly(OWNER, OUT, true), '42501');
      sql('identity', `insert into public.account_deletion_intents(user_id) values('${B}');`);
      expectError('identity', B, `select public.get_season_schedule('${B}','${S}');`, '42501');
      assert.equal(sql('identity', caller(B, 'select count(*) from public.assignments;')), '0');
      expectError('identity', OWNER, weekly(OWNER, B, true), '42501');
      sql('identity', `delete from public.account_deletion_intents where user_id='${B}'; update auth.users set banned_until='2200-01-01' where id='${B}';`);
      expectError('identity', B, weekly(B), '42501');
      expectError('identity', OWNER, weekly(OWNER, B, true), '42501');
    });

    await t.test('stale Repeatable Read cannot assign work after committed account deletion preparation', async () => {
      for (const mode of ['weekly', 'direct']) {
        const db = `intent_rr_${mode}`;
        clone(db);
        const row = assignment(db, '2099-01-07');
        const write = mode === 'weekly' ? weekly()
          : `update public.assignments set assignee_id='${A}',status='assigned',assigned_via='manual',updated_at=clock_timestamp() where id='${row.id}';`;
        const pending = asyncSql(db, `set application_name='${db}'; begin isolation level repeatable read;
          ${caller(A, 'select count(*) from public.assignments; select pg_sleep(0.6); ' + write)} commit;`);
        await waitForSleep(db, db);
        sql(db, `select public.prepare_account_deletion('${A}',null);`);
        const result = await pending;
        assert.notEqual(result.code, 0, 'A stale snapshot must never commit assignments after deletion preparation.');
        assert.match(result.error, /(40001|42501)/);
        assert.equal(sql(db, `select count(*) from public.assignments where assignee_id='${A}';`), '0');
      }
    });

    await t.test('membership and Auth deletion open future work, detach history and preserve owner-controlled empty rules', () => {
      for (const [db, removal] of [['member_cleanup', `delete from public.stable_members where user_id='${A}' and stable_id='${S}';`],
        ['account_cleanup', `select public.prepare_account_deletion('${A}',null); delete from auth.users where id='${A}';`]]) {
        clone(db); json(db, OWNER, weekly(OWNER, A, true)); const row = assignment(db);
        sql(db, `update public.assignments set date='2000-01-01',status='completed',completed_at='2000-01-01' where id='${row.id}';
          insert into public.assignment_history(assignment_id,stable_id,label,action) values('${row.id}','${S}','Bevarat','completed'); ${removal}`);
        assert.equal(sql(db, `select count(*) from public.assignments where assignee_id='${A}';`), '0');
        assert.equal(sql(db, `select count(*) from public.assignments where template_id='${TEMPLATE}' and date>'2099-01-01' and status='assigned';`), '0');
        assert.equal(sql(db, `select owner_controlled and assignee_id is null from public.schedule_weekly_assignments where template_id='${TEMPLATE}' and weekday=0;`), 't');
        assert.equal(sql(db, 'select count(*) from public.schedule_periods;'), '1'); assert.equal(sql(db, 'select count(*) from public.schedule_templates;'), '5');
        assert.equal(sql(db, 'select count(*) from public.assignments;'), '1825'); assert.equal(sql(db, 'select count(*) from public.assignment_history;'), '1');
        assert.equal(sql(db, `select status from public.assignments where id='${row.id}';`), 'completed');
      }
    });
    if (process.env.STABLEFLOW_SEASON_DB_RECEIPTS === '1') {
      clone('receipts', 'base');
      const values = [{ ...templates[0], end_time: null, instructions: '' }];
      const saved = json('receipts', OWNER, save(0, values, '2099-01-01', '2099-01-07'));
      const generated = json('receipts', OWNER, generate());
      const assigned = json('receipts', OWNER, weekly(OWNER, A, true));
      const read = json('receipts', A, `select public.get_season_schedule('${A}','${S}');`);
      const edited = occurrence('receipts', OWNER, assignment('receipts'), { label: 'Ett datum', time: '08:30', end_time: null, instructions: '' });
      const receipts = { saved, generated, assigned, read, edited };
      if (process.env.STABLEFLOW_SEASON_DB_RECEIPTS_PATH) await writeFile(process.env.STABLEFLOW_SEASON_DB_RECEIPTS_PATH, JSON.stringify(receipts, null, 2) + '\n');
      t.diagnostic('RPC_RECEIPTS ' + JSON.stringify(receipts));
    }
    t.diagnostic('No remote database access; tests exercised the migration on the complete existing schema.');
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
});
