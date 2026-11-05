import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  Database,
  KeyRound,
  Cpu,
  FileJson,
  CheckCircle2,
} from 'lucide-react';

interface FirebaseSetupGuideDropdownProps {
  defaultOpen?: boolean;
}

export const FirebaseSetupGuideDropdown: React.FC<
  FirebaseSetupGuideDropdownProps
> = ({ defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <BookOpen className="w-4 h-4 text-[var(--vault-accent)] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-[var(--vault-text)] leading-snug">
              Aktualna instrukcja Firebase Console (Nowe UI) i automatyczne zakładanie kolekcji
            </div>
            <div className="text-[11px] text-[var(--vault-muted)] truncate">
              Kliknij, aby rozwinąć przewodnik krok po kroku po nowym interfejsie Firebase (Authentication with Identity Platform + Firestore)
            </div>
          </div>
        </div>
        <div className="shrink-0 text-[var(--vault-accent)] flex items-center gap-1 text-xs font-semibold">
          <span>{isOpen ? 'Zwiń' : 'Rozwiń instrukcję'}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-[var(--vault-border)] space-y-6 text-xs leading-relaxed">
          {/* AUTOMATIC 6-COLLECTION BOOTSTRAPPER BANNER */}
          <div className="p-3.5 rounded-xl border border-[var(--vault-success)] bg-[var(--vault-surface)] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[var(--vault-success)] shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px]">
              <div className="font-bold text-[var(--vault-text)]">
                Automatyczne zakładanie 6 kolekcji bazowych (Zero ręcznego klikania „Start collection”)
              </div>
              <p className="text-[var(--vault-muted)]">
                W nowym projekcie Firebase <strong>nie musisz ręcznie tworzyć żadnych kolekcji</strong>. Przy pierwszym logowaniu Administratora aplikacja sama sprawdza każdą z 6 kolekcji (<code>vaultConfig</code>, <code>members</code>, <code>devices</code>, <code>passwords</code>, <code>invitations</code>, <code>activityLogs</code>): jeśli kolekcja nie istnieje — zakłada ją automatycznie; jeśli już istnieje i ma dane — <strong>niczego nie nadpisuje ani nie usuwa</strong>.
              </p>
            </div>
          </div>

          {/* PART 1: STEP BY STEP GUIDE FOR NEW FIREBASE CONSOLE UI */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-[var(--vault-accent)] shrink-0" />
                <span>
                  Część 1. Konfiguracja własnego projektu w nowym UI Firebase Console (5 kroków)
                </span>
              </h3>
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--vault-accent)] text-[var(--vault-accent)] hover:bg-[var(--vault-surface)] font-semibold text-[11px]"
              >
                <span>Otwórz Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <ol className="space-y-3 text-[var(--vault-muted)] list-decimal list-inside">
              <li>
                <strong className="text-[var(--vault-text)]">
                  Utwórz projekt w Firebase Console:
                </strong>{' '}
                Wejdź na <code>console.firebase.google.com</code>, kliknij{' '}
                <strong>Create a Firebase project</strong> (lub <strong>Add project</strong>), wpisz nazwę projektu (np.{' '}
                <code>moj-rodzinny-skarbiec</code>), wyłącz opcjonalne Google Analytics i kliknij{' '}
                <strong>Create project</strong>.
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Pobierz obiekt <code>firebaseConfig</code> (Koło zębate → Project settings → Your apps):
                </strong>{' '}
                W lewym wąskim pasku nawigacji kliknij ikonę{' '}
                <strong>koła zębatego (⚙) → Project settings</strong>. W zakładce{' '}
                <strong>General</strong> przewiń na sam dół do sekcji{' '}
                <strong>Your apps</strong> i kliknij okrągłą ikonę{' '}
                <strong>Web (<code>&lt;/&gt;</code>)</strong>. Wpisz nazwę (np.{' '}
                <code>FamilyStream Vault PWA</code>) i kliknij{' '}
                <strong>Register app</strong>. Skopiuj sam obiekt{' '}
                <code>&#123; apiKey: &quot;...&quot;, ... &#125;</code> i wklej go w formularzu lub zapisz jako plik{' '}
                <code>firebase-config.json</code>.
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Włącz Google oraz Anonymous w „Authentication with Identity Platform”:
                </strong>{' '}
                W lewym pasku nawigacji wybierz ikonę dwóch osób (<strong>Authentication</strong>) i kliknij{' '}
                <strong>Get started</strong>. Na górnym poziomym pasku zakładek (<code>Users | Sign-in method | Templates | Usage | Settings</code>) przejdź do{' '}
                <strong>Sign-in method</strong>:
                <ul className="list-disc list-inside pl-3 mt-1.5 space-y-1">
                  <li>
                    W tabeli <strong>Sign-in providers</strong> kliknij niebieski przycisk{' '}
                    <strong>Add new provider</strong> (w prawym górnym rogu tabeli).
                  </li>
                  <li>
                    Wybierz <strong>Google</strong> → przełącz suwak <strong>Enable</strong> → wybierz swój e-mail w polu <em>Project support email</em> → kliknij <strong>Save</strong> (status w tabeli zmieni się na zielone <strong>Enabled</strong>).
                  </li>
                  <li>
                    Ponownie kliknij niebieski przycisk <strong>Add new provider</strong> → wybierz{' '}
                    <strong>Anonymous</strong> → przełącz suwak <strong>Enable</strong> → kliknij{' '}
                    <strong>Save</strong> (w tabeli zobaczysz oba wiersze: <strong>Google — Enabled</strong> oraz <strong>Anonymous — Enabled</strong>).
                  </li>
                </ul>
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Dodaj domenę w zakładce „Settings → Authorized domains”:
                </strong>{' '}
                Pozostając w widoku <strong>Authentication</strong>, na górnym poziomym pasku zakładek kliknij{' '}
                <strong>Settings</strong> (obok <em>Usage</em>), wybierz sekcję{' '}
                <strong>Authorized domains</strong>, kliknij przycisk{' '}
                <strong>Add domain</strong> i wpisz domenę swojego GitHub Pages (np.{' '}
                <code>stradowski-byte.github.io</code>).
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Utwórz bazę w „Firestore Database” i opublikuj zakładkę „Rules”:
                </strong>{' '}
                W lewym pasku nawigacji wybierz <strong>Firestore Database</strong> i kliknij{' '}
                <strong>Create database</strong>:
                <ul className="list-disc list-inside pl-3 mt-1.5 space-y-1">
                  <li>
                    Wybierz edycję <strong>Standard edition</strong> i kliknij <strong>Next</strong>.
                  </li>
                  <li>
                    Zostaw Database ID jako <code>(default)</code>, wybierz lokalizację blisko siebie (np.{' '}
                    <code>eur3 (europe-west)</code> lub <code>europe-west3 (Frankfurt)</code>) i kliknij{' '}
                    <strong>Next → Create</strong>.
                  </li>
                  <li>
                    Gdy baza się otworzy, na górnym pasku widoku Firestore przejdź do zakładki{' '}
                    <strong>Rules</strong> (obok <em>Data | Indexes | Usage</em>), wklej reguły z pliku{' '}
                    <code>firestore.rules</code> i kliknij <strong>Publish</strong>.
                  </li>
                  <li>
                    <strong>Nie musisz klikać „+ Start collection”</strong> — zaloguj się jako Administrator w aplikacji, a wszystkie 6 kolekcji utworzy się automatycznie!
                  </li>
                </ul>
              </li>
            </ol>
          </div>

          {/* PART 2: EDUCATIONAL MODULE EXPLANATION */}
          <div className="pt-4 border-t border-[var(--vault-border)] space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-[var(--vault-text)]">
              Część 2. Za co odpowiada każdy moduł i jak współpracują ze sobą?
            </h3>

            <div className="grid grid-cols-1 gap-3">
              <div className="p-3.5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-1">
                <div className="font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    1. Authentication with Identity Platform (<code>request.auth</code>)
                  </span>
                </div>
                <p className="text-[11px] text-[var(--vault-muted)]">
                  Dostawcy <strong>Google</strong> (dla Administratora) oraz <strong>Anonymous</strong> (dla urządzeń Domowników powiązanych z Certyfikatem Sprzętowym) wystawiają kryptograficzny token <code>request.auth.uid</code>. Dzięki temu reguły <code>firestore.rules</code> weryfikują właściciela każdego rekordu i chronią bazę przed nieautoryzowanym odczytem lub usunięciem.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-1">
                <div className="font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    2. Cloud Firestore (<code>onSnapshot</code> + Auto-Inicjalizacja 6 Kolekcji)
                  </span>
                </div>
                <p className="text-[11px] text-[var(--vault-muted)]">
                  Przechowuje 6 kolekcji (<code>vaultConfig</code>, <code>members</code>, <code>devices</code>, <code>passwords</code>, <code>invitations</code>, <code>activityLogs</code>) i synchronizuje je w czasie rzeczywistym. Przy podpięciu nowej, pustej bazy funkcja <code>ensureBaseCollectionsInitializedInFirestore</code> automatycznie zakłada brakujące kolekcje bez naruszania jakichkolwiek istniejących danych.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-1">
                <div className="font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--vault-success)] shrink-0" />
                  <span>
                    3. Autorski Moduł Kryptografii E2E + Certyfikat Sprzętowy (Poza Firebase!)
                  </span>
                </div>
                <p className="text-[11px] text-[var(--vault-muted)]">
                  Wyliczanie klucza głównego (DEK) z hasła użytkownika, sygnatury sprzętowej urządzenia (<code>HW-...</code>) oraz certyfikatu zatwierdzenia sprzętu odbywa się <strong>w 100% lokalnie w pamięci RAM Twojego urządzenia</strong> przed wywołaniem <code>setDoc</code>. Do bazy Firestore trafia wyłącznie gotowy szyfrogram <code>ENC[AES-256-GCM:...]</code>.
                </p>
              </div>
            </div>
          </div>

          {/* PART 3: JSON FIELDS GLOSSARY */}
          <div className="pt-4 border-t border-[var(--vault-border)] space-y-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-[var(--vault-text)] flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[var(--vault-accent)] shrink-0" />
              <span>
                Część 3. Co oznaczają poszczególne pola w pliku JSON? (Słowniczek configu)
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;apiKey&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Identyfikator klucza Web API projektu Google Cloud pozwalający bibliotece Firebase SDK połączyć się z Twoim projektem.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;authDomain&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Domena autoryzacyjna Twojego projektu (np. <code>projekt.firebaseapp.com</code>) obsługująca logowanie OAuth 2.0 kontem Google Administratora.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;projectId&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Unikalny identyfikator Twojego projektu w chmurze Firebase.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;appId&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Unikalny identyfikator aplikacji Web/PWA zarejestrowanej w sekcji <em>Project settings → Your apps</em>.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] sm:col-span-2">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;firestoreDatabaseId&quot;
                </code>{' '}
                <span className="text-[var(--vault-muted)]">(opcjonalne)</span>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Nazwa bazy danych wewnątrz projektu. Dla standardowej bazy domyślnej pole to można pominąć (przyjmuje wartość <code>(default)</code>).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
