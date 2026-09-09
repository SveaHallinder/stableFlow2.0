# Fortsatt färdigställande inför stallstart

Användaren har instruerat att fortsätta självständigt genom hela appen. Befintlig
design, dependencies och schema behålls. Inga nya godkännandesteg för UI-fixar.

1. Säkra slutföra/släppa pass i `context/AppDataContext.tsx` och kalendern:
   invänta villkorad serveruppdatering, visa Sparar/fel, bevara läget vid nätfel.
   Lägg nätfelstest före implementation och verifiera faktisk sparning i QA-stallet.
2. Säkra hästens dagsstatus i datalagret, hästprofilen och Hagar med samma princip.
   Ge kärnvyerna tydlig uppdatering och hantera sessionsfel utan ändlös laddning.
3. Förbättra `app/contacts/index.tsx`, hästsökning och `ToastProvider.tsx`:
   läsbara uppgifter, ring-/mejllänkar, tydliga tomlägen och längre tillgängliga fel.
4. Prioritera arbetsmoment framför upprepad statistik på mobilens Idag-vy.
   Kontrollera formulärdatum, ofärdiga åtgärder och standardpassens copy.
5. Kör UI-tester för ändrade flöden samt lint, TypeScript, build och enhetstester.
   Granska mobil/desktop, uppdatera auditens kvarstående fynd och förbered konkret
   förslag där serverbehörigheter behöver ändras. Schema kräver användarbeslut.
