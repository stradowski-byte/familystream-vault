import type {
  ActivityLog,
  Device,
  GitHubPushResult,
  GitHubSyncConfig,
  InvitationMode,
  InvitationPurpose,
  Member,
  PasswordRecord,
  VaultBootstrapStatus,
  VaultConfig,
  VaultInvitation,
} from '../types/vault';

export interface ServerVaultState {
  vaultConfig: VaultConfig | null;
  members: Member[];
  devices: Device[];
  passwords: PasswordRecord[];
  invitations?: VaultInvitation[];
  activityLogs: ActivityLog[];
  driveSyncFileId?: string;
  syncEncryptionKey?: string;
  bootstrapStatus?: VaultBootstrapStatus;
  updatedAt: string;
}

export interface VaultSessionAuthResponse {
  sessionToken: string;
  syncEncryptionKey: string;
  bootstrapStatus: VaultBootstrapStatus;
  state: ServerVaultState;
}

const SESSION_TOKEN_STORAGE_KEY = 'familystream_vault_session_token_v1';
const DEVICE_FP_STORAGE_KEY = 'familystream_vault_device_fp_v1';

let inMemorySessionToken: string | null = null;
let inMemoryDeviceFingerprint: string | null = null;

export function setVaultApiSessionContext(params: {
  sessionToken?: string | null;
  deviceFingerprint?: string | null;
}) {
  if (params.sessionToken !== undefined) {
    inMemorySessionToken = params.sessionToken;
    try {
      if (params.sessionToken) {
        sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, params.sessionToken);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }
  if (params.deviceFingerprint !== undefined) {
    inMemoryDeviceFingerprint = params.deviceFingerprint;
    try {
      if (params.deviceFingerprint) {
        localStorage.setItem(DEVICE_FP_STORAGE_KEY, params.deviceFingerprint);
      }
    } catch {
      // ignore storage errors
    }
  }
}

export function getVaultApiSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;
  try {
    return sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const token = getVaultApiSessionToken();
  const fp =
    inMemoryDeviceFingerprint ||
    (() => {
      try {
        return localStorage.getItem(DEVICE_FP_STORAGE_KEY);
      } catch {
        return null;
      }
    })();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fp ? { 'X-Vault-Device-Fingerprint': fp } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errText = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(errText) as { error?: string };
      if (parsed?.error) errText = parsed.error;
    } catch {
      // keep plain text
    }
    throw new Error(
      errText ||
        `Błąd komunikacji z serwerem skarbca (${res.status}: ${res.statusText})`
    );
  }

  return (await res.json()) as T;
}

export async function fetchBootstrapStatusFromServer(): Promise<VaultBootstrapStatus> {
  return apiRequest<VaultBootstrapStatus>('/api/vault/bootstrap-status');
}

export async function verifyInvitationTokenOnServer(token: string): Promise<{
  valid: boolean;
  invitation: VaultInvitation;
}> {
  return apiRequest<{ valid: boolean; invitation: VaultInvitation }>(
    `/api/vault/invites/verify/${encodeURIComponent(token)}`
  );
}

export async function createInvitationOnServer(params: {
  purpose: InvitationPurpose;
  mode: InvitationMode;
  invitedLabel: string;
  targetMemberId?: string;
  createdByMemberId: string;
  createdByMemberName: string;
  hoursValid?: number;
}): Promise<{ invitation: VaultInvitation; state: ServerVaultState }> {
  return apiRequest<{ invitation: VaultInvitation; state: ServerVaultState }>(
    '/api/vault/invites',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}

export async function consumeInvitationTokenOnServer(
  token: string
): Promise<{ invitation: VaultInvitation; state: ServerVaultState }> {
  return apiRequest<{ invitation: VaultInvitation; state: ServerVaultState }>(
    '/api/vault/invites/consume',
    {
      method: 'POST',
      body: JSON.stringify({ token }),
    }
  );
}

export async function deleteInvitationOnServer(
  invitationId: string
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/invites/${encodeURIComponent(invitationId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function establishVaultSessionOnServer(params: {
  mode: 'admin_google' | 'member_login' | 'member_register' | 'biometric';
  memberId?: string;
  username?: string;
  passwordHash?: string;
  googleEmail?: string;
  googleUid?: string;
  deviceFingerprint: string;
  deviceName: string;
  inviteToken?: string;
}): Promise<VaultSessionAuthResponse> {
  const response = await apiRequest<VaultSessionAuthResponse>(
    '/api/vault/auth/session',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
  setVaultApiSessionContext({
    sessionToken: response.sessionToken,
    deviceFingerprint: params.deviceFingerprint,
  });
  return response;
}

export async function fetchVaultStateFromServer(): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>('/api/vault/state');
}

export async function saveVaultConfigOnServer(
  config: VaultConfig
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>('/api/vault/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function saveMemberOnServer(
  memberId: string,
  memberData: Partial<Member>
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(memberData),
    }
  );
}

export async function deleteMemberOnServer(
  memberId: string
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/members/${encodeURIComponent(memberId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function saveDeviceOnServer(
  deviceId: string,
  deviceData: Partial<Device>
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/devices/${encodeURIComponent(deviceId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(deviceData),
    }
  );
}

export async function rebindDeviceCertificateOnServer(
  deviceId: string
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/devices/${encodeURIComponent(deviceId)}/rebind-certificate`,
    {
      method: 'POST',
    }
  );
}

export async function deleteDeviceOnServer(
  deviceId: string
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/devices/${encodeURIComponent(deviceId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function savePasswordOnServer(
  passwordId: string,
  passwordData: Partial<PasswordRecord>
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/passwords/${encodeURIComponent(passwordId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    }
  );
}

export async function deletePasswordOnServer(
  passwordId: string
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>(
    `/api/vault/passwords/${encodeURIComponent(passwordId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function appendActivityLogOnServer(
  logEntry: ActivityLog
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>('/api/vault/logs', {
    method: 'POST',
    body: JSON.stringify(logEntry),
  });
}

export async function mergeMembersOnServer(params: {
  sourceMemberId: string;
  targetMemberId: string;
  updatedMergedKeysJson: string;
}): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>('/api/vault/merge-members', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function replaceVaultStateOnServer(
  state: Partial<ServerVaultState>
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>('/api/vault/sync-replace', {
    method: 'POST',
    body: JSON.stringify(state),
  });
}

export async function saveDriveSyncFileIdOnServer(
  driveSyncFileId: string
): Promise<ServerVaultState> {
  return apiRequest<ServerVaultState>('/api/vault/drive-sync-meta', {
    method: 'PUT',
    body: JSON.stringify({ driveSyncFileId }),
  });
}

export async function saveGoogleOAuthClientIdOnServer(
  googleOAuthClientId: string
): Promise<VaultBootstrapStatus> {
  return apiRequest<VaultBootstrapStatus>('/api/vault/oauth-config', {
    method: 'PUT',
    body: JSON.stringify({ googleOAuthClientId }),
  });
}

export async function fetchGitHubSyncConfigFromServer(): Promise<GitHubSyncConfig> {
  return apiRequest<GitHubSyncConfig>('/api/github/config');
}

export async function saveGitHubPatOnServer(params: {
  personalAccessToken: string;
  repoName?: string;
}): Promise<GitHubSyncConfig> {
  return apiRequest<GitHubSyncConfig>('/api/github/config', {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

export async function pushProjectCodeToGitHubOnServer(params?: {
  personalAccessToken?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  commitMessage?: string;
  createRepoIfMissing?: boolean;
  isPrivateRepo?: boolean;
}): Promise<GitHubPushResult> {
  return apiRequest<GitHubPushResult>('/api/github/push', {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

