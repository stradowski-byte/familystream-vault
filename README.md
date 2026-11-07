# FamilyStream Vault — Rodzinny Skarbiec Haseł E2E (PWA & Cloud Firestore)

Bezpieczna, bezserwerowa aplikacja progresywna (PWA) do zarządzania wspólnymi kontami rodzinnymi (VOD, Wi-Fi, rachunki, subskrypcje) oraz prywatnymi hasłami domowników szyfrowanymi po stronie klienta (**E2E AES-256-GCM**).

---

## Wzorzec Architektury Firebase dla Kolejnych Projektów AI Studio

> [!IMPORTANT]
> Pełna dokumentacja techniczna wypracowanego tutaj wdrożenia Firebase, hybrydowej autoryzacji (Administrator Google + Domownicy z certyfikatami sprzętowymi i sesją `signInAnonymously`), samowystarczalnych linków zaproszeniowych (`?invite=...&fb=...`), mostka `CacheStorage` dla PWA oraz reguł bezpieczeństwa Zero-Trust znajduje się w pliku:
>
> 👉 **[`FIREBASE_BLUEPRINT_GUIDE.md`](./FIREBASE_BLUEPRINT_GUIDE.md)**
>
> Plik `FIREBASE_BLUEPRINT_GUIDE.md` zawiera również **Gotowy Master Prompt dla AI Studio**, który możesz wkleić na starcie dowolnego nowego projektu w Google AI Studio, aby w 100% odtworzyć tę architekturę dla innej aplikacji.

---

## Kluczowe Funkcje Aplikacji

1. **Architektura Dual-Environment (AI Studio Dev vs. Produkcyjne PWA na GitHub Pages)**:
   - W podglądzie Google AI Studio (`*.run.app`) aplikacja korzysta z wbudowanego projektu testowego.
   - Na zewnętrznym hostingu (np. GitHub Pages `*.github.io`) aplikacja korzysta z produkcyjnej konfiguracji Firebase wgranej przez Administratora (obsługuje surowy kod JS prosto z konsoli Firebase) lub automatycznie pobranej z linku zaproszeniowego domownika (`&fb=`).
2. **Wspólne i Prywatne Hasła (E2E AES-256-GCM)**:
   - **Sekcja Wspólna**: Konta współdzielone w rodzinie z precyzyjną kontrolą dostępu (`allowedMemberIds`). Domyślnie nowy wpis jest przypisany wyłącznie do twórcy (**„Tylko ja”**), a udostępnianie kolejnym osobom odbywa się z rozwijanej listy **multi-select**.
   - **Sekcja Prywatna**: Rekordy szyfrowane w pamięci RAM przeglądarki kluczem DEK właściciela przed zapisem do Cloud Firestore (`ENC[AES-256-GCM:iv:ciphertext]`).
3. **Tryb „Lupa” dla Osób Słabowidzących**:
   - Przy każdym haśle znajduje się przycisk **Lupa**, który otwiera wyśrodkowane, wysokokontrastowe okno z ogromną czcionką loginu i hasła oraz **rozpisaniem hasła znak po znaku** (`#1, #2, ...` z oznaczeniem `CYFRA`, `WIELKA`, `mała`, `ZNAK`), ułatwiając przepisanie hasła na telewizorze lub dekoderze.
4. **Samowystarczalne Linki Zaproszeniowe i Ratunkowe (`?invite=...&fb=...`)**:
   - Jednorazowe lub 24-godzinne linki zaproszeniowe i ratunkowe z zaszytą konfiguracją Firebase.
   - Odporność na komunikatory mobilne (udostępnianie czystego URL-a przez `navigator.share`, ekstrakcja regexem oraz przekazywanie sesji do zainstalowanej aplikacji PWA przez `CacheStorage`).
5. **Certyfikaty Sprzętowe Urządzeń i Biometria WebAuthn**:
   - Autoryzacja nowych urządzeń przez Administratora z wydaniem kryptograficznego certyfikatu sprzętowego (`CERT-HW-...`) oraz odblokowywanie skarbca odciskiem palca / FaceID.
6. **Trwały Motyw Jasny / Ciemny na Urządzeniu**:
   - Kompaktowy przełącznik motywu (Słońce / Księżyc) dostępny w prawym górnym rogu na każdym ekranie (łącznie z ekranem logowania i konfiguracji), trwale zapamiętywany w `localStorage` urządzenia.
7. **Utwardzenie Pentestowe (5 Filarów Bezpieczeństwa Client-Side)**:
   - **Zero-Plaintext Storage (`AES-256-GCM Wrapped Keys`)**: Klucze DEK w `localStorage` (sesja i biometria) są zawsze zaszyfrowane kluczem pochodnym z sygnatury sprzętowej urządzenia (`ENC[AES-256-GCM:...]`). Surowy klucz żyje wyłącznie w pamięci RAM.
   - **Ochrona Anti-XSS i Polityka CSP**: Brak `dangerouslySetInnerHTML`, walidacja protokołów URL (`sanitizeSafeHttpUrl`) oraz ścisły nagłówek `Content-Security-Policy` w `index.html`.
   - **Blokada Source Maps (`sourcemap: false`)**: Kod produkcyjny jest zminifikowany bez plików `.map`.
   - **Zero-State Logout & Auto-Lock**: Wylogowanie oraz blokada nieaktywności natychmiastowo zerują odszyfrowane mapy i listy haseł w stanie Reacta oraz czyszczą schowek systemowy.

---

## Uruchomienie Lokalne i Budowanie

```bash
# Instalacja zależności
npm install

# Uruchomienie serwera deweloperskiego (port 3000)
npm run dev

# Sprawdzenie typów TypeScript
npm run lint

# Budowanie wersji produkcyjnej PWA
npm run build
```
