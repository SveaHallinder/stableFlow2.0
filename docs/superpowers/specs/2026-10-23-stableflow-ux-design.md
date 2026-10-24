# StableFlow: sammanhängande onboarding och daglig användning

Datum: 2026-10-23. Uppdaterat: 2026-10-24. Status: **godkänt för implementation av användaren; integrerat och lokalt verifierat.**

## Problem och önskat resultat

Ägaren ska förstå hur hen kommer igång och var administrationen finns. En medlem ska snabbt hitta sina hästar, nästa pass och viktig information. Brandingen ska kännas igen. Användarens referenser används för informationshierarki, luft, begripliga formulär, agenda, hästprofiler och konversationer — inte som tillstånd att byta färgsystem eller införa nya produktfunktioner.

## Verifierade källor

- `design/tokens.ts`, `design/system.ts`, `components/theme.ts`: #0099FF, vita ytor, Inter, befintlig radieskala. Normal vit text på signaturblått har otillräcklig kontrast; använd vita knappar med mörk text och tunn neutral kant enligt användarens senaste återkoppling.
- `assets/images/figma/logo.svg`: blå befintlig hästsymbol. `logo-blue.svg` innehåller äldre grönt och används inte.
- `app/(tabs)/_layout.tsx`, `components/DesktopNav.tsx`: sex destinationer och varierande ikonrepresentation.
- `app/(tabs)/index.tsx`: överlappande snabbval samt lång sektionering innan den praktiska prioritetsytan.
- `app/(tabs)/stable-horses.tsx`: detaljer och flera knappar per hästkort.
- `app/(tabs)/calendar.tsx`, `app/season-schedule.tsx`: vanliga pass, säsongsdefinitioner, veckofördelning, enstaka ändringar och övriga schemakategorier.
- `app/(auth)/index.tsx`, `app/(onboarding)/setup.tsx`: registreringen skapar redan stall; befintligt stall räknas därefter som valt upplägg.
- `context/AppDataContext.tsx`: nuvarande avslutskrav är stall, sparade resursfrågor, häst och pass; inbjudan är valfri.
- `app/(onboarding)/invite-members.tsx`: tio rollalternativ, inklusive separata ägar-/adminval och specialister.
- `app/admin/index.tsx`: långt flöde med flera öppna snabbformulär; nuvarande native-vy hänvisar till webb.

## Val av riktning

Tre rimliga nivåer övervägdes:

1. Ren visuell puts: låg risk men löser inte felaktiga vägval och dubblerade ingångar.
2. **Sammanhängande, uppgiftsstyrd omdesign (rekommenderad):** bevara identitet och datamodell, ge varje vy ett tydligt syfte och gruppera befintliga funktioner bättre.
3. Dekorativ totalomprofilering: starkare visuellt avsteg, men svagare igenkänning och onödig distraktion i praktiskt stallarbete.

Det klickbara förslaget visar alternativ 2. Befintliga funktioner får en tydligare plats; de ska inte tas bort som förenklingsmetod.

## Navigation

Fem huvudflikar: **Idag / Hästar / Schema / Flöde / Chatt**. Samma namn och ikoner på webb och mobil. Idag har hemikon, Hästar en separat hästikon och Flöde en dokument-/anslagsikon. Vald destination markeras även i text/form.

Avataren leder till konto, egna pass och **Mitt stall**. Stallväljaren visar valt stall och roll. Adminmenyn presenteras bara för behöriga användare. Att flytta UI ersätter aldrig serverns behörighetskontroller.

## Onboarding

Ägare: **Upplägg → Ditt stall → Hästar → Första passet → Idag**.

- Ett stall / en gård med flera stall är ett verkligt vägval före skapandet. Gården börjar med sitt första stall; fler kan läggas till senare. Alternativt kan befintliga fler-stall-formuläret behållas inom detta steg.
- Samla namn, ort och de befintliga resursfrågorna. Hagar får inte blandas ihop med volt.
- Hästnamn och ägarkoppling, med valfritt födelseår och automatisk kalenderålder. Ingen ny födelseårsgrind.
- Första pass: datum, tid och ansvarig. Väntande inbjudningar kan inte väljas som medlemskonton innan de accepterats. Återkommande fördelning leder till den befintliga säsongsmodellen.
- Sammanfattning med valfri inbjudan och samma slutdestination på webb/mobil. Namn och val ska bevaras när man går tillbaka.

Medlem: **Inbjuden e-post och eventuell kod → befintlig konto-/mejlverifiering → tydlig roll och stall → Idag**. Inga resurs- eller stallskapandefrågor. Prototypen begär inga riktiga lösenord och simulerar inte verifiering.

## Huvudvyer och funktionsbevarande

| Föreslagen yta | Befintlig funktion att behålla |
| --- | --- |
| Idag: nästa egna pass och dagens agenda | Claim/release/complete, uppdatering, avvikelser, aktuell stallavgränsning |
| Idag: kompakt väder | Sparad ort och befintlig väderintegration, tydligt felläge |
| Hästar: lista och profil | Ägarskap/ansvar, ålder, daglig status, hage, box, foderplaner, ridlogg och vård |
| Schema: kategori och agenda | Pass, ridning, ridhus, vård, tävling, egna/lediga filter |
| Planera schema | Säsongsperioder, egna dagliga pass, upp till godkänd gräns per batch, ägarföreträde, revisioner och enstaka överstyrningar |
| Flöde | Inlägg, grupper, svar, bilder, rapportering och befintlig åtkomst |
| Chatt | Privata och gemensamma konversationer, deltagare, lässtatus, bildhantering och återförsök |
| Mitt stall | Stall/gård, medlemmar/inbjudningar, hagar, anläggning, kontakter, rutiner, inställningar och moderering |
| Konto från avataren | Profil, egna standard-/veckopass, notiser, säkerhet och befintligt säkert kontoraderingsflöde |

Mobil stalladministration återanvänder nu samma actions och behörighetskontroller. Mobil webblayout är verifierad; fysisk Expo Go-enhet är ännu inte slutprovad.

## Visuella regler

- Samma logotyp och typsnitt; inget nytt typsnittspaket.
- Signaturblått för identitet och små accenter. Vita primärknappar med mörk text och tunn neutral kant; vald flik får fylld ikon och tydligare text utan blå platta. Tidsmarkeringar och väder är neutrala.
- Primär information först. Undvik kort i kort utan funktionell anledning.
- Formulär med synliga etiketter, ett tydligt sparande, separat tillbaka/avbryt och specifika fel nära fältet.
- Begripliga tomlägen för hästsökning, datum utan pass, rapporter och nya stall.
- Dialoger med fokus, Escape, fokusåtergång och begränsad intern skroll. Touchytor och safe areas verifieras i React Native vid integration.
- Små interaktionsövergångar; upprepade navigationshandlingar utan dekorativa animationer. Reduced motion respekteras.
- Fotolösa hästprofiler använder tydlig fallback. Riktiga bilder ska komma från appens befintliga privata bildhantering.

## Integrationsordning efter granskning

1. Gemensamma UI-primitiver och navigationsram på webb/native, med gamla rutter och behörigheter kvar.
2. Idag och hästlista/profil, utan ändrad lagring eller befintliga actions.
3. Kalenderhierarki och passdialoger; säsongsfunktionernas skydd och testfall bevaras.
4. Sammanhängande onboarding och fokuserad Mitt stall-vy, inklusive native-åtkomst för rätt roll.
5. Flöde, chatt och konto: enhetlig rytm, formulär och fel-/tomlägen.

Varje del verifieras mot sina faktiska actions, återförsök, stallbyte och ägar-/medlemskonton. Inga schemaändringar eller dependencies ingår. Nya behov ska motiveras och godkännas separat. Extern publicering väntar fortsatt.

## Granskning och testbarhet

Förhandsvisning: `design-preview/` på http://127.0.0.1:4173/. QA-stegen finns i dess README. Den är inte kopplad till Supabase och ändrar inte Expo-appen.

Användaren godkände implementationen efter den visuella revisionen: ”implementera den nya designen nu tack slay”. Den riktiga Expo-appen finns på http://localhost:8081/. Prototypen på port 4173 är fortsatt en separat referens.

## Visuell revision efter återkoppling

Användaren avvisade det första förslagets färger och ikoner. Förhandsvisningen använder nu rent vitt, svart, neutralt grått och #0099FF; inga blågrå sidbakgrunder eller dekorativa pastellgradienter. Originalhästen behålls, medan övriga ikoner kommer från befintliga Ionicons med kontur och fylld aktiv symbol. Användaren valde därefter originalets klara blått och rent vitt. De alternativa paletterna och den tillfälliga färgväljaren är borttagna. Den reviderade helheten godkändes därefter för implementation.

Användarens senaste precisering: behåll originalets blå identitet men ta bort blå bakgrundsplattor. Detta omfattar primärknappar, aktiv navigation, tidsmarkeringar och motsvarande väder-/valytor. Valda kontroller ska fortsatt gå att identifiera genom ikon, text, neutral yta eller kant.

## Lokal integrationskontroll 2026-10-24

957 tester, lint, TypeScript och webbexport passerar. Den befintliga ägarsessionen användes för läsande UI-prov av fem huvudvyer, profil, Mitt stall, hästprofil och onboarding. Responsiva prov omfattar 320/390/1280 px; fysisk native-enhet och ny registrering/mejlleverans ingår inte i detta designprov. Ett separat backendfritt QA-läge används för tilldelningsprovet utan ändring av riktiga pass. Inga dependencies, schema- eller providerinställningar ändras.
