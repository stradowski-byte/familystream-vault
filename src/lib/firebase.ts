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

export function parseAndValidateFirebaseConfigInput(
  rawInput: string,
  overrideDatabaseId?: string
): CustomFirebaseConfig {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Wklej zawartość pliku JSON lub obiekt firebaseConfig.');
  }

  let parsed: Record<string, unknown> | null = null;

  // 1. Try direct JSON parse
  try {
    const candidate = JSON.parse(trimmed);
    if (candidate && typeof candidate === 'object') {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    // 2. Try extracting {...} block from JS snippet (e.g. const firebaseConfig = { ... };)
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const objectSlice = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        parsed = JSON.parse(objectSlice) as Record<string, unknown>;
      } catch {
        // Convert unquoted JS keys to quoted JSON keys
        const jsonified = objectSlice
          .replace(/\/\/.*$/gm, '')
          .replace(/([,{]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'([^']*)'/g, '"$1"')
          .replace(/,\s*([}\]])/g, '$1');
        try {
          parsed = JSON.parse(jsonified) as Record<string, unknown>;
        } catch {
          throw new Error(
            'Nie udało się odczytać formatu JSON. Upewnij się, że wklejasz poprawny plik JSON lub obiekt firebaseConfig z konsoli Firebase.'
          );
        }
      }
    } else {
      throw new Error(
        'Nie znaleziono obiektu JSON ({ ... }). Wgraj poprawny plik .json lub wklej obiekt firebaseConfig.'
      );
    }
  }

  if (!parsed) {
    throw new Error('Nieprawidłowa struktura konfiguracji Firebase.');
  }

  const apiKey = String(parsed.apiKey || '').trim();
  const projectId = String(parsed.projectId || '').trim();
  const rawAuthDomain = String(parsed.authDomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const authDomain =
    rawAuthDomain || (projectId ? `${projectId.toLowerCase()}.firebaseapp.com` : '');
  const appId = String(parsed.appId || '').trim();
  const rawDbId =
    (overrideDatabaseId && overrideDatabaseId.trim()) ||
    String(parsed.firestoreDatabaseId || '').trim();
  const firestoreDatabaseId =
    rawDbId && rawDbId !== '(default)' && rawDbId !== 'default'
      ? rawDbId
      : undefined;
  const storageBucket = String(parsed.storageBucket || '').trim() || undefined;
  const messagingSenderId =
    String(parsed.messagingSenderId || '').trim() || undefined;

  if (!apiKey || !projectId || !authDomain || !appId) {
    throw new Error(
      'Brakuje wymaganych pól w konfiguracji Firebase (wymagane: apiKey, projectId, authDomain, appId).'
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
        // If user entered via an invitation link, mark this device as a Family Member instance
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
  // 1. DEV ENVIRONMENT (Google AI Studio Preview / localhost):
  // Always use the bundled test Firebase project (true-deployment-mfx4d)
  if (isAiStudioRuntime() && isValidConfigObject(bundledConfig)) {
    return bundledConfig;
  }

  // 2. PRODUCTION ENVIRONMENT (GitHub Pages PWA):
  // Strictly use the locally uploaded JSON config (e.g. familypwdvault) or invite config
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

export function clearCustomFirebaseConfig(): void {
  try {
    localStorage.removeItem(LOCAL_FIREBASE_CONFIG_KEY);
    localStorage.removeItem(DEVICE_INSTANCE_ROLE_KEY);
    const fallback = getActiveFirebaseConfig();
    if (fallback) {
      initializeOrUpdateFirebaseInstances(fallback);
    }
  } catch {
    // ignore
  }
}

export function exportActiveFirebaseConfigJson(): string {
  const cfg = getActiveFirebaseConfig();
  if (!cfg) return '{}';
  return JSON.stringify(cfg, null, 2);
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

// Initialize immediately on module load if config is available
const initialConfig = getActiveFirebaseConfig();
if (initialConfig) {
  initializeOrUpdateFirebaseInstances(initialConfig);
}

export function getFirebaseProjectInfo(): {
  projectId: string;
  databaseId: string;
  authDomain: string;
  apiKeyMasked: string;
  appId: string;
  isConfigured: boolean;
} {
  const cfg = getActiveFirebaseConfig();
  const key = cfg?.apiKey || '';
  const apiKeyMasked =
    key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : key || '—';
  return {
    projectId: cfg?.projectId || 'Brak (oczekuje na wgranie JSON)',
    databaseId: cfg?.firestoreDatabaseId || '(default)',
    authDomain: cfg?.authDomain || '—',
    apiKeyMasked,
    appId: cfg?.appId || '—',
    isConfigured: Boolean(cfg),
  };
}

export async function diagnoseFirebaseAuthConfiguration(): Promise<string> {
  const cfg = getActiveFirebaseConfig();
  if (!cfg) {
    return 'Brak załadowanej konfiguracji Firebase JSON.';
  }

  const keyMasked =
    cfg.apiKey.length > 12
      ? `${cfg.apiKey.slice(0, 8)}...${cfg.apiKey.slice(-4)}`
      : cfg.apiKey;

  // 1. Check if the user accidentally used the bundled test project's apiKey with a custom projectId
  if (
    bundledConfig?.apiKey &&
    cfg.apiKey === bundledConfig.apiKey &&
    cfg.projectId.toLowerCase() !== (bundledConfig.projectId || '').toLowerCase()
  ) {
    return `Wykryto niezgodność klucza w wgranym pliku JSON: pole projectId to „${cfg.projectId}”, ale klucz apiKey (${keyMasked}) pochodzi z projektu testowego „${bundledConfig.projectId}”. Wejdź w konsoli Firebase w projekt „${cfg.projectId}” → Koło zębate (⚙️) → Project settings → General → na samym dole w sekcji „Your apps” skopiuj firebaseConfig swojej aplikacji Web (</>) i wgraj poprawny JSON.`;
  }

  // 2. Query Google Identity Toolkit getProjectConfig for this apiKey to verify which project it belongs to
  try {
    const resp = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(
        cfg.apiKey
      )}`
    );
    const data = (await resp.json()) as {
      projectId?: string;
      authorizedDomains?: string[];
      error?: { message?: string };
    };

    if (!resp.ok) {
      const apiErr = data?.error?.message || '';
      if (apiErr.includes('CONFIGURATION_NOT_FOUND')) {
        return `Serwer Google Identity Toolkit zwrócił CONFIGURATION_NOT_FOUND dla klucza apiKey (${keyMasked}) w projekcie „${cfg.projectId}”. Oznacza to jedno z dwóch: (1) W konsoli Firebase projektu „${cfg.projectId}” wejdź w Authentication → Sign-in method → kliknij ikonę ołówka (✏️) przy „Google”, wybierz swój adres Gmail na liście „Project support email” i kliknij „Save” (lub wyłącz Google → Save → włącz ponownie → wybierz e-mail wsparcia → Save), ALBO (2) klucz apiKey (${keyMasked}) w pliku JSON pochodzi z innego projektu niż „${cfg.projectId}” (sprawdź Project settings ⚙️ → General → Your apps).`;
      }
      if (apiErr.includes('API_KEY_INVALID')) {
        return `Klucz apiKey (${keyMasked}) w wgranym pliku JSON jest nieprawidłowy (API_KEY_INVALID). Skopiuj dokładny obiekt firebaseConfig z Project settings (⚙️) → General → Your apps w projekcie „${cfg.projectId}”.`;
      }
    } else if (Array.isArray(data.authorizedDomains)) {
      const firebaseAppDomain = data.authorizedDomains.find((d) =>
        d.endsWith('.firebaseapp.com')
      );
      const actualProjectSlug = firebaseAppDomain
        ? firebaseAppDomain.replace('.firebaseapp.com', '')
        : null;

      if (
        actualProjectSlug &&
        actualProjectSlug.toLowerCase() !== cfg.projectId.toLowerCase()
      ) {
        return `Wykryto przyczynę błędu: Klucz apiKey (${keyMasked}) w Twoim pliku JSON należy do projektu „${actualProjectSlug}”, a nie do „${cfg.projectId}”! Dlatego logowanie zwraca auth/configuration-not-found. Wejdź w Firebase Console w projekt „${cfg.projectId}” → Koło zębate (⚙️) → Project settings → General → sekcja Your apps i skopiuj właściwy klucz apiKey oraz appId dla projektu „${cfg.projectId}”.`;
      }

      const currentHost =
        typeof window !== 'undefined' ? window.location.hostname : '';
      if (currentHost && !data.authorizedDomains.includes(currentHost)) {
        return `Domena „${currentHost}” nie znajduje się na liście autoryzowanych domen dla klucza apiKey (${keyMasked}, projekt: ${actualProjectSlug || cfg.projectId}). Dodaj „${currentHost}” w Authentication → Settings → Authorized domains.`;
      }
    }
  } catch {
    // ignore network check error and fall back to detailed message
  }

  return `Błąd auth/configuration-not-found dla projektu „${cfg.projectId}” (załadowany apiKey: ${keyMasked}, authDomain: ${cfg.authDomain}). W konsoli Firebase projektu „${cfg.projectId}” wejdź w Authentication → Sign-in method → kliknij ikonę ołówka (✏️) przy „Google”, upewnij się że wybrano „Project support email” i kliknij „Save” (jeśli jest już włączone: wyłącz Google → Save → włącz ponownie z e-mailem wsparcia → Save). Upewnij się też, że w Project settings (⚙️) → General → Your apps zarejestrowano aplikację Web (</>) i wgrano jej dokładny apiKey.`;
}

export const FIREBASE_PROJECT_ID = initialConfig?.projectId || '';
export const FIREBASE_DATABASE_ID =
  initialConfig?.firestoreDatabaseId || '(default)';
export const FIREBASE_AUTH_DOMAIN = initialConfig?.authDomain || '';

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

/**
 * Ensures the client has an active cryptographic `request.auth` session in Firebase Auth.
 * - If the Admin is already signed in with Google (or a persisted Anonymous session exists), returns `auth.currentUser`.
 * - Otherwise, automatically signs in with `signInAnonymously(auth)` so family member devices
 *   obtain a persistent `request.auth.uid` bound to their member profile and hardware certificate.
 */
export async function ensureFirebaseAuthSession(
  throwIfAnonymousDisabled = false
): Promise<FirebaseUser | null> {
  if (!isFirebaseConfigured() || !auth) return null;

  try {
    await auth.authStateReady();
  } catch {
    // ignore authStateReady error
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
