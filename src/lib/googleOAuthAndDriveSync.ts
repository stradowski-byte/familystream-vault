import { decryptVaultBackupFile, encryptVaultBackupFile } from './crypto';
import type { ServerVaultState } from './vaultApiClient';

export const DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
];

export const AUTO_SYNC_DRIVE_FILENAME = 'FamilyStreamVault_AutoSync.vault.enc';
export const LEGACY_AUTO_SYNC_DRIVE_FILENAME = 'FamilyStreamVault_AutoSync.json';

const LOCAL_OAUTH_CLIENT_ID_KEY = 'fsv_google_oauth_client_id_v1';
const LOCAL_PWA_HANDOFF_KEY = 'fsv_pwa_handoff_v1';
const PWA_HANDOFF_CACHE_NAME = 'fsv-pwa-handoff-cache-v1';
const PWA_HANDOFF_CACHE_URL = '/__fsv_pwa_handoff__.json';

let configuredServerOAuthClientId: string = '';
let cachedAccessToken: string | null = null;
let gisScriptPromise: Promise<void> | null = null;
let publicRuntimeConfigLoaded = false;

export interface AdminGoogleIdentity {
  uid: string;
  email: string;
  displayName: string;
  accessToken: string;
}

export interface DriveBackupFileItem {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export interface PwaHandoffParameters {
  inviteToken?: string;
  driveFileId?: string;
  syncEncryptionKey?: string;
  googleOAuthClientId?: string;
  encryptedSnapshot?: string;
  rawInviteUrl?: string;
  savedAt: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export function setConfiguredGoogleOAuthClientId(
  clientId?: string | null
): void {
  const clean = (clientId || '').trim();
  if (clean) {
    configuredServerOAuthClientId = clean;
    try {
      localStorage.setItem(LOCAL_OAUTH_CLIENT_ID_KEY, clean);
    } catch {
      // ignore storage errors
    }
  }
}

export function getOAuthClientId(): string {
  const envClientId = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (envClientId && envClientId.trim()) return envClientId.trim();
  if (configuredServerOAuthClientId) return configuredServerOAuthClientId;
  try {
    const stored = localStorage.getItem(LOCAL_OAUTH_CLIENT_ID_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // ignore
  }
  return '';
}

export async function loadPublicRuntimeOAuthConfig(): Promise<string> {
  const current = getOAuthClientId();
  if (current || publicRuntimeConfigLoaded || typeof window === 'undefined') {
    return current;
  }
  publicRuntimeConfigLoaded = true;
  try {
    const res = await fetch(`./vault-public-config.json?_cb=${Date.now()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as { googleOAuthClientId?: string };
      if (data?.googleOAuthClientId && data.googleOAuthClientId.trim()) {
        setConfiguredGoogleOAuthClientId(data.googleOAuthClientId.trim());
        return data.googleOAuthClientId.trim();
      }
    }
  } catch {
    // ignore when not present
  }
  return getOAuthClientId();
}

export function parseCustomInviteUrlParameters(
  rawUrlOrQuery?: string
): Partial<PwaHandoffParameters> {
  if (typeof window === 'undefined' && !rawUrlOrQuery) return {};
  try {
    const source = rawUrlOrQuery
      ? rawUrlOrQuery.trim()
      : window.location.href;
    const url = new URL(
      source.startsWith('http')
        ? source
        : `${window.location.origin}${
            source.startsWith('/') ? '' : '/'
          }${source}`
    );
    const params = url.searchParams;
    const hashParams = new URLSearchParams(
      url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    );

    const inviteToken = (
      params.get('invite') ||
      hashParams.get('invite') ||
      ''
    ).trim();
    const driveFileId = (
      params.get('gdf') ||
      hashParams.get('gdf') ||
      ''
    ).trim();
    const syncEncryptionKey = (
      params.get('vkey') ||
      hashParams.get('vkey') ||
      ''
    ).trim();
    const googleOAuthClientId = (
      params.get('cid') ||
      hashParams.get('cid') ||
      ''
    ).trim();
    const encryptedSnapshot = (
      hashParams.get('snap') ||
      params.get('snap') ||
      ''
    ).trim();

    if (googleOAuthClientId) {
      setConfiguredGoogleOAuthClientId(googleOAuthClientId);
    }

    return {
      ...(inviteToken ? { inviteToken } : {}),
      ...(driveFileId ? { driveFileId } : {}),
      ...(syncEncryptionKey ? { syncEncryptionKey } : {}),
      ...(googleOAuthClientId ? { googleOAuthClientId } : {}),
      ...(encryptedSnapshot ? { encryptedSnapshot } : {}),
      rawInviteUrl: source,
    };
  } catch {
    return {};
  }
}

export async function savePwaHandoffParameters(
  partial: Partial<PwaHandoffParameters>
): Promise<PwaHandoffParameters | null> {
  if (typeof window === 'undefined') return null;

  let existing: Partial<PwaHandoffParameters> = {};
  try {
    const raw = localStorage.getItem(LOCAL_PWA_HANDOFF_KEY);
    if (raw) existing = JSON.parse(raw) as Partial<PwaHandoffParameters>;
  } catch {
    // ignore
  }

  const merged: PwaHandoffParameters = {
    ...existing,
    ...partial,
    savedAt: new Date().toISOString(),
  };

  if (merged.googleOAuthClientId) {
    setConfiguredGoogleOAuthClientId(merged.googleOAuthClientId);
  }

  try {
    localStorage.setItem(LOCAL_PWA_HANDOFF_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }

  if ('caches' in window) {
    try {
      const cache = await window.caches.open(PWA_HANDOFF_CACHE_NAME);
      await cache.put(
        new Request(PWA_HANDOFF_CACHE_URL),
        new Response(JSON.stringify(merged), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch {
      // ignore cache storage errors
    }
  }

  return merged;
}

export async function loadPwaHandoffParameters(): Promise<PwaHandoffParameters | null> {
  if (typeof window === 'undefined') return null;

  const fromUrl = parseCustomInviteUrlParameters();
  if (
    fromUrl.inviteToken ||
    fromUrl.driveFileId ||
    fromUrl.syncEncryptionKey ||
    fromUrl.googleOAuthClientId ||
    fromUrl.encryptedSnapshot
  ) {
    return savePwaHandoffParameters(fromUrl);
  }

  try {
    const raw = localStorage.getItem(LOCAL_PWA_HANDOFF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PwaHandoffParameters;
      if (parsed.googleOAuthClientId) {
        setConfiguredGoogleOAuthClientId(parsed.googleOAuthClientId);
      }
      return parsed;
    }
  } catch {
    // ignore
  }

  if ('caches' in window) {
    try {
      const cache = await window.caches.open(PWA_HANDOFF_CACHE_NAME);
      const res = await cache.match(new Request(PWA_HANDOFF_CACHE_URL));
      if (res && res.ok) {
        const parsed = (await res.json()) as PwaHandoffParameters;
        if (parsed.googleOAuthClientId) {
          setConfiguredGoogleOAuthClientId(parsed.googleOAuthClientId);
        }
        try {
          localStorage.setItem(LOCAL_PWA_HANDOFF_KEY, JSON.stringify(parsed));
        } catch {
          // ignore
        }
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function loadGoogleIdentityServicesScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Nie udało się załadować skryptu Google OAuth.'))
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error('Nie udało się załadować skryptu Google Identity Services.')
      );
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

async function requestDirectGoogleOAuthToken(
  promptMode: '' | 'select_account' | 'consent' = 'select_account'
): Promise<string> {
  await loadPublicRuntimeOAuthConfig();
  await loadGoogleIdentityServicesScript();

  const clientId = getOAuthClientId();
  if (!clientId) {
    const err = new Error(
      'Aby otworzyć oficjalne okno wyboru konta Google (Wybierz konto Google), podaj raz publiczny identyfikator Google OAuth Client ID.'
    ) as Error & { code?: string };
    err.code = 'MISSING_GOOGLE_CLIENT_ID';
    throw err;
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error(
      'Biblioteka Google Identity Services nie została załadowana. Sprawdź połączenie z internetem.'
    );
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            'Przekroczono czas oczekiwania na wybór konta w oknie Google.'
          )
        );
      }
    }, 60000);

    const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPES.join(' '),
      prompt: promptMode,
      callback: (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                'Nie wybrano konta Google lub odmówiono dostępu.'
            )
          );
          return;
        }
        cachedAccessToken = response.access_token;
        resolve(response.access_token);
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        reject(
          new Error(
            err?.message ||
              err?.type ||
              'Zamknięto okno wyboru konta Google przed zakończeniem logowania.'
          )
        );
      },
    });

    tokenClient.requestAccessToken({ prompt: promptMode });
  });
}

async function fetchGoogleUserInfo(
  accessToken: string
): Promise<{ sub: string; email: string; name: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Błąd pobierania profilu konta Google (${res.status})`);
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
  };
  if (!data.email) {
    throw new Error('Wybrane konto Google nie zwróciło adresu e-mail.');
  }
  return {
    sub: data.sub || `google_${data.email}`,
    email: data.email,
    name: data.name || data.email.split('@')[0] || 'Główny Administrator',
  };
}

/**
 * Direct Google OAuth 2.0 Admin Login.
 * ALWAYS forces the real Google Account Chooser (`prompt: 'select_account'`)
 * and NEVER silently falls back to `admin@familystream.local`.
 */
export async function signInWithGoogleAdminDirect(): Promise<AdminGoogleIdentity> {
  const token = await requestDirectGoogleOAuthToken('select_account');
  const profile = await fetchGoogleUserInfo(token);
  return {
    uid: profile.sub,
    email: profile.email,
    displayName: profile.name,
    accessToken: token,
  };
}

/**
 * Explicit Google Drive OAuth connection (for Auto-Sync or .vault.enc backup).
 */
export async function connectGoogleDriveOAuthDirect(): Promise<string> {
  const token = await requestDirectGoogleOAuthToken('select_account');
  cachedAccessToken = token;
  return token;
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function setGoogleAccessTokenInMemory(token: string | null) {
  cachedAccessToken = token;
}

/**
 * Finds the single constant encrypted file `FamilyStreamVault_AutoSync.vault.enc`
 * (or legacy `FamilyStreamVault_AutoSync.json`) on the Admin's Google Drive.
 */
export async function findAutoSyncFileOnDrive(
  accessToken: string
): Promise<{
  id: string;
  name: string;
  modifiedTime: string;
  appProperties?: Record<string, string>;
} | null> {
  const query = encodeURIComponent(
    `(name = '${AUTO_SYNC_DRIVE_FILENAME}' or name = '${LEGACY_AUTO_SYNC_DRIVE_FILENAME}') and trashed = false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,appProperties)&orderBy=modifiedTime desc&pageSize=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Błąd wyszukiwania pliku Auto-Sync na Google Drive (${res.status})`
    );
  }

  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      modifiedTime: string;
      appProperties?: Record<string, string>;
    }>;
  };
  if (!data.files || data.files.length === 0) return null;

  const preferredEnc = data.files.find(
    (f) => f.name === AUTO_SYNC_DRIVE_FILENAME
  );
  return preferredEnc || data.files[0];
}

/**
 * Ensures the encrypted `.vault.enc` file on Admin's Google Drive can be downloaded by fileId
 * by family members who possess the customized invite link and AES-256-GCM decryption key.
 */
async function ensureEncryptedDriveFileSharedById(
  accessToken: string,
  fileId: string
): Promise<void> {
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
          allowFileDiscovery: false,
        }),
      }
    );
  } catch {
    // ignore if permission already exists
  }
}

/**
 * Pushes the entire current vault state to the single constant encrypted file
 * `FamilyStreamVault_AutoSync.vault.enc` on Google Drive using AES-256-GCM encryption.
 * Updates the existing file in-place (PATCH) or creates it once (POST) if it doesn't exist yet.
 */
export async function pushVaultStateToDriveAutoSync(params: {
  accessToken: string;
  state: ServerVaultState;
  knownFileId?: string;
  syncEncryptionKey?: string;
}): Promise<{ fileId: string; modifiedTime: string }> {
  let targetFileId = params.knownFileId || '';

  if (!targetFileId) {
    const existing = await findAutoSyncFileOnDrive(params.accessToken);
    if (existing) {
      targetFileId = existing.id;
    }
  }

  const encryptionPassphrase = (
    params.syncEncryptionKey ||
    params.state.syncEncryptionKey ||
    ''
  ).trim();
  if (!encryptionPassphrase) {
    throw new Error(
      'Brak klucza szyfrowania synchronizacji (syncEncryptionKey).'
    );
  }

  const plainPayloadJson = JSON.stringify({
    ...params.state,
    syncEncryptionKey: encryptionPassphrase,
    autoSyncedAt: new Date().toISOString(),
  });

  // Full AES-256-GCM encryption of the Google Drive auto-sync file
  const encryptedEnvelope = await encryptVaultBackupFile(
    plainPayloadJson,
    encryptionPassphrase
  );

  const metadata = {
    name: AUTO_SYNC_DRIVE_FILENAME,
    mimeType: 'application/octet-stream',
    description:
      'Stały zaszyfrowany plik automatycznej synchronizacji bazy FamilyStream Vault (AES-256-GCM Auto-Sync)',
    appProperties: {
      fsvSyncKey: encryptionPassphrase,
    },
  };

  const boundary = '-------FamilyStreamVaultAutoSyncBoundary2026';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/octet-stream\r\n\r\n' +
    encryptedEnvelope +
    closeDelimiter;

  const uploadVaultRequest = async (fileIdToUse: string) => {
    const endpoint = fileIdToUse
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileIdToUse}?uploadType=multipart&fields=id,name,modifiedTime`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';
    const method = fileIdToUse ? 'PATCH' : 'POST';

    return fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
  };

  let res = await uploadVaultRequest(targetFileId);

  if (res.status === 404 && targetFileId) {
    targetFileId = '';
    res = await uploadVaultRequest('');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Błąd zapisu zaszyfrowanego pliku Auto-Sync na Google Drive (${res.status}): ${errText}`
    );
  }

  const saved = (await res.json()) as {
    id: string;
    name: string;
    modifiedTime: string;
  };

  await ensureEncryptedDriveFileSharedById(params.accessToken, saved.id);

  return {
    fileId: saved.id,
    modifiedTime: saved.modifiedTime || new Date().toISOString(),
  };
}

/**
 * Pulls and decrypts the vault state from the single constant file
 * `FamilyStreamVault_AutoSync.vault.enc` on Google Drive.
 * Automatically uses `appProperties.fsvSyncKey` stored on the Drive file so an Admin
 * logging into a fresh PWA on any phone/computer can immediately decrypt their existing Vault!
 */
export async function pullVaultStateFromDriveAutoSync(
  accessToken: string,
  syncEncryptionKey?: string
): Promise<{
  fileId: string;
  syncEncryptionKey?: string;
  state: ServerVaultState;
} | null> {
  const existing = await findAutoSyncFileOnDrive(accessToken);
  if (!existing) {
    return null;
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(
      `Nie udało się pobrać pliku Auto-Sync z Google Drive (${res.status})`
    );
  }

  const rawText = (await res.text()).trim();
  if (!rawText) return null;

  const driveStoredKey = existing.appProperties?.fsvSyncKey;

  // Case 1: Encrypted AES-256-GCM envelope (`VAULT_BACKUP_V1:...`)
  if (rawText.startsWith('VAULT_BACKUP_V1:')) {
    const candidateKeys = Array.from(
      new Set(
        [driveStoredKey, syncEncryptionKey].filter((k): k is string =>
          Boolean(k && k.trim())
        )
      )
    );
    let lastErr: Error | null = null;
    for (const keyToTry of candidateKeys) {
      try {
        const decryptedJson = await decryptVaultBackupFile(rawText, keyToTry);
        const parsed = JSON.parse(decryptedJson) as ServerVaultState;
        return {
          fileId: existing.id,
          syncEncryptionKey: keyToTry,
          state: parsed,
        };
      } catch (err) {
        lastErr =
          err instanceof Error
            ? err
            : new Error('Błąd deszyfrowania AES-256-GCM.');
      }
    }
    throw (
      lastErr ||
      new Error(
        'Nie udało się odszyfrować pliku Auto-Sync z Google Drive (niezgodny klucz AES-256-GCM).'
      )
    );
  }

  // Case 2: Legacy plain JSON fallback
  const parsed = JSON.parse(rawText) as ServerVaultState;
  return {
    fileId: existing.id,
    syncEncryptionKey: driveStoredKey || syncEncryptionKey,
    state: parsed,
  };
}

/**
 * Pulls and decrypts the shared Vault file from the Administrator's Google Drive
 * for a Family Member opening a customized invitation link in their installed PWA.
 */
export async function pullSharedVaultStateFromAdminDriveForMember(params: {
  driveFileId?: string;
  syncEncryptionKey: string;
  encryptedSnapshot?: string;
}): Promise<ServerVaultState | null> {
  const cleanKey = (params.syncEncryptionKey || '').trim();
  if (!cleanKey) return null;

  // 1. Try fetching the live shared encrypted file from Admin's Google Drive (via server proxy or direct token/CORS)
  if (params.driveFileId) {
    const endpointsToTry: Array<{ url: string; headers?: Record<string, string> }> = [
      {
        url: `/api/vault/drive-shared-file?fileId=${encodeURIComponent(
          params.driveFileId
        )}`,
      },
      ...(cachedAccessToken
        ? [
            {
              url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
                params.driveFileId
              )}?alt=media`,
              headers: { Authorization: `Bearer ${cachedAccessToken}` },
            },
          ]
        : []),
    ];

    for (const ep of endpointsToTry) {
      try {
        const res = await fetch(ep.url, { headers: ep.headers });
        if (res.ok) {
          const text = (await res.text()).trim();
          if (text.startsWith('VAULT_BACKUP_V1:')) {
            const decryptedJson = await decryptVaultBackupFile(text, cleanKey);
            return JSON.parse(decryptedJson) as ServerVaultState;
          }
        }
      } catch {
        // try next endpoint or snapshot fallback
      }
    }
  }

  // 2. Fallback to the encrypted snapshot embedded in the customized invite link
  if (params.encryptedSnapshot) {
    try {
      const decryptedJson = await decryptVaultBackupFile(
        params.encryptedSnapshot,
        cleanKey
      );
      return JSON.parse(decryptedJson) as ServerVaultState;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Lists manual `.vault.enc` backup archives stored on the Admin's Google Drive.
 */
export async function listVaultBackupsOnDrive(
  accessToken: string
): Promise<DriveBackupFileItem[]> {
  const query = encodeURIComponent(
    "name contains '.vault.enc' and trashed = false"
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=20`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Błąd pobierania listy kopii z Google Drive (${res.status})`
    );
  }

  const data = (await res.json()) as { files?: DriveBackupFileItem[] };
  return data.files || [];
}

/**
 * Uploads or overwrites a manual `.vault.enc` encrypted backup file on Google Drive.
 */
export async function uploadEncryptedVaultToDrive(params: {
  accessToken: string;
  fileName: string;
  encryptedContent: string;
  existingFileId?: string;
}): Promise<DriveBackupFileItem> {
  const metadata = {
    name: params.fileName,
    mimeType: 'application/octet-stream',
    description:
      'Zaszyfrowana kopia zapasowa FamilyStream Vault (.vault.enc AES-256-GCM)',
  };

  const boundary = '-------FamilyStreamVaultBackupBoundary2026';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/octet-stream\r\n\r\n' +
    params.encryptedContent +
    closeDelimiter;

  const uploadUrl = params.existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${params.existingFileId}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const method = params.existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Nie udało się zapisać pliku .vault.enc na Google Drive (${res.status}): ${errText}`
    );
  }

  return (await res.json()) as DriveBackupFileItem;
}

/**
 * Downloads a `.vault.enc` backup archive from Google Drive by fileId.
 */
export async function downloadVaultBackupFromDrive(
  accessToken: string,
  fileId: string
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Nie udało się pobrać pliku kopii z Google Drive (${res.status})`
    );
  }

  return res.text();
}
