# Plan Wdrożenia: Całkowite usunięcie własnej integracji GitHub z aplikacji

## 1. Cel zmian
Całkowite wyczyszczenie kodu aplikacji (zarówno po stronie interfejsu użytkownika, jak i serwera `server.ts`) z ręcznej obsługi commitów, tokenów PAT oraz publikacji GitHub, tak aby projekt korzystał wyłącznie z **natywnej integracji GitHub wbudowanej w Google AI Studio**, bez dodawania zewnętrznych plików workflow.

---

## 2. Zakres modyfikacji w architekturze

### A. Usunięcie zakładki i komponentu GitHub z interfejsu Administratora
- **Usunięcie pliku `/src/components/AdminTab4GitHubAndUpdates.tsx`**: Całkowite skasowanie komponentu obsługującego formularz tokenu PAT, konfigurację repozytorium i ręczne wysyłanie commitów z poziomu aplikacji.
- **Aktualizacja `/src/components/TopBar.tsx`**:
  - Usunięcie identyfikatora `'github'` z typu `AdminTabId` (pozostają wyłącznie: `'vault' | 'profile' | 'approvals' | 'config'`).
  - Usunięcie przycisku zakładki `GitHub` z paska nawigacji Administratora oraz zbędnego parametru `isAiStudioPreview`.
- **Aktualizacja `/src/App.tsx`**:
  - Usunięcie importu i renderowania `AdminTab4GitHubAndUpdates`.
  - Wyczyszczenie przekazania nieużywanych właściwości do `TopBar`.
- **Aktualizacja `/src/types/vault.ts`**:
  - Usunięcie nieużywanych interfejsów `GitHubSyncConfig` oraz `GitHubPushResult`.

### B. Wyczyszczenie serwera `/server.ts` oraz polityki CSP w `/index.html`
- **Odchudzenie `/server.ts`**:
  - Usunięcie wszystkich endpointów `/api/github/config`, `/api/github/push`, `/api/github/pages-status` oraz powiązanych funkcji pomocniczych obsługujących GitHub REST API i lokalny plik metadanych `data/github-deploy-meta.json`.
  - Pozostawienie czystego, lekkiego serwera Express + Vite obsługującego wyłącznie aplikację na porcie `3000` oraz nagłówki bezpieczeństwa.
- **Aktualizacja `/index.html`**:
  - Usunięcie domen `https://api.github.com` oraz `https://*.github.io` z dyrektywy `connect-src` w nagłówku `Content-Security-Policy`.

### C. Bezpieczny, opcjonalny import `firebase-applet-config.json` w `/src/lib/firebase.ts`
- Zastąpienie sztywnego statycznego importu `import bundledConfig from '../../firebase-applet-config.json'` dynamicznym opcjonalnym ładowaniem przez `import.meta.glob('../../firebase-applet-config.json', { eager: true })`.
- Dzięki temu:
  - W środowisku Google AI Studio aplikacja nadal automatycznie wykrywa wbudowaną bazę testową.
  - Po natywnym commicie do repozytorium GitHub (gdzie `firebase-applet-config.json` jest ignorowany przez `.gitignore`) projekt zawsze zbuduje się bez błędów kompilacji i poza środowiskiem AI Studio od razu zażąda wgrania własnej konfiguracji Firebase (Gatekeep 2).
