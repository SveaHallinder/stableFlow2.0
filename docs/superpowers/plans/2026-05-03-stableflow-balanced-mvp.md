# StableFlow Balanced MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move StableFlow from the current working app into a balanced MVP for daily stable operations plus horse journals.

**Architecture:** Build on the existing Expo Router app, Supabase persistence, and `AppDataContext` actions. Keep the current schema/feed/chat/paddock work, add focused domain modules for horse ownership, feed, horse profiles, care events, and role-prioritized Today views. Avoid a rewrite.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Supabase Auth/Postgres/RLS/Realtime, existing `npm test` node test gate, existing Expo lint/build tools.

---

## Product Decisions

- StableFlow is for all roles, but each role gets a relevant first view.
- Main navigation target: `Idag`, `Hästar`, `Schema`, `Feed`, `Chat`.
- `Idag` is role-prioritized:
  - Admin sees uncovered work, incomplete work, feed/hage gaps, alerts, invites.
  - Staff/medryttare sees my tasks, next task, available work, alerts.
  - Horse owner sees my horses, feed/status/hage, rides, care.
- Daily operations and horse journal both matter.
- Priority modules: schema/pass, feed, hage/status, riding/training.
- Feed/chat/alerts are separate communication levels.
- Notifications are medium priority: chat, assigned work, important alerts, own/responsible horses.
- Feed/checklist/todo expansion comes later.
- Documents, economy, full box/stable map, and advanced medical journal come later.

## Repo Context

Files already carrying most product logic:

- `context/AppDataContext.tsx`
  - `UserRole`, `StableMembership`, `Horse`, `HorseDayStatus`, `RideLogEntry`, `Paddock`
  - `resolvePermissions`
  - `actions.createAssignment`
  - `actions.updateHorseDayStatus`
  - `actions.upsertPaddock`
  - `actions.addRideLog`
  - `actions.sendConversationMessage`
  - `actions.createPrivateConversation`
- `context/AuthContext.tsx`
  - Supabase session and current user bootstrapping.
- `app/(tabs)/index.tsx`
  - Current overview. This should become the `Idag` role-prioritized dashboard.
- `app/(tabs)/_layout.tsx`
  - Current tabs. This needs the nav change.
- `app/(tabs)/calendar.tsx`
  - Existing schedule, recurring assignments, ride logs, arena bookings/status.
- `app/(tabs)/feed.tsx`
  - Existing posts, groups, comments, likes.
- `app/(tabs)/messages.tsx` and `app/chat/[id].tsx`
  - Existing chat list and chat detail.
- `app/paddocks/index.tsx`
  - Existing paddocks, horse day status, print.
- `app/admin/index.tsx`
  - Existing admin quick actions and invites.
- `app/members/index.tsx` and `app/members/[id].tsx`
  - Existing member list/detail/private chat.
- `app/stables/index.tsx`
  - Existing stable settings, horses, paddocks, ride types.
- `supabase/schema.sql`
  - Base schema and RLS. Must be kept in sync with live Supabase.
- `supabase/migrations/20250110_invite_codes.sql`
  - Invite-code behavior that live Supabase already needs.
- `supabase/staging_setup.sql`
  - Staging setup order.
- `scripts/staging-setup.test.mjs`
  - Current minimal reproducibility test.

## Guardrails

- No new dependency unless explicitly approved.
- No schema change in live Supabase unless explicitly approved.
- Add migrations for schema changes. Do not rely on dashboard-only SQL.
- Keep changes minimal and phase-based.
- Keep current web demo working after each phase.
- After each phase run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build:web
git diff --check
```

## Phase 0: Foundation And Reproducible Staging

**Goal:** Make repo, staging setup, and current app behavior trustworthy before adding new product surface.

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `supabase/staging_setup.sql`
- Modify: `scripts/staging-setup.test.mjs`
- Create: `supabase/migrations/20260503_sync_invite_validation.sql`
- Optional create: `supabase/seed_qa.sql`

- [ ] **Step 1: Sync invite validation in schema**

Use the current `validate_invite` from `supabase/migrations/20250110_invite_codes.sql` as the source of truth. `supabase/schema.sql` currently has older logic where a valid email can make an invalid code pass. Replace only that function block in `supabase/schema.sql`.

Expected behavior:

```text
validate_invite(invited_email, wrong_code) -> false
validate_invite(invited_email, valid_code) -> true
validate_invite(invited_email, null) -> true
```

Keep `null` allowed because stall-invite without code may still be useful for pending invited emails.

- [ ] **Step 2: Add migration for schema sync**

Create `supabase/migrations/20260503_sync_invite_validation.sql` with the same `create or replace function public.validate_invite(...)` block used in schema.

- [ ] **Step 3: Extend staging setup test**

Update `scripts/staging-setup.test.mjs` so it verifies:

```js
assert.match(schemaSql, /create or replace function public\\.validate_invite/);
assert.match(schemaSql, /upper\\(i\\.code\\) = v_code/);
assert.match(stagingSql, /supabase\\/schema\\.sql/);
assert.match(stagingSql, /supabase\\/storage_policies\\.sql/);
```

- [ ] **Step 4: Add QA seed plan**

Create a documented QA seed path for:

- admin owner
- staff/edit
- horse owner
- medryttare/responsible
- guest/view

If Supabase Auth email confirmation blocks UI QA, use a staging-only documented manual step or SQL seed for confirmed users. Do not hide this as app logic.

- [ ] **Step 5: Verify foundation**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build:web
git diff --check
```

Expected: all pass.

## Phase 1: Navigation And Role-Prioritized Idag

**Goal:** Make first screen answer "what needs to happen now?" for each role.

**Files:**
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `components/DesktopNav.tsx`
- Modify: `context/AppDataContext.tsx`
- Optional create: `lib/today.ts`

- [ ] **Step 1: Rename tab labels**

Change bottom tabs to:

```text
Idag
Hästar
Schema
Feed
Chat
```

Keep route paths stable where possible to avoid breaking deep links. If route files need aliases, use Expo Router redirects or new wrapper routes rather than moving large files first.

- [ ] **Step 2: Add Today derivation helper**

Create `lib/today.ts` if `app/(tabs)/index.tsx` becomes too large. It should derive:

- `myTasksToday`
- `openTasksToday`
- `overdueTasks`
- `incompleteFeedChecks`
- `horseStatusGaps`
- `importantAlerts`
- `myHorseSummaries`

Inputs should be plain `AppDataState` plus current user id and current stable id.

- [ ] **Step 3: Role-prioritize sections**

In `app/(tabs)/index.tsx`, order sections by role:

```text
admin owner:
  1. Stallstatus
  2. Saknar ansvarig
  3. Ej klart
  4. Foder/hage saknas
  5. Alerts

staff/rider:
  1. Mina uppgifter
  2. Nästa pass
  3. Lediga pass
  4. Alerts

horse owner:
  1. Mina hästar
  2. Foder/status/hage
  3. Ridning/vård
  4. Alerts
```

- [ ] **Step 4: Add empty states**

Required empty states:

- no tasks: `Inget att göra just nu.`
- no horse linked: `Du har ingen häst kopplad ännu.`
- no stable data: `Slutför setup för att se dagens stallstatus.`
- missing permission: `Du kan läsa detta, men inte ändra.`

- [ ] **Step 5: Verify Today UX**

Manual QA:

1. Login as admin. Confirm stallstatus appears first.
2. Login as staff/medryttare. Confirm my tasks appears first.
3. Login as horse owner. Confirm my horses appears first.
4. Confirm old feed/chat/calendar links still work.

## Phase 2: Horse Module

**Goal:** Add a central horse list/profile so the app feels like a real stable app, not only schedule plus feed.

**Files:**
- Create: `app/(tabs)/horses.tsx`
- Create: `app/horses/[id].tsx`
- Optional create: `components/HorseSummaryCard.tsx`
- Optional create: `components/HorseJournalSection.tsx`
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `context/AppDataContext.tsx`
- Modify: `app/stables/index.tsx`
- Modify: `app/admin/index.tsx`
- Modify: `app/(onboarding)/horses.tsx`

- [ ] **Step 1: Add horse list route**

`app/(tabs)/horses.tsx` should show:

- all horses user can see in current stable
- filter chips: `Alla`, `Mina`, `Ansvar`
- status summary: hage, day/night status, feed state placeholder, next ride/care placeholder

- [ ] **Step 2: Add horse profile route**

`app/horses/[id].tsx` should show first:

- Dagens status
- Foderplan placeholder until Phase 3
- Ridning/träning from `state.rideLogs`
- Vård placeholder until Phase 5
- Ägare/ansvariga

- [ ] **Step 3: Model owner plus responsible users**

Current `Horse` has `ownerUserId`. Add responsible relationships without replacing owner:

```ts
export type HorseResponsibility = {
  id: string;
  stableId: string;
  horseId: string;
  userId: string;
  kind: 'medryttare' | 'staff' | 'trainer' | 'other';
  canLogRide: boolean;
  canUpdateDailyStatus: boolean;
  canSuggestPlanChanges: boolean;
};
```

Persist with a new Supabase table in a dedicated migration after approval:

```sql
create table if not exists public.horse_responsibilities (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  kind text not null default 'other',
  can_log_ride boolean not null default true,
  can_update_daily_status boolean not null default true,
  can_suggest_plan_changes boolean not null default true,
  created_at timestamptz default now(),
  unique (horse_id, user_id)
);
```

- [ ] **Step 4: Add permissions helper**

In `context/AppDataContext.tsx`, add helpers:

```ts
function isHorseOwner(state: AppDataState, horseId: string, userId: string) {
  return state.horses.some((horse) => horse.id === horseId && horse.ownerUserId === userId);
}

function isHorseResponsible(state: AppDataState, horseId: string, userId: string) {
  return state.horseResponsibilities.some(
    (item) => item.horseId === horseId && item.userId === userId,
  );
}
```

If `AppDataContext.tsx` grows too much, move pure derivations to `lib/horseAccess.ts`.

- [ ] **Step 5: Verify horse module**

Manual QA:

1. Admin opens `Hästar` and sees all horses.
2. Horse owner opens `Hästar` and sees owned horse first.
3. Medryttare opens `Hästar` and sees responsible horse.
4. Horse profile opens from list and Today.

## Phase 3: Feed

**Goal:** Support both simple stable-wide feed defaults and per-horse overrides without making daily work complicated.

**Files:**
- Modify: `context/AppDataContext.tsx`
- Create: `app/horses/[id]/feed.tsx` or integrate into `app/horses/[id].tsx`
- Create: `supabase/migrations/20260503_feed_plans.sql`
- Modify: `supabase/schema.sql`
- Modify: `scripts/staging-setup.test.mjs`

- [ ] **Step 1: Add feed plan types**

Add types:

```ts
export type FeedSlot = 'morning' | 'lunch' | 'evening';

export type FeedPlanItem = {
  id: string;
  stableId: string;
  horseId?: string;
  slot: FeedSlot;
  label: string;
  amount?: string;
  note?: string;
  isStableDefault: boolean;
  active: boolean;
};

export type FeedCheck = {
  id: string;
  stableId: string;
  horseId: string;
  date: string;
  slot: FeedSlot;
  checkedByUserId?: string;
  checkedAt?: string;
  deviationNote?: string;
};
```

- [ ] **Step 2: Add migration**

Add tables:

```sql
create table if not exists public.feed_plans (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade,
  slot text not null,
  label text not null,
  amount text,
  note text,
  is_stable_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.feed_checks (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade not null,
  date date not null,
  slot text not null,
  checked_by_user_id uuid references public.profiles(id) on delete set null,
  checked_at timestamptz,
  deviation_note text,
  created_at timestamptz default now(),
  unique (horse_id, date, slot)
);
```

RLS:

- stable members can read
- horse owner can update own horse feed plan
- owner/admin/edit can update stable defaults
- staff/rider responsible users can insert/update feed checks

- [ ] **Step 3: Add actions**

Add actions:

```ts
upsertFeedPlan(input: UpsertFeedPlanInput): ActionResult<FeedPlanItem>
deleteFeedPlan(feedPlanId: string): ActionResult
upsertFeedCheck(input: UpsertFeedCheckInput): ActionResult<FeedCheck>
```

- [ ] **Step 4: Add UI**

Horse profile feed section:

- stable default summary
- per-horse override list
- owner edit controls
- staff read-only controls

Today feed section:

- current slot cards
- check button
- deviation note button

- [ ] **Step 5: Verify feed**

Manual QA:

1. Admin sets stable default morning feed.
2. Horse owner sets override for one horse.
3. Staff sees concrete instructions for current slot.
4. Staff checks feed done.
5. Horse profile shows feed check history.

## Phase 4: Hagar, Status, And Riding

**Goal:** Make paddocks/status and riding usable from both daily operations and horse history.

**Files:**
- Modify: `app/paddocks/index.tsx`
- Modify: `app/horses/[id].tsx`
- Modify: `app/(tabs)/calendar.tsx`
- Modify: `context/AppDataContext.tsx`
- Optional create: `lib/horseStatus.ts`

- [ ] **Step 1: Keep two synced paddock views**

Existing `HorseDayStatus` already has:

```ts
dayStatus?: 'in' | 'out';
nightStatus?: 'in' | 'out';
checked?: boolean;
water?: boolean;
hay?: boolean;
```

Extend the UI so:

- horse profile can update today's status for that horse
- paddock page can update status by paddock
- both use `actions.updateHorseDayStatus`

- [ ] **Step 2: Add paddock assignment history**

If current `Paddock` only stores `horseNames`, keep it for print compatibility. Add a relationship table later if history needs exact horse ids:

```sql
create table if not exists public.paddock_assignments (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  paddock_id uuid references public.paddocks(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade not null,
  date date not null,
  created_at timestamptz default now(),
  unique (paddock_id, horse_id, date)
);
```

Use this only after confirming print/current behavior stays stable.

- [ ] **Step 3: Improve riding**

Existing `RideLogEntry` supports free log. Add planned ride support as assignment subtype or dedicated planned ride table.

Recommended minimal path:

- use `assignments` with a new category/type field only if schema already supports it cleanly
- otherwise add `planned_rides`

Dedicated table option:

```sql
create table if not exists public.planned_rides (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade not null,
  rider_user_id uuid references public.profiles(id) on delete set null,
  date date not null,
  time text,
  ride_type_id text,
  note text,
  status text not null default 'planned',
  completed_ride_log_id uuid references public.ride_logs(id) on delete set null,
  created_at timestamptz default now()
);
```

- [ ] **Step 4: Verify status and riding**

Manual QA:

1. Set horse in/out status from horse profile.
2. Confirm paddock page reflects status.
3. Set status from paddock page.
4. Confirm horse profile reflects it.
5. Create planned ride.
6. Mark planned ride done and confirm ride log appears.

## Phase 5: Care Events And External Contacts

**Goal:** Support hovslagare/vet/vård as calendar events that become horse history, without requiring external accounts.

**Files:**
- Modify: `context/AppDataContext.tsx`
- Modify: `app/(tabs)/calendar.tsx`
- Modify: `app/horses/[id].tsx`
- Modify: `app/admin/index.tsx`
- Create: `app/contacts/index.tsx`
- Create: `supabase/migrations/20260503_care_events_contacts.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Add contact types**

```ts
export type ExternalContactType = 'farrier' | 'vet' | 'trainer' | 'therapist' | 'other';

export type ExternalContact = {
  id: string;
  stableId: string;
  name: string;
  type: ExternalContactType;
  phone?: string;
  email?: string;
  note?: string;
};

export type CareEventType = 'farrier' | 'vet' | 'vaccination' | 'dental' | 'treatment' | 'other';

export type CareEvent = {
  id: string;
  stableId: string;
  horseIds: string[];
  type: CareEventType;
  title: string;
  date: string;
  time?: string;
  contactId?: string;
  responsibleUserId?: string;
  status: 'planned' | 'done' | 'cancelled';
  note?: string;
  completedAt?: string;
};
```

- [ ] **Step 2: Add migration**

```sql
create table if not exists public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  name text not null,
  type text not null,
  phone text,
  email text,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.care_events (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_ids uuid[] not null default '{}'::uuid[],
  type text not null,
  title text not null,
  date date not null,
  time text,
  contact_id uuid references public.external_contacts(id) on delete set null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'planned',
  note text,
  completed_at timestamptz,
  created_at timestamptz default now()
);
```

- [ ] **Step 3: Add calendar integration**

Care events should show in `Schema` with filter `Vård`.

Actions:

- create care event
- mark done
- cancel
- add completion note

- [ ] **Step 4: Add horse profile care section**

Show:

- upcoming care events
- completed care history
- empty state: `Ingen vårdhistorik ännu.`

- [ ] **Step 5: Verify care**

Manual QA:

1. Add vet contact.
2. Create care event for one horse.
3. Confirm event appears in Schema and horse profile.
4. Mark done with note.
5. Confirm it moves to horse care history.

## Phase 6: Communication And Alerts

**Goal:** Separate social feed, important alerts, and chat.

**Files:**
- Modify: `context/AppDataContext.tsx`
- Modify: `app/(tabs)/feed.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/messages.tsx`
- Modify: `supabase/functions/send-push-notification/index.ts`
- Create: `supabase/migrations/20260503_alerts.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Add alert type**

```ts
export type StableAlert = {
  id: string;
  stableId: string;
  title: string;
  body?: string;
  severity: 'info' | 'important' | 'urgent';
  horseId?: string;
  paddockId?: string;
  assignmentId?: string;
  createdByUserId: string;
  createdAt: string;
  resolvedAt?: string;
};
```

- [ ] **Step 2: Add alerts migration**

```sql
create table if not exists public.stable_alerts (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  title text not null,
  body text,
  severity text not null default 'info',
  horse_id uuid references public.horses(id) on delete set null,
  paddock_id uuid references public.paddocks(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
```

- [ ] **Step 3: Add alert UI**

`Idag`:

- important/urgent alerts near top
- resolve button for users with edit access

`Feed`:

- do not mix alerts into normal posts by default
- optionally show a compact `Viktigt` strip

- [ ] **Step 4: Add notification behavior**

Medium notification rules:

- chat messages
- assignment assigned to me
- important/urgent alerts
- care/feed deviation for own/responsible horse

Do not notify for:

- normal feed likes
- normal feed comments unless mentioned later
- every normal feed post

- [ ] **Step 5: Verify communication**

Manual QA:

1. Create normal feed post. Confirm it stays social.
2. Create important alert. Confirm it appears on `Idag`.
3. Resolve alert. Confirm it leaves active list.
4. Send chat. Confirm chat still works.

## Suggested Work Order For Cursor/Claude

Use one branch per phase:

```bash
git checkout -b codex/foundation-staging
git checkout -b codex/today-navigation
git checkout -b codex/horse-module
git checkout -b codex/feed-module
git checkout -b codex/horses-status-riding
git checkout -b codex/care-contacts
git checkout -b codex/alerts-communication
```

Preferred commit rhythm:

```text
test: add gate for phase behavior
feat: add schema and types
feat: add context actions
feat: add UI surface
test: verify phase flow
```

## Definition Of Done For Balanced MVP

- Web build passes.
- Typecheck passes.
- Lint passes.
- Minimal tests pass.
- Staging DB can be recreated from repo docs and migrations.
- Admin, staff/medryttare, horse owner, and guest can log in on staging.
- `Idag` changes priority by role.
- Horse profile shows today's status, feed plan, riding, care, owner/responsible users.
- Feed plan supports stable default and per-horse override.
- Staff can check feed without editing permanent plan.
- Horse owner can edit own horse feed plan.
- Paddock status works from horse and paddock views.
- Planned and free ride logging works.
- Care event can be created, completed, and shown in horse history.
- Feed, alert, and chat are visibly separate.

## QA Script

1. Create or seed admin, staff, horse owner, medryttare, and guest.
2. Login as admin and confirm `Idag` prioritizes stall status and uncovered work.
3. Login as staff/medryttare and confirm `Idag` prioritizes my tasks and available work.
4. Login as horse owner and confirm `Idag` prioritizes my horses.
5. Set stable default feed, add per-horse override, check feed as staff, verify horse history.
6. Update hage/status from horse profile and paddock page, verify both views sync.
7. Plan ride, mark done, verify ride log on horse.
8. Create care event with external contact, mark done, verify care history.
9. Create feed post, important alert, and chat message, verify each appears in the right place.

## Known Risks

- `context/AppDataContext.tsx` is already large. Keep pure derivations in `lib/*` when possible.
- Supabase email confirmation can block member E2E. Solve with staging seed or staging auth setting, not app hacks.
- Schema changes must be approved before applying to live Supabase.
- Navigation changes can break deep links. Prefer wrapper routes or aliases when possible.
- Paddock currently stores `horseNames`; exact historical horse-id assignment needs a relationship table.
- Notification changes touch Edge Functions and database triggers. Test web first, then native/internal build.
