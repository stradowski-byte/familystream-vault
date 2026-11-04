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
              Jak utworzyć własny plik JSON w Firebase i po co są poszczególne moduły?
            </div>
            <div className="text-[11px] text-[var(--vault-muted)] truncate">
              Kliknij, aby rozwinąć instrukcję krok po kroku (5 kroków) oraz przewodnik edukacyjny po architekturze
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
          {/* PART 1: STEP BY STEP GUIDE */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-[var(--vault-accent)] shrink-0" />
                <span>
                  Część 1. Jak wygenerować własny plik konfiguracyjny JSON (Krok po kroku)
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

            <ol className="space-y-2.5 text-[var(--vault-muted)] list-decimal list-inside">
              <li>
                <strong className="text-[var(--vault-text)]">
                  Utwórz darmowy projekt w Firebase Console:
                </strong>{' '}
                Wejdź na <code>console.firebase.google.com</code>, kliknij{' '}
                <strong>Create a project</strong> (lub <strong>Add project</strong>), nadaj mu dowolną nazwę (np.{' '}
                <code>moj-rodzinny-skarbiec</code>) i utwórz projekt na bezpłatnym planie <strong>Spark</strong> (Google Analytics możesz wyłączyć).
              </li>
              <li>
                <strong className="text-[var(--vault-text)]">
                  Zarejestruj aplikację Web (ikona <code>&lt;/&gt;</code>) i skopiuj JSON:
                </strong>{' '}
                Na ekranie głównym nowego projektu kliknij okrągłą ikonę{' '}
                <strong>Web (<code>&lt;/&gt;</code>)</strong>, wpisz nazwę (np.{' '}
                <code>FamilyStream Vault PWA</code>) i kliknij{' '}
                <strong>Register app</strong>. Zobaczysz obiekt{' '}
                <code>const firebaseConfig = &#123; ... &#125;;</code> — skopiuj sam blok <code>&#123; ... &#125;</code> i wklej go w formularzu lub zapisz na urządzeniu jako plik{' '}
                <code>firebase-config.json</code>.
              </li>
              <li>
                <strong className="text-[var(--vault-text)]">
                  Włącz logowanie Google + Anonymous oraz autoryzuj domenę GitHub Pages:
                </strong>{' '}
                W menu po lewej stronie wybierz{' '}
                <strong>Build → Authentication → Get started</strong>. W zakładce{' '}
                <strong>Sign-in method</strong> włącz dwie metody:
                <ul className="list-disc list-inside pl-3 mt-1 space-y-1">
                  <li>
                    <strong>Google</strong> (dla Głównego Administratora) — przełącz na <strong>Enable</strong>, wybierz adres e-mail wsparcia i kliknij <strong>Save</strong>.
                  </li>
                  <li>
                    <strong>Anonymous</strong> (dla urządzeń Domowników powiązanych z Certyfikatem Sprzętowym, aby reguły <code>firestore.rules</code> mogły wymagać <code>request.auth != null</code> bez zmuszania rodziny do logowania przez Google) — kliknij <strong>Add new provider → Anonymous → Enable → Save</strong>.
                  </li>
                </ul>
                Następnie wejdź w zakładkę{' '}
                <strong>Settings → Authorized domains → Add domain</strong> i dodaj domenę swojego GitHub Pages (np.{' '}
                <code>twoj-login.github.io</code>).
              </li>
              <li>
                <strong className="text-[var(--vault-text)]">
                  Utwórz bazę danych Cloud Firestore:
                </strong>{' '}
                W menu po lewej wybierz{' '}
                <strong>Build → Firestore Database → Create database</strong>. Wybierz lokalizację serwera blisko siebie (np.{' '}
                <code>eur3</code> lub <code>europe-west3</code> — Frankfurt) i utwórz bazę.
              </li>
              <li>
                <strong className="text-[var(--vault-text)]">
                  Wklej reguły bezpieczeństwa (<code>firestore.rules</code>):
                </strong>{' '}
                W widoku bazy Firestore przejdź do zakładki{' '}
                <strong>Rules</strong>, wklej pancerne reguły z pliku{' '}
                <code>firestore.rules</code> (wymagające jednocześnie <code>request.auth != null</code>, weryfikacji właściciela przy usuwaniu oraz walidacji schematu) i kliknij <strong>Publish</strong>.
              </li>
            </ol>
          </div>

          {/* PART 2: EDUCATIONAL MODULE EXPLANATION */}
          <div className="pt-4 border-t border-[var(--vault-border)] space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-[var(--vault-text)]">
              Część 2. Za co odpowiada każdy moduł i jak współpracują ze sobą? (Edukacja)
            </h3>

            <div className="grid grid-cols-1 gap-3">
              <div className="p-3.5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-1">
                <div className="font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    1. Moduł Firebase Authentication (<code>request.auth</code>) — Strażnik Tożsamości i Firewall Bazy
                  </span>
                </div>
                <p className="text-[11px] text-[var(--vault-muted)]">
                  <strong>Po co nam on:</strong> Generuje kryptograficzny token <code>request.auth</code> weryfikowany przez serwer Google przy każdym zapytaniu do bazy. <strong>Administrator</strong> otrzymuje token z logowania Google (<code>signInWithPopup</code>), natomiast <strong>urządzenia Domowników</strong> otrzymują w tle trwały token <code>Anonymous Auth</code> powiązany z ich kontem (<code>googleUid</code>) oraz Certyfikatem Sprzętowym. Dzięki temu reguły <code>firestore.rules</code> blokują każdą nieautoryzowaną próbę odczytu lub skasowania haseł z internetu (usuwać wpisy może wyłącznie ich właściciel lub Administrator).
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-1">
                <div className="font-bold text-[var(--vault-text)] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    2. Moduł Cloud Firestore (<code>onSnapshot</code>) — Baza Czasu Rzeczywistego
                  </span>
                </div>
                <p className="text-[11px] text-[var(--vault-muted)]">
                  <strong>Po co nam on:</strong> Zastępuje ręczne pliki na Google Drive. Zamiast pobierać i nadpisywać cały plik bazy, Firestore przechowuje osobne kolekcje (<code>vaultConfig</code>, <code>members</code>, <code>devices</code>, <code>passwords</code>, <code>invitations</code>) i utrzymuje otwarty kanał czasu rzeczywistego (<code>onSnapshot</code>). Gdy domownik zakłada konto z linku zaproszeniowego, widzisz jego prośbę natychmiast, a gdy klikniesz „Akceptuj”, jego telefon odblokowuje się w tej samej sekundzie bez odświeżania.
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
                  <strong>Dlaczego to kluczowe:</strong> Firebase pełni wyłącznie rolę „ślepego kuriera” i magazynu zaszyfrowanych danych (architektura <em>Zero-Knowledge</em>). Wyliczanie klucza głównego (DEK) z hasła użytkownika, sygnatury sprzętowej urządzenia (<code>HW-...</code>) oraz certyfikatu zatwierdzenia sprzętu odbywa się <strong>w 100% lokalnie w pamięci RAM Twojego telefonu</strong> przed wywołaniem <code>setDoc</code>. Do bazy Firestore trafia wyłącznie gotowy szyfrogram <code>ENC[AES-256-GCM:...]</code>, którego nawet serwery Google nie potrafią odszyfrować.
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
                  Identyfikator klucza Web API projektu Google Cloud. Pozwala bibliotece Firebase SDK nawiązać połączenie z Twoim projektem (bezpieczeństwa danych pilnują reguły <code>firestore.rules</code> oraz szyfrowanie E2E).
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;authDomain&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Domena autoryzacyjna Twojego projektu (np. <code>projekt.firebaseapp.com</code>), która obsługuje bezpieczny proces logowania OAuth 2.0 kontem Google Administratora.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;projectId&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Unikalna nazwa Twojego projektu w chmurze Firebase, wskazująca dokładnie w którym kontenerze chmurowym znajduje się Twój Skarbiec.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)]">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;appId&quot;
                </code>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Unikalny identyfikator konkretnej aplikacji Web/PWA zarejestrowanej wewnątrz Twojego projektu Firebase.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] sm:col-span-2">
                <code className="font-mono font-bold text-[var(--vault-accent)]">
                  &quot;firestoreDatabaseId&quot;
                </code>{' '}
                <span className="text-[var(--vault-muted)]">(opcjonalne)</span>
                <p className="text-[var(--vault-muted)] mt-0.5">
                  Nazwa konkretnej bazy danych wewnątrz projektu. Jeśli w konsoli Firebase utworzyłeś standardową bazę domyślną, pole to można pominąć (przyjmuje wartość <code>(default)</code>). Jeśli korzystasz z bazy nazwanej (np. wygenerowanej w AI Studio), wskazuje dokładną nazwę tej instancji.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
