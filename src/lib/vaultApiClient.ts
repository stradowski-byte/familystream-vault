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
const STANDALONE_STATE_KEY = 'fsv_standalone_vault_state_v1';
const STANDALONE_META_KEY = 'fsv_standalone_bootstrap_meta_v1';
const APP_VERSION = '2.4.0-PWA';

let inMemorySessionToken: string | null = null;
let inMemoryDeviceFingerprint: string | null = null;

interface LocalStandaloneMeta {
  vaultInstanceId: string;
  syncEncryptionKey: string;
  driveSyncFileName: string;
  driveSyncUpdatedAt: string | null;
  googleOAuthClientId: string;
  githubConfig: GitHubSyncConfig;
  githubPat?: string;
}

function randomHex(bytesCount: number): string {
  const arr = new Uint8Array(bytesCount);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytesCount; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getStandaloneMeta(): LocalStandaloneMeta {
  try {
    const raw = localStorage.getItem(STANDALONE_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStandaloneMeta>;
      if (parsed.vaultInstanceId && parsed.syncEncryptionKey) {
        return {
          vaultInstanceId: parsed.vaultInstanceId,
          syncEncryptionKey: parsed.syncEncryptionKey,
          driveSyncFileName:
            parsed.driveSyncFileName || 'FamilyStreamVault_AutoSync.vault.enc',
          driveSyncUpdatedAt: parsed.driveSyncUpdatedAt || null,
          googleOAuthClientId: parsed.googleOAuthClientId || '',
          githubConfig: parsed.githubConfig || {
            repoOwner: '',
            repoName: 'familystream-vault',
            branch: 'main',
          },
          githubPat: parsed.githubPat || '',
        };
      }
    }
  } catch {
    // ignore
  }
  const fresh: LocalStandaloneMeta = {
    vaultInstanceId: `fsv_${randomHex(6)}`,
    syncEncryptionKey: randomHex(32),
    driveSyncFileName: 'FamilyStreamVault_AutoSync.vault.enc',
    driveSyncUpdatedAt: null,
    googleOAuthClientId: '',
    githubConfig: {
      repoOwner: '',
      repoName: 'familystream-vault',
      branch: 'main',
    },
    githubPat: '',
  };
  try {
    localStorage.setItem(STANDALONE_META_KEY, JSON.stringify(fresh));
  } catch {
    // ignore
  }
  return fresh;
}

function saveStandaloneMeta(meta: LocalStandaloneMeta): void {
  try {
    localStorage.setItem(STANDALONE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

function ensureLocalDeviceCertificate(device: Device): Device {
  const now = new Date().toISOString();
  if (device.status !== 'approved') return device;
  const approvalToken = device.deviceApprovalToken || `hwcert_${randomHex(24)}`;
  const certFp =
    device.deviceCertificateFingerprint ||
    `CERT-HW-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}`;
  return {
    ...device,
    deviceApprovalToken: approvalToken,
    deviceCertificateFingerprint: certFp,
    certificateIssuedAt: device.certificateIssuedAt || now,
  };
}

function getStandaloneState(): ServerVaultState {
  const meta = getStandaloneMeta();
  try {
    const raw = localStorage.getItem(STANDALONE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ServerVaultState>;
      const state: ServerVaultState = {
        vaultConfig: parsed.vaultConfig || null,
        members: Array.isArray(parsed.members) ? parsed.members : [],
        devices: Array.isArray(parsed.devices)
          ? parsed.devices.map(ensureLocalDeviceCertificate)
          : [],
        passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
        invitations: Array.isArray(parsed.invitations)
          ? parsed.invitations
          : [],
        activityLogs: Array.isArray(parsed.activityLogs)
          ? parsed.activityLogs
          : [],
        driveSyncFileId: parsed.driveSyncFileId || '',
        syncEncryptionKey: meta.syncEncryptionKey,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
      state.bootstrapStatus = computeStandaloneBootstrapStatus(state, meta);
      return state;
    }
  } catch {
    // ignore
  }
  const empty: ServerVaultState = {
    vaultConfig: null,
    members: [],
    devices: [],
    passwords: [],
    invitations: [],
    activityLogs: [],
    driveSyncFileId: '',
    syncEncryptionKey: meta.syncEncryptionKey,
    updatedAt: new Date().toISOString(),
  };
  empty.bootstrapStatus = computeStandaloneBootstrapStatus(empty, meta);
  return empty;
}

function saveStandaloneState(state: ServerVaultState): ServerVaultState {
  const meta = getStandaloneMeta();
  state.updatedAt = new Date().toISOString();
  state.devices = (state.devices || []).map(ensureLocalDeviceCertificate);
  state.syncEncryptionKey = meta.syncEncryptionKey;
  state.bootstrapStatus = computeStandaloneBootstrapStatus(state, meta);
  try {
    localStorage.setItem(STANDALONE_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  return state;
}

function maskEmailHintLocal(email?: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

function computeStandaloneBootstrapStatus(
  state: ServerVaultState,
  meta: LocalStandaloneMeta
): VaultBootstrapStatus {
  const hasAdminMember = state.members.some(
    (m) => m.role === 'admin' || m.username.toLowerCase() === 'admin'
  );
  const initialized = Boolean(
    (state.vaultConfig && state.vaultConfig.initialized) ||
      hasAdminMember ||
      state.members.length > 0
  );
  return {
    initialized,
    vaultInstanceId: meta.vaultInstanceId,
    adminEmailHint: maskEmailHintLocal(state.vaultConfig?.adminEmail),
    driveSyncConfigured: Boolean(state.driveSyncFileId),
    driveSyncFileName: meta.driveSyncFileName,
    driveSyncUpdatedAt: meta.driveSyncUpdatedAt,
    googleOAuthClientId: meta.googleOAuthClientId || '',
    appVersion: APP_VERSION,
    updatedAt: state.updatedAt,
  };
}

async function handleLocalStandaloneApiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const bodyObj = options?.body
    ? JSON.parse(options.body as string)
    : {};
  const meta = getStandaloneMeta();
  const state = getStandaloneState();

  if (url === '/api/vault/bootstrap-status' && method === 'GET') {
    return computeStandaloneBootstrapStatus(state, meta) as unknown as T;
  }

  if (url === '/api/vault/oauth-config' && method === 'PUT') {
    meta.googleOAuthClientId = (bodyObj.googleOAuthClientId || '').trim();
    saveStandaloneMeta(meta);
    return computeStandaloneBootstrapStatus(state, meta) as unknown as T;
  }

  if (url === '/api/vault/state' && method === 'GET') {
    return state as unknown as T;
  }

  if (url === '/api/vault/auth/session' && method === 'POST') {
    const sessionToken = `local_session_${randomHex(16)}`;
    return {
      sessionToken,
      syncEncryptionKey: meta.syncEncryptionKey,
      bootstrapStatus: computeStandaloneBootstrapStatus(state, meta),
      state,
    } as unknown as T;
  }

  if (url === '/api/vault/config' && method === 'PUT') {
    state.vaultConfig = bodyObj as VaultConfig;
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/members/') && method === 'PUT') {
    const memberId = decodeURIComponent(
      url.replace('/api/vault/members/', '')
    );
    const idx = state.members.findIndex((m) => m.id === memberId);
    if (idx >= 0) {
      state.members[idx] = { ...state.members[idx], ...bodyObj };
    } else {
      state.members.push({ id: memberId, ...bodyObj } as Member);
    }
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/members/') && method === 'DELETE') {
    const memberId = decodeURIComponent(
      url.replace('/api/vault/members/', '')
    );
    state.members = state.members.filter((m) => m.id !== memberId);
    state.devices = state.devices.filter((d) => d.memberId !== memberId);
    return saveStandaloneState(state) as unknown as T;
  }

  if (
    url.startsWith('/api/vault/devices/') &&
    url.endsWith('/rebind-certificate') &&
    method === 'POST'
  ) {
    const deviceId = decodeURIComponent(
      url
        .replace('/api/vault/devices/', '')
        .replace('/rebind-certificate', '')
    );
    state.devices = state.devices.map((d) =>
      d.id === deviceId
        ? ensureLocalDeviceCertificate({
            ...d,
            status: 'approved',
            deviceApprovalToken: `hwcert_${randomHex(24)}`,
            deviceCertificateFingerprint: `CERT-HW-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}`,
            hardwareWrappedDek: '',
            certificateIssuedAt: new Date().toISOString(),
          })
        : d
    );
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/devices/') && method === 'PUT') {
    const deviceId = decodeURIComponent(
      url.replace('/api/vault/devices/', '')
    );
    const idx = state.devices.findIndex((d) => d.id === deviceId);
    if (idx >= 0) {
      state.devices[idx] = ensureLocalDeviceCertificate({
        ...state.devices[idx],
        ...bodyObj,
      });
    } else {
      state.devices.push(
        ensureLocalDeviceCertificate({ id: deviceId, ...bodyObj } as Device)
      );
    }
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/devices/') && method === 'DELETE') {
    const deviceId = decodeURIComponent(
      url.replace('/api/vault/devices/', '')
    );
    state.devices = state.devices.filter((d) => d.id !== deviceId);
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/passwords/') && method === 'PUT') {
    const passwordId = decodeURIComponent(
      url.replace('/api/vault/passwords/', '')
    );
    const idx = state.passwords.findIndex((p) => p.id === passwordId);
    if (idx >= 0) {
      state.passwords[idx] = { ...state.passwords[idx], ...bodyObj };
    } else {
      state.passwords.push({ id: passwordId, ...bodyObj } as PasswordRecord);
    }
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/passwords/') && method === 'DELETE') {
    const passwordId = decodeURIComponent(
      url.replace('/api/vault/passwords/', '')
    );
    state.passwords = state.passwords.filter((p) => p.id !== passwordId);
    return saveStandaloneState(state) as unknown as T;
  }

  if (url === '/api/vault/logs' && method === 'POST') {
    state.activityLogs = [bodyObj as ActivityLog, ...(state.activityLogs || [])].slice(
      0,
      250
    );
    return saveStandaloneState(state) as unknown as T;
  }

  if (url.startsWith('/api/vault/invites/verify/') && method === 'GET') {
    const token = decodeURIComponent(
      url.replace('/api/vault/invites/verify/', '')
    );
    const inv = (state.invitations || []).find(
      (i) => i.token === token && i.status === 'active'
    );
    if (!inv) {
      throw new Error('Link zaproszeniowy jest nieprawidłowy lub wygasł.');
    }
    return { valid: true, invitation: inv } as unknown as T;
  }

  if (url === '/api/vault/invites' && method === 'POST') {
    const now = new Date();
    const hoursValid = Number(bodyObj.hoursValid || 24);
    const targetMember = state.members.find(
      (m) => m.id === bodyObj.targetMemberId
    );
    const newInvite: VaultInvitation = {
      id: `inv_${randomHex(6)}`,
      token: `fsv_invite_${randomHex(12)}`,
      purpose: bodyObj.purpose || 'new_member',
      mode: bodyObj.mode || 'single_use',
      invitedLabel: bodyObj.invitedLabel || 'Domownik',
      targetMemberId: bodyObj.targetMemberId,
      targetMemberName: targetMember?.fullName,
      targetUsername: targetMember?.username,
      createdByMemberId: bodyObj.createdByMemberId,
      createdByMemberName: bodyObj.createdByMemberName,
      expiresAt:
        bodyObj.mode === 'time_limited'
          ? new Date(now.getTime() + hoursValid * 3600 * 1000).toISOString()
          : null,
      maxUses: bodyObj.mode === 'single_use' ? 1 : 999,
      usedCount: 0,
      status: 'active',
      createdAt: now.toISOString(),
    };
    state.invitations = [newInvite, ...(state.invitations || [])];
    const saved = saveStandaloneState(state);
    return { invitation: newInvite, state: saved } as unknown as T;
  }

  if (url === '/api/vault/invites/consume' && method === 'POST') {
    const token = bodyObj.token;
    const inv = (state.invitations || []).find((i) => i.token === token);
    if (!inv) {
      throw new Error('Nie znaleziono linku zaproszeniowego.');
    }
    inv.usedCount += 1;
    inv.lastUsedAt = new Date().toISOString();
    if (inv.mode === 'single_use' || inv.usedCount >= inv.maxUses) {
      inv.status = 'used';
    }
    const saved = saveStandaloneState(state);
    return { invitation: inv, state: saved } as unknown as T;
  }

  if (url.startsWith('/api/vault/invites/') && method === 'DELETE') {
    const invId = decodeURIComponent(
      url.replace('/api/vault/invites/', '')
    );
    state.invitations = (state.invitations || []).filter((i) => i.id !== invId);
    return saveStandaloneState(state) as unknown as T;
  }

  if (url === '/api/vault/merge-members' && method === 'POST') {
    const { sourceMemberId, targetMemberId, updatedMergedKeysJson } = bodyObj;
    state.members = state.members.map((m) => {
      if (m.id === sourceMemberId) return { ...m, status: 'merged' };
      if (m.id === targetMemberId)
        return { ...m, mergedVaultKeysJson: updatedMergedKeysJson };
      return m;
    });
    state.passwords = state.passwords.map((p) =>
      p.ownerId === sourceMemberId ? { ...p, ownerId: targetMemberId } : p
    );
    return saveStandaloneState(state) as unknown as T;
  }

  if (url === '/api/vault/sync-replace' && method === 'POST') {
    const nextState: ServerVaultState = {
      vaultConfig: bodyObj.vaultConfig ?? state.vaultConfig,
      members: Array.isArray(bodyObj.members) ? bodyObj.members : state.members,
      devices: Array.isArray(bodyObj.devices) ? bodyObj.devices : state.devices,
      passwords: Array.isArray(bodyObj.passwords)
        ? bodyObj.passwords
        : state.passwords,
      invitations: Array.isArray(bodyObj.invitations)
        ? bodyObj.invitations
        : state.invitations,
      activityLogs: Array.isArray(bodyObj.activityLogs)
        ? bodyObj.activityLogs
        : state.activityLogs,
      driveSyncFileId: bodyObj.driveSyncFileId || state.driveSyncFileId || '',
      updatedAt: new Date().toISOString(),
    };
    return saveStandaloneState(nextState) as unknown as T;
  }

  if (url === '/api/vault/drive-sync-meta' && method === 'PUT') {
    state.driveSyncFileId = bodyObj.driveSyncFileId || '';
    meta.driveSyncUpdatedAt = new Date().toISOString();
    saveStandaloneMeta(meta);
    return saveStandaloneState(state) as unknown as T;
  }

  if (url === '/api/github/config' && method === 'GET') {
    return {
      ...meta.githubConfig,
      hasServerSecretPat: Boolean(meta.githubPat),
      secretPatSource: meta.githubPat ? 'SAVED_SERVER_TOKEN' : 'NONE',
    } as unknown as T;
  }

  if (url === '/api/github/config' && method === 'PUT') {
    const cleanToken = (bodyObj.personalAccessToken || '').trim();
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cleanToken}`,
      },
    });
    if (!userRes.ok) {
      throw new Error('Nieprawidłowy token GitHub PAT.');
    }
    const userData = (await userRes.json()) as { login?: string };
    meta.githubPat = cleanToken;
    meta.githubConfig = {
      ...meta.githubConfig,
      repoOwner: userData.login || '',
      repoName: bodyObj.repoName || meta.githubConfig.repoName || 'familystream-vault',
      branch: 'main',
    };
    saveStandaloneMeta(meta);
    return {
      ...meta.githubConfig,
      hasServerSecretPat: true,
      secretPatSource: 'SAVED_SERVER_TOKEN',
    } as unknown as T;
  }

  return state as unknown as T;
}

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
  if (
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('.github.io')
  ) {
    return handleLocalStandaloneApiRequest<T>(url, options);
  }

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

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    return handleLocalStandaloneApiRequest<T>(url, options);
  }

  const contentType = res.headers.get('content-type') || '';
  if (
    res.status === 404 &&
    !contentType.includes('application/json')
  ) {
    return handleLocalStandaloneApiRequest<T>(url, options);
  }

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

  if (!contentType.includes('application/json')) {
    return handleLocalStandaloneApiRequest<T>(url, options);
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
