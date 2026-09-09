# StableFlow — staging/test setup runbook

Target project: **`zbcghmpjslasnxqcodqa`** (reusing existing dev project).
Goal: get the **real backend flow** working so other stable owners can test with their own stable.

Legend: 🧑 = you run it (needs login/secret/dashboard) · 🤖 = Claude runs it.

---

## Phase 1 — Connect the CLI  🧑
Run in your terminal (not pasted into chat — keeps secrets out):

```bash
supabase login                                   # opens browser, authorizes
supabase link --project-ref zbcghmpjslasnxqcodqa # enter the DB password when asked
supabase migration list                          # paste the output back to Claude
```

`migration list` shows which migrations are already applied remotely vs pending. That tells us
exactly what to apply (no guessing, no clobbering).

## Phase 2 — Bring the DB up to date  🤖 (after Phase 1)
Based on `migration list`, Claude applies the pending migrations (`supabase db push`, or the
specific SQL). Then the Vault secret for push (`staging_setup.sql` lines 22-30) — needs your
service-role key, so that one is 🧑.

## Phase 3 — Auth config (dashboard)  🧑
Supabase dashboard → Authentication → URL Configuration:
- Add redirect URLs: `stableflow://confirm`, `stableflow://reset`
- Note the **Confirm signup** email template format (`{{ .ConfirmationURL }}`) — Claude needs to
  know if it sends `#access_token=` (legacy) or `?code=`/`token_hash` (modern) to fix `confirm.tsx`.
- Decide: email confirmation ON (real) or OFF (faster pilot).

## Phase 4 — QA test users + seed  🧑+🤖
The real-backend Playwright suite (`staging-qa.spec.mjs`) needs 5 confirmed users (password
`QaTest1234!`):
`stableflow-{admin,staff,owner,rider,guest}@example.test`
- 🧑 Create them: dashboard → Authentication → Add user (check "Auto Confirm User") ×5.
- 🤖 Then Claude runs `seed_qa.sql` to wire their memberships/data.

## Phase 5 — Verify the real flow  🤖
- `npm run test:e2e` against staging (`staging-qa.spec.mjs`) → must go green.
- Fix the 3 backend-dependent bugs the audit found (optimistic onboarding writes, arena gate
  loop, confirm.tsx token format) — now reproducible with a real backend.
- Real manual smoke: signup → confirm → create stable → onboard → daily use.

## Phase 6 — Full pilot (edge functions)  🧑+🤖
For invites/push/account-deletion to work:
- 🤖 `supabase functions deploy send-invite delete-account send-push-notification`
- 🧑 `supabase secrets set RESEND_API_KEY=… INVITE_FROM_EMAIL=… APP_URL=…`

Only after Phase 5 is green do we invite real pilot stable owners.
