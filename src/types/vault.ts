export type ThemeMode = 'dusk' | 'linen';

export type ClientLaunchMode = 'pwa' | 'browser';

export type MemberRole = 'admin' | 'co_admin' | 'member';

export interface CoAdminPermissions {
  canResetMemberCredentials: boolean;
  canApproveDevicesAndMembers: boolean;
  canCreateInvites: boolean;
  canManagePasswordsAndVod: boolean;
}

export const DEFAULT_CO_ADMIN_PERMISSIONS: CoAdminPermissions = {
  canResetMemberCredentials: true,
  canApproveDevicesAndMembers: true,
  canCreateInvites: true,
  canManagePasswordsAndVod: true,
};

export type InvitationMode = 'single_use' | 'time_limited';

export type InvitationPurpose = 'new_member' | 'account_recovery';

export interface VaultInvitation {
  id: string;
  token: string;
  purpose: InvitationPurpose;
  mode: InvitationMode;
  invitedLabel: string;
  targetMemberId?: string;
  targetMemberName?: string;
  targetUsername?: string;
  createdByMemberId: string;
  createdByMemberName: string;
  expiresAt: string | null;
  maxUses: number;
  usedCount: number;
  status: 'active' | 'used' | 'revoked' | 'expired';
  createdAt: string;
  lastUsedAt?: string;
}

export interface VaultBootstrapStatus {
  initialized: boolean;
  vaultInstanceId: string;
  adminEmailHint: string | null;
  driveSyncConfigured: boolean;
  driveSyncFileName: string;
  driveSyncUpdatedAt: string | null;
  googleOAuthClientId?: string;
  appVersion: string;
  updatedAt: string;
}

export interface GitHubSyncConfig {
  repoOwner: string;
  repoName: string;
  branch: string;
  lastCommitSha?: string;
  lastCommitUrl?: string;
  lastPushedAt?: string;
  hasServerSecretPat?: boolean;
  secretPatSource?: 'GITHUB_PAT_ENV' | 'SAVED_SERVER_TOKEN' | 'NONE';
}

export interface GitHubPushResult {
  ok: boolean;
  commitSha: string;
  commitUrl: string;
  repoUrl: string;
  branch: string;
  filesCount: number;
  pushedAt: string;
  createdNewRepo?: boolean;
  repoOwner?: string;
  repoName?: string;
}

export interface VaultCategory {
  id: string;
  name: string;
  order: number;
}

export interface VaultConfig {
  initialized: boolean;
  adminUid: string;
  adminEmail: string;
  adminMemberId: string;
  templatesLoaded: boolean;
  categoriesJson: string;
  defaultTheme: ThemeMode;
  clipboardClearSeconds: number;
  autoLockMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  fullName: string;
  username: string;
  passwordHash: string;
  pbkdf2Salt: string;
  wrappedMasterKey: string;
  vaultEscrowKey: string;
  mergedVaultKeysJson: string;
  role: MemberRole;
  coAdminPermissions?: CoAdminPermissions;
  status: 'active' | 'pending' | 'merged';
  googleUid: string;
  invitedByToken?: string;
  createdAt: string;
  updatedAt: string;
}

export function isPrimaryAdmin(member?: Member | null): boolean {
  if (!member) return false;
  return (
    member.role === 'admin' || member.username.toLowerCase() === 'admin'
  );
}

export function isCoAdmin(member?: Member | null): boolean {
  if (!member) return false;
  return member.role === 'co_admin';
}

export function isAdminOrCoAdmin(member?: Member | null): boolean {
  return isPrimaryAdmin(member) || isCoAdmin(member);
}

export function getEffectiveCoAdminPermissions(
  member?: Member | null
): CoAdminPermissions {
  if (!member) {
    return {
      canResetMemberCredentials: false,
      canApproveDevicesAndMembers: false,
      canCreateInvites: false,
      canManagePasswordsAndVod: false,
    };
  }
  if (isPrimaryAdmin(member)) {
    return {
      canResetMemberCredentials: true,
      canApproveDevicesAndMembers: true,
      canCreateInvites: true,
      canManagePasswordsAndVod: true,
    };
  }
  if (member.role === 'co_admin') {
    return {
      ...DEFAULT_CO_ADMIN_PERMISSIONS,
      ...(member.coAdminPermissions || {}),
    };
  }
  return {
    canResetMemberCredentials: false,
    canApproveDevicesAndMembers: false,
    canCreateInvites: false,
    canManagePasswordsAndVod: false,
  };
}

export type HardwareDeviceType = 'phone' | 'tablet' | 'laptop_desktop';

export interface Device {
  id: string;
  memberId: string;
  memberName: string;
  username: string;
  deviceFingerprint: string;
  deviceName: string;
  customLabel: string;
  clientMode: ClientLaunchMode;
  hardwareModelOs?: string;
  hardwareDeviceType?: HardwareDeviceType;
  hardwareSignatureHash?: string;
  deviceApprovalToken?: string;
  deviceCertificateFingerprint?: string;
  hardwareWrappedDek?: string;
  certificateIssuedAt?: string;
  status: 'approved' | 'pending' | 'revoked';
  webAuthnCredentialId: string;
  requestedAt: string;
  lastSeenAt: string;
}

export interface SubAccountEntry {
  id: string;
  assignedMemberId: string;
  assignedMemberName: string;
  label: string;
  login: string;
  passwordValue: string;
  updatedAt: string;
}

export interface PasswordRecord {
  id: string;
  section: 'shared' | 'private';
  categoryId: string;
  serviceName: string;
  serviceUrl: string;
  login: string;
  passwordValue: string;
  encryptedPayload: string;
  keySalt: string;
  ownerId: string;
  ownerName: string;
  allowedMemberIds: string[];
  revealToAdmin?: boolean;
  subAccountsJson?: string;
  createdAt: string;
  updatedAt: string;
  passwordUpdatedAt: string;
}

export function parseSubAccounts(record: PasswordRecord): SubAccountEntry[] {
  if (!record.subAccountsJson) return [];
  try {
    const parsed = JSON.parse(record.subAccountsJson);
    return Array.isArray(parsed) ? (parsed as SubAccountEntry[]) : [];
  } catch {
    return [];
  }
}

export interface DecryptedPrivatePayload {
  categoryId: string;
  serviceName: string;
  serviceUrl: string;
  login: string;
  password: string;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actionType: string;
  details: string;
  deviceInfo: string;
  timestamp: string;
}

export interface BackupFileStructure {
  version: string;
  exportedAt: string;
  exportedBy: string;
  vaultConfig: VaultConfig | null;
  members: Member[];
  devices: Device[];
  passwords: PasswordRecord[];
  invitations?: VaultInvitation[];
  activityLogs: ActivityLog[];
}

export const DEFAULT_CATEGORIES: VaultCategory[] = [
  { id: 'vod', name: 'VOD / Streaming', order: 1 },
  { id: 'email', name: 'Email / Poczta', order: 2 },
  { id: 'shop', name: 'Sklep / Zakupy', order: 3 },
  { id: 'services', name: 'Usługi / Rachunki', order: 4 },
  { id: 'gaming', name: 'Gaming / Rozrywka', order: 5 },
  { id: 'other', name: 'Inne', order: 6 },
];

