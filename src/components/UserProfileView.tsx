import React, { useState } from 'react';
import {
  User,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Download,
  RefreshCw,
  Fingerprint,
  Sun,
  Moon,
  Lock,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Device,
  isCoAdmin,
  isPrimaryAdmin,
  Member,
  ThemeMode,
} from '../types/vault';
import { DetectedDeviceProfile } from '../lib/deviceAndBiometrics';

interface UserProfileViewProps {
  currentMember: Member;
  detectedDevice: DetectedDeviceProfile;
  currentDeviceDoc: Device | null;
  myDevices: Device[];
  mySharedCount: number;
  myPrivateCount: number;
  myRevealedCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  isPWAInstalled: boolean;
  onInstallPWA: () => void;
  appVersion: string;
  isUpdatingApp: boolean;
  onTriggerAppUpdate: () => void;
  onRegisterBiometrics: () => Promise<void>;
  onChangeOwnPassword: (params: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  onLockVault: () => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  currentMember,
  detectedDevice,
  currentDeviceDoc,
  myDevices,
  mySharedCount,
  myPrivateCount,
  myRevealedCount,
  theme,
  onToggleTheme,
  isPWAInstalled,
  onInstallPWA,
  appVersion,
  isUpdatingApp,
  onTriggerAppUpdate,
  onRegisterBiometrics,
  onChangeOwnPassword,
  onLockVault,
}) => {
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  const isTrustedCoAdmin = isCoAdmin(currentMember);
  const roleLabel = isPrimaryAdmin(currentMember)
    ? 'Główny Administrator'
    : isTrustedCoAdmin
      ? 'Zaufany Opiekun (Co-Admin)'
      : 'Domownik';

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!currentPassword) {
      setPassError('Wpisz swoje obecne hasło.');
      return;
    }
    if (newPassword.length < 4) {
      setPassError('Nowe hasło musi mieć co najmniej 4 znaki.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Nowe hasło i jego potwierdzenie nie są identyczne.');
      return;
    }

    setIsChangingPass(true);
    try {
      await onChangeOwnPassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPassSuccess(
        'Twoje hasło główne zostało zmienione. Klucz szyfrujący prywatne wpisy został automatycznie przepakowany bez utraty danych.'
      );
    } catch (err) {
      setPassError(
        err instanceof Error
          ? err.message
          : 'Nie udało się zmienić hasła. Sprawdź obecne hasło.'
      );
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECTION 01: Karta Profilu Użytkownika i Statystyki Haseł */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--vault-border)] pb-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-[var(--vault-accent)]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
                  {currentMember.fullName}
                </h2>
                <span className="text-xs font-semibold text-[var(--vault-accent)]">
                  · {roleLabel}
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)] mt-0.5">
                Login w skarbcu:{' '}
                <strong className="font-mono text-[var(--vault-text)]">
                  {currentMember.username}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLockVault}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-bg)] transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
              <span>Zablokuj ekran (Auto-Lock)</span>
            </button>
          </div>
        </div>

        {/* Statystyki własnych haseł */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Współdzielone ze mną:
            </span>
            <strong className="text-sm font-bold font-mono tabular-nums text-[var(--vault-text)]">
              {mySharedCount}
            </strong>
          </div>
          <div className="p-3.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Moje prywatne hasła:
            </span>
            <strong className="text-sm font-bold font-mono tabular-nums text-[var(--vault-text)]">
              {myPrivateCount}
            </strong>
          </div>
          <div className="p-3.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Ujawnione Adminowi:
            </span>
            <strong className="text-sm font-bold font-mono tabular-nums text-[var(--vault-accent)]">
              {myRevealedCount}
            </strong>
          </div>
        </div>
      </section>

      {/* SECTION 02: Ustawienia Tego Urządzenia, Aplikacja PWA, Aktualizacja i Wygląd */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
        <div className="border-b border-[var(--vault-border)] pb-3">
          <h3 className="text-base font-bold font-display text-[var(--vault-text)]">
            01. Aplikacja, Biometria i Wygląd na Tym Urządzeniu
          </h3>
          <p className="text-xs text-[var(--vault-muted)]">
            Skonfiguruj odblokowywanie odciskiem palca / FaceID, zainstaluj skarbiec na ekranie głównym, sprawdź aktualizacje oraz wybierz motyw kolorystyczny.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Odcisk palca / FaceID (WebAuthn) */}
          <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--vault-text)]">
                  Logowanie biometryczne (WebAuthn)
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    currentDeviceDoc?.webAuthnCredentialId
                      ? 'text-[var(--vault-success)]'
                      : 'text-[var(--vault-muted)]'
                  }`}
                >
                  {currentDeviceDoc?.webAuthnCredentialId
                    ? 'Aktywne'
                    : 'Nieskonfigurowane'}
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)]">
                Odblokowuj skarbiec na tym urządzeniu czytnikiem linii papilarnych lub FaceID.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onRegisterBiometrics}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer"
              >
                <Fingerprint className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                <span>
                  {currentDeviceDoc?.webAuthnCredentialId
                    ? 'Odśwież odcisk palca / FaceID'
                    : 'Włącz odcisk palca / FaceID'}
                </span>
              </button>
            </div>
          </div>

          {/* 2. Motyw kolorystyczny */}
          <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--vault-text)]">
                  Motyw kolorystyczny Low-Contrast
                </span>
                <span className="text-[11px] text-[var(--vault-muted)]">
                  {theme === 'dusk' ? 'Ciemny Dusk' : 'Jasny Linen'}
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)]">
                Przełącz między ciemnym motywem wieczornym (Soft Slate Dusk) a jasnym papierowym (Warm Linen Paper).
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer"
              >
                {theme === 'dusk' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                    <span>Przełącz na Jasny Linen</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                    <span>Przełącz na Ciemny Dusk</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. Instalacja aplikacji PWA */}
          <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--vault-text)]">
                  Instalacja aplikacji (PWA)
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    isPWAInstalled
                      ? 'text-[var(--vault-success)]'
                      : 'text-[var(--vault-muted)]'
                  }`}
                >
                  {isPWAInstalled ? 'Zainstalowana (PWA)' : 'Tryb przeglądarki'}
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)]">
                {isPWAInstalled
                  ? 'Korzystasz z zainstalowanej aplikacji FamilyStream Vault z pełną izolacją certyfikatu.'
                  : 'Pobierz i dodaj ikonę skarbca bezpośrednio na pulpit lub ekran telefonu.'}
              </p>
            </div>
            <div>
              {!isPWAInstalled ? (
                <button
                  type="button"
                  onClick={onInstallPWA}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Zainstaluj jako aplikację</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--vault-success)]">
                  <Check className="w-3.5 h-3.5" />
                  <span>Aplikacja jest już zainstalowana na tym urządzeniu</span>
                </span>
              )}
            </div>
          </div>

          {/* 4. Aktualizacja aplikacji */}
          <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--vault-text)]">
                  Aktualizacja aplikacji
                </span>
                <span className="text-[11px] font-mono text-[var(--vault-muted)] tabular-nums">
                  Wersja: {appVersion}
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)]">
                Odśwież pliki programu do najnowszej wersji bez utraty zapisanych haseł i sesji.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onTriggerAppUpdate}
                disabled={isUpdatingApp}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[var(--vault-accent)] ${
                    isUpdatingApp ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {isUpdatingApp
                    ? 'Sprawdzanie i aktualizowanie...'
                    : 'Aktualizuj aplikację'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 03: Certyfikat Sprzętowy i Twoje Zaufane Urządzenia (Wyżej niż zmiana hasła) */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vault-border)] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--vault-success)]" />
            <h3 className="text-base font-bold font-display text-[var(--vault-text)]">
              02. Certyfikat Sprzętowy i Twoje Zaufane Urządzenia ({myDevices.length})
            </h3>
          </div>
          <span className="text-xs font-mono text-[var(--vault-accent)] font-semibold">
            Bieżące urządzenie:{' '}
            {currentDeviceDoc?.deviceCertificateFingerprint ||
              detectedDevice.hardwareSignatureHash}
          </span>
        </div>

        <div className="p-3.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="text-[var(--vault-muted)]">
            Aktywna sesja na:{' '}
            <strong className="text-[var(--vault-text)] font-mono">
              {detectedDevice.deviceName}
            </strong>{' '}
            ({detectedDevice.hardwareModelOs})
          </div>
          <div className="text-[var(--vault-muted)]">
            Tryb uruchomienia:{' '}
            <strong className="text-[var(--vault-text)]">
              {isPWAInstalled ? 'Zainstalowana Aplikacja PWA' : 'Przeglądarka WWW'}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {myDevices.map((dev) => {
            const isCurrent =
              dev.deviceFingerprint === detectedDevice.deviceFingerprint;
            return (
              <div
                key={dev.id}
                className={`p-3.5 rounded-lg border bg-[var(--vault-bg)] space-y-1.5 ${
                  isCurrent
                    ? 'border-[var(--vault-accent)]'
                    : 'border-[var(--vault-border)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 font-semibold text-[var(--vault-text)] truncate">
                    <Smartphone className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                    <span className="truncate">{dev.deviceName}</span>
                  </div>
                  {isCurrent && (
                    <span className="text-[11px] font-semibold text-[var(--vault-accent)] shrink-0">
                      To urządzenie
                    </span>
                  )}
                </div>
                <div className="text-[var(--vault-muted)]">
                  {dev.customLabel} ·{' '}
                  {dev.clientMode === 'pwa' ? 'Aplikacja PWA' : 'Przeglądarka'}
                </div>
                <div className="font-mono text-[11px] text-[var(--vault-accent)] truncate">
                  {dev.deviceCertificateFingerprint ||
                    dev.hardwareSignatureHash ||
                    'CERT-HW-BOUND'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 04: Samodzielna Zmiana Własnego Hasła Głównego (Zwinięta domyślnie na dole) */}
      <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[var(--vault-accent)]" />
              <h3 className="text-base font-bold font-display text-[var(--vault-text)]">
                03. Samodzielna zmiana własnego hasła do skarbca
              </h3>
            </div>
            <p className="text-xs text-[var(--vault-muted)] mt-0.5">
              Zmień swoje hasło logowania w dowolnym momencie bez utraty prywatnych i współdzielonych wpisów.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsPasswordFormOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            {isPasswordFormOpen ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                <span>Ukryj formularz zmiany hasła</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                <span>Zmień moje hasło główne</span>
              </>
            )}
          </button>
        </div>

        {(isPasswordFormOpen || passSuccess || passError) && (
          <form
            onSubmit={handlePasswordChangeSubmit}
            className="space-y-4 pt-4 border-t border-[var(--vault-border)]"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Obecne hasło
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Wpisz obecne hasło..."
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Nowe hasło (min. 4 znaki)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Wpisz nowe hasło..."
                  required
                  minLength={4}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Powtórz nowe hasło
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Powtórz nowe hasło..."
                  required
                  minLength={4}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>
            </div>

            {passError && (
              <div className="p-3 rounded-lg border border-[var(--vault-danger)] bg-[var(--vault-bg)] text-xs text-[var(--vault-danger)]">
                {passError}
              </div>
            )}

            {passSuccess && (
              <div className="p-3 rounded-lg border border-[var(--vault-success)] bg-[var(--vault-bg)] text-xs text-[var(--vault-success)]">
                {passSuccess}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isChangingPass}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {isChangingPass
                    ? 'Przepakowywanie kluczy i zapisywanie...'
                    : 'Zapisz nowe hasło główne'}
                </span>
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
