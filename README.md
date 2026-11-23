# NaNákup 0.9.5

České sdílené nákupní seznamy. React, TypeScript, Vite a Firebase.

`npm ci` a `npm run dev` spustí místní verzi na cestě /nanakup/. `npm run build` vytvoří produkční soubory v dist.

Pro nasazení zapni Pages se zdrojem GitHub Actions. Ve Firebase zapni Google Authentication, přidej autorizovanou doménu reklubomir-creator.github.io a nasaď firestore.rules. Webový Firebase config patří do src/firebase-config.ts.

Push oznámení na pozadí vyžadují důvěryhodný server pro odesílání a správu tokenů. Toto vydání jej neobsahuje.
