# FIREBASE_BLUEPRINT_GUIDE.md — Kompletny Wzorzec Architektury Firebase, Autoryzacji Rodzinnej i PWA dla Projektów Google AI Studio

Ten dokument stanowi **kompletną, samowystarczalną specyfikację architektoniczną oraz bibliotekę gotowego kodu źródłowego**. Został stworzony na bazie wypracowanego i przetestowanego w boju wdrożenia w aplikacji **FamilyStream Vault**.

> [!TIP]
> **Jak użyć tego dokumentu w nowym projekcie Google AI Studio?**
> 1. Załącz ten plik (`FIREBASE_BLUEPRINT_GUIDE.md`) do czatu w nowym projekcie AI Studio (lub wklej jego zawartość).
> 2. Skopiuj poniższy **Rozdział 1: Gotowy Master Prompt dla AI Studio**, wpisz temat swojej nowej aplikacji (np. *Domowy Budżet*, *Wspólna Lista Zakupów*, *Planer Rodzinny*, *Domowa Apteczka*) i wyślij.
> 3. Agent AI Studio odtworzy całą wielośrodowiskową architekturę Firebase, system zaproszeń z zaszytą konfiguracją, przekazywanie sesji PWA (`CacheStorage Handoff`), certyfikację urządzeń oraz reguły bezpieczeństwa Zero-Trust Firestore.

---

## Spis Treści

1. [Gotowy Master Prompt dla AI Studio (Kopiuj-Wklej)](#1-gotowy-master-prompt-dla-ai-studio-kopiuj-wklej)
2. [Architektura Wielośrodowiskowa (AI Studio Dev vs. GitHub Pages Prod PWA)](#2-architektura-wielośrodowiskowa-ai-studio-dev-vs-github-pages-prod-pwa)
3. [Hybrydowy Model Tożsamości: Administrator (Google) + Domownicy (Login/Hasło + Anonymous Auth)](#3-hybrydowy-model-tożsamości-administrator-google--domownicy-loginhasło--anonymous-auth)
4. [Samowystarczalne Linki Zaproszeniowe (`?invite=...&fb=...`) i Mostek PWA CacheStorage](#4-samowystarczalne-linki-zaproszeniowe-invitefb-i-mostek-pwa-cachestorage)
5. [Schemat 6 Kolekcji Bazowych i Idempotentny Bootstrapper](#5-schemat-6-kolekcji-bazowych-i-idempotentny-bootstrapper)
6. [Kompletny Kod Wzorcowy: `src/lib/firebase.ts`](#6-kompletny-kod-wzorcowy-srclibfirebasets)
7. [Kompletny Kod Wzorcowy: `src/lib/firestoreVaultService.ts`](#7-kompletny-kod-wzorcowy-srclibfirestorevaultservicets)
8. [Kompletny Kod Wzorcowy: Obsługa Linków Zaproszeniowych i PWA Handoff](#8-kompletny-kod-wzorcowy-obsługa-linków-zaproszeniowych-i-pwa-handoff)
9. [Kompletne Reguły Bezpieczeństwa: `firestore.rules`](#9-kompletne-reguły-bezpieczeństwa-firestorerules)
10. [Checklista Konfiguracji Projektu w Konsoli Firebase](#10-checklista-konfiguracji-projektu-w-konsoli-firebase)
11. [5 Filarów Utwardzenia Pentestowego (Zero-Plaintext Storage, CSP, GCP API Key Restrictions, Sourcemap Off, Zero-State Logout)](#11-5-filarów-utwardzenia-pentestowego-zero-plaintext-storage-csp-gcp-api-key-restrictions-sourcemap-off-zero-state-logout)

---

## 1. Gotowy Master Prompt dla AI Studio (Kopiuj-Wklej)

Skopiuj poniższy blok do nowego projektu w Google AI Studio wraz z tym plikiem:

```markdown
Zbuduj aplikację [WPISZ NAZWĘ I OPIS NOWEJ APLIKACJI] wykorzystując w 100% wzorzec architektoniczny Firebase, autoryzacji wieloużytkownikowej i PWA opisany w załączonym dokumencie `FIREBASE_BLUEPRINT_GUIDE.md`.

Wymagania architektoniczne (obowiązkowe do wdrożenia 1:1 wg wzorca):
1. Środowisko Dual-Environment (`src/lib/firebase.ts`):
   - W środowisku deweloperskim AI Studio (`*.run.app`, `localhost`) aplikacja automatycznie korzysta z wbudowanego `firebase-applet-config.json` i domyślnie ustawia rolę urządzenia jako `admin`.
   - W środowisku produkcyjnym (np. GitHub Pages `*.github.io`) aplikacja NIE używa kluczy testowych z AI Studio — korzysta z konfiguracji zapisanej w `localStorage` (`fsv_custom_firebase_config_v1`) wgranej przez Administratora (akceptując zarówno czysty JSON, jak i surowy snippet JS `const firebaseConfig = { ... };` prosto z Firebase Console) lub zdekodowanej automatycznie z parametru `&fb=` w linku zaproszeniowym domownika.
2. Hybrydowa Autoryzacja i Sesja Kryptograficzna:
   - Główny Administrator loguje się przez Google OAuth (`signInWithPopup`) i jego UID jest zapisywany w `/vaultConfig/default.adminUid`.
   - Domownicy logują się swoim loginem i hasłem (lub biometrią WebAuthn), a pod spodem `ensureFirebaseAuthSession()` automatycznie zestawia trwałą sesję `signInAnonymously(auth)` (`browserLocalPersistence`). `request.auth.uid` domownika jest zapisywany w polu `googleUid` dokumentu `/members/{memberId}` oraz dodawany do `allowedMemberIds` udostępnionych rekordów.
3. Samowystarczalne Linki Zaproszeniowe i Ratunkowe (`?invite=<token>&fb=<base64url>`):
   - Link zaproszeniowy wygenerowany przez Administratora zawiera token zaproszenia oraz zakodowaną w Base64URL aktywną konfigurację Firebase (`&fb=...`).
   - Przycisk „Wyślij” na telefonie używa `navigator.share({ title, url })` przekazując wyłącznie czysty adres URL bez dodatkowego tekstu, aby komunikatory (WhatsApp, Messenger, SMS) nie psuły linku.
   - Parser wejściowy `extractInviteAndFbFromInput` wyciąga parametry `invite` oraz `fb` za pomocą wyrażeń regularnych nawet z wiadomości zawierających dodatkowy tekst.
   - Po otwarciu linku w przeglądarce mobilnej token oraz parametr `fb` są zapisywane w `localStorage` oraz w `CacheStorage` (`fsv-pwa-handoff-cache-v1`), dzięki czemu po kliknięciu „Zainstaluj aplikację PWA” na ekranie głównym telefonu zainstalowana aplikacja automatycznie przejmuje konfigurację Firebase i token zaproszenia.
   - Na ekranie zaproszenia domownika zawsze widoczny jest przycisk „Ponów weryfikację linku” oraz standardowy formularz logowania domownika (login + hasło), aby wygaśnięcie lub zużycie linku nigdy nie blokowało możliwości zalogowania.
4. Synchronizacja Real-Time i Bezpieczeństwo (`src/lib/firestoreVaultService.ts` + `firestore.rules`):
   - Subskrypcja `onSnapshot` czeka na gotowość `request.auth.uid` przed podpięciem listenerów.
   - Administrator pobiera całą kolekcję głównych rekordów, a Domownik wykonuje zapytanie z filtrem `where('allowedMemberIds', 'array-contains', uid)`.
   - Podczas tworzenia nowego wspólnego wpisu domyślnie zaznaczony jest wyłącznie twórca wpisu („Tylko ja”), a wybór dodatkowych domowników odbywa się z rozwijanej listy multi-select.
   - Po pierwszym logowaniu Administratora funkcja `ensureBaseCollectionsInitializedInFirestore` idempotentnie i nieinwazyjnie inicjalizuje brakujące kolekcje bazowe (`vaultConfig`, `members`, `devices`, główna kolekcja rekordów, `invitations`, `activityLogs`).
   - Na każdym ekranie w prawym górnym rogu znajduje się kompaktowy przycisk przełączania motywu Jasny/Ciemny zapisywany trwale na urządzeniu w `localStorage`.
5. Pięć Filarów Utwardzenia Pentestowego i Optymalizacji React (Obowiązkowe):
   - Zero jawnych kluczy w Storage: klucze DEK zapisywane w `localStorage` (sesja i biometria) muszą być owinięte kryptograficznie (`ENC[AES-256-GCM:iv:cipher]`) przez `wrapLocalDeviceKeysPayload` powiązane ze sprzętową sygnaturą urządzenia. Surowy klucz żyje wyłącznie w RAM (`useState`).
   - Aktywna weryfikacja `hardwareSignatureHash`: funkcja `verifyDeviceHardwareSignatureMatch` weryfikuje zgodność odcisku przeglądarki/urządzenia (`HW-XXXX-XXXX-XXXX`) z zatwierdzonym dokumentem w kolekcji `devices`.
   - Anti-XSS i CSP: zero użyć `dangerouslySetInnerHTML`, walidacja protokołów URL (`sanitizeSafeHttpUrl` dopuszczający wyłącznie `https:` i `http:`) oraz meta-tag `Content-Security-Policy` w `index.html`.
   - Blokada Source Maps: jawne `build: { sourcemap: false, minify: 'esbuild' }` w `vite.config.ts` oraz wykluczenie plików `.map` podczas publikacji na GitHub.
   - Zero-State Logout: wylogowanie i Auto-Lock natychmiastowo zerują tablice danych i mapy odszyfrowanych rekordów w stanie Reacta oraz czyści schowek systemowy.
   - Optymalizacja React: każde wywołanie `onAuthStateChanged` i `onSnapshot` musi znajdować się w `useEffect` z funkcją czyszczącą (`return () => unsubscribe()`), a karty rekordów na listach muszą być opakowane w `React.memo` i posiadać unikalny atrybut `key={record.id}`.
```

---

## 2. Architektura Wielośrodowiskowa (AI Studio Dev vs. GitHub Pages Prod PWA)

### Problem, który rozwiązujemy
Aplikacje tworzone w Google AI Studio posiadają automatycznie generowany plik `firebase-applet-config.json` wskazujący na testową bazę danych AI Studio. Gdy jednak wdrażasz aplikację jako produkcyjne PWA na własny hosting (np. **GitHub Pages**), chcesz:
1. W oknie podglądu **AI Studio** nadal wygodnie testować aplikację na bazie testowej.
2. Na **GitHub Pages** korzystać ze swojego prywatnego, produkcyjnego projektu Firebase bez konieczności ręcznego edytowania kodu przed każdym wdrożeniem.
3. Sprawić, aby zaproszeni domownicy (np. rodzina) **nie musieli nic wiedzieć o Firebase ani wklejać żadnych plików JSON** — klikają jedynie link zaproszeniowy od Administratora.

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
        │ • Używa wbudowanego pliku     │ │ 1. Sprawdza ?fb=... w URL          │
        │   firebase-applet-config.json │ │ 2. Sprawdza CacheStorage Handoff   │
        │ • Domyślna rola: 'admin'      │ │ 3. Sprawdza localStorage           │
        └───────────────────────────────┘ └─────────────────┬──────────────────┘
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                  Jest konfiguracja                   Brak konfiguracji
                                          ▼                                   ▼
                          ┌───────────────────────────────┐   ┌───────────────────────────────┐
                          │ Inicjalizacja Firebase SDK    │   │ Ekran powitalny:              │
                          │ • Rola 'admin' -> Logowanie   │   │ • Domownik: Wklej link od     │
                          │   Google / Zarządzanie        │   │   Admina (?invite=...&fb=...) │
                          │ • Rola 'member' -> Logowanie  │   │ • Admin: Wklej snippet JS lub │
                          │   loginem/hasłem lub zaprosz. │   │   JSON z Firebase Console     │
                          └───────────────────────────────┘   └───────────────────────────────┘
```

### Kluczowe reguły implementacyjne
- **Klucze w `localStorage`**:
  - `fsv_custom_firebase_config_v1` — przechowuje zwalidowany obiekt `CustomFirebaseConfig`.
  - `fsv_device_instance_role_v1` — przechowuje rolę urządzenia (`'admin'` lub `'member'`), dzięki czemu urządzenie domownika od razu widzi prosty ekran logowania domownika, a nie techniczny panel konfiguracji Administratora.
- **Uniwersalny Parser Konfiguracji (`parseAndValidateFirebaseConfigInput`)**:
  - W konsoli Firebase użytkownik kopiuje kod JavaScript (`const firebaseConfig = { apiKey: "...", ... };`), w którym klucze nie mają cudzysłowów wymaganych przez `JSON.parse`. Nasz parser wyciąga pola wyrażeniami regularnymi bezpośrednio z surowego tekstu JS lub z obiektu JSON.
- **Automatyczna Diagnostyka (`diagnoseFirebaseAuthConfiguration`)**:
  - W razie błędu `auth/configuration-not-found` odpytuje endpoint `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=...` i dokładnie wskazuje, czy w konsoli Firebase nie włączono dostawcy Google/Anonymous, czy domena `*.github.io` nie została dodana do *Authorized domains*, czy też klucz `apiKey` pochodzi z innego projektu niż `projectId`.

---

## 3. Hybrydowy Model Tożsamości: Administrator (Google) + Domownicy (Login/Hasło + Anonymous Auth)

### Dlaczego model hybrydowy?
- **Główny Administrator** potrzebuje silnego uwierzytelnienia właściciela chmury (konto Google za pomocą `signInWithPopup(auth, googleProvider)`), które wiąże jego `request.auth.uid` z dokumentem głównym `/vaultConfig/default.adminUid`.
- **Domownicy (np. mama, tata, dzieci)** nie powinni być zmuszani do logowania przez OAuth ani zakładania kont w Firebase Console. Chcą zalogować się prostym loginem i hasłem utworzonym po kliknięciu linku zaproszeniowego, a następnie odblokowywać aplikację odciskiem palca / FaceID (WebAuthn).
- Jednocześnie **Cloud Firestore wymaga kryptograficznego `request.auth != null`**, aby reguły bezpieczeństwa (`firestore.rules`) mogły chronić prywatne wpisy i weryfikować uprawnienia na poziomie dokumentu!

### Jak działa połączenie `Member` + `signInAnonymously`?
1. Każde urządzenie domownika przed wykonaniem jakiejkolwiek operacji w Firestore wywołuje `ensureFirebaseAuthSession()`.
2. Jeśli na urządzeniu nie ma aktywnej sesji Firebase Auth, funkcja automatycznie wywołuje `signInAnonymously(auth)` z trwałą pamięcią `browserLocalPersistence`.
3. Wygenerowany przez Firebase identyfikator `request.auth.uid` jest zapisywany w dokumencie domownika `/members/{memberId}` w polu `googleUid`.
4. Kiedy wpis (np. hasło w kolekcji `/passwords/{passwordId}`) jest udostępniany domownikowi, tablica `allowedMemberIds` przechowuje zarówno identyfikator logiczny `member.id`, jak i kryptograficzny UID `member.googleUid` (`request.auth.uid`).
5. Dzięki temu reguła w `firestore.rules`:
   ```javascript
   allow list: if isSignedIn() && (isAdmin() || isMemberOwner(existing().ownerId) || (request.auth.uid in existing().allowedMemberIds));
   ```
   oraz zapytanie klienckie:
   ```typescript
   query(collection(db, 'passwords'), where('allowedMemberIds', 'array-contains', user.uid))
   ```
   działają z pełną separacją kryptograficzną na serwerach Google!

---

## 4. Samowystarczalne Linki Zaproszeniowe (`?invite=...&fb=...`) i Mostek PWA CacheStorage

### Anatomia Linku Zaproszeniowego
Gdy Administrator tworzy link zaproszeniowy (dla nowego konta lub odzyskiwania konta), aplikacja buduje URL zawierający dwa parametry:
```
https://twoj-login.github.io/twoja-aplikacja/?invite=inv_a1b2c3d4e5f6&fb=eyJhcGlLZXkiOiJBSXph...
```
- `invite` — unikalny token dokumentu w kolekcji `/invitations/{invitationId}`.
- `fb` — zminimalizowany obiekt `CustomFirebaseConfig` zakodowany w formacie **Base64URL** (`encodeFirebaseConfigForInviteUrl`).

### Rozwiązanie 4 krytycznych problemów mobilnych

1. **Komunikatory psujące linki (WhatsApp / Messenger / SMS)**:
   - Jeśli do `navigator.share({ text: "Cześć, oto link...", url })` przekażesz pole `text`, wiele komunikatorów na Androidzie skleja tekst z adresem URL bez spacji lub ucina parametr `&fb=`.
   - **Zasada**: W `navigator.share` przekazuj **wyłącznie `title` oraz czysty `url`** (`await navigator.share({ title: 'Zaproszenie', url })`).
2. **Wklejanie całej wiadomości z komunikatora**:
   - Użytkownik często kopiuje całą wiadomość SMS/WhatsApp razem z tekstem powitania.
   - **Zasada**: Funkcja `extractInviteAndFbFromInput(raw)` używa wyrażeń regularnych (`/[?&]invite=([a-zA-Z0-9_-]+)/i` oraz `/[?&]fb=([a-zA-Z0-9_=-]+)/i`), dzięki czemu bezbłędnie wyłuskuje token i konfigurację Firebase z dowolnego wklejonego tekstu.
3. **Izolacja pamięci między przeglądarką a zainstalowanym PWA (iOS / Android)**:
   - Kiedy domownik otwiera link zaproszeniowy w przeglądarce Chrome/Safari i klika „Zainstaluj aplikację na ekranie głównym”, nowo otwarta ikona PWA może nie widzieć parametrów URL z karty przeglądarki.
   - **Zasada**: Przy starcie aplikacji zapisujemy `inviteToken` oraz `fbParam` zarówno w `localStorage`, jak i w współdzielonym dla całego originu obiekcie `window.caches.open('fsv-pwa-handoff-cache-v1')` pod kluczem `/__fsv_invite_handoff__`. Zainstalowana aplikacja PWA przy pierwszym uruchomieniu odczytuje ten cache i automatycznie konfiguruje Firebase oraz otwiera formularz zaproszenia.
4. **Nigdy nie blokuj ekranu logowania domownika błędem linku**:
   - Jeśli domownik kliknie w stary lub już wykorzystany link z historii czatu, aplikacja wyświetla czytelny komunikat z przyciskiem **„Ponów weryfikację linku”**, ale **poniżej zawsze renderuje standardowy formularz logowania (Login + Hasło)**, aby zarejestrowany domownik mógł od razu się zalogować.

---

## 5. Schemat 6 Kolekcji Bazowych i Idempotentny Bootstrapper

Każda aplikacja oparta na tym wzorcu korzysta z 6 kolekcji w Cloud Firestore:

| Kolekcja | Klucz dokumentu | Przeznaczenie | Dostęp `read` | Dostęp `write` |
| :--- | :--- | :--- | :--- | :--- |
| `vaultConfig` | `default` | Konfiguracja globalna instancji, `adminUid`, `adminMemberId`, domyślny motyw i kategorie | Wszyscy zalogowani (`isSignedIn()`) | Create: pierwszy Admin (`!exists(...)`), Update: tylko `isAdmin()` |
| `members` | `{memberId}` | Profile Administratora, Współadministratorów i Domowników, sole PBKDF2, klucze DEK i `googleUid` | Wszyscy zalogowani (`isSignedIn()`) | Admin lub właściciel profilu (`googleUid == request.auth.uid`) |
| `devices` | `{deviceId}` | Zarejestrowane urządzenia, fingerprint sprzętowy, status (`approved`/`pending`/`revoked`), certyfikat `CERT-HW-...` | Wszyscy zalogowani (`isSignedIn()`) | Admin lub właściciel urządzenia |
| `passwords` *(lub główna kolekcja danych)* | `{recordId}` | Główne rekordy aplikacji (wspólne `shared` z listą `allowedMemberIds` oraz prywatne `private` zaszyfrowane E2E AES-256-GCM) | Admin, właściciel lub osoba z `request.auth.uid in allowedMemberIds` | Admin, właściciel lub uprawniony domownik |
| `invitations` | `{invitationId}` | Linki zaproszeniowe (`new_member`) i ratunkowe (`account_recovery`), jednorazowe lub czasowe 24h | Wszyscy zalogowani (`isSignedIn()`) | Admin, twórca lub domownik zużywający aktywne zaproszenie (`isConsumingActiveInvitation()`) |
| `activityLogs` | `{logId}` | Dziennik audytowy zdarzeń bezpieczeństwa w czasie rzeczywistym | Tylko `isAdmin()` | Create: każdy zalogowany (`isSignedIn()`), Update/Delete: tylko `isAdmin()` |

---

## 6. Kompletny Kod Wzorcowy: `src/lib/firebase.ts`

Poniżej znajduje się pełny, gotowy do skopiowania kod modułu `src/lib/firebase.ts`:

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
import bundledFirebaseConfigRaw from '../../firebase-applet-config.json';

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

const bundledConfig = bundledFirebaseConfigRaw as Partial<CustomFirebaseConfig>;

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
    // Surowy snippet JS z Firebase Console jest obsługiwany bezpośrednio przez extractConfigField poniżej
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
```

---

## 7. Kompletny Kod Wzorcowy: `src/lib/firestoreVaultService.ts`

Kluczowe wzorce w warstwie komunikacji z Cloud Firestore:
1. **`handleFirestoreError`**: Ustrukturyzowane raportowanie błędów uprawnień z pełnym kontekstem `authInfo` oraz `operationType`.
2. **`subscribeToVaultFirestoreRealtime`**: Dwustopniowa subskrypcja `onSnapshot` — najpierw czeka na aktywnego użytkownika (`onAuthStateChanged` / `ensureFirebaseAuthSession`), następnie odczytuje `/vaultConfig/default`, ustala czy `cfg.adminUid === user.uid` i podpina zapytania zależne od roli (`collection(db, 'passwords')` dla Admina vs `where('allowedMemberIds', 'array-contains', uid)` dla Domownika).
3. **`verifyInvitationTokenInFirestore`**: Odporna weryfikacja tokenu zaproszenia z zapytaniem głównym (`where('token', '==', cleanToken)`) oraz fallbackiem po całej kolekcji `invitations` (niewrażliwym na wielkość liter lub spacje).
4. **`ensureBaseCollectionsInitializedInFirestore`**: Idempotentna funkcja wywoływana po zalogowaniu Administratora, która sprawdza każdą z 6 kolekcji za pomocą `limit(1)` i tworzy dokument startowy tylko wtedy, gdy kolekcja jest pusta.

```typescript
// Fragment wzorcowy subskrypcji Real-Time oraz weryfikacji zaproszeń z src/lib/firestoreVaultService.ts:

export function subscribeToVaultFirestoreRealtime(
  callbacks: RealtimeVaultSnapshotCallbacks
): Unsubscribe {
  if (!isFirebaseConfigured() || !db || !auth) {
    callbacks.onInitialSyncComplete?.();
    return () => {};
  }

  let snapshotUnsubscribers: Unsubscribe[] = [];
  let roleScopedUnsubscribers: Unsubscribe[] = [];
  let attachedUid: string | null = null;
  let attachedRoleScope: 'admin' | 'member' | null = null;
  let initialConfigLoaded = false;
  let initialMembersLoaded = false;
  let notifiedInitial = false;
  let isDisposed = false;

  const checkInitialComplete = () => {
    if (!notifiedInitial && initialConfigLoaded && initialMembersLoaded) {
      notifiedInitial = true;
      callbacks.onInitialSyncComplete?.();
    }
  };

  const detachRoleScopedSnapshots = () => {
    roleScopedUnsubscribers.forEach((u) => u());
    roleScopedUnsubscribers = [];
    attachedRoleScope = null;
  };

  const detachSnapshots = () => {
    detachRoleScopedSnapshots();
    snapshotUnsubscribers.forEach((u) => u());
    snapshotUnsubscribers = [];
    attachedUid = null;
  };

  const attachRoleScopedListeners = (uid: string, isVaultAdmin: boolean) => {
    if (isDisposed) return;
    const targetScope: 'admin' | 'member' = isVaultAdmin ? 'admin' : 'member';
    if (attachedRoleScope === targetScope) return;
    detachRoleScopedSnapshots();
    attachedRoleScope = targetScope;

    // Kolekcja głównych zasobów: Admin widzi wszystko, Domownik tylko rekordy z jego UID w allowedMemberIds
    const passwordsRefOrQuery = isVaultAdmin
      ? collection(db, 'passwords')
      : query(
          collection(db, 'passwords'),
          where('allowedMemberIds', 'array-contains', uid)
        );
    roleScopedUnsubscribers.push(
      onSnapshot(
        passwordsRefOrQuery,
        (snap) => {
          const list = snap.docs.map((d) => ({
            ...(d.data() as PasswordRecord),
            id: d.id,
          }));
          callbacks.onPasswords(list);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, 'passwords');
          }
        }
      )
    );

    // Kolekcja logów aktywności: dostępna do odczytu wyłącznie dla Administratora
    if (isVaultAdmin) {
      const logsQuery = query(
        collection(db, 'activityLogs'),
        orderBy('timestamp', 'desc'),
        limit(150)
      );
      roleScopedUnsubscribers.push(
        onSnapshot(
          logsQuery,
          (snap) => {
            const list = snap.docs.map((d) => ({
              ...(d.data() as ActivityLog),
              id: d.id,
            }));
            callbacks.onActivityLogs(list);
          },
          (err) => {
            if (auth.currentUser) {
              handleFirestoreError(err, OperationType.LIST, 'activityLogs');
            }
          }
        )
      );
    } else {
      callbacks.onActivityLogs([]);
    }
  };

  const attachSnapshotsForUser = (user: User) => {
    if (isDisposed || attachedUid === user.uid) return;
    detachSnapshots();
    attachedUid = user.uid;

    snapshotUnsubscribers.push(
      onSnapshot(
        doc(db, 'vaultConfig', 'default'),
        (snap) => {
          const cfg = snap.exists() ? (snap.data() as VaultConfig) : null;
          callbacks.onVaultConfig(cfg);
          const isVaultAdmin = Boolean(cfg && cfg.adminUid === user.uid);
          attachRoleScopedListeners(user.uid, isVaultAdmin);
          initialConfigLoaded = true;
          checkInitialComplete();
        },
        (err) => {
          initialConfigLoaded = true;
          checkInitialComplete();
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'vaultConfig/default');
          }
        }
      )
    );

    snapshotUnsubscribers.push(
      onSnapshot(collection(db, 'members'), (snap) => {
        callbacks.onMembers(
          snap.docs.map((d) => ({ ...(d.data() as Member), id: d.id }))
        );
        initialMembersLoaded = true;
        checkInitialComplete();
      })
    );

    snapshotUnsubscribers.push(
      onSnapshot(collection(db, 'devices'), (snap) => {
        callbacks.onDevices(
          snap.docs.map((d) =>
            ensureDeviceHardwareCertificate({ ...(d.data() as Device), id: d.id })
          )
        );
      })
    );

    snapshotUnsubscribers.push(
      onSnapshot(collection(db, 'invitations'), (snap) => {
        callbacks.onInvitations(
          normalizeInvitationStatuses(
            snap.docs.map((d) => ({ ...(d.data() as VaultInvitation), id: d.id }))
          )
        );
      })
    );
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    if (isDisposed) return;
    if (user) {
      attachSnapshotsForUser(user);
    } else {
      detachSnapshots();
    }
  });

  void ensureFirebaseAuthSession(false).then((user) => {
    if (isDisposed) return;
    if (user) {
      attachSnapshotsForUser(user);
    } else {
      initialConfigLoaded = true;
      initialMembersLoaded = true;
      checkInitialComplete();
    }
  });

  return () => {
    isDisposed = true;
    unsubAuth();
    detachSnapshots();
  };
}
```

*(Pełna implementacja wszystkich metod CRUD, szyfrowania E2E AES-256-GCM oraz idempotentnej inicjalizacji kolekcji znajduje się w pliku `/src/lib/firestoreVaultService.ts` w tym repozytorium).*

---

## 8. Kompletny Kod Wzorcowy: Obsługa Linków Zaproszeniowych i PWA Handoff

Poniższy kod odpowiada za:
1. Wyciąganie `invite` oraz `fb` z każdego formatu tekstu lub URL-a (`extractInviteAndFbFromInput`).
2. Przekazywanie tokenu i konfiguracji Firebase pomiędzy przeglądarką a zainstalowaną aplikacją PWA za pomocą `CacheStorage` (`saveInviteAndFbForPwaHandoff` / `loadInviteAndFbFromPwaHandoff`).
3. Generowanie i wysyłanie czystego linku zaproszeniowego przez systemowe menu telefonu (`navigator.share({ title, url })`).

```typescript
const PWA_INVITE_HANDOFF_KEY = 'fsv_invite_token_v1';
const PWA_FB_CONFIG_HANDOFF_KEY = 'fsv_invite_fb_param_v1';
export const PWA_HANDOFF_CACHE_NAME = 'fsv-pwa-handoff-cache-v1';

/**
 * Odporny parser wyciągający token zaproszenia (?invite=...) oraz zakodowaną konfigurację Firebase (&fb=...)
 * zarówno z czystego adresu URL, jak i z pełnej wiadomości skopiowanej z komunikatora (WhatsApp/Messenger/SMS).
 */
export function extractInviteAndFbFromInput(raw: string): {
  inviteToken: string;
  fbParam: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { inviteToken: '', fbParam: '' };

  // 1. Bezpośrednia ekstrakcja wyrażeniem regularnym
  const invMatch = trimmed.match(/[?&]invite=([a-zA-Z0-9_-]+)/i);
  const fbMatch = trimmed.match(/[?&]fb=([a-zA-Z0-9_=-]+)/i);
  if (invMatch?.[1] || fbMatch?.[1]) {
    return {
      inviteToken: invMatch?.[1] ? decodeURIComponent(invMatch[1]).trim() : '',
      fbParam: fbMatch?.[1] ? decodeURIComponent(fbMatch[1]).trim() : '',
    };
  }

  // 2. Fallback przez obiekt URL
  try {
    const urlCandidateMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    const targetUrlStr = urlCandidateMatch
      ? urlCandidateMatch[0]
      : trimmed.startsWith('http')
        ? trimmed
        : `https://vault.local/${trimmed.replace(/^\//, '')}`;
    if (targetUrlStr.includes('invite=') || targetUrlStr.includes('fb=')) {
      const url = new URL(targetUrlStr);
      return {
        inviteToken: (url.searchParams.get('invite') || '').trim(),
        fbParam: (url.searchParams.get('fb') || '').trim(),
      };
    }
  } catch {
    // ignore
  }

  // 3. Bezpośredni token (np. inv_a1b2c3d4e5f6)
  const directTokenMatch = trimmed.match(/\b(inv_[a-zA-Z0-9_-]+)\b/i);
  if (directTokenMatch?.[1]) {
    return { inviteToken: directTokenMatch[1].trim(), fbParam: '' };
  }

  return { inviteToken: trimmed, fbParam: '' };
}

/**
 * Zapisuje token zaproszenia i parametr fb w localStorage oraz w CacheStorage,
 * aby po zainstalowaniu PWA na ekranie głównym (Add to Home Screen) aplikacja przejęła sesję.
 */
export async function saveInviteAndFbForPwaHandoff(
  inviteToken: string,
  fbParam: string
): Promise<void> {
  try {
    if (inviteToken) localStorage.setItem(PWA_INVITE_HANDOFF_KEY, inviteToken);
    if (fbParam) localStorage.setItem(PWA_FB_CONFIG_HANDOFF_KEY, fbParam);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(PWA_HANDOFF_CACHE_NAME);
      await cache.put(
        new Request('/__fsv_invite_handoff__'),
        new Response(
          JSON.stringify({
            inviteToken: inviteToken || '',
            fbParam: fbParam || '',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
    } catch {
      // ignore
    }
  }
}

export async function loadInviteAndFbFromPwaHandoff(): Promise<{
  inviteToken: string;
  fbParam: string;
}> {
  let inviteToken = '';
  let fbParam = '';
  try {
    inviteToken = localStorage.getItem(PWA_INVITE_HANDOFF_KEY) || '';
    fbParam = localStorage.getItem(PWA_FB_CONFIG_HANDOFF_KEY) || '';
  } catch {
    // ignore
  }
  if (
    (!inviteToken || !fbParam) &&
    typeof window !== 'undefined' &&
    'caches' in window
  ) {
    try {
      const cache = await window.caches.open(PWA_HANDOFF_CACHE_NAME);
      const res = await cache.match(new Request('/__fsv_invite_handoff__'));
      if (res) {
        const data = (await res.json()) as {
          inviteToken?: string;
          fbParam?: string;
        };
        if (!inviteToken && data?.inviteToken) inviteToken = data.inviteToken;
        if (!fbParam && data?.fbParam) fbParam = data.fbParam;
      }
    } catch {
      // ignore
    }
  }
  return { inviteToken, fbParam };
}

/**
 * Budowanie i wysyłanie czystego linku zaproszeniowego przez systemowe menu udostępniania telefonu:
 */
export function buildInvitationUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const fbEncoded = encodeFirebaseConfigForInviteUrl();
  return fbEncoded
    ? `${base}?invite=${encodeURIComponent(token)}&fb=${encodeURIComponent(fbEncoded)}`
    : `${base}?invite=${encodeURIComponent(token)}`;
}

export async function shareInvitationUrlOnMobile(inv: VaultInvitation): Promise<void> {
  const url = buildInvitationUrl(inv.token);
  if (navigator.share) {
    // KRYTYCZNE: Wysyłamy wyłącznie czysty URL bez pola `text`, aby komunikatory nie doklejały tekstu do adresu URL
    await navigator.share({
      title:
        inv.purpose === 'account_recovery'
          ? `Link ratunkowy (${inv.targetMemberName || inv.invitedLabel})`
          : `Zaproszenie (${inv.invitedLabel})`,
      url,
    });
  } else {
    await navigator.clipboard.writeText(url);
  }
}
```

---

## 9. Kompletne Reguły Bezpieczeństwa: `firestore.rules`

Poniższe reguły realizują architekturę **Zero-Trust ABAC** dla wszystkich 6 kolekcji:
- weryfikują rolę Administratora poprzez `/vaultConfig/default.adminUid == request.auth.uid`,
- weryfikują tożsamość Domownika poprzez `isMemberOwner(memberId)` (sprawdzając `googleUid == request.auth.uid`),
- izolują odczyt i listowanie głównych rekordów (`/passwords/{passwordId}`) wyłącznie do właściciela, Administratora oraz osób znajdujących się w tablicy `allowedMemberIds`,
- pozwalają nowemu domownikowi bezpiecznie oznaczyć aktywny link zaproszeniowy jako użyty (`isConsumingActiveInvitation()`),
- walidują typy, klucze oraz rozmiary wszystkich pól.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn() &&
             exists(/databases/$(database)/documents/vaultConfig/default) &&
             get(/databases/$(database)/documents/vaultConfig/default).data.adminUid == request.auth.uid;
    }

    function isMemberOwner(memberId) {
      return isSignedIn() && (
        request.auth.uid == memberId ||
        (exists(/databases/$(database)/documents/members/$(memberId)) &&
         get(/databases/$(database)/documents/members/$(memberId)).data.googleUid == request.auth.uid)
      );
    }

    function isConsumingActiveInvitation() {
      return existing().status == 'active' &&
             incoming().token == existing().token &&
             incoming().purpose == existing().purpose &&
             incoming().mode == existing().mode &&
             incoming().createdByMemberId == existing().createdByMemberId &&
             incoming().usedCount == existing().usedCount + 1 &&
             incoming().status in ['active', 'used'];
    }

    function isValidVaultConfig(data) {
      return data.keys().hasAll(['initialized', 'adminUid', 'adminEmail', 'adminMemberId', 'templatesLoaded', 'categoriesJson', 'defaultTheme', 'clipboardClearSeconds', 'autoLockMinutes', 'createdAt', 'updatedAt']) &&
      data.keys().hasOnly(['initialized', 'adminUid', 'adminEmail', 'adminMemberId', 'templatesLoaded', 'categoriesJson', 'defaultTheme', 'clipboardClearSeconds', 'autoLockMinutes', 'createdAt', 'updatedAt']) &&
      data.initialized is bool && data.adminUid is string && data.adminUid.size() <= 128 && data.adminEmail is string && data.adminEmail.size() <= 256 && data.adminMemberId is string && data.adminMemberId.size() <= 128 && data.templatesLoaded is bool && data.categoriesJson is string && data.categoriesJson.size() <= 20000 && data.defaultTheme in ['dusk', 'linen'] && data.clipboardClearSeconds is number && data.clipboardClearSeconds >= 5 && data.clipboardClearSeconds <= 600 && data.autoLockMinutes is number && data.autoLockMinutes >= 1 && data.autoLockMinutes <= 1440 && data.createdAt is string && data.createdAt.size() <= 64 && data.updatedAt is string && data.updatedAt.size() <= 64;
    }

    function isValidMember(data) {
      return data.keys().hasAll(['id', 'fullName', 'username', 'passwordHash', 'pbkdf2Salt', 'wrappedMasterKey', 'vaultEscrowKey', 'mergedVaultKeysJson', 'role', 'status', 'googleUid', 'createdAt', 'updatedAt']) &&
      data.keys().hasOnly(['id', 'fullName', 'username', 'passwordHash', 'pbkdf2Salt', 'wrappedMasterKey', 'vaultEscrowKey', 'mergedVaultKeysJson', 'role', 'coAdminPermissions', 'status', 'googleUid', 'invitedByToken', 'createdAt', 'updatedAt']) &&
      data.id is string && data.id.size() >= 1 && data.id.size() <= 128 && data.fullName is string && data.fullName.size() >= 1 && data.fullName.size() <= 120 && data.username is string && data.username.size() >= 1 && data.username.size() <= 80 && data.passwordHash is string && data.passwordHash.size() <= 512 && data.passwordHash.size() >= 1 && data.pbkdf2Salt is string && data.pbkdf2Salt.size() <= 256 && data.wrappedMasterKey is string && data.wrappedMasterKey.size() <= 2048 && data.vaultEscrowKey is string && data.vaultEscrowKey.size() <= 2048 && data.mergedVaultKeysJson is string && data.mergedVaultKeysJson.size() <= 20000 && data.role in ['admin', 'co_admin', 'member'] && data.status in ['active', 'pending', 'merged'] && data.googleUid is string && data.googleUid.size() <= 256 && data.createdAt is string && data.createdAt.size() <= 64 && data.updatedAt is string && data.updatedAt.size() <= 64;
    }

    function isValidDevice(data) {
      return data.keys().hasAll(['id', 'memberId', 'memberName', 'username', 'deviceFingerprint', 'deviceName', 'customLabel', 'clientMode', 'status', 'webAuthnCredentialId', 'requestedAt', 'lastSeenAt']) &&
      data.keys().hasOnly(['id', 'memberId', 'memberName', 'username', 'deviceFingerprint', 'deviceName', 'customLabel', 'clientMode', 'hardwareModelOs', 'hardwareDeviceType', 'hardwareSignatureHash', 'deviceApprovalToken', 'deviceCertificateFingerprint', 'hardwareWrappedDek', 'certificateIssuedAt', 'status', 'webAuthnCredentialId', 'requestedAt', 'lastSeenAt']) &&
      data.id is string && data.id.size() >= 1 && data.id.size() <= 128 && data.memberId is string && data.memberId.size() >= 1 && data.memberId.size() <= 128 && data.memberName is string && data.memberName.size() <= 120 && data.username is string && data.username.size() <= 80 && data.deviceFingerprint is string && data.deviceFingerprint.size() <= 256 && data.deviceName is string && data.deviceName.size() <= 200 && data.customLabel is string && data.customLabel.size() <= 200 && data.clientMode in ['pwa', 'browser'] && data.status in ['approved', 'pending', 'revoked'] && data.webAuthnCredentialId is string && data.webAuthnCredentialId.size() <= 1024 && data.requestedAt is string && data.requestedAt.size() <= 64 && data.lastSeenAt is string && data.lastSeenAt.size() <= 64;
    }

    function isValidPasswordRecord(data) {
      return data.keys().hasAll(['id', 'section', 'categoryId', 'serviceName', 'serviceUrl', 'login', 'passwordValue', 'encryptedPayload', 'keySalt', 'ownerId', 'ownerName', 'allowedMemberIds', 'createdAt', 'updatedAt', 'passwordUpdatedAt']) &&
      data.keys().hasOnly(['id', 'section', 'categoryId', 'serviceName', 'serviceUrl', 'login', 'passwordValue', 'encryptedPayload', 'keySalt', 'ownerId', 'ownerName', 'allowedMemberIds', 'revealToAdmin', 'subAccountsJson', 'createdAt', 'updatedAt', 'passwordUpdatedAt']) &&
      data.id is string && data.id.size() >= 1 && data.id.size() <= 128 && data.section in ['shared', 'private'] && data.categoryId is string && data.categoryId.size() <= 128 && data.serviceName is string && data.serviceName.size() <= 200 && data.serviceUrl is string && data.serviceUrl.size() <= 500 && data.login is string && data.login.size() <= 256 && data.passwordValue is string && data.passwordValue.size() <= 2048 && data.encryptedPayload is string && data.encryptedPayload.size() <= 50000 && data.keySalt is string && data.keySalt.size() <= 256 && data.ownerId is string && data.ownerId.size() <= 128 && data.ownerName is string && data.ownerName.size() <= 120 && data.allowedMemberIds is list && data.allowedMemberIds.size() <= 100 && data.createdAt is string && data.createdAt.size() <= 64 && data.updatedAt is string && data.updatedAt.size() <= 64 && data.passwordUpdatedAt is string && data.passwordUpdatedAt.size() <= 64;
    }

    function isValidVaultInvitation(data) {
      return data.keys().hasAll(['id', 'token', 'purpose', 'mode', 'invitedLabel', 'createdByMemberId', 'createdByMemberName', 'maxUses', 'usedCount', 'status', 'createdAt']) &&
      data.keys().hasOnly(['id', 'token', 'purpose', 'mode', 'invitedLabel', 'targetMemberId', 'targetMemberName', 'targetUsername', 'createdByMemberId', 'createdByMemberName', 'expiresAt', 'maxUses', 'usedCount', 'status', 'createdAt', 'lastUsedAt']) &&
      data.id is string && data.id.size() >= 1 && data.id.size() <= 128 && data.token is string && data.token.size() >= 1 && data.token.size() <= 256 && data.purpose in ['new_member', 'account_recovery'] && data.mode in ['single_use', 'time_limited'] && data.invitedLabel is string && data.invitedLabel.size() <= 160 && data.createdByMemberId is string && data.createdByMemberId.size() <= 128 && data.createdByMemberName is string && data.createdByMemberName.size() <= 120 && data.maxUses is number && data.maxUses >= 1 && data.maxUses <= 1000 && data.usedCount is number && data.usedCount >= 0 && data.usedCount <= 1000 && data.status in ['active', 'used', 'revoked', 'expired'] && data.createdAt is string && data.createdAt.size() <= 64;
    }

    function isValidActivityLog(data) {
      return data.keys().hasAll(['id', 'actorId', 'actorName', 'actionType', 'details', 'deviceInfo', 'timestamp']) &&
      data.keys().hasOnly(['id', 'actorId', 'actorName', 'actionType', 'details', 'deviceInfo', 'timestamp']) &&
      data.id is string && data.id.size() >= 1 && data.id.size() <= 128 && data.actorId is string && data.actorId.size() <= 128 && data.actorName is string && data.actorName.size() <= 120 && data.actionType is string && data.actionType.size() <= 80 && data.details is string && data.details.size() <= 500 && data.deviceInfo is string && data.deviceInfo.size() <= 200 && data.timestamp is string && data.timestamp.size() <= 64;
    }

    match /vaultConfig/{configId} {
      allow get: if isSignedIn() && isValidId(configId);
      allow list: if isSignedIn() && request.time != null;
      allow create: if isSignedIn() &&
                    configId == 'default' &&
                    !exists(/databases/$(database)/documents/vaultConfig/default) &&
                    isValidVaultConfig(incoming()) &&
                    incoming().adminUid == request.auth.uid;
      allow update: if isAdmin() &&
                    isValidId(configId) &&
                    isValidVaultConfig(incoming()) &&
                    (!('createdAt' in existing()) || incoming().createdAt == existing().createdAt);
      allow delete: if isAdmin() && isValidId(configId);
    }

    match /members/{memberId} {
      allow get: if isSignedIn() && isValidId(memberId);
      allow list: if isSignedIn() && request.time != null;
      allow create: if isSignedIn() && isValidId(memberId) && isValidMember(incoming()) && incoming().id == memberId;
      allow update: if isSignedIn() &&
                    isValidId(memberId) &&
                    isValidMember(incoming()) &&
                    (!('id' in existing()) || incoming().id == existing().id) && (
                      isAdmin() ||
                      (
                        (existing().googleUid == request.auth.uid || existing().id == request.auth.uid || (existing().googleUid == '' && incoming().googleUid == request.auth.uid)) &&
                        incoming().role == existing().role
                      )
                    );
      allow delete: if isSignedIn() && isValidId(memberId) && (isAdmin() || existing().googleUid == request.auth.uid || existing().id == request.auth.uid);
    }

    match /devices/{deviceId} {
      allow get: if isSignedIn() && isValidId(deviceId);
      allow list: if isSignedIn() && request.time != null;
      allow create: if isSignedIn() && isValidId(deviceId) && isValidDevice(incoming()) && incoming().id == deviceId;
      allow update: if isSignedIn() && isValidId(deviceId) && isValidDevice(incoming()) && (!('id' in existing()) || incoming().id == existing().id) && (isAdmin() || isMemberOwner(existing().memberId));
      allow delete: if isSignedIn() && isValidId(deviceId) && (isAdmin() || isMemberOwner(existing().memberId));
    }

    match /passwords/{passwordId} {
      allow get: if isSignedIn() && isValidId(passwordId) && (isAdmin() || isMemberOwner(existing().ownerId) || (request.auth.uid in existing().allowedMemberIds));
      allow list: if isSignedIn() && (isAdmin() || isMemberOwner(existing().ownerId) || (request.auth.uid in existing().allowedMemberIds));
      allow create: if isSignedIn() && isValidId(passwordId) && isValidPasswordRecord(incoming()) && incoming().id == passwordId;
      allow update: if isSignedIn() && isValidId(passwordId) && isValidPasswordRecord(incoming()) && incoming().id == existing().id && (isAdmin() || isMemberOwner(existing().ownerId) || (existing().section == 'shared' && (request.auth.uid in existing().allowedMemberIds)));
      allow delete: if isSignedIn() && isValidId(passwordId) && (isAdmin() || isMemberOwner(existing().ownerId));
    }

    match /invitations/{invitationId} {
      allow get: if isSignedIn() && isValidId(invitationId);
      allow list: if isSignedIn() && request.time != null;
      allow create: if isSignedIn() && isValidId(invitationId) && isValidVaultInvitation(incoming()) && incoming().id == invitationId;
      allow update: if isSignedIn() && isValidId(invitationId) && isValidVaultInvitation(incoming()) && incoming().id == existing().id && (isAdmin() || isMemberOwner(existing().createdByMemberId) || isConsumingActiveInvitation());
      allow delete: if isSignedIn() && isValidId(invitationId) && (isAdmin() || isMemberOwner(existing().createdByMemberId));
    }

    match /activityLogs/{logId} {
      allow get: if isAdmin() && isValidId(logId);
      allow list: if isAdmin() && request.time != null;
      allow create: if isSignedIn() && isValidId(logId) && isValidActivityLog(incoming()) && incoming().id == logId;
      allow update: if isAdmin() && isValidId(logId) && isValidActivityLog(incoming()) && incoming().id == existing().id;
      allow delete: if isAdmin() && isValidId(logId);
    }
  }
}
```

---

## 10. Checklista Konfiguracji Projektu w Konsoli Firebase

Gdy tworzysz nowy projekt w [Firebase Console](https://console.firebase.google.com/) pod kolejną aplikację:

1. **Utwórz aplikację Web (`</>`)**:
   - Wejdź w **Project settings (⚙️) → General → Your apps → Add app (`</>`)**.
   - Skopiuj blok `firebaseConfig` (możesz skopiować surowy kod JavaScript prosto z konsoli — parser w aplikacji sam go rozpozna).
2. **Włącz dostawców logowania w Authentication**:
   - Wejdź w **Build → Authentication → Sign-in method**:
     - Włącz **Google** (wybierz swój *Project support email* i kliknij **Save**).
     - Włącz **Anonymous** (niezbędne, aby urządzenia domowników otrzymywały własne kryptograficzne `request.auth.uid`).
3. **Dodaj domenę produkcyjną do Authorized Domains**:
   - Wejdź w **Build → Authentication → Settings → Authorized domains** i dodaj swoją domenę GitHub Pages (np. `twoj-login.github.io`).
4. **Utwórz bazę Cloud Firestore i wklej reguły**:
   - Wejdź w **Build → Firestore Database → Create database**.
   - W zakładce **Rules** wklej reguły z Rozdziału 9 powyżej i kliknij **Publish**.
5. **Zaloguj się jako Administrator w aplikacji**:
   - Po pierwszym logowaniu kontem Google aplikacja automatycznie wywoła `ensureBaseCollectionsInitializedInFirestore` i utworzy wszystkie 6 kolekcji bazowych bez naruszania istniejących danych.

---

## 11. 5 Filarów Utwardzenia Pentestowego (Zero-Plaintext Storage, CSP, GCP API Key Restrictions, Sourcemap Off, Zero-State Logout)

Poniżej znajduje się zestawienie 5 zabezpieczeń wdrożonych przeciwko atakom po stronie klienta (przeglądarka / pamięć RAM / API):

### Filar 1: Brak Jawnych Kluczy w `localStorage` (AES-256-GCM Wrapped Keys)
- **Zagrożenie**: Atakujący otwiera Narzędzia Deweloperskie (`F12 -> Application -> Local Storage`) i szuka surowego klucza `dekBase64`.
- **Zabezpieczenie (`src/lib/crypto.ts`, `src/lib/deviceAndBiometrics.ts`, `src/App.tsx`)**:
  - Surowy klucz deszyfrujący (`activeDekBase64`) istnieje **wyłącznie w pamięci RAM (`useState`)**.
  - W `localStorage` (zarówno pod kluczem sesyjnym `fsv_remembered_session_v1`, jak i biometrycznym `fsv_biometric_vault_v1`) zapisywany jest wyłącznie szyfrogram `wrappedKeysPayload: "ENC[AES-256-GCM:iv:ciphertext]"` oraz losowa sól `keyWrapSaltBase64`.
  - Klucz owijający (KEK) jest wyprowadzany przez `PBKDF2-SHA256` (100 000 iteracji) z fizycznego profilu urządzenia (`deviceFingerprint` + `hardwareSignatureHash` + `credentialIdBase64` / `memberId`).

```typescript
export async function wrapLocalDeviceKeysPayload(params: {
  dekBase64: string;
  mergedDeks: string[];
  deviceFingerprint: string;
  hardwareSignatureHash: string;
  bindingToken: string;
  saltBase64?: string;
}): Promise<{ wrappedKeysPayload: string; keyWrapSaltBase64: string }> {
  const keyWrapSaltBase64 = params.saltBase64 || generateSaltBase64(16);
  const compositeSecret = [
    'FSV_LOCAL_WRAPPED_KEY_V1',
    params.deviceFingerprint.trim(),
    params.hardwareSignatureHash.trim(),
    params.bindingToken.trim(),
  ].join('|');
  const kek = await deriveAesKeyFromPassword(compositeSecret, keyWrapSaltBase64);
  const plainJson = JSON.stringify({
    dekBase64: params.dekBase64,
    mergedDeks: params.mergedDeks || [],
  });
  const wrappedKeysPayload = await encryptWithCryptoKey(plainJson, kek);
  return { wrappedKeysPayload, keyWrapSaltBase64 };
}
```

### Filar 2: Ochrona przed XSS i Polityka Content Security Policy (CSP)
- **Zagrożenie**: Wstrzyknięcie `<script>alert('HACKED')</script>`, `<img src=x onerror=...>` lub `javascript:alert(1)` w polu nazwy usługi, loginu lub adresu URL.
- **Zabezpieczenie (`index.html`, `src/lib/crypto.ts`, `src/components/PasswordCard.tsx`)**:
  1. Całkowity zakaz używania `dangerouslySetInnerHTML` w kodzie React (0 wystąpień).
  2. Funkcja `sanitizeSafeHttpUrl(rawUrl)` waliduje każdy otwierany link zewnętrzny za pomocą parsera `new URL()` i przepuszcza wyłącznie protokoły `https:` oraz `http:`, blokując `javascript:`, `data:` oraz `vbscript:`.
  3. W pliku `index.html` wdrożony jest ścisły nagłówek meta `Content-Security-Policy` blokujący obce skrypty inline (`script-src` bez `'unsafe-inline'` i bez `'unsafe-eval'`) oraz `object-src 'none'`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://api.github.com https://*.github.io; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; object-src 'none'; base-uri 'self';" />
```

### Filar 3: Uszczelnienie Klucza `apiKey` w Google Cloud Console (API Key Restrictions)
- **Zagrożenie**: Atakujący odczytuje publiczny `apiKey` Firebase i próbuje wywołać API z obcej domeny lub własnego skryptu.
- **Zabezpieczenie w kodzie (`server.ts`)**: Eksporter na GitHub Pages automatycznie czyści plik `firebase-applet-config.json` do pustego obiektu `{}`, więc w publicznym repozytorium GitHub nie ma żadnych kluczy.
- **Instrukcja Konfiguracji w Google Cloud Console (Krok po Kroku)**:
  1. Otwórz [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) i wybierz swój projekt Firebase (np. `familypwdvault`).
  2. W sekcji **API Keys** kliknij na klucz **Browser key (auto created by Firebase)**.
  3. W sekcji **Application restrictions** wybierz **Websites (HTTP referrers)** i dodaj swoje autoryzowane adresy:
     - `https://<twoj-login>.github.io/*`
     - `https://<twoj-projekt>.firebaseapp.com/*`
     - `https://<twoj-projekt>.web.app/*`
     - *(opcjonalnie do testów lokalnych)* `http://localhost:3000/*`
  4. W sekcji **API restrictions** wybierz **Restrict key** i zaznacz wyłącznie 4 usługi wymagane przez Firebase Web SDK:
     - **Identity Toolkit API**
     - **Token Service API**
     - **Cloud Firestore API**
     - **Firebase Installations API**
  5. Kliknij **Save**. Od tej chwili każde wywołanie Twojego klucza `apiKey` z obcej domeny lub spoza tych 4 usług zostanie natychmiast odrzucone przez serwery Google (HTTP 403).

### Filar 4: Blokada Wycieku Kodu Źródłowego (Wyłączenie Source Maps)
- **Zagrożenie**: Atakujący otwiera `F12 -> Sources` w wersji produkcyjnej i odczytuje oryginalne pliki `.ts` / `.tsx` z map źródłowych (`.map`).
- **Zabezpieczenie (`vite.config.ts`, `server.ts`)**:
  - W `vite.config.ts` ustawiono jawnie:
    ```typescript
    build: {
      sourcemap: false,
      minify: 'esbuild',
    }
    ```
  - W `server.ts` eksporter gałęzi `main` oraz `gh-pages` bezwzględnie odrzuca wszelkie pliki z rozszerzeniem `.map`.

### Filar 5: Brak Wycieków Stanu po Wylogowaniu (Zero-State RAM & Clipboard Logout)
- **Zagrożenie**: Po kliknięciu „Wyloguj” atakujący bada stan głównego komponentu przez React Developer Tools w poszukiwaniu tablicy haseł lub odszyfrowanych rekordów poprzedniego użytkownika.
- **Zabezpieczenie (`src/App.tsx`)**:
  - Zarówno funkcja `handleLogout`, jak i timer nieaktywności `Auto-Lock` natychmiastowo zerują wszystkie struktury w pamięci RAM (`setDecryptedPrivateMap({})`, `setPasswords([])`, `setActivityLogs([])`, `setActiveDekBase64(null)`, `setActiveMergedDeks([])`), usuwają klucz sesyjny z `localStorage` oraz nadpisują schowek systemowy pustym ciągiem (`navigator.clipboard.writeText('')`).

