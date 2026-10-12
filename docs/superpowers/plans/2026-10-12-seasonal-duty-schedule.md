# Seasonal duty schedule implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Owner-defined dated daily shifts, recurring member choices, owner priority and protected single-date changes, usable in the current Expo UI.

**Architecture:** Three normalized schedule tables generate existing assignments through authenticated, versioned PostgreSQL RPCs. A focused client library/hook drives one new screen while the existing provider keeps concrete duties, pagination and legacy workflows. No new packages, cron, purchases or publication.

**Tech Stack:** Expo 57, React Native, TypeScript, Supabase PostgreSQL, Node tests, existing Playwright offline harness.

## Shared contract

All RPCs return user_id and stable_id matching the authenticated request. All inputs include p_expected_user_id and p_stable_id. Errors begin [season schedule]. Dates ISO, weekdays Monday=0, times HH:MM.

- get_season_schedule: returns periods[], templates[], weekly_assignments[].
- save_schedule_period: p_period_id UUID (client-generated, replayable), p_expected_revision (0=new), p_name, p_date_from, p_date_to, p_templates JSON [{id,name,start_time,end_time,instructions,sort_order,archived}]. Returns period. Status generating; owner only. Definition edits preview before confirmation.
- generate_schedule_batch: p_period_id, p_expected_revision; returns period, changed_count (0..365), total_count, generated_count. Repeated calls converge; status ready only after full DB coverage and snapshot sync. Future archived/out-of-range non-overrides removed, completed/history/started/overrides untouched.
- set_schedule_weekly_assignment: p_template_id, p_weekday, p_effective_from, p_assignee_id (nullable), p_owner_controlled, p_expected_revision (latest rule revision, 0 absent). Returns rule and updated_count. Max one weekday/year <=53 shifts per operation, server owns assignment changes. Owner priority across overlapping effective ranges; two late same-revision calls conflict. Member only self or own release; owner all eligible users.
- update_schedule_occurrence: p_assignment_id, p_expected_updated_at text, p_changes JSON {date,label,time,end_time,instructions,assignee_id,reset_override?}. Returns assignment. Owner content/any assignee, member only own one-date release or open claim. Preserve template_id/original_date; set override unless explicit reset. Completed/history/start protected.

Period: id,stable_id,name,date_from,date_to,revision,generation_revision,status,created_at,updated_at. Template: id,period_id,name,start_time,end_time,instructions,sort_order,archived. Rule: id,template_id,weekday,effective_from,assignee_id,changed_by_user_id,owner_controlled,revision. Assignment fields: templateId,originalDate,isScheduleOverride,updatedAt mapped from snake_case.

## Task 1: Database backend (database agent owns only migration + scripts/season-schedule-db.test.mjs)
- [ ] Write local PostgreSQL regressions for overlap/boundaries, arbitrary templates, resumable 365 chunks and >1000 assignments. Run RED with the migration absent.
- [ ] Create migration with supabase migration new seasonal_duty_schedule; implement tables, checked constraints, same-stable FK, uniqueness, RLS and the five RPCs above.
- [ ] Lock authenticated active account and membership; use fixed search_path and revoke public execution except intended authenticated RPCs. Serialise period/rule changes and compare revision.
- [ ] Prevent direct or legacy writes from bypassing authority, preserve ordinary claim/release/complete as single overrides, skip old series edit on template-linked duties. Cover account/member cleanup without history loss.
- [ ] Run local DB GREEN, concurrency/owner-empty/outsider/historical/one-off protections and self-review. Root deploys only after independent review.

## Task 2: Client/provider (root owns lib/seasonSchedule.ts, hooks/useSeasonSchedule.ts, context/AppDataContext.tsx, scripts/season-schedule.test.mjs)
- [ ] Add failing Node client tests for validation, receipt identity, pagination over 1000 and interrupted/replayed batches; run RED.
- [ ] Implement typed validation, scoped RPC timeouts, verified receipts, paged assignment loading; errors retain input and flag reload conflicts.
- [ ] Hook loads current stable schedule, rejects stale identity results, runs batches with progress, refreshes actual assignments after acknowledged completion.
- [ ] Provider maps three new fields/updatedAt, skips legacy defaults for seasonal assignments, and supports QA concrete occurrence hydration via existing reducer patterns.
- [ ] Run Node GREEN and TypeScript/lint before integration.

## Task 3: UI (UI agent owns app/season-schedule.tsx, components/SeasonOccurrenceModal.tsx, calendar/profile/member entry links, scripts/e2e/season-schedule.spec.mjs)
- [ ] Write failing offline UI scenarios before screen exists.
- [ ] Blue/white Figma-consistent responsive screen: empty summer state, period editor dates and dynamic daily shift rows with optional end/instructions, impact preview and generate/resume progress.
- [ ] Owner/member weekday cards show own/other/owner-controlled choices; date-effective changes and explicit owner unlock. One-date editor distinct from future weekday edit; archive/delete-template preview protects history.
- [ ] Add Schema Fasta pass and profile/member entry links; branch seasonal edits before legacy series modal. Preserve existing actions.
- [ ] Run targeted offline GREEN at 390px and desktop, screenshot and self-review.

## Task 4: Review, integration and release (root, fresh review agents)
- [ ] Spec review first, fix gaps, then quality/security review; do not deploy unresolved issues.
- [ ] Run all Node/DB tests, offline E2E, lint, TypeScript, web and iOS bundle export using Node24.
- [ ] Check live target zbcghmpjslasnxqcodqa and current schema; transactionally apply approved migration + migration history, verify RLS/RPCs with rolled-back isolated fixtures. Do not create real winter dates for IB.
- [ ] Commit only owned feature files, push codex branch, verify both CI checks, update draft PR2 and fast-forward clean original checkout; reload Expo 8081 and verify SDK57 manifest.
- [ ] Produce exact per-file diffs and a seven-step UI QA artifact, with honest separation of synthetic tests/live schema/phone acceptance.
