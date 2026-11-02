import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  CloudUpload,
  Download,
  Upload,
  Sliders,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  ThemeMode,
  VaultCategory,
  VaultConfig,
} from '../types/vault';
import {
  DriveBackupFileItem,
  listVaultBackupsOnDrive,
} from '../lib/googleOAuthAndDriveSync';

interface AdminTab3ConfigAndBackupProps {
  vaultConfig: VaultConfig;
  categories: VaultCategory[];
  currentTheme: ThemeMode;
  googleAccessToken: string | null;
  lastDriveAutoSyncAt: string | null;
  onUpdateCategories: (newCategories: VaultCategory[]) => Promise<void>;
  onUpdateSystemSettings: (params: {
    defaultTheme: ThemeMode;
    clipboardClearSeconds: number;
    autoLockMinutes: number;
  }) => Promise<void>;
  onConnectGoogleForDrive: () => Promise<string>;
  onManualPushAutoSyncToDrive: () => Promise<void>;
  onManualPullAutoSyncFromDrive: () => Promise<void>;
  onExportBackupToGoogleDrive: (
    passphrase: string,
    existingFileId?: string
  ) => Promise<void>;
  onDownloadLocalBackupFile: (passphrase: string) => Promise<void>;
  onRestoreBackupFromFile: (
    fileContent: string,
    passphrase: string
  ) => Promise<void>;
  onRestoreBackupFromDriveFileId: (
    fileId: string,
    passphrase: string
  ) => Promise<void>;
}

export const AdminTab3ConfigAndBackup: React.FC<
  AdminTab3ConfigAndBackupProps
> = ({
  vaultConfig,
  categories,
  currentTheme,
  googleAccessToken,
  lastDriveAutoSyncAt,
  onUpdateCategories,
  onUpdateSystemSettings,
  onConnectGoogleForDrive,
  onManualPushAutoSyncToDrive,
  onManualPullAutoSyncFromDrive,
  onExportBackupToGoogleDrive,
  onDownloadLocalBackupFile,
  onRestoreBackupFromFile,
  onRestoreBackupFromDriveFileId,
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

  // Backup & Google Drive state
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveBackupFileItem[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [isProcessingBackup, setIsProcessingBackup] = useState(false);
  const [backupStatusMsg, setBackupStatusMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);

  // Restore confirmation modal state
  const [pendingRestorePayload, setPendingRestorePayload] = useState<{
    sourceLabel: string;
    fileContent?: string;
    driveFileId?: string;
  } | null>(null);
  const [pendingOverwriteDriveFile, setPendingOverwriteDriveFile] =
    useState<DriveBackupFileItem | null>(null);

  const refreshDriveFiles = async (token: string) => {
    setIsLoadingDriveFiles(true);
    try {
      const files = await listVaultBackupsOnDrive(token);
      setDriveFiles(files);
    } catch {
      // ignore if token expired
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  useEffect(() => {
    if (googleAccessToken) {
      refreshDriveFiles(googleAccessToken);
    }
  }, [googleAccessToken]);

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
      setSettingsSavedMsg('Zapisano globalne czasy ochrony schowka i blokady sesji.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleExportDriveClick = async (existingFileId?: string) => {
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
      await onExportBackupToGoogleDrive(backupPassphrase, existingFileId);
      setPendingOverwriteDriveFile(null);
      setBackupStatusMsg(
        'Zaszyfrowana kopia .vault.enc została zapisana na Twoim Google Drive!'
      );
      if (googleAccessToken) {
        await refreshDriveFiles(googleAccessToken);
      }
    } catch (err) {
      setBackupErrorMsg(
        err instanceof Error
          ? err.message
          : 'Nie udało się zapisać kopii na Google Drive.'
      );
    } finally {
      setIsProcessingBackup(false);
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
      setBackupStatusMsg('Pobrano zaszyfrowany plik .vault.enc na dysk lokalny.');
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
        'Podaj hasło, którym zaszyfrowano plik .vault.enc przed przywróceniem bazy.'
      );
      return;
    }
    setIsProcessingBackup(true);
    try {
      if (pendingRestorePayload.fileContent) {
        await onRestoreBackupFromFile(
          pendingRestorePayload.fileContent,
          backupPassphrase
        );
      } else if (pendingRestorePayload.driveFileId) {
        await onRestoreBackupFromDriveFileId(
          pendingRestorePayload.driveFileId,
          backupPassphrase
        );
      }
      setBackupStatusMsg(
        `Pomyślnie przywrócono bazę danych z ${pendingRestorePayload.sourceLabel}!`
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
      {/* SECTION 01 (HIGHEST PRIORITY): Automatic 1-File Google Drive Sync & Encrypted Backup (.vault.enc) */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
            01. Automatyczna Synchronizacja z Google Drive i Kopie Zapasowe (.vault.enc)
          </h2>
          <p className="text-xs text-[var(--vault-muted)]">
            Każda zmiana w skarbcu zapisuje się na serwerze aplikacji i automatycznie aktualizuje jeden stały, w pełni zaszyfrowany plik <code className="font-mono">FamilyStreamVault_AutoSync.vault.enc</code> (AES-256-GCM) na Twoim Google Drive.
          </p>
        </div>

        {/* Live 1-File Google Drive Auto-Sync Status & Controls */}
        <div className="p-4 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-[var(--vault-text)]">
              Status Auto-Sync (Plik: <code className="font-mono">FamilyStreamVault_AutoSync.vault.enc</code> · AES-256-GCM):{' '}
              <span className={googleAccessToken ? 'text-[var(--vault-success)]' : 'text-[var(--vault-warning)]'}>
                {googleAccessToken ? 'Połączono z Google Drive (Szyfrowany Auto-Sync Aktywny)' : 'Wymaga połączenia z Google Drive'}
              </span>
            </div>
            <div className="text-[var(--vault-muted)]">
              {lastDriveAutoSyncAt
                ? `Ostatnia synchronizacja z Google Drive: ${new Date(lastDriveAutoSyncAt).toLocaleString('pl-PL')}`
                : 'Po podłączeniu konta Google każde dodanie lub edycja hasła automatycznie szyfruje (AES-256-GCM) i nadpisuje stały plik na Twoim Google Drive.'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!googleAccessToken ? (
              <button
                type="button"
                onClick={() => onConnectGoogleForDrive()}
                className="px-3.5 py-2 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg cursor-pointer"
              >
                Połącz Google Drive Auto-Sync
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isProcessingBackup}
                  onClick={onManualPushAutoSyncToDrive}
                  className="px-3 py-1.5 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg cursor-pointer"
                >
                  Wyślij stan na Google Drive teraz
                </button>
                <button
                  type="button"
                  disabled={isProcessingBackup}
                  onClick={onManualPullAutoSyncFromDrive}
                  className="px-3 py-1.5 font-medium text-[var(--vault-text)] border border-[var(--vault-border)] hover:bg-[var(--vault-surface)] rounded-lg cursor-pointer"
                >
                  Pobierz stan z pliku Auto-Sync
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
              Hasło główne archiwum kopii zapasowej (.vault.enc)
            </label>
            <input
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Wpisz hasło do zaszyfrowania / odszyfrowania pliku .vault.enc..."
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isProcessingBackup}
              onClick={() => handleExportDriveClick()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <CloudUpload className="w-4 h-4" />
              <span>Eksportuj .vault.enc na Google Drive</span>
            </button>

            <button
              type="button"
              disabled={isProcessingBackup}
              onClick={handleLocalExportClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Pobierz .vault.enc lokalnie</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer whitespace-nowrap">
              <Upload className="w-4 h-4" />
              <span>Wczytaj z pliku .vault.enc</span>
              <input
                type="file"
                accept=".enc,.json,.txt"
                onChange={handleFileImportSelect}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Google Drive Files List */}
        <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--vault-text)]">
              Pliki kopii .vault.enc na Twoim Google Drive:
            </span>
            {googleAccessToken ? (
              <button
                type="button"
                onClick={() => refreshDriveFiles(googleAccessToken)}
                className="inline-flex items-center gap-1 text-xs text-[var(--vault-accent)] hover:underline cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Odśwież listę z Google Drive</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const token = await onConnectGoogleForDrive();
                  if (token) await refreshDriveFiles(token);
                }}
                className="text-xs font-medium text-[var(--vault-accent)] hover:underline cursor-pointer"
              >
                Połącz z Google Drive, aby wyświetlić kopie
              </button>
            )}
          </div>

          {isLoadingDriveFiles ? (
            <div className="text-xs text-[var(--vault-muted)]">
              Pobieranie listy kopii z Google Drive...
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="text-xs text-[var(--vault-muted)]">
              {googleAccessToken
                ? 'Brak zapisanych plików .vault.enc na Google Drive.'
                : 'Kliknij „Eksportuj .vault.enc na Google Drive” lub połącz konto Google powyżej.'}
            </div>
          ) : (
            <div className="space-y-2">
              {driveFiles.map((df) => (
                <div
                  key={df.id}
                  className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-mono font-medium text-[var(--vault-text)]">
                      {df.name}
                    </span>
                    <span className="text-[var(--vault-muted)] ml-2 tabular-nums">
                      · Zmodyfikowano:{' '}
                      {new Date(df.modifiedTime).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPendingOverwriteDriveFile(df)}
                      className="px-2.5 py-1 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded hover:bg-[var(--vault-surface-hover)] cursor-pointer"
                    >
                      Nadpisz tę kopię
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingRestorePayload({
                          sourceLabel: `pliku Google Drive „${df.name}”`,
                          driveFileId: df.id,
                        })
                      }
                      className="px-2.5 py-1 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded cursor-pointer"
                    >
                      Przywróć z tej kopii
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirmation Dialog for Overwriting Existing Drive Backup File */}
        {pendingOverwriteDriveFile && (
          <div className="p-4 rounded-xl border border-[var(--vault-warning)] bg-[var(--vault-bg)] space-y-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-[var(--vault-text)]">
              <ShieldAlert className="w-4 h-4 text-[var(--vault-warning)]" />
              <span>
                Czy na pewno chcesz zaktualizować zawartość pliku „{pendingOverwriteDriveFile.name}” na Google Drive?
              </span>
            </div>
            <p className="text-[var(--vault-muted)]">
              Operacja zastąpi istniejący plik kopii zapasowej na Google Drive najnowszym zaszyfrowanym zrzutem skarbca.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleExportDriveClick(pendingOverwriteDriveFile.id)
                }
                className="px-3.5 py-1.5 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
              >
                Potwierdź aktualizację pliku na Google Drive
              </button>
              <button
                type="button"
                onClick={() => setPendingOverwriteDriveFile(null)}
                className="px-3 py-1.5 text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

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
              Przywrócenie kopii zapasowej odtworzy konta domowników, urządzenia oraz wpisy haseł wspólnych i prywatnych z wybranego pliku <code className="font-mono">.vault.enc</code>. Upewnij się, że powyżej wpisałeś poprawne hasło archiwum.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isProcessingBackup}
                onClick={handleConfirmRestore}
                className="px-4 py-1.5 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
              >
                {isProcessingBackup
                  ? 'Przywracanie bazy...'
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
            <span>03. Globalne Parametry Bezpieczeństwa Skarbca (Schowek i Auto-Lock)</span>
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
