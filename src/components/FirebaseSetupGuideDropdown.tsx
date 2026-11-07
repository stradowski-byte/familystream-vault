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
  Copy,
  Check,
} from 'lucide-react';
import { PRODUCTION_FIRESTORE_RULES } from '../lib/firebase';

interface FirebaseSetupGuideDropdownProps {
  defaultOpen?: boolean;
}

export const FirebaseSetupGuideDropdown: React.FC<
  FirebaseSetupGuideDropdownProps
> = ({ defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedRules, setCopiedRules] = useState(false);

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

          {/* PART 1: STEP BY STEP GUIDE FOR NEW FIREBASE CONSOLE UI (6 VERIFIED STEPS) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-[var(--vault-accent)] shrink-0" />
                <span>
                  Część 1. Kompletna procedura konfiguracji Firebase Console (Nowe UI — 6 kroków)
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

            <ol className="space-y-3.5 text-[var(--vault-muted)] list-decimal list-inside">
              <li>
                <strong className="text-[var(--vault-text)]">
                  Utwórz projekt i upewnij się, że jest wybrany w lewym górnym rogu konsoli:
                </strong>{' '}
                Wejdź na <code>console.firebase.google.com</code>, kliknij{' '}
                <strong>Create a Firebase project</strong> (lub <strong>Add project</strong>), wpisz nazwę (np.{' '}
                <code>FamilyPwdVault</code>), wyłącz opcjonalne Google Analytics i kliknij{' '}
                <strong>Create project</strong>.{' '}
                <em>
                  Ważne: na liście rozwijanej w lewym górnym rogu konsoli zawsze upewnij się, że edytujesz swój docelowy projekt produkcyjny (np. <code>FamilyPwdVault</code>), a nie projekt testowy AI Studio (<code>true-deployment-...</code>).
                </em>
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Zarejestruj aplikację Web (<code>&lt;/&gt;</code>) i skopiuj surowy obiekt <code>firebaseConfig</code>:
                </strong>{' '}
                W lewym wąskim pasku nawigacji kliknij ikonę{' '}
                <strong>koła zębatego (⚙) → Project settings</strong>. W zakładce{' '}
                <strong>General</strong> przewiń na sam dół do sekcji{' '}
                <strong>Your apps</strong> i kliknij okrągłą ikonę{' '}
                <strong>Web (<code>&lt;/&gt;</code>)</strong>. Wpisz nazwę (np.{' '}
                <code>FamilyStream Vault PWA</code>) i kliknij{' '}
                <strong>Register app</strong>. Skopiuj domyślny blok wygenerowany przez Google:{' '}
                <code>&#123; apiKey: &quot;AIzaSy...&quot;, authDomain: &quot;...&quot;, projectId: &quot;...&quot;, ... &#125;;</code>{' '}
                (lub cały kod z <code>import &#123; initializeApp &#125;</code>).{' '}
                <strong>
                  Nie musisz zmieniać formatowania, dodawać cudzysłowów wokół kluczy ani usuwać średnika <code>;</code> na końcu
                </strong>{' '}
                — aplikacja natywnie obsługuje surowy format z Firebase Console.
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Włącz dostawców „Google” (z e-mailem wsparcia) oraz „Anonymous” w Authentication:
                </strong>{' '}
                W lewym pasku nawigacji wybierz ikonę dwóch osób (<strong>Build → Authentication</strong>) i kliknij{' '}
                <strong>Get started</strong>. Na górnym poziomym pasku zakładek (<code>Users | Sign-in method | Templates | Usage | Settings</code>) przejdź do{' '}
                <strong>Sign-in method</strong>:
                <ul className="list-disc list-inside pl-3 mt-1.5 space-y-1">
                  <li>
                    Kliknij niebieski przycisk <strong>Add new provider</strong> (w prawym górnym rogu tabeli) → wybierz{' '}
                    <strong>Google</strong> → przełącz suwak <strong>Enable</strong> →{' '}
                    <strong>koniecznie wybierz swój adres Gmail w polu <em>Project support email</em></strong> i kliknij{' '}
                    <strong>Save</strong>{' '}
                    <em>
                      (zapisanie e-maila wsparcia generuje identyfikator Web OAuth Client ID i zapobiega błędowi <code>auth/configuration-not-found</code>; jeśli błąd wystąpi, kliknij ikonę ołówka ✏️ przy Google i ponownie kliknij Save)
                    </em>
                    .
                  </li>
                  <li>
                    Ponownie kliknij <strong>Add new provider</strong> → wybierz{' '}
                    <strong>Anonymous</strong> → przełącz suwak <strong>Enable</strong> → kliknij{' '}
                    <strong>Save</strong> (w tabeli oba wiersze <strong>Google</strong> oraz <strong>Anonymous</strong> muszą mieć zielony status <strong>Enabled</strong>).
                  </li>
                </ul>
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Dodaj domenę aplikacji w zakładce „Authentication → Settings → Authorized domains”:
                </strong>{' '}
                Pozostając w widoku <strong>Authentication</strong>, na górnym poziomym pasku zakładek kliknij{' '}
                <strong>Settings</strong> (obok <em>Usage</em>), w lewym podmenu wybierz{' '}
                <strong>Authorized domains</strong>, kliknij niebieski przycisk{' '}
                <strong>Add domain</strong> i wpisz domenę swojego GitHub Pages (np.{' '}
                <code>stradowski-byte.github.io</code>).
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Utwórz bazę w „Firestore Database” i opublikuj reguły bezpieczeństwa w zakładce „Rules”:
                </strong>{' '}
                W lewym pasku nawigacji wybierz <strong>Build → Firestore Database</strong> i kliknij{' '}
                <strong>Create database</strong>:
                <ul className="list-disc list-inside pl-3 mt-1.5 space-y-1">
                  <li>
                    Wybierz edycję <strong>Standard edition</strong> → <strong>Next</strong>, zostaw Database ID jako{' '}
                    <code>(default)</code>, wybierz lokalizację blisko siebie (np.{' '}
                    <code>eur3 (europe-west)</code> lub <code>europe-west3 (Frankfurt)</code>) i kliknij{' '}
                    <strong>Next → Create</strong>.
                  </li>
                  <li>
                    <strong>Kluczowe (zapobiega błędowi <code>Missing or insufficient permissions</code>):</strong> Nowo utworzona baza ma domyślnie całkowicie zablokowany zapis (<code>allow read, write: if false;</code>). Na górnym poziomym pasku widoku Firestore przejdź do zakładki{' '}
                    <strong>Rules</strong> (obok <em>Data | Indexes | Usage</em>), skopiuj gotowe reguły bezpieczeństwa przyciskiem poniżej, wklej je w miejsce domyślnego kodu i kliknij{' '}
                    <strong>Publish</strong>:
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(PRODUCTION_FIRESTORE_RULES)
                            .catch(() => {});
                          setCopiedRules(true);
                          setTimeout(() => setCopiedRules(false), 3000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--vault-accent)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] text-[var(--vault-text)] font-semibold text-[11px] cursor-pointer"
                      >
                        {copiedRules ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[var(--vault-success)]" />
                            <span>Skopiowano gotowe reguły firestore.rules do schowka!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                            <span>Kopiuj gotowe reguły firestore.rules (1-klik)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                </ul>
              </li>

              <li>
                <strong className="text-[var(--vault-text)]">
                  Wklej config w aplikacji PWA i zaloguj się przez Google (Auto-inicjalizacja 6 kolekcji):
                </strong>{' '}
                Wklej skopiowany w Kroku 2 surowy config w aplikacji PWA (lub wgraj go z pliku), kliknij{' '}
                <strong>„Załaduj konfigurację i uruchom jako Administrator”</strong>, a następnie{' '}
                <strong>„Zaloguj przez Google (Administrator)”</strong>.{' '}
                <strong>Nie musisz ręcznie klikać „+ Start collection” w konsoli Firebase</strong> — przy pierwszym logowaniu aplikacja sama sprawdza i automatycznie zakłada wszystkie 6 kolekcji bazowych (<code>vaultConfig</code>, <code>members</code>, <code>devices</code>, <code>passwords</code>, <code>invitations</code>, <code>activityLogs</code>) bez ruszania istniejących danych.
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
