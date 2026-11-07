# Plan Naprawy: Zielony Build w GitHub Actions (`--legacy-peer-deps` + `Node.js 24`)

## 1. Dokładna przyczyna błędów w Run #1 i Run #2
1. **Dlaczego Run #2 (`e8afb93`) zgłosił brak katalogu `docs/`?**
   Natywny mechanizm commitów w Google AI Studio wysyła do GitHuba wyłącznie pliki utworzone przez narzędzia edycji kodu AI Studio, a ignoruje katalogi wygenerowane przez komendy terminalowe (takie jak `docs/` czy `dist/`). Oznacza to, że kompilacja `npm run build` musi wykonać się po stronie GitHub Actions.
2. **Dlaczego Run #1 (`86741af`) wywalił się na kroku `npm install`?**
   Przetestowaliśmy czystą instalację w izolowanym katalogu i znaleźliśmy dwie blokady:
   - Konflikt `ERESOLVE` pomiędzy `@typescript-eslint/parser@8.72.1` (wymaganym przez `@firebase/eslint-plugin-security-rules`) a `typescript@7.0.2` — domyślny `npm install` przerywa pracę z kodem błędu `1`, natomiast **`npm install --legacy-peer-deps`** przechodzi w 100% bezbłędnie (kod wyjścia `0`).
   - Nowe pakiety `@firebase/*` wymagają silnika **`Node.js >= 24.12.0`**.

---

## 2. Zakres zmian w projekcie

### A. Aktualizacja `.github/workflows/deploy.yml`
1. **Środowisko `Node.js 24`**: Zmiana `node-version` z `22` na `'24'` (spełnia wymagania `@firebase/* >= 24.12.0`).
2. **Instalacja z `--legacy-peer-deps`**: Uruchomienie `npm install --legacy-peer-deps --no-audit --no-fund`, co całkowicie eliminuje błąd `ERESOLVE` podczas instalacji zależności na serwerze GitHuba.
3. **Czysty build produkcyjny (`npm run build`)**: Uruchomienie `node scripts/build-gh-pages.mjs`, który tworzy czysty `firebase-applet-config.json` (`{}`), buduje pakiet PWA do `dist/` i dokłada `dist/404.html` oraz `dist/.nojekyll`.
4. **Publikacja `dist/` na gałąź `gh-pages` + aktywacja GitHub Pages**: Automatyczne wypchnięcie katalogu `./dist` na gałąź `gh-pages` oraz włączenie usługi GitHub Pages przez GitHub API pod adresem `https://stradowski-byte.github.io/familystream-vault/`.
