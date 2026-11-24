# NaNákup 0.9.18

České sdílené nákupní seznamy. React, TypeScript, Vite a Firebase.

`npm ci` a `npm run dev` spustí místní verzi na cestě /nanakup/. `npm run build` vytvoří produkční soubory v dist.

Pro nasazení zapni Pages se zdrojem GitHub Actions. Ve Firebase zapni Google Authentication, přidej autorizovanou doménu reklubomir-creator.github.io a nasaď firestore.rules. Webový Firebase config patří do src/firebase-config.ts.

Push používá stávající plánovanou funkci `sendListUpdates` v regionu `europe-west3`. Test směrování se spouští příkazem `node --test functions/push-routing.test.js`.

Nasazení této verze nejprve aktualizuje Firebase pravidla a funkci. Produkční frontend smí následovat až po úspěšném nasazení obou:

```sh
npx --yes firebase-tools deploy --project nanakup-eab4d --only firestore:rules,functions:sendListUpdates
npx --yes firebase-tools functions:log --project nanakup-eab4d --only sendListUpdates
```

Seskupování čeká 60 sekund od poslední zaznamenané změny a plánovač kontroluje frontu každou minutu. Odznaky na pozadí jsou součástí viditelného Web Push oznámení. Vypnutí oznámení pro konkrétní seznam potlačí jeho zprávy a jejich aktualizaci odznaku na pozadí, při otevření se odznak sčítá ze všech aktivních seznamů.
