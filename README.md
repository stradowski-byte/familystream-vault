# FamilyStream Vault — Rodzinny Skarbiec Haseł E2E (PWA & Cloud Firestore)

Bezpieczna, bezserwerowa aplikacja progresywna (PWA) do zarządzania wspólnymi kontami rodzinnymi (VOD, Wi-Fi, rachunki, subskrypcje) oraz prywatnymi hasłami domowników szyfrowanymi po stronie klienta (**E2E AES-256-GCM**).

---

## Kompletny Przewodnik Migracji dla Kolejnych Projektów w Google AI Studio (`GDrive → Firebase` oraz `Wbudowany GitHub → Natywny GitHub AI Studio + GitHub Actions`)

> [!IMPORTANT]
> Pełna dokumentacja techniczna oraz instrukcja krok po kroku pozwalająca **automatycznie zmigrować dowolny inny projekt w Google AI Studio**:
> 1. **Z synchronizacji Google Drive (GDrive API / pliki JSON) na Firebase Cloud Firestore (`onSnapshot` Real-Time + Hybrydowe Auth)**,
> 2. **Z wbudowanej w aplikację zakładki GitHub (tokeny PAT w UI i `server.ts`) na Natywną Integrację GitHub w Google AI Studio + automatyczny GitHub Actions (`.github/workflows/deploy.yml` publikujący na `gh-pages`)**,
>
> znajduje się w pliku:
>
> 👉 **[`FIREBASE_BLUEPRINT_GUIDE.md`](./FIREBASE_BLUEPRINT_GUIDE.md)**
>
> **Jak użyć go w drugim projekcie jutro?**
> Załącz plik `FIREBASE_BLUEPRINT_GUIDE.md` w czacie drugiego projektu w Google AI Studio i napisz:
> *„Przeczytaj `FIREBASE_BLUEPRINT_GUIDE.md` i wykonaj pełną migrację tej aplikacji według Rozdziału 1 (Wariant B), Rozdziału 2 oraz Rozdziału 3, zachowując całą logikę biznesową naszej aplikacji.”*

---

## Kluczowe Funkcje i Architektura Aplikacji

1. **Architektura Dual-Environment (AI Studio Dev vs. Produkcyjne PWA na GitHub Pages)**:
   - W podglądzie Google AI Studio (`*.run.app`) aplikacja korzysta z wbudowanego projektu testowego ładowanego opcjonalnie przez `import.meta.glob('../../firebase-applet-config.json', { eager: true })`.
   - Na zewnętrznym hostingu (`https://stradowski-byte.github.io/familystream-vault/`) aplikacja korzysta z produkcyjnej konfiguracji Firebase wgranej przez Administratora (obsługuje surowy kod JS prosto z konsoli Firebase) lub automatycznie pobranej z linku zaproszeniowego domownika (`&fb=`).
2. **Natywny Pipeline CI/CD (Google AI Studio Native GitHub Commit → GitHub Actions `Node.js 24` → `gh-pages`)**:
   - Aplikacja nie zawiera żadnego kodu ani tokenów GitHuba w UI ani w `server.ts`.
   - Każdy natywny commit z Google AI Studio automatycznie wyzwala `.github/workflows/deploy.yml` (`Node.js 24` + `npm install --legacy-peer-deps`), który uruchamia `scripts/build-gh-pages.mjs` (czyszcząc `firebase-applet-config.json` do `{}`), tworzy `404.html` oraz `.nojekyll` i publikuje aplikację na gałęzi `gh-pages`.
3. **Wspólne i Prywatne Hasła (E2E AES-256-GCM) + Historia 3 Wersji (1-Click Rollback)**:
   - **Sekcja Wspólna**: Konta współdzielone w rodzinie z precyzyjną kontrolą dostępu (`allowedMemberIds`) oraz sub-kontami członków rodziny.
   - **Sekcja Prywatna**: Rekordy szyfrowane w pamięci RAM przeglądarki kluczem DEK właściciela przed zapisem do Cloud Firestore (`ENC[AES-256-GCM:iv:ciphertext]`).
   - **Historia Haseł**: Każda zmiana hasła zachowuje 3 poprzednie wersje wraz z przyciskiem **„Przywróć to hasło”** (1-Click Rollback).
4. **Wbudowany Zegar 2FA TOTP Live, PIN Profilu TV, Kod QR Wi-Fi oraz Tryb „Lupa”**:
   - Obsługa 6-cyfrowych kodów **2FA TOTP (RFC 6238 HMAC-SHA1)** odświeżanych na żywo co 30 sekund oraz notatki/PIN-u profilu TV zarówno na karcie, jak i w pełnoekranowym oknie **Lupy**.
   - Automatyczna karta **Kodu QR dla sieci Wi-Fi** (skanowanie aparatem telefonu bez wpisywania hasła).
   - Przycisk **SOS / Poproś o kod TV Live** kierowany bezpośrednio do głównego właściciela (założyciela) danego hasła, z automatycznym wyświetleniem otrzymanego kodu na pełnym ekranie Lupy u czekającego domownika.
5. **Audyt Kondycji Haseł i Zero-Knowledge Test Wycieków (`k-Anonymity` HIBP)**:
   - Lokalny audyt wykrywający duplikaty, hasła starsze niż 180 dni oraz słabe hasła z możliwością wymiany 1-klikiem.
   - Test wycieków **Zero-Knowledge (`SHA-1 k-Anonymity`)** wysyłający do API HaveIBeenPwned wyłącznie pierwsze 5 znaków skrótu `SHA-1`.
6. **Tarcza Prywatności w Tle, Ochrona Brute-Force i 5 Filarów Utwardzenia Pentestowego**:
   - Automatyczne maskowanie haseł po przełączeniu karty/aplikacji w tło (`visibilitychange`) bez wylogowywania.
   - Blokada Brute-Force po 5 nieudanych próbach logowania (60s cooldown).
   - Zero-Plaintext Storage (`AES-256-GCM Wrapped Keys`), ścisłe CSP w `index.html`, wyłączone Source Maps (`sourcemap: false`) oraz Zero-State Logout.

---

## Uruchomienie Lokalne i Budowanie

```bash
# Instalacja zależności
npm install --legacy-peer-deps

# Uruchomienie serwera deweloperskiego (port 3000)
npm run dev

# Sprawdzenie typów TypeScript
npm run lint

# Budowanie czystej wersji produkcyjnej PWA (dist/ oraz docs/)
npm run build
```
