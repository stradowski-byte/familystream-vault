# Plan Wdrożenia: Naprawa Kroku 5 (`Install dependencies`) w GitHub Actions i Automatyczny Start GitHub Pages

## 1. Potwierdzona diagnoza z logów repozytorium `stradowski-byte/familystream-vault`
Repozytorium jest już **Publiczne**, dzięki czemu odczytaliśmy dokładny raport z ostatniego uruchomienia GitHub Actions (`Run #42408184494`):
- Kroki 1–4 przeszły na zielono (`success`).
- **Krok 5 (`Install dependencies`) zakończył się błędem (`failure`)**, ponieważ w kontenerze Google AI Studio plik `package.json` używa wewnętrznych wersji pakietów z prywatnego rejestru AI Studio (m.in. `@firebase/eslint-plugin-security-rules`, `vite: ^8.3.0`, `typescript: ^7.0.2`), których nie ma na publicznym serwerze `registry.npmjs.org`. Przez to kroki 6–9 (budowanie i utworzenie gałęzi `gh-pages`) zostały pominięte (`skipped`).

---

## 2. Zakres zmian (100% zielony workflow w ~8 sekund)

### A. Automatyczny Pre-Build czystej paczki produkcyjnej w AI Studio (`scripts/build-gh-pages.mjs` + katalog `docs/`)
1. Dodamy skrypt `scripts/build-gh-pages.mjs` podpięty pod `npm run build`, który wewnątrz Google AI Studio:
   - Tymczasowo podmienia zawartość `firebase-applet-config.json` na pusty obiekt `{}` (gwarancja Gatekeep 2 — klucze testowe z AI Studio nigdy nie trafiają do buildu produkcyjnego ani na GitHuba),
   - Uruchamia `vite build`, a następnie natychmiast przywraca lokalny plik `firebase-applet-config.json` dla podglądu w AI Studio,
   - Kopiuje `index.html` do `404.html` i tworzy plik `.nojekyll`,
   - Zapisuje gotowy, czysty pakiet produkcyjny PWA w katalogu **`docs/`** (śledzonym przez Git i wysyłanym podczas natywnego commita z AI Studio).

### B. Przebudowa `.github/workflows/deploy.yml` (Zero `npm install` na serwerze GitHuba)
1. Usunięcie kroku `npm install` z `.github/workflows/deploy.yml`.
2. Workflow na serwerze GitHuba pobiera gotowy katalog produkcyjny `docs/` bezpośrednio z natywnego commita, publikuje go na gałęzi **`gh-pages`** (`peaceiris/actions-gh-pages@v4`) i automatycznie włącza usługę GitHub Pages dla gałęzi `gh-pages` (lub `/docs`) przez GitHub REST API.
3. Czas wykonania akcji spadnie do **~8 sekund**, a strona **`https://stradowski-byte.github.io/familystream-vault/`** uruchomi się automatycznie po natywnym commicie.
