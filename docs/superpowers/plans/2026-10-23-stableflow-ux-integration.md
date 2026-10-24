# StableFlow UX Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Work on disjoint owned files; shared component contracts are defined below.

**Goal:** Integrate the approved design-preview into the real Expo app while preserving authenticated data, actions, access checks, routes and recovery behavior.

**Architecture:** Reuse AppDataContext and existing screen actions. Update shared visual primitives and navigation first, then recompose existing screen presentation around those actions. No schema, dependencies, seeded example content in production UI or external publication.

**Tech Stack:** Expo Router, React Native/Web, existing Ionicons, Inter, react-native-svg, existing Node tests and TypeScript.

## Shared contract

Use existing theme.colors.surface/background/primaryText/secondaryText/border/surfaceMuted. Backgrounds are white or neutral #F5F5F5. Primary controls use white, 1px neutral border and dark text. Brand #0099FF remains logo/link/small accent only. Root will add `components/AppIcon.tsx`: `{name: 'home'|'horse'|'calendar'|'feed'|'chat'|'stable', size?:number, color?:ColorValue, focused?:boolean}`. Do not depend on this component until root announces it exists. Existing ScreenHeader and Card signatures remain compatible.

### Task 1: Shared presentation and navigation (root)

Files: design/tokens.ts, design/system.ts, components/theme.ts, components/Primitives.tsx, components/ScreenHeader.tsx, components/DesktopNav.tsx, components/StableSwitcher.tsx, app/(tabs)/_layout.tsx, app/(tabs)/profile.tsx, new components/AppIcon.tsx.

- [x] Set true white background, neutral borders and readable button treatments without changing brand color semantics used by data/status.
- [x] Use Ionicons outline/filled navigation and original geometric horse SVG; five tabs Idag/Hästar/Schema/Flöde/Chatt, hide Profile from tab bar while preserving route.
- [x] Add profile/avatar entry at root screens, keep account deletion/security and default/weekly passes reachable. Mitt stall links to existing admin/member/stable routes with permission-aware access.
- [x] Keep 44px touch targets and safe-area padding; sidebar on desktop, unboxed bottom icons on mobile.
- [x] Verify navigation and account access with UI and focused source behavior tests where routing changes.

### Task 2: Today workspace (root)

Files: app/(tabs)/index.tsx; retain lib/today.ts selectors and callback behavior unless a functional defect requires a regression test.

- [x] Lead with actual next own assignment, open staffing gap and compact weather sourced from existing useWeather/current stable location.
- [x] Reorder today's agenda and near-to-hand links; keep feeding/check/deviation/status, alerts, history, posts/messages and retries reachable through existing handlers.
- [x] Replace overlapping/duplicated prominent blocks with progressive detail; never insert prototype names/counts or fake weather.
- [x] Preserve current-stable isolation, disabled/loading/error states and existing functional tests.

### Task 3: Onboarding and Mitt stall (agent onboarding)

Owned: app/(onboarding)/*, components/OnboardingShell.tsx, app/admin/index.tsx, scoped onboarding/admin tests; optional new lib/onboarding-flow.ts + focused tests.

- [x] Recompose as Upplägg / Ditt stall / Hästar / Första passet with a visible current step and one primary next action. Reuse existing create-stable/farm/arena/horse/calendar actions and saved completion gates.
- [x] Explicitly surface single stable versus farm choice, including when registration already created the first stable. Preserve existing stable and avoid duplicate creation.
- [x] Use visible labels and preserve draft/save recovery; birth year stays optional; invitations stay optional; invited members avoid owner forms.
- [x] Finish into Idag consistently on web/native.
- [x] Present Mitt stall as grouped task links and one selected form at a time; preserve create/invite/horse quick actions with their existing validation/errors. Remove native-only admin presentation restriction while keeping real authorization checks.
- [x] Add minimal tests for changed onboarding destination/step selection and native access guards; run related existing tests.

### Task 4: Horses, feed and conversations (agent daily)

Owned: app/(tabs)/stable-horses.tsx, app/horses/[id].tsx, app/(tabs)/feed.tsx, app/(tabs)/messages.tsx, app/messages/*, components/Post.tsx and scoped tests.

- [x] Compact searchable horse list, focused profile with Overview/Foder/Ridning/Vård sections and existing actual owner/box/status/feed/care actions retained.
- [x] Clean feed composer, posts and conversation list/thread styling. Preserve images, participants, read state, retries, reports, comments and all permission checks.
- [x] Use shared visual contract, real empty states and readable type. Keep secondary actions accessible in focused details/menus, not removed.
- [x] Verify horse/feed/chat tests and TypeScript for owned files.

### Task 5: Calendar and schedule forms (agent calendar)

Owned: app/(tabs)/calendar.tsx, app/season-schedule.tsx, components/NewAssignmentModal.tsx, components/SeasonOccurrenceModal.tsx, components/RecurringSeriesModal.tsx and scoped calendar tests.

- [x] Clear category/date/filter hierarchy, agenda rows and neutral selected-day treatment matching preview.
- [x] Keep all real categories, owner allocation, recurring/season periods, owner precedence, member claims, overrides, pending invites behavior, save errors and batch constraints.
- [x] Restyle focused pass/detail/season dialogs; no schema/actions/security model changes. Preserve functional callback names expected by existing behavior tests where possible.
- [x] Run calendar scheduling/recurring/season/assignment tests.

### Task 6: Integration verification and delivery (root + reviewers)

- [x] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:web`; fix introduced failures, identify pre-existing failures separately.
- [x] Start app on localhost:8081 using current workspace. Verify actual authenticated UI if browser session exists; otherwise use existing bounded QA-demo mechanism and label it as demo evidence. Do not create/alter real accounts or send invitations for visual QA.
- [x] Browser-check five main views, horse profile, owner onboarding, Mitt stall, and profile at mobile and desktop widths; verify no overflow. Role and current-stable boundaries are covered by behavior tests; UI session uses the actual owner.
- [x] Review final diff for function preservation and neutral fills. Do not describe browser emulation as physical Expo Go testing.
- [x] Commit/push integration branch; create per-file git diffs, screenshots and QA steps. No merge or external publication.

## QA script

1. Log in/open existing test session; check Idag, next own pass, weather and open gap using current stable data.
2. Navigate all five tabs and open profile via avatar; confirm account, default passes and Mitt stall remain reachable.
3. Search/open a horse; check profile, feed plan, riding and care without saving unwanted changes.
4. Open Schema and switch categories/date/Mina/Lediga; open a pass and verify responsible member, recurring options, cancel/save error recovery.
5. Open owner onboarding; check farm/stable choice, existing-stable reuse, Back behavior and completion into Idag. Check invited member does not see owner forms.
6. Open Mitt stall on mobile/desktop; verify invitation/member/settings access follows the actual role, and separate forms open one at a time.
7. Open feed and a conversation; inspect composer, images, read/error states and cancel without sending anything.

## Verification receipt

- 2026-10-24: 957/957 Node tests, Expo lint, TypeScript and Expo web export passed. Full tests require local-socket permission for disposable PostgreSQL and HTTP fixtures; no shared database is used.
- Actual authenticated owner UI read: five tabs, horse/profile, calendar detail, new-pass selected future date, feed composer, chat, profile, Mitt stall and saved onboarding.
- Responsive UI: 320 px resource/Today views have no horizontal document overflow; 390 px main screens and 1280 px sidebar/layout reviewed.
- Review fixes: Today agenda chronological order, feed disclosure errors and busy state, resource draft-preserving Back route, arbitrary empty-week browsing, named onboarding controls.
- A transient browser auth refresh transport error occurred before a successful reload/live hydrate; no auth code change or guaranteed network fix is claimed.
- Physical iOS/Android Expo Go and real signup/invitation delivery are outside this visual integration acceptance.
