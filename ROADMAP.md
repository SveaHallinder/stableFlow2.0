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
- Smalna av `profiles_select` — ta bort telefon/PII från bred exponering, exponera via scopad vy/RPC.
- Fixa `conversation_members_insert` (bara egna/inbjudna konversationer); RPC för deltagarnamn; UPDATE/DELETE-policy på messages för moderering.
- Kolumn/operation-scoping på `can_claim_assignments` (rider får bara claim/decline).
- Flytta service-role-nyckeln från plaintext GUC till Supabase Vault/edge secrets.
- Audita varje `persist*`-väg: bekräfta att RLS oberoende enforce:ar stall + roll.

### Fas 1 — Skriv-korrekthet & datatillit  `[L]`
Eliminera tyst dataförlust — UI:t får aldrig rapportera success när DB:n inte ändrades.
- Felhantering + rollback (POST_RESTORE-mönstret från deletePost) på alla fire-and-forget-skrivningar, eller en durable retry-kö.
- Visa skrivfel för användaren (toast + failed-state) istället för bara console.warn.
- Fixa `STATE_HYDRATE` att merga per id/updated_at istället för att byta hela collections; blockera refresh medan skrivningar pågår.
- Fixa admins post-radering (no-op idag): lägg posts_delete admin/owner RLS + kolla rows-affected.
- Last-admin / self-demotion-guard i updateMemberRole + member removal.
- Ersätt namn-baserad hage↔häst-länk med häst-ID-referenser.

### Fas 2 — Stäng kärnlooparna (acquisition, inbjudningar, realtid)  `[XL]`
Få tillväxt- och multiuser-looparna att fungera end-to-end.
- [x] Self-serve owner-signup som skapar stall (2026-06-13: 'create'/'join'-intent i auth, återupplivad pendingOwnerStable bunden till e-post, onboarding tar vid). Codex-reviewad.
- [x] Invite-leverans: `send-invite` edge function (Resend, env-gated) + `on_invite_created`-trigger + 14-dagars expiry på invites (2026-06-13, codex-reviewad: per-rad-unik kod, e-post-centrerad acceptans, enqueue-fel kan ej abortera insert). KVAR: admin-synlig inbjudningslista; server-validering single-use; RESEND_API_KEY-deploy.
- [x] Email-confirmation: confirmCard ("kolla mejl" + skicka-igen via auth.resend) + emailRedirectTo='stableflow://confirm' + ny confirm.tsx deep-link-route som sätter session (2026-06-13, codex bekräftade resend-API-form; edge-cases self-verifierade).
- Aktivera Supabase realtime-publication för messages; realtid (eller server-authoritative claim) för assignments & stable_alerts.
- Persistent unread/read (per-member last_read_at); fixa privat-chatt-namn + dedup-race.

### Fas 3 — UGC-säkerhet, kontolivscykel & store-compliance  `[L]`
Möt App Store / Google Play + EU-legala krav för en UGC + persondata-produkt.
- Moderering: report/flag inlägg & kommentarer, block/mute, admin removal-kö.
- Kontohantering: byt e-post, byt lösenord, radera konto (GDPR-radering) + dataexport.
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
