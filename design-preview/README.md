# StableFlow — en lugnare stallvardag

Klickbart UI/UX-förslag, 23 oktober 2026. **Detta är en separat förhandsvisning, inte en ny version av Expo-appen.**

## Öppna

Från repots rot:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory design-preview
```

Öppna http://127.0.0.1:4173/. Knappen **Utforska förslaget** visar ägarresa, medlemsresa, daglig användning och stallhantering.

Inga dependencies behöver installeras. Typsnitt och logotyp kommer från appens befintliga tillgångar. Inter-licensen ligger bredvid fontfilerna. Ikonfont och MIT-licens är kopierade från projektets befintliga `@expo/vector-icons`. Ingen extern font, bild, analys eller backend laddas.

## Riktning

Behåll hästsymbolen, Inter, blått och vitt. Använd signaturblått `#0099FF`, rent vitt, svart text och neutralt grå ytor. Knappar på klart blått har mörk text för kontrast. Blågrå bakgrund, pastellgradienter och flerfärgade dekorativa ikonytor är borttagna. Ikonerna kommer från det redan installerade Ionicons-setet i `@expo/vector-icons`; Hästar använder originalets geometriska hästsymbol. Aktiv flik använder en fylld ikon och tydlig formmarkering.

**Vald färgriktning:** användaren har valt originalets klara blått `#0099FF` och rent vitt. De tillfälliga svartvita och varmvita alternativen är borttagna. Valet gäller färgerna i förhandsvisningen; det innebär inte ett godkännande av hela designen eller en integration i appen.

| Före | Efter | Varför |
| --- | --- | --- |
| Sex huvudflikar | Idag, Hästar, Schema, Flöde, Chatt | Profil nås från avataren; huvudnavigationen blir lättare att läsa. |
| Många upprepade snabbval och statuskort | Nästa egna pass, bemanningslucka och dagens tidslinje | Det går att förstå vad som behöver göras först. |
| Checklistan avbryter onboarding mellan varje formulär | Fyra sammanhängande steg med sparade utkast | Tillbaka innebär inte att börja om. |
| Gårdvalet försvinner när registreringen redan skapat stall | Ett stall / gård med flera stall är ett uttryckligt vägval | Upplägget blir begripligt innan detaljerna fylls i. |
| Admin med flera öppna formulär | Mitt stall → en uppgift och ett formulär åt gången | Ett andra stall konkurrerar inte med att bjuda in en medlem. |
| Flera knappar på varje hästkort | Kompakt hästlista → profil med Översikt, Foder, Ridning, Vård | Detaljer finns där de behövs. |
| Blandade kalendermenyval | Kategori → datum → relevanta filter → agenda | Alla/Mina/Lediga gäller bara stallpass. |
| Grönt äldre logoalternativ bland tillgångarna | Befintlig blå Figma-logotyp | En gemensam, verifierad identitet. |

## Vad som går att prova

- De fem huvudvyerna på mobil och dator.
- Hästsökning med tomläge, egna hästar, hästprofilens fyra vyer.
- Passfilter, passdetalj, lokal tilldelning till vald medlem, ta ett ledigt pass och markera eget pass klart.
- Förhandsvisning av säsong: datumperiod, fler än tre dagliga pass och fördelningsexempel.
- Ägaronboarding: ett stall eller första stallet på en gård, resurssvar, häst med valfritt födelseår, första pass, sammanfattning och valfri inbjudan.
- Separat anslutningsresa för en inbjuden medlem, utan ägarens formulär.
- Ägar-/medlemsläge med olika administrativa åtgärder.
- Inbjudningsförhandsvisning med de tio befintliga rollalternativen, lokala chattmeddelanden och inläggsförhandsvisning.
- Kontomeny, stallbyte, rutiner, hagöverblick och placering av sekundära verktyg.

Allt använder exempeldata i minnet. En omladdning återställer designprovet. Onboardingens exempel och det befolkade exempelstallet visar separata delar av förslaget; det är inte en simulator av databasens skapandeflöde.

## Avgränsning

- Appens huvudvyer, behörigheter och databas har inte ändrats.
- Inga konton skapas, inga mejl/chattar/inlägg skickas, inga riktiga pass genereras.
- Kalendern visar exempelveckan 19–25 oktober 2026. Veckopilarna visar en förklaring; de genererar inte fler veckor.
- Säsongsöversikten visar ett fördelningsexempel, inte hela produktionsredigeraren med alla veckosegment, revisioner och samtidighetskontroller.
- Sekundära verktyg som dokument, vård, ridhusbokning och kontoinställningar visar placering/formulärprincip. De ersätter inte appens befintliga funktioner.
- Mobil stalladministration är ett **förslag till ny appvy**: den nuvarande appen har en webbbegränsning. Det får inte beskrivas som redan levererat till iPhone.
- Obligatorisk stall/resurs/häst/första-pass-grind behålls i konceptet; ett sommarupplägg utan obligatoriskt första pass är ett separat produktbeslut.

## QA, sex steg

1. Öppna Idag på mobilbredd. Kontrollera att nästa egna pass och bemanningsluckan är tydliga; öppna passet och markera klart.
2. Öppna Hästar. Sök efter ett okänt namn, rensa, öppna Cinder och växla mellan Översikt, Foder, Ridning och Vård.
3. Öppna Schema. Prova Mina pass/Lediga, skapa ett lokalt pass till Emma och kontrollera namn och datum i listan.
4. Utforska förslaget → ny stallägare. Välj gård, fyll i grunduppgifter, lägg till en häst och gå Tillbaka: utkast och val ska finnas kvar. Slutför första passet.
5. Utforska förslaget → inbjuden medlem. Prova utan kod, öppna Mitt stall och kontrollera att ägarens inbjudnings-/inställningsåtgärder saknas.
6. Kontrollera huvudvyerna vid 320, 390 och 1280 px. Öppna/stäng en dialog med tangentbord, prova Chatt → Ny chatt → Lisa och kontrollera mottagaren.

Kör de avgränsade prototyptesterna:

```sh
node --check design-preview/app.js
node --test design-preview/preview.test.mjs
```

## Underlag för nästa steg

Se `docs/superpowers/specs/2026-10-23-stableflow-ux-design.md` för kopplingen till befintliga appvyer och ordningen för en integration efter visuell granskning.
