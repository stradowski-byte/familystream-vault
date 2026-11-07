import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Download,
  Upload,
  Sliders,
  ShieldAlert,
  CheckCircle2,
  Database,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  ThemeMode,
  VaultCategory,
  VaultConfig,
} from '../types/vault';
import {
  exportActiveFirebaseConfigJson,
  getFirebaseProjectInfo,
} from '../lib/firebase';
import { FirebaseSetupGuideDropdown } from './FirebaseSetupGuideDropdown';

interface AdminTab3ConfigAndBackupProps {
  vaultConfig: VaultConfig;
  categories: VaultCategory[];
  currentTheme: ThemeMode;
  onUpdateCategories: (newCategories: VaultCategory[]) => Promise<void>;
  onUpdateSystemSettings: (params: {
    defaultTheme: ThemeMode;
    clipboardClearSeconds: number;
    autoLockMinutes: number;
  }) => Promise<void>;
  onDownloadLocalBackupFile: (passphrase: string) => Promise<void>;
  onRestoreBackupFromFile: (
    fileContent: string,
    passphrase: string
  ) => Promise<void>;
  onEnsureBaseCollections?: () => Promise<{
    initializedCollections: string[];
    skippedExistingCollections: string[];
  }>;
}

export const AdminTab3ConfigAndBackup: React.FC<
  AdminTab3ConfigAndBackupProps
> = ({
  vaultConfig,
  categories,
  currentTheme,
  onUpdateCategories,
  onUpdateSystemSettings,
  onDownloadLocalBackupFile,
  onRestoreBackupFromFile,
  onEnsureBaseCollections,
}) => {
  // Categories state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [isSavingCategories, setIsSavingCategories] = useState(false);

  // Settings state (Clipboard & Auto-Lock)
  const [clipboardSeconds, setClipboardSeconds] = useState<number>(
    vaultConfig.clipboardClearSeconds
  );
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(
    vaultConfig.autoLockMinutes
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  // Local Encrypted Backup (.vault.enc) state
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [isProcessingBackup, setIsProcessingBackup] = useState(false);
  const [backupStatusMsg, setBackupStatusMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);

  // Authorized domain copy helper & Base collections verification state
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const [copiedFbConfigJson, setCopiedFbConfigJson] = useState(false);
  const [isCheckingCollections, setIsCheckingCollections] = useState(false);
  const [collectionsReport, setCollectionsReport] = useState<{
    initializedCollections: string[];
    skippedExistingCollections: string[];
  } | null>(null);
  const currentHostname =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const fbInfo = getFirebaseProjectInfo();

  const [pendingRestorePayload, setPendingRestorePayload] = useState<{
    sourceLabel: string;
    fileContent: string;
  } | null>(null);

  const handleCopyDomain = (domainText: string) => {
    navigator.clipboard.writeText(domainText).catch(() => {});
    setCopiedDomain(domainText);
    setTimeout(() => setCopiedDomain(null), 2500);
  };

  const handleCopyFirebaseConfigJson = () => {
    const json = exportActiveFirebaseConfigJson();
    navigator.clipboard.writeText(json).catch(() => {});
    setCopiedFbConfigJson(true);
    setTimeout(() => setCopiedFbConfigJson(false), 2500);
  };

  const handleDownloadFirebaseConfigJson = () => {
    const json = exportActiveFirebaseConfigJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firebase-config-${fbInfo.projectId || 'vault'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const slug =
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || `cat_${Date.now()}`;
    const uniqueId = categories.some((c) => c.id === slug)
      ? `${slug}_${Date.now().toString().slice(-4)}`
      : slug;

    setIsSavingCategories(true);
    try {
      const updated: VaultCategory[] = [
        ...categories,
        { id: uniqueId, name: trimmed, order: categories.length + 1 },
      ];
      await onUpdateCategories(updated);
      setNewCategoryName('');
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleSaveRenameCategory = async (catId: string) => {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;
    setIsSavingCategories(true);
    try {
      const updated = categories.map((c) =>
        c.id === catId ? { ...c, name: trimmed } : c
      );
      await onUpdateCategories(updated);
      setEditingCategoryId(null);
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (categories.length <= 1) return;
    setIsSavingCategories(true);
    try {
      const updated = categories
        .filter((c) => c.id !== catId)
        .map((c, idx) => ({ ...c, order: idx + 1 }));
      await onUpdateCategories(updated);
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSavedMsg(null);
    try {
      await onUpdateSystemSettings({
        defaultTheme: currentTheme,
        clipboardClearSeconds: Number(clipboardSeconds),
        autoLockMinutes: Number(autoLockMinutes),
      });
      setSettingsSavedMsg(
        'Zapisano globalne czasy ochrony schowka i blokady sesji w Cloud Firestore.'
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLocalExportClick = async () => {
    setBackupErrorMsg(null);
    setBackupStatusMsg(null);
    if (backupPassphrase.length < 4) {
      setBackupErrorMsg(
        'Podaj hasło szyfrowania kopii zapasowej .vault.enc (min. 4 znaki).'
      );
      return;
    }
    setIsProcessingBackup(true);
    try {
      await onDownloadLocalBackupFile(backupPassphrase);
      setBackupStatusMsg(
        'Pobrano zaszyfrowany plik .vault.enc (AES-256-GCM) na dysk lokalny.'
      );
    } catch (err) {
      setBackupErrorMsg(
        err instanceof Error ? err.message : 'Błąd pobierania kopii.'
      );
    } finally {
      setIsProcessingBackup(false);
    }
  };

  const handleFileImportSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPendingRestorePayload({
      sourceLabel: `pliku lokalnego „${file.name}”`,
      fileContent: text,
    });
    e.target.value = '';
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestorePayload) return;
    setBackupErrorMsg(null);
    setBackupStatusMsg(null);
    if (backupPassphrase.length < 4) {
      setBackupErrorMsg(
        'Podaj hasło, którym zaszyfrowano plik .vault.enc przed przywróceniem bazy do Firestore.'
      );
      return;
    }
    setIsProcessingBackup(true);
    try {
      await onRestoreBackupFromFile(
        pendingRestorePayload.fileContent,
        backupPassphrase
      );
      setBackupStatusMsg(
        `Pomyślnie przywrócono bazę danych z ${pendingRestorePayload.sourceLabel} do Cloud Firestore!`
      );
      setPendingRestorePayload(null);
    } catch (err) {
      setBackupErrorMsg(
        err instanceof Error
          ? err.message
          : 'Nie udało się odszyfrować lub przywrócić pliku .vault.enc.'
      );
    } finally {
      setIsProcessingBackup(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION 01: Cloud Firestore Real-Time Status, Authorized Domains & Local E2E Backup (.vault.enc) */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-display text-[var(--vault-text)] flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--vault-accent)]" />
            <span>
              01. Baza Cloud Firestore (Czas Rzeczywisty onSnapshot) i Szyfrowane Kopie Zapasowe (.vault.enc)
            </span>
          </h2>
          <p className="text-xs text-[var(--vault-muted)]">
            Skarbiec działa na bazie <strong>Firebase Cloud Firestore</strong> z nasłuchiwaniem w czasie rzeczywistym (<code className="font-mono">onSnapshot</code>) oraz natywnym podtrzymywaniem sesji przeglądarki (<code className="font-mono">browserLocalPersistence</code>). Wszystkie prywatne hasła są szyfrowane i deszyfrowane wyłącznie po stronie klienta (E2E AES-256-GCM + Certyfikat Sprzętowy).
          </p>
        </div>

        {/* Live Cloud Firestore Connection Info & Authorized Domains Helper */}
        <div className="p-4 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="font-semibold text-[var(--vault-text)]">
                Połączony projekt Firebase:{' '}
                <span className="font-mono text-[var(--vault-accent)]">
                  {fbInfo.projectId}
                </span>
              </div>
              <div className="text-[11px] font-mono text-[var(--vault-muted)]">
                Baza Firestore: {fbInfo.databaseId} · Auth Domain: {fbInfo.authDomain}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--vault-success)] text-[var(--vault-success)] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Synchronizacja onSnapshot Aktywna</span>
            </span>
          </div>

          {onEnsureBaseCollections && (
            <div className="pt-3 border-t border-[var(--vault-border)] space-y-2">
              <div className="font-semibold text-[var(--vault-text)]">
                Weryfikacja i automatyczne zakładanie 6 kolekcji bazowych w Firestore:
              </div>
              <p className="text-[11px] text-[var(--vault-muted)] leading-relaxed">
                Sprawdza osobno każdą z 6 kolekcji (<code className="font-mono text-[var(--vault-text)]">vaultConfig, members, devices, passwords, invitations, activityLogs</code>). Jeśli kolekcja nie istnieje — zakłada ją automatycznie; jeśli już zawiera dane — <strong>nic w niej nie zmienia ani nie usuwa</strong>.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isCheckingCollections}
                  onClick={async () => {
                    setIsCheckingCollections(true);
                    try {
                      const res = await onEnsureBaseCollections();
                      setCollectionsReport(res);
                    } finally {
                      setIsCheckingCollections(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>
                    {isCheckingCollections
                      ? 'Sprawdzanie kolekcji w Firestore...'
                      : 'Sprawdź i utwórz brakujące kolekcje bazowe'}
                  </span>
                </button>
              </div>
              {collectionsReport && (
                <div className="p-2.5 rounded-lg border border-[var(--vault-success)] bg-[var(--vault-surface)] text-[11px] space-y-1">
                  <div className="font-semibold text-[var(--vault-success)]">
                    Wszystkie 6 kolekcji bazowych jest aktywnych w bazie Firestore!
                  </div>
                  {collectionsReport.initializedCollections.length > 0 && (
                    <div className="text-[var(--vault-text)]">
                      Utworzono nowe kolekcje:{' '}
                      <code className="font-mono">
                        {collectionsReport.initializedCollections.join(', ')}
                      </code>
                    </div>
                  )}
                  {collectionsReport.skippedExistingCollections.length > 0 && (
                    <div className="text-[var(--vault-muted)]">
                      Pominięto istniejące kolekcje (dane nienaruszone):{' '}
                      <code className="font-mono">
                        {collectionsReport.skippedExistingCollections.join(', ')}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-[var(--vault-border)] space-y-2">
            <div className="font-semibold text-[var(--vault-text)]">
              Eksport lokalnego pliku konfiguracyjnego Firebase (JSON) dla czystej instalacji PWA Administratora:
            </div>
            <p className="text-[11px] text-[var(--vault-muted)] leading-relaxed">
              Publiczne repozytorium na GitHubie nie zawiera żadnych kluczy Firebase. Pobierz lub skopiuj poniższy plik <code className="font-mono text-[var(--vault-text)]">firebase-config.json</code>, aby załadować go w drugim kroku po zainstalowaniu czystej aplikacji PWA na telefonie Administratora:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadFirebaseConfigJson}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Pobierz plik firebase-config.json</span>
              </button>
              <button
                type="button"
                onClick={handleCopyFirebaseConfigJson}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-medium text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg cursor-pointer"
              >
                {copiedFbConfigJson ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--vault-success)]" />
                    <span>Skopiowano JSON konfiguracji Firebase!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                    <span>Kopiuj JSON konfiguracji Firebase</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--vault-border)] space-y-2">
            <div className="font-semibold text-[var(--vault-text)]">
              Autoryzacja domeny GitHub Pages w Firebase Auth (jednorazowa konfiguracja dla logowania Google na telefonie):
            </div>
            <p className="text-[11px] text-[var(--vault-muted)] leading-relaxed">
              Aby natywne logowanie Google (<code className="font-mono">Firebase Auth</code>) działało w aplikacji PWA zainstalowanej z GitHub Pages, upewnij się, że domena <code className="font-mono text-[var(--vault-text)]">stradowski-byte.github.io</code> jest dopisana w konsoli Firebase w zakładce <strong>Authentication → Settings → Authorized domains</strong>:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopyDomain('stradowski-byte.github.io')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg cursor-pointer"
              >
                {copiedDomain === 'stradowski-byte.github.io' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Skopiowano: stradowski-byte.github.io</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopiuj domenę: stradowski-byte.github.io</span>
                  </>
                )}
              </button>

              {currentHostname &&
                currentHostname !== 'stradowski-byte.github.io' && (
                  <button
                    type="button"
                    onClick={() => handleCopyDomain(currentHostname)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg cursor-pointer"
                  >
                    {copiedDomain === currentHostname ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[var(--vault-success)]" />
                        <span>Skopiowano bieżący host</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                        <span>Kopiuj bieżący host ({currentHostname})</span>
                      </>
                    )}
                  </button>
                )}

              <a
                href={`https://console.firebase.google.com/project/${fbInfo.projectId}/authentication/settings`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--vault-accent)] border border-[var(--vault-accent)] rounded-lg hover:bg-[var(--vault-surface)]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Otwórz Firebase Authorized Domains</span>
              </a>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--vault-border)]">
            <FirebaseSetupGuideDropdown />
          </div>
        </div>

        {/* Local Encrypted Backup (.vault.enc) Export / Import */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end pt-2">
          <div>
            <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
              Hasło główne archiwum lokalnej kopii zapasowej (.vault.enc · AES-256-GCM)
            </label>
            <input
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Wpisz hasło do zaszyfrowania / odszyfrowania pliku .vault.enc..."
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              type="button"
              disabled={isProcessingBackup}
              onClick={handleLocalExportClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer text-left leading-snug"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Pobierz kopię .vault.enc lokalnie</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer text-left leading-snug">
              <Upload className="w-4 h-4 shrink-0" />
              <span>Wczytaj i przywróć z pliku .vault.enc</span>
              <input
                type="file"
                accept=".enc,.json,.txt"
                onChange={handleFileImportSelect}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Confirmation Dialog for Restoring Vault from .vault.enc */}
        {pendingRestorePayload && (
          <div className="p-4 rounded-xl border border-[var(--vault-warning)] bg-[var(--vault-bg)] space-y-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-[var(--vault-text)]">
              <ShieldAlert className="w-4 h-4 text-[var(--vault-warning)]" />
              <span>
                Potwierdź przywrócenie skarbca z {pendingRestorePayload.sourceLabel}
              </span>
            </div>
            <p className="text-[var(--vault-muted)]">
              Przywrócenie kopii zapasowej odtworzy konta domowników, urządzenia oraz wpisy haseł wspólnych i prywatnych z wybranego pliku <code className="font-mono">.vault.enc</code> bezpośrednio do bazy Cloud Firestore. Upewnij się, że powyżej wpisałeś poprawne hasło archiwum.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isProcessingBackup}
                onClick={handleConfirmRestore}
                className="px-4 py-1.5 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
              >
                {isProcessingBackup
                  ? 'Przywracanie bazy do Firestore...'
                  : 'Potwierdzam — przywróć skarbiec'}
              </button>
              <button
                type="button"
                onClick={() => setPendingRestorePayload(null)}
                className="px-3 py-1.5 text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

        {backupStatusMsg && (
          <div className="p-3 rounded-lg border border-[var(--vault-success)] bg-[var(--vault-bg)] text-xs text-[var(--vault-text)]">
            {backupStatusMsg}
          </div>
        )}

        {backupErrorMsg && (
          <div className="p-3 rounded-lg border border-[var(--vault-danger)] bg-[var(--vault-bg)] text-xs text-[var(--vault-danger)]">
            {backupErrorMsg}
          </div>
        )}
      </section>

      {/* SECTION 02: Dynamic Categories / Entry Types Management */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
            02. Kategorie i Typy Wpisów (Filtrowanie i Sortowanie)
          </h2>
          <p className="text-xs text-[var(--vault-muted)]">
            Zarządzaj kategoriami wpisów dostępnymi dla wszystkich domowników podczas dodawania i filtrowania haseł (np. VOD, Email, Sklep, Usługi, Bankowość).
          </p>
        </div>

        <form onSubmit={handleAddCategory} className="flex items-center gap-2.5">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Dodaj nową kategorię (np. Bankowość, Praca, Dom)..."
            maxLength={48}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
          />
          <button
            type="submit"
            disabled={isSavingCategories || !newCategoryName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Dodaj kategorię</span>
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex items-center justify-between gap-2 text-xs"
            >
              {editingCategoryId === cat.id ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="text"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveRenameCategory(cat.id)}
                    className="px-2 py-1 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--vault-text)] block truncate">
                      {cat.name}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--vault-muted)]">
                      klucz: {cat.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(cat.id);
                        setEditingCategoryName(cat.name);
                      }}
                      className="px-2 py-1 text-[var(--vault-muted)] hover:text-[var(--vault-text)] underline cursor-pointer"
                    >
                      Zmień
                    </button>
                    {categories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1 text-[var(--vault-muted)] hover:text-[var(--vault-danger)] cursor-pointer"
                        title="Usuń kategorię"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 03: Global Security Timers (Clipboard & Auto-Lock) */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-display text-[var(--vault-text)] flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[var(--vault-accent)]" />
            <span>
              03. Globalne Parametry Bezpieczeństwa Skarbca (Schowek i Auto-Lock)
            </span>
          </h2>
          <p className="text-xs text-[var(--vault-muted)]">
            Skonfiguruj czas automatycznego czyszczenia schowka po skopiowaniu hasła oraz czas automatycznej blokady skarbca po bezczynności. (Osobisty motyw kolorystyczny przełączysz w zakładce Profil).
          </p>
        </div>

        <form onSubmit={handleSaveSystemSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                Czas automatycznego czyszczenia schowka po skopiowaniu hasła (sekundy)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={clipboardSeconds}
                onChange={(e) => setClipboardSeconds(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                Automatyczna blokada skarbca po bezczynności (Auto-Lock w minutach)
              </label>
              <input
                type="number"
                min={1}
                max={240}
                value={autoLockMinutes}
                onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
              />
            </div>
          </div>

          {settingsSavedMsg && (
            <div className="p-3 rounded-lg border border-[var(--vault-success)] bg-[var(--vault-bg)] text-xs text-[var(--vault-text)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--vault-success)]" />
              <span>{settingsSavedMsg}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-5 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
            >
              {isSavingSettings
                ? 'Zapisywanie...'
                : 'Zapisz parametry bezpieczeństwa'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
