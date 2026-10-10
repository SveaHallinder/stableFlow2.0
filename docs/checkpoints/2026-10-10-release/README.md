# Releaseöversikt, 10 oktober 2026

**StableFlow är en verifierad pilotkandidat, ännu inte slutaccepterad.** Produktcommitten är `b0e62122760fa70415a15e99fb9c4517867d25b7`. Både push- och PR-CI är gröna med 786 kodprov, 112 offline UI-prov, lint, typkontroll och webbbygge. Det uttryckligen godkända backendpaketet installerades därefter i befintligt Supabase-projekt `zbcghmpjslasnxqcodqa`. Denna dokumentationsuppdatering återger releaseägarens installations- och efterkontrollkvitton; faktisk användaracceptans återstår.

| Område | Verifierat | Återstår |
|---|---|---|
| Design och webb | Idag, Hästar, Schema och gemensam navigation; visuell QA vid 320, 390 och 1280 px. | Användarens slutprov i stallvardagen. |
| Kod och GitHub | På `b0e6212`: 786 kodprov, 112 offline UI-prov, lint, TypeScript och webbbygge. Push- och PR-CI gröna. | Efterföljande commits får egna CI-kvitton; resultatet här gäller angiven produktcommit. |
| Befintlig backend | Tidigare godkända installationer kompletterade med sex nya migrationer. Fem privata RLS-tabeller, åtta Storage-policyer, sex triggers, två privata bildbuckets och 24 RPC-behörighetskontroller kvitterade. | Verkliga användarflöden inklusive konto-/filhantering behöver separat acceptans. |
| Push och vårdpåminnelser | Befintlig sändare v3 och kvittofunktion v1 kompletterade med Vault-URL-konfiguration och `care-reminders` v1. Påminnelsejobbet kör varje minut; första körningen lyckades med HTTP 200 och `submitted: 0`, `held: 0`. | APNs/Expo-konfiguration och faktisk leverans på iPhone. En tom lyckad körning bekräftar inga utskick eller telefonnotiser. |
| Native | Tidigare vanligt simulatorbygge; senaste designens iOS JavaScript-export lyckades. | Fysisk installation, inloggning och push på användarens enda iPhone. Export är inget installationskvitto. |
| Inbjudan och återställning | Klientflöden och isolerade regressioner finns. | Riktigt mottaget mejl, användbar länk och avslutad inbjudan/lösenordsåterställning. Tidigare mottaget återställningsmejl är inte ett fullföljt byte. |
| Godkänt slutpaket | Godkänt och installerat den 10 oktober: sex migrationer, `delete-account` v2 och `care-reminders` v1 aktiva med JWT-kontroll, exakt källreadback av fyra filer samt schemalagt påminnelsejobb. Oinloggad POST gav 401 för båda funktionerna. | Slutprov med avsedda konton, data och fysisk iPhone. |
| Publicering | PR #2 är draft i leveranskvittot. | Extern webbpublicering väntar enligt användarens beslut. |

Färsk telefonkontroll 10 oktober: iPhonen är parad men Utvecklarläge är av och utvecklartunneln är otillgänglig. Xcode finns, men ingen giltig signeringsidentitet hittades och projektet saknar valt utvecklarteam. Anslut och lås upp telefonen, aktivera Utvecklarläge under Inställningar → Integritet och säkerhet och logga vid behov in med eget Apple-konto i Xcode → Settings → Apple Accounts. Därefter kan befintlig signering kontrolleras på nytt. Ingen telefoninstallation är utförd.

## Installationskvitto

De sex källmigrationerna `20261008233000`–`20261008233500` installerades i ordning och registrerades i Hosted-historiken som `20261010090244`, `20261010090246`, `20261010090248`, `20261010090250`, `20261010090253` och `20261010090254`. De två separata release-SQL-stegen kvitterades som `enable_care_reminder_cron` (`20261010090340`) och `activate_care_reminder_cron` (`20261010090358`).

Cron-jobbet `stableflow-care-reminders-09-stockholm` kör varje minut. Första körningen hade status `succeeded`; workerns HTTP 200-svar innehöll noll inskickade och noll stoppade planer. Det fanns inga planer och inga pushutskick gjordes. Dessa driftkontroller är inte ett genomfört konto-, mejl- eller telefonprov.

## Källor

- [Push-CI på produktcommitten](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/38039440209) och [PR-CI på samma commit](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/38039441639).
- [Designleveransens sex UI-steg](../../design-qa.md), [föregående kostnadsfria integration](../2026-10-08-free-completion/README.md) och [installerat pushpaket](../2026-10-08-push-ownership/README.md). Äldre checkpoints beskriver sin egen tidpunkt och ersätter inte denna avstämning.
- Sparade designkvitton: `stableflow-design-20261009/github-ci-final.json`, `github-ci-totals.json`, `github-pr-after-design.json` och `ios-export-final-receipt.json` i arbetsuppgiftens lokala underlag. Dessa kvitton gäller den tidigare designleveransen; backendstatus ovan bygger på releaseägarens Hosted-efterkontroller den 10 oktober.

## QA, sex steg

1. Öppna `http://localhost:8081/?qaDemo=1`. Kontrollera datum, valt stall och att Dagens arbete, viktiga händelser och foder är lätta att hitta. QA-data är fiktiva.
2. Öppna Mina pass och Lediga pass från Idag. Kontrollera rätt valt filter i Schema, läsbara passnamn, veckopilar och Färgförklaring. Öppna Nytt pass och avbryt.
3. På Hästar, sök efter Saga och sedan ett namn som saknas. Kontrollera sökträff, begripligt tomläge, Rensa sökning samt profil och tillbaka.
4. Prova samma vyer vid 320/390 px och på bred skärm. Inga namn eller knappar får klippas och sidan ska inte kräva horisontell skroll. Kontrollera sedan GitHub-CI för den commit som faktiskt ska levereras.
5. När avsedda konton och en användbar miljö finns: prova den godkända mottagarens inbjudnings-/återställningskedja på dator och iPhone. Dokumentera mottagning, länköppning och slutförd inloggning separat; skicka inte om ett mejl enbart för att kvitto saknas.
6. Efter godkänd native- och pushkonfiguration: prova verklig installation, inloggning, kontobyte och mottagarbunden push på iPhone. Anteckna ej utförda steg som kvarstående. Behåll extern publicering vilande.

För miljöval, hemligheter och avgränsade verkliga backendprov, följ [staging-runbooken](../../../RUNBOOK_STAGING.md). Sex migrationer, två serverfunktioner och påminnelsejobbet är uttryckligen godkända och installerade. Inga nya dependencies eller köp ingår.
