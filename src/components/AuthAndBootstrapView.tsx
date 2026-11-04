import React, { useEffect, useState } from 'react';
import {
  Fingerprint,
  Smartphone,
  ShieldCheck,
  Clock,
  Monitor,
  UserPlus,
  LogIn,
  CheckCircle2,
  Download,
  RefreshCw,
  Lock,
  KeyRound,
  Link2,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  Cloud,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { verifyInvitationTokenInFirestore } from '../lib/firestoreVaultService';
import {
  Device,
  Member,
  VaultConfig,
  VaultInvitation,
} from '../types/vault';
import {
  DetectedDeviceProfile,
  StoredBiometricProfile,
} from '../lib/deviceAndBiometrics';

interface AuthAndBootstrapViewProps {
  vaultConfig: VaultConfig | null;
  membersCount: number;
  detectedDevice: DetectedDeviceProfile;
  biometricProfile: StoredBiometricProfile | null;
  pendingAuthState: {
    member: Member;
    dekBase64: string;
    mergedDeksBase64: string[];
    existingDevice: Device | null;
  } | null;
  canInstallPWA: boolean;
  isPWAInstalled: boolean;
  onInstallPWA: () => void;
  onTriggerAppUpdate: () => Promise<void>;
  isUpdatingApp: boolean;
  onAdminGoogleLogin: (options: {
    firebaseUser: FirebaseUser;
    masterPassword?: string;
  }) => Promise<void>;
  onLoginWithCredentials: (username: string, password: string) => Promise<void>;
  onRegisterMemberAccountWithInvite: (params: {
    inviteToken: string;
    fullName: string;
    username: string;
    password: string;
    setupBiometrics: boolean;
  }) => Promise<void>;
  onRecoverMemberAccountWithInvite: (params: {
    inviteToken: string;
    targetMemberId: string;
    newUsername: string;
    newPassword: string;
    setupBiometrics: boolean;
  }) => Promise<void>;
  onRequestDeviceAuthorization: (customLabel: string) => Promise<void>;
  onUnlockWithBiometrics: () => Promise<void>;
  onCancelPendingState: () => void;
  }

const PWA_INVITE_HANDOFF_CACHE = 'fsv-pwa-handoff-cache-v1';
const PWA_INVITE_HANDOFF_KEY = 'fsv_invite_token_v1';

function extractInviteTokenFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('invite=')) {
      const url = new URL(
        trimmed.startsWith('http')
          ? trimmed
          : `https://vault.local/${trimmed.replace(/^\//, '')}`
      );
      return (url.searchParams.get('invite') || '').trim();
    }
  } catch {
    const match = trimmed.match(/[?&]invite=([^&#\s]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return trimmed;
}

async function saveInviteTokenForPwaHandoff(token: string): Promise<void> {
  if (!token) return;
  try {
    localStorage.setItem(PWA_INVITE_HANDOFF_KEY, token);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(PWA_INVITE_HANDOFF_CACHE);
      await cache.put(
        new Request('/__fsv_invite_handoff__'),
        new Response(JSON.stringify({ inviteToken: token }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch {
      // ignore
    }
  }
}

async function loadInviteTokenFromPwaHandoff(): Promise<string> {
  try {
    const fromLs = localStorage.getItem(PWA_INVITE_HANDOFF_KEY);
    if (fromLs) return fromLs;
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(PWA_INVITE_HANDOFF_CACHE);
      const res = await cache.match(new Request('/__fsv_invite_handoff__'));
      if (res) {
        const data = (await res.json()) as { inviteToken?: string };
        if (data?.inviteToken) return data.inviteToken;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

async function clearInviteTokenHandoff(): Promise<void> {
  try {
    localStorage.removeItem(PWA_INVITE_HANDOFF_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(PWA_INVITE_HANDOFF_CACHE);
      await cache.delete(new Request('/__fsv_invite_handoff__'));
    } catch {
      // ignore
    }
  }
}

export const AuthAndBootstrapView: React.FC<AuthAndBootstrapViewProps> = ({
  vaultConfig,
  membersCount,
  detectedDevice,
  biometricProfile,
  pendingAuthState,
  canInstallPWA,
  isPWAInstalled,
  onInstallPWA,
  onTriggerAppUpdate,
  isUpdatingApp,
  onAdminGoogleLogin,
  onLoginWithCredentials,
  onRegisterMemberAccountWithInvite,
  onRecoverMemberAccountWithInvite,
  onRequestDeviceAuthorization,
  onUnlockWithBiometrics,
  onCancelPendingState,
  }) => {
  const isVaultInitialized = Boolean(
    (vaultConfig && vaultConfig.initialized) || membersCount > 0
  );

  // Invitation token from URL (?invite=...) or restored from PWA Handoff CacheStorage
  const [inviteToken, setInviteToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return extractInviteTokenFromInput(window.location.search);
  });
  const [isInitializingHandoff, setIsInitializingHandoff] = useState(true);

  const [manualInviteInput, setManualInviteInput] = useState('');
  const [showManualInviteBox, setShowManualInviteBox] = useState(false);

  const [verifiedInvite, setVerifiedInvite] =
    useState<VaultInvitation | null>(null);
  const [isVerifyingInvite, setIsVerifyingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Invite registration / recovery form state
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regUsernameManuallyEdited, setRegUsernameManuallyEdited] =
    useState(false);
  const [regPassword, setRegPassword] = useState('');
  const [setupBiometricsOnInvite, setSetupBiometricsOnInvite] = useState(false);

  const [deviceCustomLabel, setDeviceCustomLabel] = useState(
    detectedDevice.clientMode === 'pwa'
      ? 'Moja aplikacja PWA'
      : 'Moja przeglądarka'
  );

  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isFamilyLoading, setIsFamilyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Native Firebase Auth user state (persisted via browserLocalPersistence)
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<FirebaseUser | null>(
    () => auth.currentUser
  );
  const [adminMasterPasswordInput, setAdminMasterPasswordInput] = useState('');
  const [copiedCustomLink, setCopiedCustomLink] = useState(false);

  // Strict PWA-only enforcement outside AI Studio
  const isRunningInInstalledPwa =
    isPWAInstalled || detectedDevice.clientMode === 'pwa';
  const isBrowserBlocked = !isAiStudioPreview && !isRunningInInstalledPwa;

  // Listen to native Firebase Auth state (browserLocalPersistence)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Save/restore ?invite=TOKEN across browser -> installed PWA handoff
  useEffect(() => {
    let active = true;
    async function initInviteHandoff() {
      try {
        if (typeof window !== 'undefined') {
          const urlInvite = extractInviteTokenFromInput(window.location.search);
          if (urlInvite) {
            await saveInviteTokenForPwaHandoff(urlInvite);
            if (active) setInviteToken(urlInvite);
            return;
          }
        }
        const restoredToken = await loadInviteTokenFromPwaHandoff();
        if (active && restoredToken && !inviteToken) {
          setInviteToken(restoredToken);
        }
      } finally {
        if (active) setIsInitializingHandoff(false);
      }
    }
    initInviteHandoff();
    return () => {
      active = false;
    };
  }, []);

  // Verify invite token directly in Cloud Firestore whenever `inviteToken` changes
  useEffect(() => {
    let cancelled = false;
    if (!inviteToken || isInitializingHandoff) {
      if (!inviteToken) {
        setVerifiedInvite(null);
        setInviteError(null);
      }
      return;
    }

    setIsVerifyingInvite(true);
    setInviteError(null);

    verifyInvitationTokenInFirestore(inviteToken)
      .then((invitation) => {
        if (cancelled) return;
        setVerifiedInvite(invitation);
        if (
          invitation.purpose === 'account_recovery' &&
          invitation.targetUsername
        ) {
          setRegUsername(invitation.targetUsername);
          setRegFullName(invitation.targetMemberName || '');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setVerifiedInvite(null);
        setInviteError(
          err instanceof Error
            ? err.message
            : 'Ten link zaproszeniowy jest nieprawidłowy lub wygasł.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsVerifyingInvite(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, isInitializingHandoff]);

  const clearInviteFromUrlAndState = () => {
    setInviteToken('');
    setVerifiedInvite(null);
    setInviteError(null);
    clearInviteTokenHandoff().catch(() => {});
    if (
      typeof window !== 'undefined' &&
      window.location.search.includes('invite=')
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  // Auto-suggest login from full name if user hasn't edited login field manually
  const handleFullNameChange = (val: string) => {
    setRegFullName(val);
    if (!regUsernameManuallyEdited) {
      const firstWord = val
        .trim()
        .split(/\s+/)[0]
        ?.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/[^a-z0-9]/g, '');
      if (firstWord) {
        setRegUsername(firstWord);
      }
    }
  };

  const handleCopyCurrentCustomUrl = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopiedCustomLink(true);
    setTimeout(() => setCopiedCustomLink(false), 2500);
  };

  // 0. STRICT BROWSER BLOCK GATE (Force PWA Installation on GitHub Pages / Web Browser)
  if (isBrowserBlocked) {
    const hasCustomInviteInUrlOrHandoff = Boolean(
      inviteToken ||
        (typeof window !== 'undefined' &&
          window.location.search.includes('invite='))
    );

    return (
      <div className="max-w-lg mx-auto my-6 p-6 sm:p-8 rounded-xl border-2 border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-6 shadow-md">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--vault-accent)]">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>
              Wymagana Instalacja Aplikacji PWA · Blokada Trybu Przeglądarki
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-[var(--vault-text)] leading-snug">
            Zainstaluj FamilyStream Vault jako aplikację PWA, aby kontynuować
          </h1>
          <p className="text-xs sm:text-sm text-[var(--vault-muted)] leading-relaxed">
            Ze względów bezpieczeństwa oraz trwałego powiązania Certyfikatu Sprzętowego z bazą Cloud Firestore korzystanie ze skarbca w zwykłej karcie przeglądarki jest wyłączone. Zainstaluj aplikację lokalnie na swoim urządzeniu i otwórz ją z ikony na ekranie głównym.
          </p>
        </div>

        {hasCustomInviteInUrlOrHandoff && (
          <div className="p-4 rounded-xl border border-[var(--vault-success)] bg-[var(--vault-bg)] space-y-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--vault-success)] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-[var(--vault-text)]">
                  Wykryto link zaproszeniowy do Skarbca Rodzinnego!
                </div>
                <p className="text-[var(--vault-muted)] leading-relaxed">
                  Token zaproszenia został zapisany w pamięci podręcznej tego urządzenia. Po zainstalowaniu i uruchomieniu aplikacji PWA Twoje zaproszenie otworzy się automatycznie i połączy z bazą Cloud Firestore.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyCurrentCustomUrl}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer"
            >
              {copiedCustomLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--vault-success)] shrink-0" />
                  <span>Skopiowano link zaproszeniowy do schowka!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    Kopiuj ten link zaproszeniowy (na wypadek ręcznego wklejenia w PWA)
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={onInstallPWA}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-bold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-xl transition-colors cursor-pointer shadow-sm text-center"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>
              {canInstallPWA
                ? 'Zainstaluj aplikację FamilyStream Vault (PWA)'
                : 'Pokaż instrukcję instalacji PWA na tym telefonie'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTriggerAppUpdate()}
            disabled={isUpdatingApp}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0 ${
                isUpdatingApp ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isUpdatingApp
                ? 'Odświeżanie najnowszej wersji...'
                : 'Odśwież wersję aplikacji przed instalacją'}
            </span>
          </button>
        </div>

        <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2.5 text-xs">
          <div className="font-semibold text-[var(--vault-text)]">
            Jak zainstalować aplikację w 10 sekund:
          </div>
          <ul className="list-disc list-inside space-y-1.5 text-[var(--vault-muted)] leading-relaxed">
            <li>
              <strong className="text-[var(--vault-text)]">
                Android (Chrome / Edge / Brave):
              </strong>{' '}
              Kliknij przycisk powyżej lub otwórz menu przeglądarki (trzy kropki{' '}
              <code>⋮</code> w prawym górnym rogu) i wybierz{' '}
              <strong>„Zainstaluj aplikację”</strong> /{' '}
              <strong>„Dodaj do ekranu głównego”</strong>.
            </li>
            <li>
              <strong className="text-[var(--vault-text)]">
                iPhone / iPad (Safari):
              </strong>{' '}
              Stuknij ikonę <strong>Udostępnij</strong> na dolnym pasku i wybierz{' '}
              <strong>„Dodaj do ekranu początkowego”</strong>.
            </li>
            <li>
              <strong className="text-[var(--vault-text)]">
                Po instalacji:
              </strong>{' '}
              Zamknij tę kartę przeglądarki i uruchom <strong>FamilyStream Vault</strong> bezpośrednio z nowej ikony na ekranie telefonu.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // 1. DEVICE / ACCOUNT AUTHORIZATION WAITING SCREEN
  if (pendingAuthState) {
    const { member, existingDevice } = pendingAuthState;
    const isAccountPending = member.status === 'pending';
    const isDevicePending = existingDevice?.status === 'pending';
    const isDeviceRevoked = existingDevice?.status === 'revoked';

    const handleRequestAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMsg(null);
      setIsFamilyLoading(true);
      try {
        await onRequestDeviceAuthorization(deviceCustomLabel.trim());
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Nie udało się wysłać prośby o autoryzację.'
        );
      } finally {
        setIsFamilyLoading(false);
      }
    };

    return (
      <div className="max-w-lg mx-auto my-8 p-6 sm:p-8 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-6">
        <div className="space-y-2">
          <div className="text-xs font-medium text-[var(--vault-accent)]">
            Dwuetapowa ochrona dostępu · Link Zaproszeniowy + Certyfikat Sprzętowy
          </div>
          <h2 className="text-xl font-bold font-display text-[var(--vault-text)]">
            {existingDevice && isDevicePending
              ? 'Oczekiwanie na akceptację konta przez Administratora lub Opiekuna'
              : 'Rozpoznano Twoje konto — autoryzuj to urządzenie'}
          </h2>
          <p className="text-sm text-[var(--vault-muted)]">
            Zgłoszono profil:{' '}
            <strong className="text-[var(--vault-text)]">
              {member.fullName} (login: {member.username})
            </strong>
            . Ze względów bezpieczeństwa dostęp do haseł otworzy się natychmiast (przez nasłuchiwanie czasu rzeczywistego <code>onSnapshot</code>), gdy tylko Administrator lub Zaufany Opiekun kliknie „Akceptuj” w swoim panelu.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Model i system operacyjny:
            </span>
            <span className="font-mono font-semibold text-[var(--vault-text)]">
              {detectedDevice.hardwareModelOs} ({detectedDevice.deviceName})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Typ sprzętu i tryb klienta:
            </span>
            <span className="font-medium text-[var(--vault-text)]">
              {detectedDevice.hardwareDeviceType === 'phone'
                ? 'Smartfon / Telefon'
                : detectedDevice.hardwareDeviceType === 'tablet'
                  ? 'Tablet'
                  : 'Laptop / Komputer'}{' '}
              ·{' '}
              {detectedDevice.clientMode === 'pwa'
                ? 'Aplikacja PWA (Zainstalowana)'
                : 'Przeglądarka internetowa'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Sygnatura sprzętowa (do klucza prywatnego):
            </span>
            <span className="font-mono font-semibold text-[var(--vault-accent)]">
              {detectedDevice.hardwareSignatureHash}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--vault-muted)]">
              Identyfikator sprzętowy urządzenia:
            </span>
            <span className="font-mono text-[var(--vault-muted)]">
              {detectedDevice.deviceFingerprint}
            </span>
          </div>
        </div>

        {!existingDevice || isDeviceRevoked ? (
          <form onSubmit={handleRequestAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                Nazwa pomocnicza tego urządzenia (widoczna dla Ciebie i Admina)
              </label>
              <input
                type="text"
                value={deviceCustomLabel}
                onChange={(e) => setDeviceCustomLabel(e.target.value)}
                placeholder="np. Telefon Mamy, Laptop w salonie"
                maxLength={80}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg border border-[var(--vault-danger)] text-xs text-[var(--vault-danger)]">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isFamilyLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-xl transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isFamilyLoading
                  ? 'Wysyłanie prośby...'
                  : 'Autoryzuj moje urządzenie'}
              </span>
            </button>
          </form>
        ) : (
          <div className="p-4 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--vault-text)]">
              <Clock className="w-4 h-4 text-[var(--vault-accent)]" />
              <span>
                {isAccountPending
                  ? 'Prośba „Załóż mi konto” została zapisana w Cloud Firestore!'
                  : 'Prośba o autoryzację urządzenia została zapisana w Cloud Firestore!'}
              </span>
            </div>
            <p className="text-xs text-[var(--vault-muted)]">
              {isAccountPending
                ? 'Twoje zgłoszenie jest już widoczne w czasie rzeczywistym u Administratora i Zaufanego Opiekuna. Gdy klikną „Akceptuj”, skarbiec otworzy się automatycznie na tym ekranie.'
                : 'Twoje urządzenie czeka na zatwierdzenie. Gdy tylko Administrator lub Zaufany Opiekun kliknie „Akceptuj”, skarbiec otworzy się automatycznie.'}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--vault-border)] flex justify-between items-center text-xs">
          <button
            type="button"
            onClick={onCancelPendingState}
            className="text-[var(--vault-muted)] hover:text-[var(--vault-text)] underline cursor-pointer"
          >
            Wróć do ekranu logowania
          </button>
          <span className="text-[var(--vault-muted)]">
            Cloud Firestore onSnapshot aktywny
          </span>
        </div>
      </div>
    );
  }

  // Native Firebase Auth Google login handler
  const handleAdminClick = async (forceAccountSelection = false) => {
    setErrorMsg(null);
    setIsAdminLoading(true);
    try {
      let userToUse = !forceAccountSelection ? auth.currentUser : null;
      if (!userToUse) {
        if (forceAccountSelection) {
          googleProvider.setCustomParameters({ prompt: 'select_account' });
        } else {
          const hintEmail =
            vaultConfig?.adminEmail &&
            !vaultConfig.adminEmail.endsWith('.local')
              ? vaultConfig.adminEmail
              : undefined;
          googleProvider.setCustomParameters(
            hintEmail ? { login_hint: hintEmail } : {}
          );
        }
        const credential = await signInWithPopup(auth, googleProvider);
        userToUse = credential.user;
      }

      await onAdminGoogleLogin({
        firebaseUser: userToUse,
        masterPassword: adminMasterPasswordInput.trim() || undefined,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/unauthorized-domain') {
        const host =
          typeof window !== 'undefined' ? window.location.hostname : '';
        setErrorMsg(
          `Domena „${host}” nie jest jeszcze dodana do autoryzowanych domen w Firebase Auth. Dodaj ją w Firebase Console -> Authentication -> Settings -> Authorized domains.`
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Zamknięto okno logowania Google przed wyborem konta.');
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Nie udało się zalogować jako Administrator przez Firebase Auth.'
        );
      }
    } finally {
      setIsAdminLoading(false);
    }
  };

  
  const handleFamilyLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsFamilyLoading(true);
    try {
      await onLoginWithCredentials(
        loginUsername.trim().toLowerCase(),
        loginPassword
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Błąd podczas logowania.'
      );
    } finally {
      setIsFamilyLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedInvite) return;
    setErrorMsg(null);

    if (verifiedInvite.purpose === 'account_recovery') {
      if (!verifiedInvite.targetMemberId) {
        setErrorMsg('Brak przypisanego konta domownika w linku ratunkowym.');
        return;
      }
      if (!regUsername.trim() || regPassword.length < 4) {
        setErrorMsg('Podaj login oraz nowe hasło (minimum 4 znaki).');
        return;
      }
      setIsFamilyLoading(true);
      try {
        await onRecoverMemberAccountWithInvite({
          inviteToken: verifiedInvite.token,
          targetMemberId: verifiedInvite.targetMemberId,
          newUsername: regUsername.trim().toLowerCase(),
          newPassword: regPassword,
          setupBiometrics: setupBiometricsOnInvite,
        });
        clearInviteFromUrlAndState();
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Nie udało się zresetować dostępu z linku ratunkowego.'
        );
      } finally {
        setIsFamilyLoading(false);
      }
      return;
    }

    // New member registration via invitation link
    if (!regFullName.trim() || !regUsername.trim() || regPassword.length < 4) {
      setErrorMsg(
        'Wpisz swoje imię i nazwisko, login oraz hasło (min. 4 znaki).'
      );
      return;
    }

    setIsFamilyLoading(true);
    try {
      await onRegisterMemberAccountWithInvite({
        inviteToken: verifiedInvite.token,
        fullName: regFullName.trim(),
        username: regUsername.trim().toLowerCase(),
        password: regPassword,
        setupBiometrics: setupBiometricsOnInvite,
      });
      clearInviteFromUrlAndState();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Błąd podczas zakładania konta z zaproszenia.'
      );
    } finally {
      setIsFamilyLoading(false);
    }
  };

  const handleBiometricClick = async () => {
    setErrorMsg(null);
    setIsFamilyLoading(true);
    try {
      await onUnlockWithBiometrics();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Nie udało się odblokować odciskiem palca.'
      );
    } finally {
      setIsFamilyLoading(false);
    }
  };

  const handleApplyManualInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractInviteTokenFromInput(manualInviteInput);
    if (!extracted) return;
    await saveInviteTokenForPwaHandoff(extracted);
    setInviteToken(extracted);
    setShowManualInviteBox(false);
    setManualInviteInput('');
  };

  const rememberedAdminEmail =
    firebaseAuthUser?.email ||
    (vaultConfig?.adminEmail && !vaultConfig.adminEmail.endsWith('.local')
      ? vaultConfig.adminEmail
      : null);

  return (
    <div className="max-w-lg mx-auto my-4 space-y-6">
      
      {/* MAIN PAGE QUICK ACTION BAR: PWA Status + Update */}
      <div className="p-4 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-xs font-semibold text-[var(--vault-text)] flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
            <span>
              {isRunningInInstalledPwa
                ? 'Aplikacja FamilyStream Vault działa w trybie zainstalowanym (PWA)'
                : 'Zainstaluj skarbiec jako aplikację PWA'}
            </span>
          </div>
          <p className="text-[11px] text-[var(--vault-muted)]">
            {isRunningInInstalledPwa
              ? 'Kliknij „Aktualizuj aplikację”, aby pobrać najnowszą wersję kodu z GitHub Pages bez utraty danych w Cloud Firestore.'
              : 'Zainstaluj jako aplikację PWA na telefonie lub zaktualizuj program jednym kliknięciem.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isRunningInInstalledPwa && (
            <button
              type="button"
              onClick={onInstallPWA}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Zainstaluj jako aplikację (PWA)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onTriggerAppUpdate()}
            disabled={isUpdatingApp}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0 ${
                isUpdatingApp ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isUpdatingApp ? 'Aktualizowanie...' : 'Aktualizuj aplikację'}
            </span>
          </button>
        </div>
      </div>

      {/* CASE 1: FRESH UNINITIALIZED INSTANCE -> ADMIN FIREBASE GOOGLE AUTH */}
      {!isVaultInitialized && !inviteToken ? (
        <div className="p-5 sm:p-7 rounded-xl border-2 border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-5 overflow-hidden">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--vault-accent)]">
              <Cloud className="w-4 h-4 shrink-0" />
              <span>
                Autoryzacja Głównego Administratora · Firebase Auth + Cloud Firestore
              </span>
            </div>
            <h1 className="text-xl font-bold font-display text-[var(--vault-text)]">
              Zaloguj się kontem Google i zainicjalizuj Skarbiec w Cloud Firestore
            </h1>
            <p className="text-xs text-[var(--vault-muted)] leading-relaxed">
              Kliknij przycisk poniżej, aby zalogować się przez <strong>Firebase Authentication</strong>. Sesja zostanie natywnie zapamiętana w przeglądarce (<code>browserLocalPersistence</code>), a szyfrowanie haseł (E2E AES-256-GCM) odbywa się w 100% lokalnie na Twoim urządzeniu.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2">
            <label className="block text-[11px] font-medium text-[var(--vault-muted)]">
              Opcjonalne hasło główne Admina (ułatwia awaryjne logowanie loginem <code className="font-mono text-[var(--vault-accent)]">admin</code>)
            </label>
            <input
              type="password"
              value={adminMasterPasswordInput}
              onChange={(e) => setAdminMasterPasswordInput(e.target.value)}
              placeholder="Opcjonalne hasło (min. 4 znaki)..."
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg border border-[var(--vault-danger)] text-xs text-[var(--vault-danger)] break-words">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleAdminClick(false)}
              disabled={isAdminLoading}
              className="gsi-material-button !w-full"
            >
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isAdminLoading
                    ? 'Logowanie przez Firebase Auth...'
                    : rememberedAdminEmail
                      ? `Zaloguj jako Administrator (${rememberedAdminEmail})`
                      : 'Zaloguj przez Google (Firebase Auth)'}
                </span>
              </div>
            </button>

            {rememberedAdminEmail && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--vault-muted)] px-1">
                <span>
                  Aktywna sesja Firebase Auth: <strong>{rememberedAdminEmail}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => handleAdminClick(true)}
                  disabled={isAdminLoading}
                  className="text-[var(--vault-accent)] hover:underline font-medium cursor-pointer"
                >
                  Zmień konto Google
                </button>
              </div>
            )}
          </div>

          {/* Manual invite paste for family member */}
          <div className="pt-2 border-t border-[var(--vault-border)] space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--vault-muted)]">
              <span>Jesteś domownikiem i otrzymałeś link zaproszeniowy od Admina?</span>
              <button
                type="button"
                onClick={() => setShowManualInviteBox((v) => !v)}
                className="text-[var(--vault-accent)] hover:underline font-medium cursor-pointer"
              >
                {showManualInviteBox
                  ? 'Ukryj pole linku'
                  : 'Wklej link zaproszeniowy'}
              </button>
            </div>
            {showManualInviteBox && (
              <form
                onSubmit={handleApplyManualInvite}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  value={manualInviteInput}
                  onChange={(e) => setManualInviteInput(e.target.value)}
                  placeholder="Wklej link zaproszeniowy od Administratora..."
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer shrink-0"
                >
                  Otwórz zaproszenie
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {/* CASE 2: INVITATION OR RECOVERY LINK MODE (?invite=TOKEN) */}
      {inviteToken && (
        <div className="p-6 rounded-xl border-2 border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-5">
          {isInitializingHandoff || isVerifyingInvite ? (
            <div className="py-6 text-center text-xs text-[var(--vault-muted)]">
              Weryfikacja kryptograficznego linku zaproszeniowego w Cloud Firestore...
            </div>
          ) : inviteError || !verifiedInvite ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 text-[var(--vault-danger)]">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="text-base font-bold font-display text-[var(--vault-text)]">
                    Link zaproszeniowy jest nieaktywny
                  </h2>
                  <p className="text-xs text-[var(--vault-danger)]">
                    {inviteError ||
                      'Ten link został już wykorzystany lub stracił ważność. Poproś Administratora o nowy link.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearInviteFromUrlAndState}
                className="w-full py-2.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
              >
                Przejdź do ekranu głównego
              </button>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[var(--vault-accent)] flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>
                      {verifiedInvite.purpose === 'account_recovery'
                        ? 'Link Ratunkowy — Odzyskiwanie Dostępu'
                        : 'Zaproszenie do Skarbca Rodzinnego'}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[var(--vault-muted)]">
                    {verifiedInvite.mode === 'single_use'
                      ? 'Link jednorazowy'
                      : 'Link czasowy (24h)'}
                  </span>
                </div>

                <h2 className="text-xl font-bold font-display text-[var(--vault-text)]">
                  {verifiedInvite.purpose === 'account_recovery'
                    ? `Ustaw nowe hasło dla: ${
                        verifiedInvite.targetMemberName || 'Domownika'
                      }`
                    : 'Witaj w Rodzinnym Skarbcu — Załóż swoje konto'}
                </h2>

                <p className="text-xs text-[var(--vault-muted)]">
                  {verifiedInvite.purpose === 'account_recovery' ? (
                    <>
                      Link wygenerowany przez:{' '}
                      <strong className="text-[var(--vault-text)]">
                        {verifiedInvite.createdByMemberName}
                      </strong>
                      . Wpisz poniżej swoje nowe hasło — Twoje konto oraz to urządzenie zostaną od razu odblokowane.
                    </>
                  ) : (
                    <>
                      Zaproszenie utworzone przez:{' '}
                      <strong className="text-[var(--vault-text)]">
                        {verifiedInvite.createdByMemberName}
                      </strong>{' '}
                      ({verifiedInvite.invitedLabel}). Wpisz swoje imię i nazwisko oraz ustal login i hasło do skarbca.
                    </>
                  )}
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg border border-[var(--vault-danger)] text-xs text-[var(--vault-danger)]">
                  {errorMsg}
                </div>
              )}

              {verifiedInvite.purpose === 'new_member' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                    Imię i nazwisko
                  </label>
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => handleFullNameChange(e.target.value)}
                    placeholder="np. Anna Kowalska"
                    required
                    maxLength={100}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  {verifiedInvite.purpose === 'account_recovery'
                    ? 'Twój login do skarbca (możesz go zostawić lub zmienić)'
                    : 'Twój login do odblokowania skarbca'}
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => {
                    setRegUsername(e.target.value);
                    setRegUsernameManuallyEdited(true);
                  }}
                  placeholder="np. mama, anna, piotr"
                  required
                  maxLength={60}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  {verifiedInvite.purpose === 'account_recovery'
                    ? 'Wpisz nowe hasło (min. 4 znaki)'
                    : 'Ustal własne hasło (min. 4 znaki)'}
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min. 4 znaki..."
                  required
                  minLength={4}
                  maxLength={128}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-xs text-[var(--vault-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={setupBiometricsOnInvite}
                  onChange={(e) => setSetupBiometricsOnInvite(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-semibold block">
                    Włącz odblokowywanie odciskiem palca / FaceID na tym urządzeniu
                  </span>
                  <span className="text-[11px] text-[var(--vault-muted)]">
                    Pozwoli Ci wchodzić do skarbca jednym dotknięciem bez konieczności pamiętania hasła.
                  </span>
                </div>
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isFamilyLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-xl transition-colors cursor-pointer"
                >
                  {verifiedInvite.purpose === 'account_recovery' ? (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>
                        {isFamilyLoading
                          ? 'Zapisywanie nowego hasła...'
                          : 'Zapisz nowe hasło i odblokuj moje konto'}
                      </span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {isFamilyLoading
                          ? 'Wysyłanie zgłoszenia...'
                          : 'Załóż mi konto'}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-2 border-t border-[var(--vault-border)] flex justify-between items-center text-xs">
                <button
                  type="button"
                  onClick={clearInviteFromUrlAndState}
                  className="text-[var(--vault-muted)] hover:text-[var(--vault-text)] underline cursor-pointer"
                >
                  Masz już aktywne konto? Przejdź do logowania
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CASE 3: INITIALIZED VAULT STANDARD LOGIN SCREEN */}
      {isVaultInitialized && !inviteToken && (
        <>
          {/* 1-Touch Fingerprint Unlock (if already paired on this device) */}
          {biometricProfile && (
            <div className="p-5 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--vault-muted)]">
                    Szybkie odblokowanie biometryczne (WebAuthn)
                  </div>
                  <div className="text-sm font-semibold text-[var(--vault-text)]">
                    {biometricProfile.fullName} ({biometricProfile.username})
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-[var(--vault-success)]" />
              </div>
              <button
                type="button"
                onClick={handleBiometricClick}
                disabled={isFamilyLoading || isAdminLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
              >
                <Fingerprint className="w-4 h-4" />
                <span>Odblokuj skarbiec odciskiem palca (1-Dotknięcie)</span>
              </button>
            </div>
          )}

          {/* SECTION A: FAMILY MEMBERS & CO-ADMINS LOGIN */}
          <div className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--vault-muted)]">
                <span className="font-semibold text-[var(--vault-text)]">
                  01. Logowanie Domowników i Zaufanych Opiekunów
                </span>
                <span className="inline-flex items-center gap-1">
                  {detectedDevice.clientMode === 'pwa' ? (
                    <Smartphone className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  ) : (
                    <Monitor className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  )}
                  <span>{detectedDevice.deviceName}</span>
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)]">
                Wpisz swój login oraz hasło. Klucz deszyfrujący Twoje prywatne hasła powstaje lokalnie z połączenia Twojego hasła, profilu sprzętowego tego urządzenia oraz certyfikatu zatwierdzenia.
              </p>
              <div className="p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--vault-muted)] mt-2">
                <span>
                  Profil sprzętowy:{' '}
                  <strong className="text-[var(--vault-text)]">
                    {detectedDevice.hardwareModelOs} ·{' '}
                    {detectedDevice.clientMode === 'pwa' ? 'PWA' : 'Browser'}
                  </strong>
                </span>
                <span className="text-[var(--vault-accent)] font-semibold">
                  {detectedDevice.hardwareSignatureHash}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg border border-[var(--vault-danger)] text-xs text-[var(--vault-danger)] break-words">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleFamilyLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Login domownika / opiekuna
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="np. mama, brat, anna"
                  required
                  maxLength={80}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Hasło
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Twoje hasło..."
                  required
                  maxLength={128}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
              </div>

              <button
                type="submit"
                disabled={isFamilyLoading || isAdminLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {isFamilyLoading
                    ? 'Weryfikacja certyfikatu sprzętowego...'
                    : 'Zaloguj się do skarbca'}
                </span>
              </button>
            </form>

            {/* Invitation link helper / manual token paste for installed PWA */}
            <div className="pt-3 border-t border-[var(--vault-border)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--vault-muted)]">
                <span>
                  Nie masz konta lub zapomniałeś hasła? Poproś Administratora lub Zaufanego Opiekuna o link zaproszeniowy.
                </span>
                <button
                  type="button"
                  onClick={() => setShowManualInviteBox((v) => !v)}
                  className="text-[var(--vault-accent)] hover:underline font-medium cursor-pointer shrink-0"
                >
                  {showManualInviteBox
                    ? 'Ukryj pole linku'
                    : 'Wklej otrzymany link / kod zaproszenia'}
                </button>
              </div>

              {showManualInviteBox && (
                <form
                  onSubmit={handleApplyManualInvite}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
                >
                  <input
                    type="text"
                    value={manualInviteInput}
                    onChange={(e) => setManualInviteInput(e.target.value)}
                    placeholder="Wklej tutaj link zaproszeniowy..."
                    className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer shrink-0"
                  >
                    Otwórz zaproszenie
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* SECTION B: PRIMARY ADMINISTRATOR FIREBASE GOOGLE LOGIN */}
          <div className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[var(--vault-accent)]">
                  02. Główny Administrator Skarbca (Firebase Auth + Cloud Firestore)
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--vault-muted)] shrink-0">
                  <Lock className="w-3 h-3 text-[var(--vault-success)]" />
                  <span>E2E AES-256-GCM</span>
                </span>
              </div>
              <p className="text-xs text-[var(--vault-muted)] leading-relaxed">
                Konto Głównego Administratora (
                <strong>{rememberedAdminEmail || 'zainicjalizowane'}</strong>) jest chronione przez Firebase Auth z trwałym podtrzymywaniem sesji (<code>browserLocalPersistence</code>).
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleAdminClick(false)}
                disabled={isAdminLoading || isFamilyLoading}
                className="gsi-material-button !w-full"
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      ></path>
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      ></path>
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      ></path>
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      ></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isAdminLoading
                      ? 'Odblokowywanie skarbca Administratora...'
                      : rememberedAdminEmail
                        ? `Zaloguj jako Administrator (${rememberedAdminEmail})`
                        : 'Zaloguj jako Główny Administrator przez Google'}
                  </span>
                </div>
              </button>

              {rememberedAdminEmail && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--vault-muted)] px-1">
                  <span>
                    Konto Admina:{' '}
                    <strong className="text-[var(--vault-text)]">
                      {rememberedAdminEmail}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAdminClick(true)}
                    disabled={isAdminLoading || isFamilyLoading}
                    className="text-[var(--vault-accent)] hover:underline font-medium cursor-pointer shrink-0"
                  >
                    Zmień konto Google
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
