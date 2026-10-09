# Designprov

Öppna [localhost-demot](http://localhost:8081/?qaDemo=1). Namn som börjar med QA är fiktiva; ändringar i demot skickas inte till Supabase.

1. På Idag: kontrollera datum, valt stall och Dagens arbete. Viktiga händelser och Foder nu ska synas före den längre statusöversikten.
2. Öppna Mina pass och Lediga pass. Kontrollera att rätt filter är valt i Schema och gå tillbaka via Idag.
3. På Hästar: sök efter Saga och sedan ett namn som inte finns. Kontrollera sökträff, tomläge och Rensa sökning.
4. Öppna Sagas profil och gå tillbaka. Hage, foder och daglig status ska fortfarande vara begripliga på hästkortet.
5. På Schema: öppna och stäng Färgförklaring. Prova veckopilarna och Nytt pass; stäng formuläret utan att spara.
6. Prova samma vyer vid 390 px och på en bred skärm. Fliknamn, vald flik, sidomeny och knappar ska vara läsbara utan horisontell sidskroll.

Designändringen använder befintliga beroenden och ändrar inga databasscheman. Telefoninstallation, verklig mejlleverans och extern publicering har separata slutprov.
