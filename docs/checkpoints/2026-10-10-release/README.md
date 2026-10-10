# Releaseöversikt, 10 oktober 2026

**StableFlow är en verifierad pilotkandidat, ännu inte slutaccepterad.** Utgångspunkten för denna integration är `65692d43fc4b51b1effea2c8b0d08d6d7a6b895f`. Följande avstämning bygger på sparade kvitton från 9 oktober och tidigare releaseunderlag; den samlade kandidaten har dessutom provats lokalt den 10 oktober: 786 kodprov, 112 offline UI-prov, lint, typkontroll och webbbygge godkända. Hosted-installation sker först efter grön CI på integrationscommitten.

| Område | Verifierat | Återstår |
|---|---|---|
| Design och webb | Idag, Hästar, Schema och gemensam navigation; visuell QA vid 320, 390 och 1280 px. | Användarens slutprov i stallvardagen. |
| Kod och GitHub | På `65692d4`: 683 kodprov utan skips, 110 offline UI-prov, lint, TypeScript och webbbygge. Push- och PR-CI gröna. | Nya kodändringar måste få egen verifiering; dessa siffror gäller inte frysta förslag. |
| Befintlig backend | Tidigare releaseunderlag på `4b57cbd` kvitterar sju godkända migrationer, privata chattläskvitton, Realtime, hagkopplingar och kontoraderingsvakter; `delete-account` v1 har JWT-kontroll och källreadback. | Verkliga användarflöden inklusive konto-/filhantering behöver separat acceptans. |
| Push | Godkänt ägarskaps-/kvittopaket installerat: sändare v3 och kvittofunktion v1. | Vault-URL-fallback, eventuell schemaläggning, APNs/Expo-konfiguration och faktisk leverans på iPhone. |
| Native | Tidigare vanligt simulatorbygge; senaste designens iOS JavaScript-export lyckades. | Fysisk installation, inloggning och push på användarens enda iPhone. Export är inget installationskvitto. |
| Inbjudan och återställning | Klientflöden och isolerade regressioner finns. | Riktigt mottaget mejl, användbar länk och avslutad inbjudan/lösenordsåterställning. Tidigare mottaget återställningsmejl är inte ett fullföljt byte. |
| Godkänt slutpaket | Användaren godkände hela paketet i repo och Supabase den 10 oktober. Integrerat med senaste design; 786 kodprov och 112 offline UI-prov godkända. | GitHub-CI på integrationscommitten, sex migrationer, två serverfunktioner och schemalagt jobb ska kvitteras i leveransunderlaget. |
| Publicering | PR #2 är draft i leveranskvittot. | Extern webbpublicering väntar enligt användarens beslut. |

Färsk telefonkontroll 10 oktober: iPhonen är parad men Utvecklarläge är av och utvecklartunneln är otillgänglig. Xcode finns, men ingen giltig signeringsidentitet hittades och projektet saknar valt utvecklarteam. Anslut och lås upp telefonen, aktivera Utvecklarläge under Inställningar → Integritet och säkerhet och logga vid behov in med eget Apple-konto i Xcode → Settings → Apple Accounts. Därefter kan befintlig signering kontrolleras på nytt. Ingen telefoninstallation är utförd.

## Källor

- [Push-CI på produktcommitten](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/37902814168) och [PR-CI på samma commit](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/37902819460).
- [Designleveransens sex UI-steg](../../design-qa.md), [föregående kostnadsfria integration](../2026-10-08-free-completion/README.md) och [installerat pushpaket](../2026-10-08-push-ownership/README.md). Äldre checkpoints beskriver sin egen tidpunkt och ersätter inte denna avstämning.
- Sparade designkvitton: `stableflow-design-20261009/github-ci-final.json`, `github-ci-totals.json`, `github-pr-after-design.json` och `ios-export-final-receipt.json` i arbetsuppgiftens lokala underlag. Backendraden ovan återger det sparade PR-releaseunderlaget, inte en ny providerverifiering.

## QA, sex steg

1. Öppna `http://localhost:8081/?qaDemo=1`. Kontrollera datum, valt stall och att Dagens arbete, viktiga händelser och foder är lätta att hitta. QA-data är fiktiva.
2. Öppna Mina pass och Lediga pass från Idag. Kontrollera rätt valt filter i Schema, läsbara passnamn, veckopilar och Färgförklaring. Öppna Nytt pass och avbryt.
3. På Hästar, sök efter Saga och sedan ett namn som saknas. Kontrollera sökträff, begripligt tomläge, Rensa sökning samt profil och tillbaka.
4. Prova samma vyer vid 320/390 px och på bred skärm. Inga namn eller knappar får klippas och sidan ska inte kräva horisontell skroll. Kontrollera sedan GitHub-CI för den commit som faktiskt ska levereras.
5. När avsedda konton och en användbar miljö finns: prova den godkända mottagarens inbjudnings-/återställningskedja på dator och iPhone. Dokumentera mottagning, länköppning och slutförd inloggning separat; skicka inte om ett mejl enbart för att kvitto saknas.
6. Efter godkänd native- och pushkonfiguration: prova verklig installation, inloggning, kontobyte och mottagarbunden push på iPhone. Anteckna ej utförda steg som kvarstående. Behåll extern publicering vilande.

För miljöval, hemligheter och avgränsade verkliga backendprov, följ [staging-runbooken](../../../RUNBOOK_STAGING.md). Sex migrationer, två serverfunktioner och påminnelsejobbet är uttryckligen godkända. Inga nya dependencies eller köp ingår.
