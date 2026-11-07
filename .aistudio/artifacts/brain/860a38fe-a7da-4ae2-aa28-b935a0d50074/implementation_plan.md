# Plan Wdrożenia: Aktualizacja zakładki „Kopie i Konfiguracja” oraz przełączenie repozytorium z Private na Public

## 1. Dlaczego zmiana repozytorium na Public jest kluczowa?
Natywna integracja GitHub w Google AI Studio domyślnie tworzy repozytorium `stradowski-byte/familystream-vault` jako **Prywatne (Private)**. Na darmowym koncie GitHub usługa **GitHub Pages działa wyłącznie dla repozytoriów Publicznych (Public)** — dopóki repozytorium jest prywatne, GitHub blokuje publikację strony `https://stradowski-byte.github.io/familystream-vault/`.
Ponieważ nasz workflow `.github/workflows/deploy.yml` podczas budowania czyści `firebase-applet-config.json` do pustego obiektu `{}`, repozytorium nie zawiera żadnych haseł ani kluczy prywatnych i może być w 100% bezpiecznie ustawione jako **Public**.

---

## 2. Zakres zmian w aplikacji

### A. Dodanie panelu „Repozytorium GitHub, Widoczność Public i Adres Produkcyjny PWA” w zakładce `Kopie i Konfiguracja` (`/src/components/AdminTab3ConfigAndBackup.tsx`)
W sekcji 01 zakładki **Kopie i Konfiguracja** dodamy przejrzystą kartę z kompletem aktualnych linków i przycisków dla repozytorium `stradowski-byte/familystream-vault`:
1. **Przełączenie repozytorium z Private na Public (Wymagane dla GitHub Pages)**:
   - Bezpośredni przycisk prowadzący do sekcji **Danger Zone** w ustawieniach repozytorium:
     `https://github.com/stradowski-byte/familystream-vault/settings#danger-zone-heading`
   - Zwięzła instrukcja 3 kliknięć: *Change repository visibility* → *Change to public* → potwierdzenie nazwy `stradowski-byte/familystream-vault`.
2. **Komplet aktualnych linków GitHub (`stradowski-byte/familystream-vault`)**:
   - **Produkcyjna aplikacja PWA (GitHub Pages)**: `https://stradowski-byte.github.io/familystream-vault/` (przycisk otwarcia w nowej karcie + przycisk kopiowania adresu dla domowników).
   - **Status budowania po natywnym commicie (GitHub Actions)**: `https://github.com/stradowski-byte/familystream-vault/actions`
   - **Ustawienia GitHub Pages (`gh-pages`)**: `https://github.com/stradowski-byte/familystream-vault/settings/pages`
   - **Kod źródłowy repozytorium (`main`)**: `https://github.com/stradowski-byte/familystream-vault`
3. **Komplet zaktualizowanych, bezpośrednich linków do konsoli Firebase (dla aktywnego projektu)**:
   - *Project Settings → General (Your apps / firebaseConfig)*
   - *Authentication → Sign-in method (Google & Anonymous)*
   - *Authentication → Settings → Authorized domains (`stradowski-byte.github.io`)*
   - *Firestore Database → Data (6 kolekcji)*
   - *Firestore Database → Rules (`firestore.rules`)*

### B. Ulepszenie raportowania w `.github/workflows/deploy.yml`
- Dodanie w ostatnim kroku workflow automatycznego podsumowania (`$GITHUB_STEP_SUMMARY`), które w przypadku wykrycia prywatnego repozytorium wyświetli w zakładce GitHub Actions bezpośredni link do `Settings -> Danger Zone`, a po przełączeniu na Public potwierdzi aktywny adres `https://stradowski-byte.github.io/familystream-vault/`.
