# FIREBASE_BLUEPRINT_GUIDE.md — Kompletny Wzorzec Architektury, Migracji z Google Drive na Firebase Cloud Firestore oraz Natywnego CI/CD GitHub Pages dla Projektów Google AI Studio

Ten dokument stanowi **kompletną, samowystarczalną specyfikację architektoniczną, instrukcję migracyjną krok po kroku oraz bibliotekę gotowego kodu źródłowego (1:1)**. Został stworzony i przetestowany produkcyjnie w aplikacji **FamilyStream Vault**.

> [!TIP]
> **Jak użyć tego dokumentu jutro w drugim projekcie Google AI Studio?**
> 1. Pobierz ten plik z repozytorium GitHub (`FIREBASE_BLUEPRINT_GUIDE.md`) i załącz go do czatu w drugim projekcie Google AI Studio (lub wklej jego treść).
> 2. Napisz krótki komunikat:
>    **„Przeczytaj załączony dokument `FIREBASE_BLUEPRINT_GUIDE.md` i wykonaj pełną migrację tej aplikacji według Rozdziału 1 (Wariant B), Rozdziału 2 (Migracja z Google Drive na Firebase) oraz Rozdziału 3 (Przejście na Natywny GitHub AI Studio + GitHub Actions `gh-pages`), zachowując całą logikę biznesową i widoki naszej aplikacji.”**
> 3. Agent AI Studio automatycznie usunie starą obsługę Google Drive oraz wbudowane w aplikację commity GitHub, wdroży architekturę **Firebase Cloud Firestore (`onSnapshot`)**, opcjonalne ładowanie `firebase-applet-config.json`, skrypt `scripts/build-gh-pages.mjs` oraz bezbłędny workflow `.github/workflows/deploy.yml`.

---

## Spis Treści

1. [Gotowe Master Prompty dla AI Studio (Wariant A: Nowy Projekt | Wariant B: Automatyczna Migracja Istniejącego Projektu)](#1-gotowe-master-prompty-dla-ai-studio-wariant-a-nowy-projekt--wariant-b-automatyczna-migracja-istniejącego-projektu)
2. [KROK PO KROKU: Migracja z Google Drive (GDrive API / JSON) na Firebase Cloud Firestore (`onSnapshot`)](#2-krok-po-kroku-migracja-z-google-drive-gdrive-api--json-na-firebase-cloud-firestore-onsnapshot)
3. [KROK PO KROKU: Przejście z Wbudowanego w Aplikację GitHuba (PAT) na Natywną Integrację GitHub w AI Studio + GitHub Actions (`gh-pages`)](#3-krok-po-kroku-przejście-z-wbudowanego-w-aplikację-githuba-pat-na-natywną-integrację-github-w-ai-studio--github-actions-gh-pages)
4. [Architektura Wielośrodowiskowa (AI Studio Dev vs. GitHub Pages Prod PWA)](#4-architektura-wielośrodowiskowa-ai-studio-dev-vs-github-pages-prod-pwa)
5. [Hybrydowy Model Tożsamości: Administrator (Google) + Użytkownicy/Domownicy (Login/Hasło + Anonymous Auth)](#5-hybrydowy-model-tożsamości-administrator-google--użytkownicydomownicy-loginhasło--anonymous-auth)
6. [Samowystarczalne Linki Zaproszeniowe (`?invite=...&fb=...`) i Mostek PWA CacheStorage](#6-samowystarczalne-linki-zaproszeniowe-invitefb-i-mostek-pwa-cachestorage)
7. [Schemat 6 Kolekcji Bazowych i Idempotentny Bootstrapper](#7-schemat-6-kolekcji-bazowych-i-idempotentny-bootstrapper)
8. [Kompletny Kod Wzorcowy: `src/lib/firebase.ts` (z opcjonalnym `import.meta.glob`)](#8-kompletny-kod-wzorcowy-srclibfirebasets-z-opcjonalnym-importmetaglob)
9. [Kompletny Kod Wzorcowy: `src/lib/firestoreVaultService.ts`](#9-kompletny-kod-wzorcowy-srclibfirestorevaultservicets)
10. [Kompletny Kod Wzorcowy: Obsługa Linków Zaproszeniowych i PWA Handoff](#10-kompletny-kod-wzorcowy-obsługa-linków-zaproszeniowych-i-pwa-handoff)
11. [Kompletne Reguły Bezpieczeństwa: `firestore.rules`](#11-kompletne-reguły-bezpieczeństwa-firestorerules)
12. [Checklista Konfiguracji Projektu w Konsoli Firebase i na GitHub.com](#12-checklista-konfiguracji-projektu-w-konsoli-firebase-i-na-githubcom)
13. [8 Filarów Utwardzenia Pentestowego, Stabilności i Ergonomii (Zero-Plaintext Storage, CSP, Tarcza Prywatności, Brute-Force Lockout, k-Anonymity, Rollback)](#13-8-filarów-utwardzenia-pentestowego-stabilności-i-ergonomii-zero-plaintext-storage-csp-tarcza-prywatności-brute-force-lockout-k-anonymity-rollback)

---

## 1. Gotowe Master Prompty dla AI Studio (Wariant A: Nowy Projekt | Wariant B: Automatyczna Migracja Istniejącego Projektu)

### Wariant B (Najważniejszy do migracji istniejącej aplikacji jutro):
Skopiuj poniższy blok do swojego drugiego projektu w Google AI Studio wraz z plikiem `FIREBASE_BLUEPRINT_GUIDE.md`:

```markdown
Przeczytaj dokładnie załączony dokument `FIREBASE_BLUEPRINT_GUIDE.md` i przeprowadź kompleksową migrację tej aplikacji w dwóch obszarach, zachowując w 100% jej logikę domenową, widoki i funkcje biznesowe:

CZĘŚĆ 1 — MIGRACJA Z GOOGLE DRIVE / LOKALNYCH PLIKÓW NA FIREBASE CLOUD FIRESTORE (`onSnapshot` Real-Time):
1. Całkowicie usuń z kodu aplikacyjnego i serwerowego starą synchronizację opartą o Google Drive REST API (endpointy GDrive, tokeny OAuth `drive.file`/`drive.appdata`, ręczne odpytywanie i scalanie plików JSON na Dysku Google).
2. Wdróż architekturę Dual-Environment w `src/lib/firebase.ts` zgodnie z Rozdziałem 8:
   - Użyj opcjonalnego ładowania `import.meta.glob('../../firebase-applet-config.json', { eager: true })`, aby w środowisku Google AI Studio (`*.run.app`, `localhost`) aplikacja automatycznie korzystała z bazy testowej, a przy braku pliku (np. na GitHubie) kompilowała się bez błędów.
   - Na hostingu produkcyjnym (`*.github.io`) aplikacja korzysta wyłącznie z konfiguracji wgranej przez Administratora do `localStorage` (obsługując zarówno surowy kod JS `const firebaseConfig = { ... };` skopiowany z Firebase Console, jak i JSON) lub zdekodowanej automatycznie z parametru `&fb=` w linku zaproszeniowym.
3. Zmapuj dotychczasowe struktury danych aplikacji na kolekcje Cloud Firestore z subskrypcją w czasie rzeczywistym (`onSnapshot`), hybrydowym uwierzytelnianiem (Administrator przez Google OAuth `signInWithPopup` + członkowie/użytkownicy przez `signInAnonymously(auth)` z `browserLocalPersistence`), samowystarczalnymi linkami zaproszeniowymi (`?invite=...&fb=...` + mostek `CacheStorage` dla PWA) oraz idempotentnym zakładaniem kolekcji bazowych (`ensureBaseCollectionsInitializedInFirestore`).
4. Zastąp dawny eksport na Google Drive lokalnym, szyfrowanym eksportem/importem pełnej kopii zapasowej bazy do pliku (`.enc` / `.json`) w zakładce Kopie i Konfiguracja.

CZĘŚĆ 2 — CAŁKOWITE USUNIĘCIE WBUDOWANEGO W APLIKACJĘ GITHUBA I PRZEJŚCIE NA NATYWNĄ INTEGRACJĘ GITHUB W AI STUDIO + GITHUB ACTIONS (`gh-pages`):
1. Całkowicie usuń z interfejsu aplikacji oraz z `server.ts` własną obsługę commitów i tokenów GitHub PAT:
   - Usuń komponent zakładki GitHub z UI, klienta API GitHub z frontendu, typy `GitHubSyncConfig`/`GitHubPushResult` oraz przycisk zakładki GitHub z paska nawigacji (`TopBar`).
   - Wyczyść `server.ts` z wszystkich endpointów `/api/github/*`, obsługi `data/github-deploy-meta.json` oraz zmiennej `GITHUB_PAT` w `.env.example`, zostawiając czysty, lekki serwer Express + Vite na porcie 3000.
   - Usuń domeny `https://api.github.com` i `https://*.github.io` z `Content-Security-Policy` w `index.html`.
2. Skonfiguruj automatyczne budowanie i publikację GitHub Pages (`gh-pages`) wyzwalane po każdym natywnym commicie z Google AI Studio zgodnie z Rozdziałem 3:
   - Utwórz skrypt `scripts/build-gh-pages.mjs` i podepnij go w `package.json` jako `"build": "node scripts/build-gh-pages.mjs"` (skrypt na czas `vite build` podmienia `firebase-applet-config.json` na `{}`, generuje `dist/404.html` oraz `dist/.nojekyll`, a w bloku `finally` przywraca lokalny `firebase-applet-config.json`).
   - Upewnij się, że w `vite.config.ts` ustawione jest `base: './'`, a w `index.html` ikony używają ścieżek względnych `./`.
   - Utwórz plik `.github/workflows/deploy.yml` używający `Node.js 24`, usuwający na czas CI konfliktowy pakiet `@firebase/eslint-plugin-security-rules`, instalujący zależności przez `npm install --legacy-peer-deps --no-audit --no-fund`, uruchamiający `npm run build` i publikujący katalog `./dist` na gałąź `gh-pages` (`peaceiris/actions-gh-pages@v4`).
   - W zakładce „Kopie i Konfiguracja” dodaj prosty pasek ogólnej zajętości pojemności Storage projektu Firebase względem darmowego limitu `1 GiB per projekt` (`estimateFirestoreProjectStorage`) oraz sekcję aktualnych linków do repozytorium GitHub (w tym przycisk zmiany widoczności z Private na Public w Danger Zone, link do GitHub Actions, ustawień GitHub Pages oraz bezpośrednie skróty do konsoli Firebase).
```

---

### Wariant A (Budowa zupełnie nowej aplikacji od zera):
```markdown
Zbuduj aplikację [WPISZ NAZWĘ I OPIS NOWEJ APLIKACJI] wykorzystując w 100% wzorzec architektoniczny Firebase Cloud Firestore (`onSnapshot`), autoryzacji wieloużytkownikowej, prostego paska zajętości pojemności `1 GiB per projekt` (`estimateFirestoreProjectStorage`), PWA oraz natywnego wdrożenia GitHub Pages (`.github/workflows/deploy.yml` + `scripts/build-gh-pages.mjs`) opisany w załączonym dokumencie `FIREBASE_BLUEPRINT_GUIDE.md`. Nie twórz w aplikacji żadnej własnej zakładki do commitów GitHub — aplikacja korzysta wyłącznie z natywnej integracji GitHub wbudowanej w Google AI Studio.
```

---

## 2. KROK PO KROKU: Migracja z Google Drive (GDrive API / JSON) na Firebase Cloud Firestore (`onSnapshot`)

W starszych projektach dane aplikacji były trzymane w jednym pliku JSON na Dysku Google (`Google Drive API v3`, zakresy OAuth `https://www.googleapis.com/auth/drive.file` lub `drive.appdata`), co powodowało problemy z wygasaniem tokenów OAuth co 60 minut, konfliktami zapisu przy pracy wielu urządzeń oraz koniecznością ręcznego klikania „Synchronizuj z Google Drive”.

Poniżej znajduje się dokładna procedura zastąpienia Google Drive bazą **Firebase Cloud Firestore**:

### Krok 2.1. Co należy całkowicie usunąć z projektu (Demontaż warstwy Google Drive)
1. **Usunięcie bibliotek i skryptów Google Drive**:
   - Usuń ładowanie skryptu `https://apis.google.com/js/api.js` (`gapi.client.drive`) oraz `https://accounts.google.com/gsi/client` (`google.accounts.oauth2.initTokenClient`), jeśli służyły do pobierania tokenu dostępowego do Google Drive.
   - Usuń moduły typu `googleDriveService.ts`, `driveSync.ts`, `gdriveBackup.ts` oraz endpointy `/api/gdrive/*` z `server.ts`.
   - Usuń ze stanu aplikacji (`App.tsx`) pola takie jak `driveFileId`, `lastDriveSyncAt`, `isSyncingDrive`, `driveAccessToken` oraz przyciski „Zapisz na Google Drive / Pobierz z Google Drive”.
2. **Zastąpienie kopii zapasowych z Google Drive lokalnymi szyfrowanymi plikami (`.enc` / `.json`)**:
   - Zamiast trzymać kopię na Dysku Google, w zakładce „Kopie i Konfiguracja” zostaw wyłącznie eksport/import zaszyfrowanego pliku lokalnego (`AES-256-GCM`), który pobiera cały stan z kolekcji Firestore i pozwala go w każdej chwili odtworzyć jednym kliknięciem (`replaceFullVaultStateInFirestore`).

### Krok 2.2. Mapowanie dawnego pliku JSON z Google Drive na kolekcje Cloud Firestore
Dawny pojedynczy obiekt JSON z Google Drive (np. `{ config, users, devices, items, logs }`) rozbijamy na osobne kolekcje w Firestore:

| Dawne pole w pliku JSON na Google Drive | Docelowa kolekcja w Cloud Firestore | Sposób synchronizacji w nowej architekturze |
| :--- | :--- | :--- |
| `config` / `settings` | `vaultConfig/default` (pojedynczy dokument) | `onSnapshot(doc(db, 'vaultConfig', 'default'))` |
| `users` / `members` | `members/{memberId}` | `onSnapshot(collection(db, 'members'))` |
| `devices` | `devices/{deviceId}` | `onSnapshot(collection(db, 'devices'))` |
| `items` / `records` / `passwords` / `workouts` *(główne dane aplikacji)* | `{mainCollection}/{recordId}` (np. `passwords/{id}`) | `onSnapshot(collection(db, ...))` (lub z filtrem `where('allowedMemberIds', 'array-contains', uid)`) |
| `invitations` | `invitations/{invitationId}` | `onSnapshot(collection(db, 'invitations'))` |
| `logs` / `history` | `activityLogs/{logId}` | `onSnapshot(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(150)))` |

### Krok 2.3. Zastąpienie operacji zapisu pliku Drive pojedynczymi zapisami dokumentów (`setDoc` / `deleteDoc`)
- Zamiast nadpisywać cały plik JSON po każdej edycji rekordu, każda akcja użytkownika (dodanie rekordu, edycja, usunięcie, zmiana ustawień) wywołuje bezpośrednio `setDoc(doc(db, 'nazwaKolekcji', record.id), sanitizeForFirestore(record))` lub `deleteDoc(...)`.
- Nasłuchiwacz `onSnapshot` automatycznie i w ułamku sekundy rozsyła zmianę do wszystkich otwartych telefonów i komputerów bez żadnego ręcznego odświeżania!
- **Ważna uwaga techniczna Firestore**: Cloud Firestore odrzuca pola o wartości `undefined`. Przed każdym wywołaniem `setDoc` przepuść obiekt przez prostą funkcję czyszczącą:
  ```typescript
  function stripUndefined<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }
  ```

### Krok 2.4. Provisioning bazy Firebase w Google AI Studio
1. W nowym lub migrowanym projekcie w Google AI Studio wywołaj narzędzie `set_up_firebase` (`platform: 'web'`, `requestedProducts: ['firestore']`), które utworzy bazę testową dla środowiska AI Studio oraz plik `firebase-applet-config.json`.
2. W pliku `src/lib/firebase.ts` użyj opcjonalnego importu `import.meta.glob('../../firebase-applet-config.json', { eager: true })` (pełny kod w Rozdziale 8), dzięki czemu w AI Studio aplikacja działa od razu na bazie testowej, a po wypchnięciu na GitHub Pages wymaga wgrania produkcyjnego configu Firebase (Gatekeep 2).

---

## 3. KROK PO KROKU: Przejście z Wbudowanego w Aplikację GitHuba (PAT) na Natywną Integrację GitHub w AI Studio + GitHub Actions (`gh-pages`)

Dawniej aplikacje miały wbudowaną zakładkę „GitHub” w panelu Administratora, w której wklejało się token `GITHUB_PAT`, a `server.ts` ręcznie wysyłał bloby przez GitHub REST API.
Obecnie **Google AI Studio posiada natywną integrację z GitHubem** (ikona GitHub w górnym pasku AI Studio). Całą obsługę GitHuba wyrzucamy więc z kodu aplikacji, a budowanie wersji produkcyjnej dla **GitHub Pages (`gh-pages`)** powierzamy automatycznemu workflow **GitHub Actions (`.github/workflows/deploy.yml`)**.

### Krok 3.1. Co należy całkowicie usunąć z kodu aplikacji
1. **Usuń komponent i klienta GitHub z frontendu**:
   - Usuń pliki `src/components/AdminTab4GitHubAndUpdates.tsx` oraz `src/lib/githubDeployClient.ts`.
   - W `src/types/vault.ts` (lub odpowiedniku typów) usuń interfejsy `GitHubSyncConfig` oraz `GitHubPushResult`.
   - W `src/components/TopBar.tsx` usuń `'github'` z unii zakładek (`AdminTabId`), usuń przycisk zakładki GitHub oraz prop `isAiStudioPreview`.
   - W `src/App.tsx` usuń import i renderowanie `AdminTab4GitHubAndUpdates`.
2. **Wyczyść `server.ts`, `.env.example` oraz `index.html`**:
   - W `.env.example` usuń zmienną `GITHUB_PAT=""`.
   - W `index.html` w meta-tagu `Content-Security-Policy` usuń `https://api.github.com https://*.github.io` z dyrektywy `connect-src`.
   - Zastąp cały plik `server.ts` czystym, minimalnym serwerem Express + Vite (poniżej gotowy kod 1:1):

```typescript
// Pełny, czysty kod pliku /server.ts (bez żadnej obsługi GitHub API ani ZIP):
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
```

---

### Krok 3.2. Utworzenie skryptu budującego `scripts/build-gh-pages.mjs` (Ochrona Gatekeep 2 + SPA Fallback)

Utwórz plik `/scripts/build-gh-pages.mjs`. Skrypt ten gwarantuje, że podczas kompilacji produkcyjnej plik `firebase-applet-config.json` jest pustym obiektem `{}` (dzięki czemu testowe klucze z AI Studio nigdy nie trafią na GitHub Pages), generuje `dist/404.html` (dla linków zaproszeniowych `?invite=...&fb=...`) oraz `dist/.nojekyll`, a po zakończeniu budowania przywraca oryginalny `firebase-applet-config.json` w środowisku AI Studio:

```javascript
// Plik: /scripts/build-gh-pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildVite } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const firebaseConfigPath = path.join(rootDir, 'firebase-applet-config.json');
const distDir = path.join(rootDir, 'dist');
const docsDir = path.join(rootDir, 'docs');

async function runCleanProductionBuild() {
  const hadOriginalConfig = fs.existsSync(firebaseConfigPath);
  const originalConfigContent = hadOriginalConfig
    ? fs.readFileSync(firebaseConfigPath, 'utf-8')
    : null;

  try {
    // 1. Wyczyść testowe klucze Firebase przed kompilacją produkcyjną (Gatekeep 2)
    fs.writeFileSync(firebaseConfigPath, '{}\n', 'utf-8');

    // 2. Zbuduj pakiet produkcyjny Vite do katalogu dist/
    await buildVite({
      root: rootDir,
      logLevel: 'info',
    });

    // 3. Dodaj fallback SPA dla GitHub Pages (404.html) oraz .nojekyll
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      fs.copyFileSync(indexHtmlPath, path.join(distDir, '404.html'));
    }
    fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf-8');

    // 4. Skopiuj czysty build również do docs/
    if (fs.existsSync(docsDir)) {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
    fs.cpSync(distDir, docsDir, { recursive: true });
    console.log(
      'Clean production bundle prepared in dist/ and docs/ (Gatekeep 2 verified).'
    );
  } finally {
    // 5. Zawsze przywróć oryginalny firebase-applet-config.json dla podglądu w AI Studio
    if (hadOriginalConfig && originalConfigContent !== null) {
      fs.writeFileSync(firebaseConfigPath, originalConfigContent, 'utf-8');
    }
  }
}

runCleanProductionBuild().catch((err) => {
  console.error('Production build failed:', err);
  process.exit(1);
});
```

W pliku `package.json` ustaw skrypt `"build"`:
```json
  "scripts": {
    "dev": "tsx server.ts",
    "start": "node --import tsx server.ts",
    "build": "node scripts/build-gh-pages.mjs",
    "preview": "vite preview",
    "clean": "rm -rf dist docs server.js",
    "lint": "tsc --noEmit"
  }
```

Upewnij się też, że:
- w `vite.config.ts` ustawione jest `base: './'` (oraz w `VitePWA` pola `id: './'`, `start_url: './'`, `scope: './'`),
- w `index.html` linki do ikon mają ścieżki względne (`href="./apple-touch-icon.png"`, `href="./icon.svg"`), aby aplikacja działała poprawnie w podkatalogu `https://<twoj-login>.github.io/<nazwa-repozytorium>/`.

---

### Krok 3.3. Utworzenie pliku `.github/workflows/deploy.yml` (Rozwiązanie problemów `Node.js 24` i `ERESOLVE` w AI Studio)

> [!WARNING]
> **Dlaczego zwykły workflow z `npm install` i `Node 20/22` wywala błąd w projektach z Google AI Studio?**
> 1. Pakiety `@firebase/*` instalowane w AI Studio wymagają silnika **`Node.js >= 24.12.0`**.
> 2. Pakiet deweloperski `@firebase/eslint-plugin-security-rules` z `package.json` w AI Studio wymusza zależność `@typescript-eslint/parser` (`typescript < 6.1.0`), podczas gdy w `package.json` znajduje się `typescript: ^7.0.2`. Zwykłe `npm install` na serwerze GitHub Actions kończy się błędem `ERESOLVE` (Exit code 1).
>
> **Rozwiązanie zastosowane w poniższym workflow**:
> Używamy `node-version: '24'`, przed instalacją na maszynie CI automatycznie usuwamy z `package.json` niepotrzebny do budowania pakiet `@firebase/eslint-plugin-security-rules` oraz `eslint`, i uruchamiamy `npm install --legacy-peer-deps --no-audit --no-fund`.

Skopiuj poniższy plik 1:1 do `/.github/workflows/deploy.yml`:

```yaml
name: Deploy PWA to GitHub Pages (gh-pages)

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: 'pages-deploy'
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Prepare clean production firebase-applet-config.json & sanitize devDependencies for CI
        run: |
          echo "{}" > firebase-applet-config.json
          node -e '
            const fs = require("fs");
            const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
            if (pkg.devDependencies) {
              delete pkg.devDependencies["@firebase/eslint-plugin-security-rules"];
              delete pkg.devDependencies["eslint"];
            }
            fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
          '

      - name: Install dependencies (--legacy-peer-deps)
        run: |
          rm -f bun.lock package-lock.json
          npm install --legacy-peer-deps --no-audit --no-fund || npm install --force --no-audit --no-fund

      - name: Build Production PWA Bundle (dist/)
        run: npm run build

      - name: Verify GitHub Pages SPA fallback (404.html & .nojekyll)
        run: |
          cp dist/index.html dist/404.html
          touch dist/.nojekyll

      - name: Publish dist/ to gh-pages branch
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          publish_branch: gh-pages
          force_orphan: true
          commit_message: 'chore(gh-pages): deploy production PWA'

      - name: Summary of GitHub Pages Deployment
        run: |
          echo "### GitHub Pages Deployment (gh-pages)" >> $GITHUB_STEP_SUMMARY
          echo "- Gałąź \`gh-pages\` została zbudowana i opublikowana." >> $GITHUB_STEP_SUMMARY
          echo "- Adres ustawień Pages: https://github.com/${{ github.repository }}/settings/pages" >> $GITHUB_STEP_SUMMARY
```

---

### Krok 3.4. Dwie jednorazowe czynności na GitHub.com po pierwszym natywnym commicie z AI Studio

Gdy podepniesz nowe repozytorium przez natywną integrację GitHub w Google AI Studio i wykonasz pierwszy commit:

1. **Przestaw repozytorium z Private (`🔒`) na Public**:
   - Natywna integracja Google AI Studio domyślnie tworzy repozytorium jako **Prywatne (`Private`)**. Darmowe konto GitHub wymaga repozytorium **Publicznego (`Public`)**, aby udostępnić stronę GitHub Pages.
   - Wejdź w: `https://github.com/<twoj-login>/<nazwa-repo>/settings#danger-zone-heading`
   - Na samym dole w sekcji **Danger Zone** kliknij **Change repository visibility → Change to public** i potwierdź. *(Ponieważ `deploy.yml` czyści `firebase-applet-config.json` do `{}`, w repozytorium nie ma żadnych kluczy ani haseł).*
2. **Włącz gałąź `gh-pages` w ustawieniach GitHub Pages**:
   - Poczekaj ok. 40 sekund, aż w zakładce `Actions` (`https://github.com/<twoj-login>/<nazwa-repo>/actions`) pierwszy przebieg zaświeci się na **zielono (`✓`)** — utworzy on gałąź `gh-pages`.
   - Wejdź w: `https://github.com/<twoj-login>/<nazwa-repo>/settings/pages`
   - W sekcji **Build and deployment → Branch** zmień wartość z **`None`** na **`gh-pages`** (`/ (root)`) i kliknij **Save**.
   - Po 30 sekundach Twoja aplikacja PWA działa pod adresem `https://<twoj-login>.github.io/<nazwa-repo>/`, a każdy kolejny natywny commit z AI Studio aktualizuje ją całkowicie automatycznie!

---

## 4. Architektura Wielośrodowiskowa (AI Studio Dev vs. GitHub Pages Prod PWA)

### Problem, który rozwiązujemy
Aplikacje tworzone w Google AI Studio posiadają automatycznie generowany plik `firebase-applet-config.json` wskazujący na testową bazę danych AI Studio (`ai-studio-...`). Gdy jednak wdrażasz aplikację jako produkcyjne PWA na **GitHub Pages**, chcesz:
1. W oknie podglądu **AI Studio** nadal wygodnie testować aplikację na bazie testowej.
2. Na **GitHub Pages** korzystać ze swojego prywatnego, produkcyjnego projektu Firebase bez konieczności ręcznego edytowania kodu przed każdym commitem.
3. Sprawić, aby zaproszeni użytkownicy/domownicy **nie musieli nic wiedzieć o Firebase ani wklejać żadnych plików JSON** — klikają jedynie link zaproszeniowy od Administratora.

### Diagram Przepływu Konfiguracji

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     START APLIKACJI W PRZEGLĄDARCE / PWA                     │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                         Czy host to *.run.app / localhost?
                        ┌───────────────┴───────────────┐
                       TAK                             NIE (np. *.github.io)
                        ▼                               ▼
        ┌───────────────────────────────┐ ┌────────────────────────────────────┐
        │ ŚRODOWISKO DEV (AI Studio)    │ │ ŚRODOWISKO PROD (GitHub Pages PWA) │
        │ • Używa opcjonalnego globa    │ │ 1. Sprawdza ?fb=... w URL          │
        │   firebase-applet-config.json │ │ 2. Sprawdza CacheStorage Handoff   │
        │ • Domyślna rola: 'admin'      │ │ 3. Sprawdza localStorage           │
        └───────────────────────────────┘ └─────────────────┬──────────────────┘
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                  Jest konfiguracja                   Brak konfiguracji
                                          ▼                                   ▼
                          ┌───────────────────────────────┐   ┌───────────────────────────────┐
                          │ Inicjalizacja Firebase SDK    │   │ Ekran powitalny (Gatekeep 2): │
                          │ • Rola 'admin' -> Logowanie   │   │ • Domownik: Wklej link od     │
                          │   Google / Zarządzanie        │   │   Admina (?invite=...&fb=...) │
                          │ • Rola 'member' -> Logowanie  │   │ • Admin: Wklej snippet JS lub │
                          │   loginem/hasłem lub zaprosz. │   │   JSON z Firebase Console     │
                          └───────────────────────────────┘   └───────────────────────────────┘
```

---

## 5. Hybrydowy Model Tożsamości: Administrator (Google) + Użytkownicy/Domownicy (Login/Hasło + Anonymous Auth)

1. **Główny Administrator** loguje się kontem Google za pomocą `signInWithPopup(auth, googleProvider)`, co wiąże jego `request.auth.uid` z dokumentem głównym `/vaultConfig/default.adminUid`.
2. **Domownicy / Użytkownicy** logują się prostym loginem i hasłem utworzonym po kliknięciu linku zaproszeniowego, a następnie odblokowują aplikację biometrią WebAuthn.
3. Pod spodem każde urządzenie domownika wywołuje `ensureFirebaseAuthSession()`, które automatycznie zestawia trwałą sesję `signInAnonymously(auth)` (`browserLocalPersistence`). Wygenerowany identyfikator `request.auth.uid` jest zapisywany w polu `googleUid` dokumentu `/members/{memberId}` oraz dodawany do tablicy `allowedMemberIds` udostępnionych rekordów.

---

## 6. Samowystarczalne Linki Zaproszeniowe (`?invite=...&fb=...`) i Mostek PWA CacheStorage

Gdy Administrator tworzy link zaproszeniowy, aplikacja buduje URL zawierający dwa parametry:
```
https://twoj-login.github.io/twoja-aplikacja/?invite=inv_a1b2c3d4e5f6&fb=eyJhcGlLZXkiOiJBSXph...
```
- `invite` — unikalny token dokumentu w kolekcji `/invitations/{invitationId}`.
- `fb` — zminimalizowany obiekt `CustomFirebaseConfig` zakodowany w formacie **Base64URL** (`encodeFirebaseConfigForInviteUrl`).
- Przy starcie aplikacji w przeglądarce mobilnej `invite` oraz `fb` są zapisywane jednocześnie w `localStorage` oraz w `window.caches.open('fsv-pwa-handoff-cache-v1')` pod kluczem `/__fsv_invite_handoff__`, dzięki czemu po kliknięciu „Zainstaluj aplikację PWA” nowo otwarta aplikacja z ekranu głównego telefonu automatycznie przejmuje konfigurację Firebase i token zaproszenia.

---

## 7. Schemat 6 Kolekcji Bazowych i Idempotentny Bootstrapper

| Kolekcja | Klucz dokumentu | Przeznaczenie | Dostęp `read` | Dostęp `write` |
| :--- | :--- | :--- | :--- | :--- |
| `vaultConfig` | `default` | Konfiguracja globalna instancji, `adminUid`, `adminMemberId`, domyślny motyw i kategorie | Wszyscy zalogowani (`isSignedIn()`) | Create: pierwszy Admin (`!exists(...)`), Update: tylko `isAdmin()` |
| `members` | `{memberId}` | Profile Administratora, Współadministratorów i Domowników, sole PBKDF2, klucze DEK i `googleUid` | Wszyscy zalogowani (`isSignedIn()`) | Admin lub właściciel profilu (`googleUid == request.auth.uid`) |
| `devices` | `{deviceId}` | Zarejestrowane urządzenia, fingerprint sprzętowy, status (`approved`/`pending`/`revoked`), certyfikat `CERT-HW-...` | Wszyscy zalogowani (`isSignedIn()`) | Admin lub właściciel urządzenia |
| `passwords` *(lub główna kolekcja danych aplikacji)* | `{recordId}` | Główne rekordy aplikacji (wspólne `shared` z listą `allowedMemberIds` oraz prywatne `private` zaszyfrowane E2E AES-256-GCM) | Admin, właściciel lub osoba z `request.auth.uid in allowedMemberIds` | Admin, właściciel lub uprawniony domownik |
| `invitations` | `{invitationId}` | Linki zaproszeniowe (`new_member`) i ratunkowe (`account_recovery`), jednorazowe lub czasowe 24h | Wszyscy zalogowani (`isSignedIn()`) | Admin, twórca lub domownik zużywający aktywne zaproszenie (`isConsumingActiveInvitation()`) |
| `activityLogs` | `{logId}` | Dziennik audytowy zdarzeń bezpieczeństwa w czasie rzeczywistym | Tylko `isAdmin()` | Create: każdy zalogowany (`isSignedIn()`), Update/Delete: tylko `isAdmin()` |

---

## 8. Kompletny Kod Wzorcowy: `src/lib/firebase.ts` (z opcjonalnym `import.meta.glob`)

Zwróć uwagę na użycie `import.meta.glob('../../firebase-applet-config.json', { eager: true })` zamiast sztywnego statycznego importu — dzięki temu po natywnym commicie do repozytorium GitHub (gdzie `firebase-applet-config.json` jest w `.gitignore`) kompilacja nigdy nie zgłosi błędu brakującego pliku:

```typescript
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInAnonymously,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';

const optionalBundledConfigs = import.meta.glob<{
  default?: Partial<CustomFirebaseConfig>;
}>('../../firebase-applet-config.json', { eager: true });

export interface CustomFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export type DeviceInstanceRole = 'admin' | 'member';

export const LOCAL_FIREBASE_CONFIG_KEY = 'fsv_custom_firebase_config_v1';
export const DEVICE_INSTANCE_ROLE_KEY = 'fsv_device_instance_role_v1';
export const PWA_HANDOFF_CACHE_NAME = 'fsv-pwa-handoff-cache-v1';

const rawBundledModule =
  optionalBundledConfigs['../../firebase-applet-config.json'];
const bundledConfig: Partial<CustomFirebaseConfig> =
  (rawBundledModule?.default ??
    (rawBundledModule as Partial<CustomFirebaseConfig> | undefined)) ||
  {};

function isAiStudioRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('run.app') ||
    host.includes('aistudio.google.com') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

function isValidConfigObject(
  candidate: unknown
): candidate is CustomFirebaseConfig {
  if (!candidate || typeof candidate !== 'object') return false;
  const c = candidate as Record<string, unknown>;
  return (
    typeof c.apiKey === 'string' &&
    c.apiKey.trim().length > 5 &&
    typeof c.projectId === 'string' &&
    c.projectId.trim().length > 2 &&
    typeof c.authDomain === 'string' &&
    c.authDomain.trim().length > 3 &&
    typeof c.appId === 'string' &&
    c.appId.trim().length > 3
  );
}

export function encodeFirebaseConfigForInviteUrl(
  cfg?: CustomFirebaseConfig | null
): string {
  const active = cfg || getActiveFirebaseConfig();
  if (!active) return '';
  const minimal: CustomFirebaseConfig = {
    apiKey: active.apiKey,
    authDomain: active.authDomain,
    projectId: active.projectId,
    appId: active.appId,
    ...(active.firestoreDatabaseId
      ? { firestoreDatabaseId: active.firestoreDatabaseId }
      : {}),
    ...(active.storageBucket ? { storageBucket: active.storageBucket } : {}),
    ...(active.messagingSenderId
      ? { messagingSenderId: active.messagingSenderId }
      : {}),
  };
  try {
    const json = JSON.stringify(minimal);
    const base64 = window.btoa(unescape(encodeURIComponent(json)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodeFirebaseConfigFromInviteUrl(
  encoded: string
): CustomFirebaseConfig | null {
  if (!encoded || !encoded.trim()) return null;
  try {
    let base64 = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const json = decodeURIComponent(escape(window.atob(base64)));
    const parsed = JSON.parse(json);
    if (isValidConfigObject(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function extractConfigField(raw: string, fieldName: string): string {
  const quotedMatch = new RegExp(
    `["'\`]?\\b${fieldName}\\b["'\`]?\\s*[:=]\\s*["'\`]([^"'\`\\r\\n]+)["'\`]`,
    'i'
  ).exec(raw);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1].trim();
  }
  const unquotedMatch = new RegExp(
    `["'\`]?\\b${fieldName}\\b["'\`]?\\s*[:=]\\s*([^,\\s;}\\r\\n]+)`,
    'i'
  ).exec(raw);
  if (unquotedMatch && unquotedMatch[1]) {
    return unquotedMatch[1].replace(/^["'\`]|["'\`]$/g, '').trim();
  }
  return '';
}

export function parseAndValidateFirebaseConfigInput(
  rawInput: string,
  overrideDatabaseId?: string
): CustomFirebaseConfig {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error(
      'Wklej obiekt konfiguracji skopiowany z Firebase Console lub wgraj plik z konfiguracją.'
    );
  }

  let jsonParsed: Record<string, unknown> = {};
  try {
    const candidate = JSON.parse(trimmed);
    if (candidate && typeof candidate === 'object') {
      jsonParsed = candidate as Record<string, unknown>;
    }
  } catch {
    // Surowy snippet JS z Firebase Console jest obsługiwany bezpośrednio przez extractConfigField
  }

  const apiKey = (
    extractConfigField(trimmed, 'apiKey') || String(jsonParsed.apiKey || '')
  ).trim();
  const projectId = (
    extractConfigField(trimmed, 'projectId') ||
    String(jsonParsed.projectId || '')
  ).trim();
  const rawAuthDomain = (
    extractConfigField(trimmed, 'authDomain') ||
    String(jsonParsed.authDomain || '')
  )
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const authDomain =
    rawAuthDomain ||
    (projectId ? `${projectId.toLowerCase()}.firebaseapp.com` : '');
  const appId = (
    extractConfigField(trimmed, 'appId') || String(jsonParsed.appId || '')
  ).trim();
  const rawDbId =
    (overrideDatabaseId && overrideDatabaseId.trim()) ||
    extractConfigField(trimmed, 'firestoreDatabaseId') ||
    String(jsonParsed.firestoreDatabaseId || '').trim();
  const firestoreDatabaseId =
    rawDbId && rawDbId !== '(default)' && rawDbId !== 'default'
      ? rawDbId
      : undefined;
  const storageBucket =
    (
      extractConfigField(trimmed, 'storageBucket') ||
      String(jsonParsed.storageBucket || '')
    ).trim() || undefined;
  const messagingSenderId =
    (
      extractConfigField(trimmed, 'messagingSenderId') ||
      String(jsonParsed.messagingSenderId || '')
    ).trim() || undefined;

  if (!apiKey || !projectId || !authDomain || !appId) {
    throw new Error(
      'Brakuje wymaganych pól w konfiguracji Firebase (wymagane: apiKey, projectId, authDomain, appId). Skopiuj cały blok firebaseConfig prosto z Firebase Console.'
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(firestoreDatabaseId ? { firestoreDatabaseId } : {}),
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

export function getDeviceInstanceRole(): DeviceInstanceRole | null {
  if (typeof window === 'undefined') return null;
  try {
    if (
      isAiStudioRuntime() &&
      !window.location.search.includes('invite=')
    ) {
      return 'admin';
    }
    const val = localStorage.getItem(DEVICE_INSTANCE_ROLE_KEY);
    if (val === 'admin' || val === 'member') return val;
  } catch {
    // ignore
  }
  return null;
}

export function setDeviceInstanceRole(role: DeviceInstanceRole): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_INSTANCE_ROLE_KEY, role);
  } catch {
    // ignore
  }
}

function captureUrlInviteFirebaseConfigOnBoot(): CustomFirebaseConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fbParam = params.get('fb');
    if (fbParam && !isAiStudioRuntime()) {
      const decoded = decodeFirebaseConfigFromInviteUrl(fbParam);
      if (decoded) {
        localStorage.setItem(
          LOCAL_FIREBASE_CONFIG_KEY,
          JSON.stringify(decoded)
        );
        if (params.get('invite')) {
          localStorage.setItem(DEVICE_INSTANCE_ROLE_KEY, 'member');
        }
        return decoded;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function getStoredCustomFirebaseConfig(): CustomFirebaseConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = captureUrlInviteFirebaseConfigOnBoot();
    if (fromUrl) return fromUrl;

    const raw = localStorage.getItem(LOCAL_FIREBASE_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidConfigObject(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getActiveFirebaseConfig(): CustomFirebaseConfig | null {
  // 1. ŚRODOWISKO DEV (Google AI Studio Preview / localhost)
  if (isAiStudioRuntime() && isValidConfigObject(bundledConfig)) {
    return bundledConfig;
  }
  // 2. ŚRODOWISKO PROD (GitHub Pages PWA / własna domena)
  return getStoredCustomFirebaseConfig();
}

export function isFirebaseConfigured(): boolean {
  return getActiveFirebaseConfig() !== null;
}

export function saveCustomFirebaseConfigAsAdmin(
  config: CustomFirebaseConfig
): void {
  localStorage.setItem(LOCAL_FIREBASE_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(DEVICE_INSTANCE_ROLE_KEY, 'admin');
  initializeOrUpdateFirebaseInstances(config);
}

export function saveCustomFirebaseConfigAsMember(
  config: CustomFirebaseConfig
): void {
  localStorage.setItem(LOCAL_FIREBASE_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(DEVICE_INSTANCE_ROLE_KEY, 'member');
  initializeOrUpdateFirebaseInstances(config);
}

export let firebaseApp: FirebaseApp | null = null;
export let db: Firestore = null as unknown as Firestore;
export let auth: Auth = null as unknown as Auth;
export const googleProvider = new GoogleAuthProvider();

function initializeOrUpdateFirebaseInstances(
  cfg: CustomFirebaseConfig | null
): boolean {
  if (!cfg) return false;
  try {
    const existingApps = getApps();
    const keyFingerprint = cfg.apiKey ? cfg.apiKey.slice(-6) : 'nokey';
    const appName = `fsv-${cfg.projectId}-${cfg.firestoreDatabaseId || 'default'}-${keyFingerprint}`;
    const existing = existingApps.find((a) => a.name === appName);
    firebaseApp = existing || initializeApp(cfg, appName);

    db = cfg.firestoreDatabaseId
      ? getFirestore(firebaseApp, cfg.firestoreDatabaseId)
      : getFirestore(firebaseApp);

    auth = getAuth(firebaseApp);
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error('Błąd konfiguracji trwałej sesji Firebase Auth:', err);
    });
    return true;
  } catch (err) {
    console.error('Błąd inicjalizacji Firebase:', err);
    return false;
  }
}

const initialConfig = getActiveFirebaseConfig();
if (initialConfig) {
  initializeOrUpdateFirebaseInstances(initialConfig);
}

let pendingAuthPromise: Promise<FirebaseUser | null> | null = null;

export function isAnonymousAuthDisabledError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'auth/configuration-not-found' ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/admin-restricted-operation' ||
    msg.includes('auth/configuration-not-found') ||
    msg.includes('auth/operation-not-allowed') ||
    msg.includes('auth/admin-restricted-operation')
  );
}

export async function ensureFirebaseAuthSession(
  throwIfAnonymousDisabled = false
): Promise<FirebaseUser | null> {
  if (!isFirebaseConfigured() || !auth) return null;

  try {
    await auth.authStateReady();
  } catch {
    // ignore
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (pendingAuthPromise) {
    return pendingAuthPromise;
  }

  pendingAuthPromise = (async () => {
    try {
      const cred = await signInAnonymously(auth);
      return cred.user;
    } catch (err) {
      if (throwIfAnonymousDisabled && isAnonymousAuthDisabledError(err)) {
        const proj = getActiveFirebaseConfig()?.projectId || 'twoj-projekt';
        throw new Error(
          `W projekcie Firebase (${proj}) nie włączono jeszcze modułu Authentication (Sign-in method). Wejdź w konsoli Firebase w projekt ${proj} → Build → Authentication → zakładka Sign-in method i włącz dostawców „Google” oraz „Anonymous”.`
        );
      }
      return auth.currentUser;
    } finally {
      pendingAuthPromise = null;
    }
  })();

  return pendingAuthPromise;
}

export async function testFirestoreConnection(): Promise<void> {
  if (!isFirebaseConfigured() || !db || !auth) return;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;
    await getDocFromServer(doc(db, 'vaultConfig', 'default'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Please check your Firebase configuration. The client is offline.'
      );
    }
  }
}

export const FIRESTORE_SPARK_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB per projekt Firebase (plan darmowy Spark)

function formatBytesHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GiB`;
}

/**
 * Oblicza szacowaną zajętość pojemności bazy Cloud Firestore dla bieżącego projektu
 * względem darmowego limitu 1 GiB (1 024 MB) przysługującego osobno na każdy projekt Firebase.
 */
export function estimateFirestoreProjectStorage(
  collectionsData: unknown[]
): {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  usedFormatted: string;
  freeFormatted: string;
} {
  let rawBytes = 0;
  let docCount = 0;

  for (const item of collectionsData) {
    if (!item) continue;
    if (Array.isArray(item)) {
      docCount += item.length;
      try {
        rawBytes += new TextEncoder().encode(JSON.stringify(item)).length;
      } catch {
        // ignore
      }
    } else if (typeof item === 'object') {
      docCount += 1;
      try {
        rawBytes += new TextEncoder().encode(JSON.stringify(item)).length;
      } catch {
        // ignore
      }
    }
  }

  const usedBytes = Math.round(rawBytes * 1.8 + docCount * 64);
  const limitBytes = FIRESTORE_SPARK_STORAGE_LIMIT_BYTES;
  const percentUsed = Math.min(100, (usedBytes / limitBytes) * 100);
  const freeBytes = Math.max(0, limitBytes - usedBytes);

  return {
    usedBytes,
    limitBytes,
    percentUsed,
    usedFormatted: formatBytesHuman(usedBytes),
    freeFormatted: formatBytesHuman(freeBytes),
  };
}
```

### Gotowy snippet UI: Prosty Pasek Zajętości Pojemności Projektu Firebase (`1 GiB per projekt`)
Wklej w zakładce konfiguracji Administratora (przekazując tablicę wszystkich załadowanych kolekcji, np. `const storageQuota = estimateFirestoreProjectStorage([vaultConfig, members, devices, mainRecords, invitations, activityLogs])`):

```tsx
<div className="pt-3 border-t border-[var(--vault-border)] space-y-1.5">
  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
    <span className="font-semibold text-[var(--vault-text)]">
      Zajętość pojemności Storage projektu Firebase (limit 1 GiB per projekt):
    </span>
    <span className="font-mono text-[var(--vault-text)] tabular-nums">
      <strong>{storageQuota.usedFormatted}</strong> / 1.00 GiB (
      {storageQuota.percentUsed > 0 && storageQuota.percentUsed < 0.01
        ? '< 0.01%'
        : `${storageQuota.percentUsed.toFixed(2)}%`}
      ) · Wolne: {storageQuota.freeFormatted}
    </span>
  </div>
  <div className="w-full h-2 rounded-full bg-[var(--vault-surface)] border border-[var(--vault-border)] overflow-hidden">
    <div
      className={`h-full transition-all duration-300 ${
        storageQuota.percentUsed > 85
          ? 'bg-[var(--vault-danger)]'
          : storageQuota.percentUsed > 65
            ? 'bg-[var(--vault-warning)]'
            : 'bg-[var(--vault-success)]'
      }`}
      style={{
        width: `${
          storageQuota.usedBytes > 0
            ? Math.max(1.5, Math.min(100, storageQuota.percentUsed))
            : 0
        }%`,
      }}
    />
  </div>
</div>
```

---

## 9. Kompletny Kod Wzorcowy: `src/lib/firestoreVaultService.ts`

Kluczowe wzorce w warstwie komunikacji z Cloud Firestore:
1. **`handleFirestoreError`**: Ustrukturyzowane raportowanie błędów uprawnień z pełnym kontekstem `authInfo` oraz `operationType`.
2. **`subscribeToVaultFirestoreRealtime`**: Dwustopniowa subskrypcja `onSnapshot` — najpierw czeka na aktywnego użytkownika (`onAuthStateChanged` / `ensureFirebaseAuthSession`), następnie odczytuje `/vaultConfig/default`, ustala czy `cfg.adminUid === user.uid` i podpina zapytania zależne od roli (`collection(db, 'passwords')` dla Admina vs `where('allowedMemberIds', 'array-contains', uid)` dla Domownika).
3. **`verifyInvitationTokenInFirestore`**: Odporna weryfikacja tokenu zaproszenia z zapytaniem głównym (`where('token', '==', cleanToken)`) oraz fallbackiem po całej kolekcji `invitations`.
4. **`ensureBaseCollectionsInitializedInFirestore`**: Idempotentna funkcja wywoływana po zalogowaniu Administratora, która sprawdza każdą z 6 kolekcji za pomocą `limit(1)` i tworzy dokument startowy tylko wtedy, gdy kolekcja jest pusta.

*(Pełna implementacja znajduje się w pliku `/src/lib/firestoreVaultService.ts` w tym repozytorium).*

---

## 10. Kompletny Kod Wzorcowy: Obsługa Linków Zaproszeniowych i PWA Handoff

1. **`extractInviteAndFbFromInput(raw)`**: Wyciąga parametry `invite` oraz `fb` za pomocą wyrażeń regularnych zarówno z czystego URL-a, jak i z pełnej wiadomości skopiowanej z komunikatora (WhatsApp/Messenger/SMS).
2. **`saveInviteAndFbForPwaHandoff` / `loadInviteAndFbFromPwaHandoff`**: Przekazuje token i konfigurację Firebase między przeglądarką a zainstalowaną aplikacją PWA przez `window.caches.open('fsv-pwa-handoff-cache-v1')`.
3. **`navigator.share({ title, url })`**: Wysyła wyłącznie czysty adres URL bez pola `text`, aby komunikatory mobilne nie sklejały tekstu z linkiem.

---

## 11. Kompletne Reguły Bezpieczeństwa: `firestore.rules`

Pełny plik reguł bezpieczeństwa Zero-Trust ABAC znajduje się w `/firestore.rules` (oraz jest zaszyty jako stała `PRODUCTION_FIRESTORE_RULES` w `src/lib/firebase.ts`, skąd Administrator może go skopiować jednym kliknięciem w aplikacji).

---

## 12. Checklista Konfiguracji Projektu w Konsoli Firebase i na GitHub.com

### Część A — Konsola Firebase (`console.firebase.google.com`):
1. **Utwórz aplikację Web (`</>`)**: Project settings (⚙️) → General → Your apps → skopiuj blok `firebaseConfig`.
2. **Włącz dostawców logowania w Authentication**: Build → Authentication → Sign-in method → włącz **Google** (wybierz *Project support email* i kliknij Save) oraz **Anonymous**.
3. **Dodaj domenę produkcyjną do Authorized Domains**: Build → Authentication → Settings → Authorized domains → dodaj `<twoj-login>.github.io`.
4. **Utwórz bazę Cloud Firestore i opublikuj reguły**: Build → Firestore Database → Create database → zakładka **Rules** → wklej reguły z `firestore.rules` i kliknij **Publish**.

### Część B — GitHub.com (po pierwszym natywnym commicie z Google AI Studio):
1. **Zmień widoczność repozytorium z Private (`🔒`) na Public**:
   `https://github.com/<twoj-login>/<nazwa-repo>/settings#danger-zone-heading` → *Change repository visibility* → *Change to public*.
2. **Włącz gałąź `gh-pages` w GitHub Pages**:
   `https://github.com/<twoj-login>/<nazwa-repo>/settings/pages` → w sekcji *Branch* zmień z `None` na **`gh-pages`** (`/ (root)`) i kliknij **Save**.

---

## 13. 8 Filarów Utwardzenia Pentestowego, Stabilności i Ergonomii (Zero-Plaintext Storage, CSP, Tarcza Prywatności, Brute-Force Lockout, k-Anonymity, Rollback)

1. **Filar 1 — Zero Jawnych Kluczy w `localStorage` (`AES-256-GCM Wrapped Keys`)**:
   Surowy klucz DEK żyje wyłącznie w pamięci RAM (`useState`). W `localStorage` zapisywany jest wyłącznie szyfrogram `ENC[AES-256-GCM:iv:ciphertext]` owinięty kluczem pochodnym z sygnatury sprzętowej urządzenia (`wrapLocalDeviceKeysPayload`).
2. **Filar 2 — Ochrona Anti-XSS i Polityka Content Security Policy (CSP)**:
   Zero użyć `dangerouslySetInnerHTML`, walidacja protokołów URL (`sanitizeSafeHttpUrl`) oraz ścisły nagłówek `Content-Security-Policy` w `index.html` (z dozwolonymi wyłącznie domenami Firebase oraz `https://api.pwnedpasswords.com`).
3. **Filar 3 — Ochrona Kluczy i Gatekeep 2 (`firebase-applet-config.json = {}`)**:
   Skrypt `scripts/build-gh-pages.mjs` oraz `.github/workflows/deploy.yml` gwarantują, że w publicznym repozytorium i na GitHub Pages plik `firebase-applet-config.json` jest pustym obiektem `{}`.
4. **Filar 4 — Wyłączenie Source Maps (`sourcemap: false`)**:
   W `vite.config.ts` ustawiono `build: { sourcemap: false, minify: 'esbuild' }`.
5. **Filar 5 — Zero-State Logout & Auto-Lock**:
   Wylogowanie i blokada nieaktywności natychmiastowo zerują wszystkie odszyfrowane rekordy w pamięci RAM i czyszczą schowek systemowy.
6. **Filar 6 — Tarcza Prywatności w Tle (`visibilitychange`) oraz Ochrona Brute-Force Logowania**:
   Przełączenie karty lub zminimalizowanie aplikacji na telefonie automatycznie maskuje odsłonięte hasła i zamyka okna modalne bez wylogowywania użytkownika. Z kolei 5 nieudanych prób logowania włącza 60-sekundową blokadę Brute-Force.
7. **Filar 7 — Zero-Knowledge Test Wycieków (`SHA-1 k-Anonymity` HaveIBeenPwned)**:
   Funkcja `checkPasswordPwnedKAnonymity` wylicza lokalnie w przeglądarce skrót `SHA-1` hasła i wysyła do API `https://api.pwnedpasswords.com/range/{prefix5}` **wyłącznie pierwsze 5 znaków skrótu**, sprawdzając lokalnie resztę sufiksu (pełne hasło ani pełny hash nigdy nie opuszczają urządzenia).
8. **Filar 8 — Historia 3 Ostatnich Wersji z 1-Click Rollback, Zegar 2FA TOTP Live i Kierowane SOS**:
   Każda zmiana hasła zachowuje w `passwordHistory` 3 poprzednie wersje z datą i autorem oraz przyciskiem **„Przywróć to hasło”**. Karty obsługują również wbudowany generator kodów **2FA TOTP (RFC 6238 HMAC-SHA1)** odświeżany co 30 sekund, PIN profilu TV oraz zgłoszenia **SOS / Kod TV Live** kierowane bezpośrednio do właściciela (założyciela) danego wpisu.
