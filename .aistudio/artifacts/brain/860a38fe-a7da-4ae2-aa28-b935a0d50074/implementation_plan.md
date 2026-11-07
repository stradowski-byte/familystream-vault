# Plan Wdrożenia: Kompleksowa Aktualizacja Dokumentacji Migracyjnej (`FIREBASE_BLUEPRINT_GUIDE.md` & `README.md`)

## 1. Cel zmian
Przygotowanie kompletnej, samowystarczalnej dokumentacji w plikach `FIREBASE_BLUEPRINT_GUIDE.md` oraz `README.md`, dzięki której w kolejnym projekcie Google AI Studio wystarczy przekazać ten dokument i wydać polecenie:
*„Przeczytaj `FIREBASE_BLUEPRINT_GUIDE.md` i wdróż opisane zmiany w kontekście tej aplikacji”*,
aby agent automatycznie przeprowadził:
1. **Migrację z Google Drive (GDrive API / pliki JSON) na Firebase Cloud Firestore (`onSnapshot` Real-Time + Hybrydowe Auth)**,
2. **Migrację z wbudowanej w aplikację obsługi GitHuba (zakładka UI, tokeny PAT, endpointy `/api/github/*` w `server.ts`) na Natywną Integrację GitHub w Google AI Studio + automatyczne wdrożenie GitHub Pages (`gh-pages`) przez GitHub Actions**.

---

## 2. Zakres aktualizacji w `FIREBASE_BLUEPRINT_GUIDE.md`

### A. Rozbudowa Rozdziału 1 o dwa gotowe Master Prompty („Kopiuj-Wklej” dla AI Studio):
- **Wariant A — Budowa nowej aplikacji od zera** w oparciu o wzorzec Firebase + Natywny GitHub AI Studio.
- **Wariant B — Automatyczna Migracja istniejącej aplikacji (z Google Drive + wbudowanego GitHuba w aplikacji na Firebase Cloud Firestore + Natywny GitHub AI Studio)**: gotowa instrukcja nakazująca agentowi w drugim projekcie zachowanie całej logiki biznesowej tamtej aplikacji przy jednoczesnej wymianie warstwy synchronizacji danych i wdrożenia.

### B. Nowy Rozdział: Pełna Procedura Migracji z Google Drive na Firebase Cloud Firestore (Krok po Kroku)
1. **Inwentaryzacja i demontaż warstwy Google Drive**:
   - Co dokładnie usunąć (klient GDrive REST API, tokeny OAuth `drive.file`/`drive.appdata`, ręczne pobieranie/wysyłanie plików JSON, mechanizmy scalania konfliktów plików Drive).
2. **Mapowanie modelu danych na kolekcje Cloud Firestore**:
   - Jak zamienić strukturę pliku JSON z Google Drive na kolekcje Firestore (`vaultConfig`, `members`, `devices`, kolekcje domenowe aplikacji, `invitations`, `activityLogs`).
   - Jak wdrożyć subskrypcję `onSnapshot` w czasie rzeczywistym, idempotentne zakładanie kolekcji (`ensureBaseCollectionsInitializedInFirestore`) oraz lokalne szyfrowane kopie zapasowe (`.enc`) zastępujące ręczne pliki na Dysku Google.
3. **Aktualizacja `src/lib/firebase.ts`** z opcjonalnym ładowaniem `import.meta.glob('../../firebase-applet-config.json', { eager: true })`.

### C. Nowy Rozdział: Przejście z Wbudowanego w Aplikację GitHuba na Natywną Integrację Google AI Studio + GitHub Pages (`gh-pages`)
1. **Lista elementów do usunięcia z aplikacji**:
   - Usunięcie zakładki/komponentu GitHub z UI (`AdminTab4GitHubAndUpdates.tsx`, `githubDeployClient.ts`, typy `GitHubSyncConfig`/`GitHubPushResult`, zakładka w `TopBar.tsx`).
   - Odchudzenie `server.ts` (usunięcie `/api/github/config`, `/api/github/push`, `/api/github/pages-status`, `data/github-deploy-meta.json` oraz `GITHUB_PAT` z `.env.example`).
   - Wyczyszczenie `Content-Security-Policy` w `index.html` z domen `api.github.com`.
2. **Lista plików i skryptów do dodania (z pełnym kodem 1:1 do skopiowania)**:
   - Pełny kod `scripts/build-gh-pages.mjs` (tymczasowe czyszczenie `firebase-applet-config.json` do `{}` na czas `vite build`, generowanie `dist/404.html` i `dist/.nojekyll`, przywracanie pliku testowego po kompilacji).
   - Aktualizacja `package.json` (`"build": "node scripts/build-gh-pages.mjs"`) oraz względnych ścieżek `./` w `vite.config.ts` i `index.html`.
   - Pełny, przetestowany kod `.github/workflows/deploy.yml` (z `Node.js 24`, usunięciem konfliktowego `@firebase/eslint-plugin-security-rules` na czas CI, flagą `npm install --legacy-peer-deps`, budowaniem `dist/` i publikacją na `gh-pages`).
3. **Instrukcja 2 jednorazowych kroków na GitHub.com po pierwszym natywnym commicie z AI Studio**:
   - Krok 1: Zmiana widoczności repozytorium z **Private (`🔒`)** na **Public** w `Settings → Danger Zone`.
   - Krok 2: Włączenie publikacji w `Settings → Pages` poprzez wybór gałęzi **`gh-pages` (`/ root`) → Save**.
4. **Wzór sekcji aktualnych linków w zakładce Konfiguracji Administratora** (`Danger Zone`, `GitHub Pages PWA`, `GitHub Actions`, `Settings -> Pages` oraz głębokie linki do konsoli Firebase).

---

## 3. Zakres aktualizacji w `README.md`
- Aktualizacja opisu architektury o natywny przepływ CI/CD (Google AI Studio Native GitHub Commit → GitHub Actions `Node.js 24` → `gh-pages`), nowe funkcje bezpieczeństwa (Tarcza Prywatności w tle, Ochrona Brute-Force, Test Wycieków Zero-Knowledge k-Anonymity HIBP, Historia 3 wersji haseł z 1-Click Rollback, zegar 2FA TOTP Live, PIN profilu, SOS do właściciela hasła) oraz bezpośrednie odwołanie do zaktualizowanego przewodnika migracji w `FIREBASE_BLUEPRINT_GUIDE.md`.
