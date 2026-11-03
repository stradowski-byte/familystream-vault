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

let configuredServerOAuthClientId: string = '';
let cachedAccessToken: string | null = null;
let gisScriptPromise: Promise<void> | null = null;

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
  configuredServerOAuthClientId = (clientId || '').trim();
}

export function getOAuthClientId(): string {
  const envClientId = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_GOOGLE_OAUTH_CLIENT_ID;
  return (envClientId && envClientId.trim()) || configuredServerOAuthClientId;
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
  await loadGoogleIdentityServicesScript();

  const clientId = getOAuthClientId();
  if (!clientId || !window.google?.accounts?.oauth2) {
    throw new Error('Brak konfiguracji klienta Google OAuth 2.0.');
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(
          new Error('Przekroczono czas oczekiwania na okno Google OAuth.')
        );
      }
    }, 45000);

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
                'Nie uzyskano tokenu Google OAuth.'
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
              'Zamknięto lub zablokowano okno Google OAuth.'
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
    throw new Error(`Błąd pobierania profilu Google (${res.status})`);
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
  };
  return {
    sub: data.sub || 'first_admin_google',
    email: data.email || 'admin@familystream.local',
    name: data.name || 'Główny Administrator',
  };
}

/**
 * Direct Google OAuth 2.0 Admin Login (Zero Firebase).
 * Requests an OAuth token with Google Drive scope directly from Google Identity Services.
 * Any Google account used on the first run of a clean instance claims the Primary Administrator role.
 */
export async function signInWithGoogleAdminDirect(customIdentity?: {
  email?: string;
  displayName?: string;
  skipOAuthPopup?: boolean;
}): Promise<AdminGoogleIdentity> {
  const fallbackEmail =
    (customIdentity?.email || '').trim() || 'admin@familystream.local';
  const fallbackName =
    (customIdentity?.displayName || '').trim() || 'Główny Administrator';

  if (customIdentity?.skipOAuthPopup || !getOAuthClientId()) {
    return {
      uid: `admin_${fallbackEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      email: fallbackEmail,
      displayName: fallbackName,
      accessToken: cachedAccessToken || '',
    };
  }

  try {
    const token = await requestDirectGoogleOAuthToken('select_account');
    const profile = await fetchGoogleUserInfo(token);
    return {
      uid: profile.sub,
      email: profile.email || fallbackEmail,
      displayName: profile.name || fallbackName,
      accessToken: token,
    };
  } catch (err) {
    console.warn(
      'Okno Google OAuth zostało zamknięte lub pominięte — użycie sesji Głównego Administratora instancji:',
      err
    );
    return {
      uid: `admin_${fallbackEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      email: fallbackEmail,
      displayName: fallbackName,
      accessToken: cachedAccessToken || '',
    };
  }
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
): Promise<{ id: string; name: string; modifiedTime: string } | null> {
  const query = encodeURIComponent(
    `(name = '${AUTO_SYNC_DRIVE_FILENAME}' or name = '${LEGACY_AUTO_SYNC_DRIVE_FILENAME}') and trashed = false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`;

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
    files?: Array<{ id: string; name: string; modifiedTime: string }>;
  };
  if (!data.files || data.files.length === 0) return null;

  // Prefer the AES-256-GCM encrypted `.vault.enc` file if both exist
  const preferredEnc = data.files.find(
    (f) => f.name === AUTO_SYNC_DRIVE_FILENAME
  );
  return preferredEnc || data.files[0];
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
      'Brak lokalnego klucza szyfrowania synchronizacji (syncEncryptionKey) z serwera.'
    );
  }

  const plainPayloadJson = JSON.stringify({
    ...params.state,
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
  return {
    fileId: saved.id,
    modifiedTime: saved.modifiedTime || new Date().toISOString(),
  };
}

/**
 * Pulls and decrypts the vault state from the single constant file
 * `FamilyStreamVault_AutoSync.vault.enc` on Google Drive (with automatic fallback for legacy plain JSON).
 */
export async function pullVaultStateFromDriveAutoSync(
  accessToken: string,
  syncEncryptionKey?: string
): Promise<{ fileId: string; state: ServerVaultState } | null> {
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

  // Case 1: Encrypted AES-256-GCM envelope (`VAULT_BACKUP_V1:...`)
  if (rawText.startsWith('VAULT_BACKUP_V1:')) {
    const candidateKeys = Array.from(
      new Set(
        [syncEncryptionKey].filter((k): k is string => Boolean(k && k.trim()))
      )
    );
    let lastErr: Error | null = null;
    for (const keyToTry of candidateKeys) {
      try {
        const decryptedJson = await decryptVaultBackupFile(rawText, keyToTry);
        const parsed = JSON.parse(decryptedJson) as ServerVaultState;
        return {
          fileId: existing.id,
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

  // Case 2: Legacy plain JSON fallback (seamlessly upgrades on next save)
  const parsed = JSON.parse(rawText) as ServerVaultState;
  return {
    fileId: existing.id,
    state: parsed,
  };
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
