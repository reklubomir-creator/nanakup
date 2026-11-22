# NaNákup 0.9.3

České sdílené nákupní seznamy. React, TypeScript, Vite a Firebase.

`npm ci` a `npm run dev` spustí místní verzi na cestě /nanakup/. `npm run build` vytvoří produkční soubory v dist.

Pro nasazení zapni Pages se zdrojem GitHub Actions. Ve Firebase zapni Google Authentication, přidej autorizovanou doménu reklubomir-creator.github.io a nasaď firestore.rules. Webový Firebase config patří do src/firebase-config.ts.

## Webová oznámení

Pro aktivaci nasaď pravidla, index a funkci do projektu NaNákup:

```sh
firebase deploy --project nanakup-eab4d --only firestore:rules,firestore:indexes,functions:sendListUpdates
```

Funkce používá Cloud Scheduler a Cloud Functions na tarifu Blaze. Před zapnutím klienta vyčkej na sestavení indexu skupiny pushActors. Ve Firebase vytvoř dvojici klíčů Web Push a její veřejný klíč nastav v repozitáři jako Actions variable `VITE_PUSH_VAPID_KEY`. Po sestavení veřejné verze se v Nastavení objeví přepínač oznámení. Výchozí build bez této proměnné ponechá oznámení vypnutá.

Aplikace poznačí změnu ve stejné dávce jako zápis seznamu nebo položky. Funkce kontroluje čekající změny jednou za minutu a pošle jednu zprávu po nejméně 45 sekundách bez úprav. Před odesláním ověří aktuální členy a nastavení jednotlivých zařízení. Bez aktivního odběru se zprávy neodesílají.
