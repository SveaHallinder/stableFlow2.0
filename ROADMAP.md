# StableFlow 2.0 — Roadmap till färdig produkt

> Genererad 2026-06-13 från en full plattformsaudit (11 agenter, hela kodbasen läst per subsystem).
> Status idag: **visuellt färdig, funktionsbred MVP — ~57% mot kommersiell launch.**

## Produktvision (målet)
En multi-tenant SaaS (iOS/Android/Web) för stallhantering i Sverige/EU. En stallägare kan
self-serve skapa stall (gård → stall → ridhus → hagar → hästar → medlemmar), bjuda in
personal & hästägare via e-post med rollbaserad åtkomst, och driva den dagliga driften från
en rollanpassad "Idag"-dashboard: återkommande pass med open/claim/complete live delat mellan
personalens enheter, foderplaner med daglig avprickning, dag/natt-status, planerade
ridpass + ridloggar, vårdhändelser (hovslagare/veterinär) med påminnelser. Plus stall-scopat
socialt flöde med grupp-privacy & moderering, realtidschatt, viktiga-alerts med push,
sök, och full kontohantering under GDPR. Säljs som prenumeration till stall & ridskolor.

## Var vi står (completeness per subsystem)
| % | Subsystem |
|---|---|
| 68 | Today / "Idag"-dashboard |
| 68 | Stall, medlemmar, admin, profil, settings, sök |
| 62 | Auth & Onboarding |
| 62 | Feed, socialt & alerts |
| 58 | Hästar, hagar & vård |
| 58 | Backend: schema, RLS, migrationer, push |
| 58 | Designsystem, cross-platform & kvalitet |
| 52 | Datalager (AppDataContext) |
| 52 | Kalender & schemaläggning |
| 42 | Meddelanden & chatt |

## Tre klasser av launch-blockers (återkommer i nästan alla subsystem)
1. **Säkerhet/integritet i RLS** — vilken medlem som helst kan idag skriva om stall-settings/join_code; "privata" gruppinlägg läsbara av alla; profiles_select läcker allas telefonnummer (GDPR); chatt-historik kan enumereras.
2. **Tyst dataförlust** — nästan alla skrivningar är fire-and-forget med bara `console.warn`, ingen rollback. UI:t säger "sparat" fast DB:n aldrig ändrades. Allvarligt för ett verktyg där man matar/medicinerar hästar.
3. **Brutna kärnloopar** — ingen self-serve stallskapande (signup hårt gated på inbjudningskod), inbjudningar levereras aldrig till mottagaren, realtid finns bara för meddelanden → delade pass-tavlan är inaktuell & dubbelclaim-bar.

---

## Faser

### Fas 0 — Säkerhet & RLS-härdning  `[L]`  *(launch-blocker, görs först)*
Stäng varje server-side auktoriserings-, integritets- och secrets-hål så klienten inte längre är säkerhetsgränsen.
- Begränsa `stables_update` till owner/can_edit_stable (inte vilken medlem som helst); skydda join_code-rotation.
- Skriv om `posts_select` så group_ids respekteras; fixa group-filter i `loadMorePosts`.
- [x] Smalna av `profiles_select` (PII/telefon) — 2026-06-15. `profiles`-bas-tabell self-only RLS; co-member namn/avatar/location via SECURITY DEFINER-RPC `get_member_directory()` (phone maskas → bara self eller admin i delat stall); klientens bulk-load repointad till RPC:n; phone-rad gated i medlemsprofil-UI. Migration `20260615_fas0b_profiles_pii.sql` + schema.sql-spegel. Gates: tsc/lint/39 tester gröna. KAN EJ runtime-verifieras autonomt (qaDemo kringgår Supabase/RLS) → staging-spec: `supabase/tests/rls_profiles_pii.sql`. KRÄVER DEPLOY + Svea-verifiering på staging.
- Fixa `conversation_members_insert` (bara egna/inbjudna konversationer); RPC för deltagarnamn; UPDATE/DELETE-policy på messages för moderering.
- Kolumn/operation-scoping på `can_claim_assignments` (rider får bara claim/decline).
- Flytta service-role-nyckeln från plaintext GUC till Supabase Vault/edge secrets.
- Audita varje `persist*`-väg: bekräfta att RLS oberoende enforce:ar stall + roll.

### Fas 1 — Skriv-korrekthet & datatillit  `[L]`
Eliminera tyst dataförlust — UI:t får aldrig rapportera success när DB:n inte ändrades.
- [x] Felvisning på ALLA fire-and-forget-skrivningar: `reportPersistError` (debounced toast) på 13 säkerhetskritiska + ref-mönster (`reportPersistErrorRef`) på resten (paddock/häst/kontakt/grupp/gård/stall/medlem/inbjudan/profil/dagsnotis/arena/alert/standardpass/inlägg/kommentar/meddelande) — 2026-06-13, codex: inga problem. Läs/sekundär-warns lämnade medvetet. KVAR: rollback/resync, STATE_HYDRATE merge-by-id.
- Visa skrivfel för användaren (toast + failed-state) istället för bara console.warn.
- [FLAGGAD: risk] Fixa `STATE_HYDRATE` att merga per id/updated_at + blockera refresh medan skrivningar pågår. → Riskabel core-reducer-ändring som inte kan runtime-verifieras autonomt; rekommenderas göras med staging + manuell test. Skippad av loopen.
- [x] Fixa admins post-radering (no-op): posts_delete RLS = författare ELLER can_manage_groups + rows-affected-koll (0 rader → fail+rollback) — 2026-06-13, codex: inga findings.
- [x] Last-owner-guard i updateMemberRole + removeMemberFromStable (countStableOwners blockerar demote/remove av sista ägaren) — 2026-06-13, codex: bara teoretisk same-tick-race (ej reellt UI-flöde), dokumenterad.
- [FLAGGAD: produktbeslut + schema] Ersätt namn-baserad hage↔häst-länk med häst-ID. → Kräver: bygga om UX från fritext-namn till häst-väljare, schema-migration (horse_ids på paddocks) + backfill, och produktbeslut (tillåts oregistrerade hästar i hage?). Skippad av loopen — för Svea.

### Fas 2 — Stäng kärnlooparna (acquisition, inbjudningar, realtid)  `[XL]`
Få tillväxt- och multiuser-looparna att fungera end-to-end.
- [x] Self-serve owner-signup som skapar stall (2026-06-13: 'create'/'join'-intent i auth, återupplivad pendingOwnerStable bunden till e-post, onboarding tar vid). Codex-reviewad.
- [x] Invite-leverans: `send-invite` edge function (Resend, env-gated) + `on_invite_created`-trigger + 14-dagars expiry på invites (2026-06-13, codex-reviewad: per-rad-unik kod, e-post-centrerad acceptans, enqueue-fel kan ej abortera insert). KVAR: admin-synlig inbjudningslista; server-validering single-use; RESEND_API_KEY-deploy.
- [x] Email-confirmation: confirmCard ("kolla mejl" + skicka-igen via auth.resend) + emailRedirectTo='stableflow://confirm' + ny confirm.tsx deep-link-route som sätter session (2026-06-13, codex bekräftade resend-API-form; edge-cases self-verifierade).
- Aktivera Supabase realtime-publication för messages; realtid (eller server-authoritative claim) för assignments & stable_alerts.
- Persistent unread/read (per-member last_read_at); fixa privat-chatt-namn + dedup-race.

### Fas 3 — UGC-säkerhet, kontolivscykel & store-compliance  `[L]`
Möt App Store / Google Play + EU-legala krav för en UGC + persondata-produkt.
- [x] Moderering: [x] rapportera inlägg + [x] rapportera kommentarer + [x] admin removal-kö (app/admin/reports.tsx) + [x] blockera/tysta användare (2026-06-15: blocked_users-tabell + own-row RLS, state/hydration/reducer, blockUser/unblockUser optimistiskt + rollback, createPrivateConversation-guard, feed-post+kommentar-filter, chatt-meddelande-filter, konversationslista-filter, Blockera-knapp i medlemsprofil. Gates: tsc/lint/39 tester gröna. KVAR: server-side message-insert-enforce (flaggad, kräver conversation-membership-modell); KRÄVER DEPLOY: applicera 20260615_fas3_blocked_users.sql).
  - OBS: removal-kön self-reviewad (codex rate-limited vid commit); rekommenderas codex-granskas när limit återställts.
- [x] Kontohantering: byt lösenord + byt e-post + radera konto (GDPR). Radera = `delete-account` edge fn (verifierar caller-JWT, blockerar ensam-ägare med fler medlemmar, fail-closed på guard-fel, auth.admin.deleteUser → cascade) + två-stegs danger-card i settings/account. 2026-06-13, codex: caller-identitet säker, fixade fail-open-guard. KVAR: dataexport (nice-to-have). KRÄVER DEPLOY: deploya delete-account edge fn.
- Rate limiting / abuse-skydd på inlägg, kommentarer, likes, alerts, meddelanden.
- Wire EAS: riktig projectId, updates.url, eas.json submit-credentials; synka app-version.
- Cleanup av döda push-tokens (läs Expo-receipts, radera DeviceNotRegistered).

### Fas 4 — Schemaläggnings-djup & domän-komplett  `[L]`
Gör MVP-featuresetet till ett verktyg stall faktiskt kör dagligen på.
- Native date/time-pickers + validering överallt; persista recurring sluttid/duration till riktig DB-kolumn (idag bara in-memory useRef).
- Recurring-series-koncept (edit/delete this-and-future), pass-konfliktdetektering, cap på recurring-generering.
- Vårdpåminnelser/recurrence (hovslagare ~6-8v, årliga vaccinationer) med due-date + push.
- Default-pass-materialisering (eller fixa vilseledande "schemat fylls automatiskt"-copy).
- Häst medical/identitet (ras, chip/pass, vikt, mediciner, allergier) + foton; chatt-bilagor.

### Fas 5 — Skala, arkitektur & kvalitetshärdning  `[XL]`
Gör kodbasen underhållbar & performant vid riktiga datavolymer, med enforced quality gates.
- Splittra AppDataContext (~7900 rader) i selector-baserade slices; per-entity refresh + pagination.
- Riktig, ordnad migrationshistorik (eller commit till schema.sql som single source).
- Riktiga beteende/render-tester (RNTL) istället för source-text-grep; CI (GitHub Actions) som enforce:ar lint/test/e2e på PR.
- Dark mode (eller pinna light); konsolidera de 4 samexisterande styling-systemen & två blå-nyanser.
- Live tidsrefresh på dashboard (slot/midnatt-rollover), pull-to-refresh, loading-skeletons.
