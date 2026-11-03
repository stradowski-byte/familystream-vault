import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  build as buildViteBundle,
  createServer as createViteServer,
} from 'vite';
import type {
  ActivityLog,
  Device,
  GitHubPushResult,
  GitHubSyncConfig,
  InvitationMode,
  InvitationPurpose,
  Member,
  MemberRole,
  PasswordRecord,
  VaultBootstrapStatus,
  VaultConfig,
  VaultInvitation,
} from './src/types/vault.ts';
import { parseSubAccounts } from './src/types/vault.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_VERSION = '2.6.0-HARDWARE-CRYPTO';
const AUTO_SYNC_DRIVE_FILENAME = 'FamilyStreamVault_AutoSync.vault.enc';

export interface ServerVaultState {
  vaultConfig: VaultConfig | null;
  members: Member[];
  devices: Device[];
  passwords: PasswordRecord[];
  invitations: VaultInvitation[];
  activityLogs: ActivityLog[];
  driveSyncFileId?: string;
  syncEncryptionKey?: string;
  bootstrapStatus?: VaultBootstrapStatus;
  updatedAt: string;
}

interface PersistedBootstrapMetadata {
  vaultInstanceId: string;
  syncEncryptionKey: string;
  sessionSecret: string;
  driveSyncFileName: string;
  driveSyncUpdatedAt: string | null;
  googleOAuthClientId?: string;
  githubConfig: GitHubSyncConfig;
  githubPat?: string;
  updatedAt: string;
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'vault-db.json');
const BOOTSTRAP_FILE_PATH = path.join(DATA_DIR, 'vault-bootstrap.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrCreateBootstrapMeta(): PersistedBootstrapMetadata {
  ensureDataDir();
  if (fs.existsSync(BOOTSTRAP_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(BOOTSTRAP_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedBootstrapMetadata>;
      if (parsed.vaultInstanceId && parsed.syncEncryptionKey && parsed.sessionSecret) {
        const isLegacyStaticKey =
          parsed.syncEncryptionKey.startsWith('FamilyStreamVault-');
        const resolvedSyncKey = isLegacyStaticKey
          ? crypto.randomBytes(32).toString('hex')
          : parsed.syncEncryptionKey;

        const loadedMeta: PersistedBootstrapMetadata = {
          vaultInstanceId: parsed.vaultInstanceId,
          syncEncryptionKey: resolvedSyncKey,
          sessionSecret: parsed.sessionSecret,
          driveSyncFileName:
            parsed.driveSyncFileName || AUTO_SYNC_DRIVE_FILENAME,
          driveSyncUpdatedAt: parsed.driveSyncUpdatedAt || null,
          googleOAuthClientId: parsed.googleOAuthClientId || '',
          githubConfig: parsed.githubConfig || {
            repoOwner: '',
            repoName: 'familystream-vault',
            branch: 'main',
          },
          githubPat: parsed.githubPat || '',
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
        if (isLegacyStaticKey) {
          saveBootstrapMetaToDisk(loadedMeta);
        }
        return loadedMeta;
      }
    } catch (err) {
      console.warn('Reinitializing vault-bootstrap.json:', err);
    }
  }

  const initialMeta: PersistedBootstrapMetadata = {
    vaultInstanceId: `fsv_${crypto.randomBytes(6).toString('hex')}`,
    syncEncryptionKey: crypto.randomBytes(32).toString('hex'),
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    driveSyncFileName: AUTO_SYNC_DRIVE_FILENAME,
    driveSyncUpdatedAt: null,
    googleOAuthClientId: '',
    githubConfig: {
      repoOwner: '',
      repoName: 'familystream-vault',
      branch: 'main',
    },
    githubPat: '',
    updatedAt: new Date().toISOString(),
  };
  saveBootstrapMetaToDisk(initialMeta);
  return initialMeta;
}

function saveBootstrapMetaToDisk(
  meta: PersistedBootstrapMetadata
): PersistedBootstrapMetadata {
  ensureDataDir();
  meta.updatedAt = new Date().toISOString();
  const tempPath = `${BOOTSTRAP_FILE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(meta, null, 2), 'utf-8');
  fs.renameSync(tempPath, BOOTSTRAP_FILE_PATH);
  return meta;
}

function createEmptyState(): ServerVaultState {
  return {
    vaultConfig: null,
    members: [],
    devices: [],
    passwords: [],
    invitations: [],
    activityLogs: [],
    driveSyncFileId: '',
    updatedAt: new Date().toISOString(),
  };
}

function normalizeInvitationStatuses(
  invitations: VaultInvitation[]
): VaultInvitation[] {
  const nowMs = Date.now();
  return invitations.map((inv) => {
    if (inv.status !== 'active') return inv;
    if (inv.usedCount >= inv.maxUses) {
      return { ...inv, status: 'used' as const };
    }
    if (inv.expiresAt && new Date(inv.expiresAt).getTime() <= nowMs) {
      return { ...inv, status: 'expired' as const };
    }
    return inv;
  });
}

function normalizeServerHardwareModelOnly(rawModel?: string): string {
  if (!rawModel) return 'Urządzenie';
  const cleaned = rawModel
    .replace(/Build\/[^\s;)]+/gi, '')
    .replace(/Android\s+[0-9._]+/gi, '')
    .replace(/iOS\s+[0-9._]+/gi, '')
    .replace(/iPadOS\s+[0-9._]+/gi, '')
    .replace(/macOS\s+[0-9._]+/gi, '')
    .replace(/Windows\s+NT\s+[0-9._]+/gi, '')
    .replace(/\(iOS\)/gi, '')
    .replace(/\(iPadOS\)/gi, '')
    .replace(/\(macOS\)/gi, '')
    .replace(/^Android\s*\(([^)]+)\)$/i, 'Smartfon ($1)')
    .replace(/^Mac$/i, 'Komputer Mac')
    .replace(/^Komputer Windows$/i, 'Komputer PC')
    .replace(/^System Linux$/i, 'Komputer PC')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Urządzenie';
}

function ensureDeviceCertificateFields(
  dev: Device,
  forceReissue = false
): Device {
  const normalizedModel = normalizeServerHardwareModelOnly(
    dev.hardwareModelOs || dev.deviceName
  );
  if (dev.status === 'approved') {
    const token =
      !dev.deviceApprovalToken || forceReissue
        ? `hwtok_${crypto.randomBytes(24).toString('hex')}`
        : dev.deviceApprovalToken;
    const certRaw = crypto
      .createHash('sha256')
      .update(
        `${dev.deviceFingerprint || ''}|${normalizedModel}|${dev.hardwareDeviceType || 'laptop_desktop'}|${dev.clientMode || 'browser'}|${token}`
      )
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();
    const formattedCert = `CERT-HW-${certRaw.slice(0, 4)}-${certRaw.slice(
      4,
      8
    )}-${certRaw.slice(8, 12)}`;

    return {
      ...dev,
      hardwareModelOs: normalizedModel,
      deviceApprovalToken: token,
      deviceCertificateFingerprint: formattedCert,
      certificateIssuedAt:
        !dev.certificateIssuedAt || forceReissue
          ? new Date().toISOString()
          : dev.certificateIssuedAt,
      hardwareWrappedDek: forceReissue ? '' : dev.hardwareWrappedDek || '',
    };
  }

  // Pending or revoked devices NEVER hold an active approval certificate or hardware-wrapped DEK
  return {
    ...dev,
    hardwareModelOs: normalizedModel,
    deviceApprovalToken: '',
    deviceCertificateFingerprint: '',
    hardwareWrappedDek: '',
  };
}

function loadStateFromDisk(): ServerVaultState {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE_PATH)) {
    const initial = createEmptyState();
    saveStateToDisk(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ServerVaultState>;
    return {
      vaultConfig: parsed.vaultConfig || null,
      members: Array.isArray(parsed.members) ? parsed.members : [],
      devices: Array.isArray(parsed.devices)
        ? parsed.devices.map((d) => ensureDeviceCertificateFields(d, false))
        : [],
      passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
      invitations: Array.isArray(parsed.invitations)
        ? normalizeInvitationStatuses(parsed.invitations)
        : [],
      activityLogs: Array.isArray(parsed.activityLogs)
        ? parsed.activityLogs
        : [],
      driveSyncFileId: parsed.driveSyncFileId || '',
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      'Failed to parse vault-db.json, initializing clean state:',
      err
    );
    return createEmptyState();
  }
}

function saveStateToDisk(state: ServerVaultState): ServerVaultState {
  ensureDataDir();
  state.invitations = normalizeInvitationStatuses(state.invitations || []);
  state.updatedAt = new Date().toISOString();
  const toPersist: ServerVaultState = {
    vaultConfig: state.vaultConfig,
    members: state.members,
    devices: state.devices,
    passwords: state.passwords,
    invitations: state.invitations,
    activityLogs: state.activityLogs,
    driveSyncFileId: state.driveSyncFileId || '',
    updatedAt: state.updatedAt,
  };
  const tempPath = `${DB_FILE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(toPersist, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_FILE_PATH);
  return state;
}

let bootstrapMeta: PersistedBootstrapMetadata = loadOrCreateBootstrapMeta();
let vaultState: ServerVaultState = loadStateFromDisk();

function maskEmailHint(email?: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

function computePublicBootstrapStatus(): VaultBootstrapStatus {
  const hasAdminMember = vaultState.members.some(
    (m) => m.role === 'admin' || m.username.toLowerCase() === 'admin'
  );
  const initialized = Boolean(
    (vaultState.vaultConfig && vaultState.vaultConfig.initialized) ||
      hasAdminMember ||
      vaultState.members.length > 0
  );
  const resolvedClientId = (
    process.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    bootstrapMeta.googleOAuthClientId ||
    ''
  ).trim();

  return {
    initialized,
    vaultInstanceId: bootstrapMeta.vaultInstanceId,
    adminEmailHint: maskEmailHint(vaultState.vaultConfig?.adminEmail),
    driveSyncConfigured: Boolean(vaultState.driveSyncFileId),
    driveSyncFileName: bootstrapMeta.driveSyncFileName,
    driveSyncUpdatedAt: bootstrapMeta.driveSyncUpdatedAt,
    googleOAuthClientId: resolvedClientId,
    appVersion: APP_VERSION,
    updatedAt: vaultState.updatedAt,
  };
}

function signSessionToken(payload: {
  memberId: string;
  role: MemberRole | 'bootstrap';
  deviceFingerprint: string;
}): string {
  const issuedAt = Date.now().toString();
  const data = `${payload.memberId}|${payload.role}|${payload.deviceFingerprint}|${issuedAt}`;
  const sig = crypto
    .createHmac('sha256', bootstrapMeta.sessionSecret)
    .update(data)
    .digest('hex');
  return Buffer.from(`${data}|${sig}`, 'utf-8').toString('base64url');
}

function verifySessionToken(token?: string | null): {
  valid: boolean;
  memberId?: string;
  role?: string;
  deviceFingerprint?: string;
} {
  if (!token) return { valid: false };
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('|');
    if (parts.length !== 5) return { valid: false };
    const [memberId, role, deviceFingerprint, issuedAt, sig] = parts;
    const data = `${memberId}|${role}|${deviceFingerprint}|${issuedAt}`;
    const expectedSig = crypto
      .createHmac('sha256', bootstrapMeta.sessionSecret)
      .update(data)
      .digest('hex');
    if (sig !== expectedSig) return { valid: false };
    return { valid: true, memberId, role, deviceFingerprint };
  } catch {
    return { valid: false };
  }
}

function buildClientStatePayload(): ServerVaultState {
  vaultState.invitations = normalizeInvitationStatuses(
    vaultState.invitations || []
  );
  return {
    ...vaultState,
    syncEncryptionKey: bootstrapMeta.syncEncryptionKey,
    bootstrapStatus: computePublicBootstrapStatus(),
  };
}

function stripAiStudioOnlyBlocks(sourceText: string): string {
  const startMarker = 'AI_STUDIO_' + 'ONLY_START';
  const endMarker = 'AI_STUDIO_' + 'ONLY_END';
  const jsxPattern = new RegExp(
    `\\{\\/\\*\\s*\\[${startMarker}\\]\\s*\\*\\/\\}[\\s\\S]*?\\{\\/\\*\\s*\\[${endMarker}\\]\\s*\\*\\/\\}\\n?`,
    'g'
  );
  const lineCommentPattern = new RegExp(
    `\\/\\/\\s*\\[${startMarker}\\][\\s\\S]*?\\/\\/\\s*\\[${endMarker}\\]\\n?`,
    'g'
  );
  return sourceText
    .replace(jsxPattern, '')
    .replace(lineCommentPattern, '');
}

function computeGitBlobSha(buf: Buffer): string {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf-8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

/**
 * Helper to collect all application code files for non-destructive GitHub Commit & Push
 * (strictly excluding `data/`, `node_modules/`, `dist/`, `.git/`, `.github/`, `.env` secrets,
 * and stripping AI Studio-only preview helpers so production GitHub code has no skip button).
 */
function collectProjectSourceFiles(rootDir: string): Array<{
  relativePath: string;
  buffer: Buffer;
}> {
  const results: Array<{ relativePath: string; buffer: Buffer }> = [];
  const excludedDirs = new Set([
    'node_modules',
    'dist',
    'data',
    '.git',
    '.github',
    '.aistudio',
  ]);
  const excludedFiles = new Set([
    '.env',
    '.env.local',
    'vault-db.json',
    'vault-bootstrap.json',
    'package-lock.json',
  ]);

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.DS_Store') || entry.name.endsWith('.tmp')) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path
        .relative(rootDir, fullPath)
        .split(path.sep)
        .join('/');

      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (excludedFiles.has(entry.name)) continue;
        if (entry.name.startsWith('.env') && entry.name !== '.env.example') {
          continue;
        }
        const buf = fs.readFileSync(fullPath);
        if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          const cleanedText = stripAiStudioOnlyBlocks(buf.toString('utf-8'));
          results.push({
            relativePath: relPath,
            buffer: Buffer.from(cleanedText, 'utf-8'),
          });
        } else {
          results.push({
            relativePath: relPath,
            buffer: buf,
          });
        }
      }
    }
  }

  walk(rootDir);
  return results;
}

function collectBuiltDistFiles(distDir: string): Array<{
  relativePath: string;
  buffer: Buffer;
}> {
  const results: Array<{ relativePath: string; buffer: Buffer }> = [];
  if (!fs.existsSync(distDir)) return results;

  function walkDist(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.DS_Store') || entry.name.endsWith('.tmp')) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path
        .relative(distDir, fullPath)
        .split(path.sep)
        .join('/');

      if (entry.isDirectory()) {
        walkDist(fullPath);
      } else if (entry.isFile()) {
        results.push({
          relativePath: relPath,
          buffer: fs.readFileSync(fullPath),
        });
      }
    }
  }

  walkDist(distDir);

  const indexFile = results.find((f) => f.relativePath === 'index.html');
  if (indexFile && !results.some((f) => f.relativePath === '404.html')) {
    results.push({
      relativePath: '404.html',
      buffer: indexFile.buffer,
    });
  }
  if (!results.some((f) => f.relativePath === '.nojekyll')) {
    results.push({
      relativePath: '.nojekyll',
      buffer: Buffer.from('', 'utf-8'),
    });
  }

  return results;
}

async function githubApiRequest<T>(
  url: string,
  token: string,
  options?: RequestInit
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'FamilyStream-Vault-Admin-Sync',
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
    },
  });

  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }

  if (!res.ok) {
    const errMsg =
      (parsed as { message?: string })?.message ||
      `GitHub API HTTP ${res.status}`;
    const error = new Error(errMsg) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return { status: res.status, data: parsed as T };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // 0A. PUBLIC BOOTSTRAP HANDSHAKE
  app.get('/api/vault/bootstrap-status', (_req, res) => {
    res.json(computePublicBootstrapStatus());
  });

  // 0B. PUBLIC INVITATION TOKEN VERIFICATION (For "?invite=TOKEN" links)
  app.get('/api/vault/invites/verify/:token', (req, res) => {
    const cleanToken = (req.params.token || '').trim();
    vaultState.invitations = normalizeInvitationStatuses(
      vaultState.invitations || []
    );
    const found = vaultState.invitations.find((i) => i.token === cleanToken);

    if (!found) {
      res.status(404).json({
        valid: false,
        error:
          'Nie znaleziono takiego linku zaproszeniowego. Poproś Administratora lub Zaufanego Opiekuna o wygenerowanie nowego linku.',
      });
      return;
    }

    if (found.status === 'revoked') {
      res.status(410).json({
        valid: false,
        error: 'Ten link zaproszeniowy został unieważniony przez Administratora.',
      });
      return;
    }

    if (found.status === 'used' || found.usedCount >= found.maxUses) {
      res.status(410).json({
        valid: false,
        error:
          'Ten jednorazowy link zaproszeniowy został już wykorzystany do założenia konta.',
      });
      return;
    }

    if (
      found.status === 'expired' ||
      (found.expiresAt && new Date(found.expiresAt).getTime() <= Date.now())
    ) {
      res.status(410).json({
        valid: false,
        error:
          'Ważność czasowa tego linku zaproszeniowego już wygasła. Poproś o nowy link.',
      });
      return;
    }

    // If purpose is account_recovery, resolve current member info
    let targetMember: Member | undefined;
    if (found.purpose === 'account_recovery' && found.targetMemberId) {
      targetMember = vaultState.members.find(
        (m) => m.id === found.targetMemberId
      );
    }

    res.json({
      valid: true,
      invitation: {
        ...found,
        targetMemberName: targetMember?.fullName || found.targetMemberName,
        targetUsername: targetMember?.username || found.targetUsername,
      },
    });
  });

  // 0C. CREATE INVITATION OR RECOVERY LINK (Admin or Co-Admin)
  app.post('/api/vault/invites', (req, res) => {
    const {
      purpose = 'new_member',
      mode = 'single_use',
      invitedLabel = '',
      targetMemberId,
      createdByMemberId = 'admin',
      createdByMemberName = 'Administrator',
      hoursValid = 24,
    } = req.body as {
      purpose?: InvitationPurpose;
      mode?: InvitationMode;
      invitedLabel?: string;
      targetMemberId?: string;
      createdByMemberId?: string;
      createdByMemberName?: string;
      hoursValid?: number;
    };

    const now = new Date();
    const inviteId = `inv_${crypto.randomBytes(6).toString('hex')}`;
    const token = `fsv_invite_${crypto.randomBytes(16).toString('hex')}`;

    const targetMember = targetMemberId
      ? vaultState.members.find((m) => m.id === targetMemberId)
      : undefined;

    const newInvite: VaultInvitation = {
      id: inviteId,
      token,
      purpose,
      mode,
      invitedLabel:
        invitedLabel.trim() ||
        (purpose === 'account_recovery' && targetMember
          ? `Link ratunkowy dla: ${targetMember.fullName}`
          : 'Zaproszenie dla domownika'),
      targetMemberId: targetMember?.id,
      targetMemberName: targetMember?.fullName,
      targetUsername: targetMember?.username,
      createdByMemberId,
      createdByMemberName,
      expiresAt:
        mode === 'time_limited'
          ? new Date(
              now.getTime() + Math.max(1, Number(hoursValid) || 24) * 3600 * 1000
            ).toISOString()
          : null,
      maxUses: mode === 'single_use' ? 1 : 25,
      usedCount: 0,
      status: 'active',
      createdAt: now.toISOString(),
    };

    vaultState.invitations = [
      newInvite,
      ...normalizeInvitationStatuses(vaultState.invitations || []),
    ];
    saveStateToDisk(vaultState);

    res.json({
      invitation: newInvite,
      state: buildClientStatePayload(),
    });
  });

  // 0D. CONSUME INVITATION TOKEN (When member registers or uses recovery link)
  app.post('/api/vault/invites/consume', (req, res) => {
    const { token } = req.body as { token?: string };
    const cleanToken = (token || '').trim();
    vaultState.invitations = normalizeInvitationStatuses(
      vaultState.invitations || []
    );

    const idx = vaultState.invitations.findIndex((i) => i.token === cleanToken);
    if (idx < 0) {
      res.status(404).json({
        error: 'Nieprawidłowy token zaproszenia.',
      });
      return;
    }

    const inv = vaultState.invitations[idx];
    if (inv.status !== 'active') {
      res.status(410).json({
        error: 'Ten link zaproszeniowy nie jest już aktywny.',
      });
      return;
    }

    const nextUsedCount = inv.usedCount + 1;
    const nextStatus =
      inv.mode === 'single_use' || nextUsedCount >= inv.maxUses
        ? 'used'
        : 'active';

    vaultState.invitations[idx] = {
      ...inv,
      usedCount: nextUsedCount,
      status: nextStatus,
      lastUsedAt: new Date().toISOString(),
    };
    saveStateToDisk(vaultState);

    res.json({
      invitation: vaultState.invitations[idx],
      state: buildClientStatePayload(),
    });
  });

  // 0E. DELETE / REVOKE INVITATION LINK
  app.delete('/api/vault/invites/:id', (req, res) => {
    const { id } = req.params;
    vaultState.invitations = (vaultState.invitations || []).filter(
      (i) => i.id !== id
    );
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 0F. TWO-WAY AUTHENTICATION SESSION HANDSHAKE
  app.post('/api/vault/auth/session', (req, res) => {
    const {
      mode,
      memberId,
      username,
      passwordHash,
      deviceFingerprint,
      inviteToken,
    } = req.body as {
      mode: 'admin_google' | 'member_login' | 'member_register' | 'biometric';
      memberId?: string;
      username?: string;
      passwordHash?: string;
      googleEmail?: string;
      googleUid?: string;
      deviceFingerprint?: string;
      deviceName?: string;
      inviteToken?: string;
    };

    const fp = deviceFingerprint || 'unknown_device';

    if (mode === 'admin_google') {
      const adminMember = vaultState.members.find(
        (m) => m.role === 'admin' || m.username.toLowerCase() === 'admin'
      );
      const token = signSessionToken({
        memberId: adminMember?.id || 'admin_bootstrap',
        role: 'admin',
        deviceFingerprint: fp,
      });
      res.json({
        sessionToken: token,
        syncEncryptionKey: bootstrapMeta.syncEncryptionKey,
        bootstrapStatus: computePublicBootstrapStatus(),
        state: buildClientStatePayload(),
      });
      return;
    }

    if (mode === 'member_login') {
      const member = vaultState.members.find(
        (m) =>
          m.username.toLowerCase() === (username || '').toLowerCase() &&
          m.status !== 'merged'
      );
      if (!member) {
        res.status(404).json({
          error:
            'Nie znaleziono konta o podanym loginie w bazie skarbca. Jeśli jesteś Administratorem, zaloguj się przyciskiem Google powyżej.',
        });
        return;
      }
      if (passwordHash && member.passwordHash !== passwordHash) {
        res.status(401).json({
          error: 'Nieprawidłowe hasło wewnętrzne domownika.',
        });
        return;
      }
      const token = signSessionToken({
        memberId: member.id,
        role: member.role,
        deviceFingerprint: fp,
      });
      res.json({
        sessionToken: token,
        syncEncryptionKey: bootstrapMeta.syncEncryptionKey,
        bootstrapStatus: computePublicBootstrapStatus(),
        state: buildClientStatePayload(),
      });
      return;
    }

    if (mode === 'biometric') {
      const member = vaultState.members.find(
        (m) => m.id === memberId && m.status === 'active'
      );
      if (!member) {
        res.status(401).json({
          error: 'Powiązane konto biometryczne nie jest aktywne na serwerze.',
        });
        return;
      }
      const token = signSessionToken({
        memberId: member.id,
        role: member.role,
        deviceFingerprint: fp,
      });
      res.json({
        sessionToken: token,
        syncEncryptionKey: bootstrapMeta.syncEncryptionKey,
        bootstrapStatus: computePublicBootstrapStatus(),
        state: buildClientStatePayload(),
      });
      return;
    }

    // mode === 'member_register' — enforce valid invitation token when vault is initialized
    const isInitialized = computePublicBootstrapStatus().initialized;
    if (isInitialized) {
      vaultState.invitations = normalizeInvitationStatuses(
        vaultState.invitations || []
      );
      const validInvite = vaultState.invitations.find(
        (i) => i.token === (inviteToken || '').trim() && i.status === 'active'
      );
      if (!validInvite) {
        res.status(403).json({
          error:
            'Rejestracja domowników jest zamknięta. Aby założyć konto lub zresetować dostęp, użyj ważnego linku zaproszeniowego od Administratora lub Zaufanego Opiekuna.',
        });
        return;
      }
    }

    const token = signSessionToken({
      memberId: memberId || 'pending_registration',
      role: 'bootstrap',
      deviceFingerprint: fp,
    });
    res.json({
      sessionToken: token,
      syncEncryptionKey: bootstrapMeta.syncEncryptionKey,
      bootstrapStatus: computePublicBootstrapStatus(),
      state: buildClientStatePayload(),
    });
  });

  // 1. GET full vault state
  app.get('/api/vault/state', (_req, res) => {
    res.json(buildClientStatePayload());
  });

  // 2. PUT vaultConfig
  app.put('/api/vault/config', (req, res) => {
    const nextConfig = req.body as VaultConfig;
    if (!nextConfig || typeof nextConfig !== 'object') {
      res.status(400).json({ error: 'Nieprawidłowy format konfiguracji.' });
      return;
    }
    vaultState.vaultConfig = nextConfig;
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 3. PUT member (create or update)
  app.put('/api/vault/members/:id', (req, res) => {
    const { id } = req.params;
    const incoming = req.body as Partial<Member>;
    const existingIndex = vaultState.members.findIndex((m) => m.id === id);

    if (existingIndex >= 0) {
      const updatedMember: Member = {
        ...vaultState.members[existingIndex],
        ...incoming,
        id,
      };
      vaultState.members[existingIndex] = updatedMember;

      // Also sync username/fullName onto member's devices if updated
      if (incoming.username || incoming.fullName) {
        vaultState.devices = vaultState.devices.map((d) =>
          d.memberId === id
            ? {
                ...d,
                memberName: updatedMember.fullName,
                username: updatedMember.username,
              }
            : d
        );
      }
    } else {
      vaultState.members.push({
        ...(incoming as Member),
        id,
      });
    }

    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 4. DELETE member (and their devices)
  app.delete('/api/vault/members/:id', (req, res) => {
    const { id } = req.params;
    vaultState.members = vaultState.members.filter((m) => m.id !== id);
    vaultState.devices = vaultState.devices.filter((d) => d.memberId !== id);
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 5. PUT device (create or update + automatic Hardware Certificate issuance on approval)
  app.put('/api/vault/devices/:id', (req, res) => {
    const { id } = req.params;
    const incoming = req.body as Partial<Device>;
    const existingIndex = vaultState.devices.findIndex((d) => d.id === id);

    if (existingIndex >= 0) {
      const prev = vaultState.devices[existingIndex];
      const merged: Device = {
        ...prev,
        ...incoming,
        id,
      };
      const wasJustApproved =
        prev.status !== 'approved' && merged.status === 'approved';
      vaultState.devices[existingIndex] = ensureDeviceCertificateFields(
        merged,
        wasJustApproved
      );
    } else {
      const created: Device = {
        ...(incoming as Device),
        id,
      };
      vaultState.devices.push(ensureDeviceCertificateFields(created, false));
    }

    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 5B. POST rebind / reissue Hardware Certificate for a device (Admin or Trusted Co-Admin)
  app.post('/api/vault/devices/:id/rebind-certificate', (req, res) => {
    const { id } = req.params;
    const existingIndex = vaultState.devices.findIndex((d) => d.id === id);
    if (existingIndex < 0) {
      res.status(404).json({ error: 'Nie znaleziono urządzenia.' });
      return;
    }

    const updated: Device = {
      ...vaultState.devices[existingIndex],
      status: 'approved',
      lastSeenAt: new Date().toISOString(),
    };
    vaultState.devices[existingIndex] = ensureDeviceCertificateFields(
      updated,
      true
    );
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 6. DELETE device
  app.delete('/api/vault/devices/:id', (req, res) => {
    const { id } = req.params;
    vaultState.devices = vaultState.devices.filter((d) => d.id !== id);
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 7. PUT password record (create or update login / sub-accounts)
  app.put('/api/vault/passwords/:id', (req, res) => {
    const { id } = req.params;
    const incoming = req.body as Partial<PasswordRecord>;
    const existingIndex = vaultState.passwords.findIndex((p) => p.id === id);

    if (existingIndex >= 0) {
      vaultState.passwords[existingIndex] = {
        ...vaultState.passwords[existingIndex],
        ...incoming,
        id,
      };
    } else {
      vaultState.passwords.push({
        ...(incoming as PasswordRecord),
        id,
      });
    }

    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 8. DELETE password record
  app.delete('/api/vault/passwords/:id', (req, res) => {
    const { id } = req.params;
    vaultState.passwords = vaultState.passwords.filter((p) => p.id !== id);
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 9. POST activity log
  app.post('/api/vault/logs', (req, res) => {
    const entry = req.body as ActivityLog;
    if (entry && entry.id) {
      vaultState.activityLogs = [
        entry,
        ...vaultState.activityLogs.filter((l) => l.id !== entry.id),
      ].slice(0, 200);
      saveStateToDisk(vaultState);
    }
    res.json(buildClientStatePayload());
  });

  // 10. POST merge duplicate member accounts
  app.post('/api/vault/merge-members', (req, res) => {
    const {
      sourceMemberId,
      targetMemberId,
      updatedMergedKeysJson,
    } = req.body as {
      sourceMemberId: string;
      targetMemberId: string;
      updatedMergedKeysJson: string;
    };

    const sourceMember = vaultState.members.find(
      (m) => m.id === sourceMemberId
    );
    const targetMember = vaultState.members.find(
      (m) => m.id === targetMemberId
    );

    if (!sourceMember || !targetMember) {
      res.status(404).json({ error: 'Nie znaleziono kont do scalenia.' });
      return;
    }

    const now = new Date().toISOString();

    vaultState.members = vaultState.members
      .map((m) =>
        m.id === targetMemberId
          ? {
               ...m,
              mergedVaultKeysJson: updatedMergedKeysJson,
              updatedAt: now,
            }
          : m
      )
      .filter((m) => m.id !== sourceMemberId);

    vaultState.devices = vaultState.devices.map((d) =>
      d.memberId === sourceMemberId
        ? {
            ...d,
            memberId: targetMember.id,
            memberName: targetMember.fullName,
            username: targetMember.username,
            lastSeenAt: now,
          }
        : d
    );

    vaultState.passwords = vaultState.passwords.map((pw) => {
      const isSourceOwner = pw.ownerId === sourceMemberId;
      const hasSourceInAllowed = pw.allowedMemberIds.includes(sourceMemberId);
      const parsedSubs = parseSubAccounts(pw);
      const hasSourceInSubs = parsedSubs.some(
        (sa) => sa.assignedMemberId === sourceMemberId
      );

      if (!isSourceOwner && !hasSourceInAllowed && !hasSourceInSubs) {
        return pw;
      }

      const nextAllowed = Array.from(
        new Set(
          pw.allowedMemberIds.map((id) =>
            id === sourceMemberId ? targetMember.id : id
          )
        )
      );
      const nextSubs = parsedSubs.map((sa) =>
        sa.assignedMemberId === sourceMemberId
          ? {
              ...sa,
              assignedMemberId: targetMember.id,
              assignedMemberName: targetMember.fullName,
            }
          : sa
      );

      return {
        ...pw,
        ownerId: isSourceOwner ? targetMember.id : pw.ownerId,
        ownerName: isSourceOwner ? targetMember.fullName : pw.ownerName,
        allowedMemberIds: nextAllowed,
        ...(hasSourceInSubs
          ? { subAccountsJson: JSON.stringify(nextSubs) }
          : {}),
        updatedAt: now,
      };
    });

    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 11. POST replace or sync state (from encrypted Google Drive Auto-Sync file or .vault.enc backup)
  app.post('/api/vault/sync-replace', (req, res) => {
    const incoming = req.body as Partial<ServerVaultState>;
    if (incoming.vaultConfig !== undefined) {
      vaultState.vaultConfig = incoming.vaultConfig;
    }
    if (Array.isArray(incoming.members)) {
      vaultState.members = incoming.members;
    }
    if (Array.isArray(incoming.devices)) {
      vaultState.devices = incoming.devices;
    }
    if (Array.isArray(incoming.passwords)) {
      vaultState.passwords = incoming.passwords;
    }
    if (Array.isArray(incoming.invitations)) {
      vaultState.invitations = normalizeInvitationStatuses(incoming.invitations);
    }
    if (Array.isArray(incoming.activityLogs)) {
      vaultState.activityLogs = incoming.activityLogs.slice(0, 200);
    }
    if (typeof incoming.driveSyncFileId === 'string') {
      vaultState.driveSyncFileId = incoming.driveSyncFileId;
      bootstrapMeta.driveSyncUpdatedAt = new Date().toISOString();
      saveBootstrapMetaToDisk(bootstrapMeta);
    }
    saveStateToDisk(vaultState);
    res.json(buildClientStatePayload());
  });

  // 12. Save known Google Drive Auto-Sync fileId
  app.put('/api/vault/drive-sync-meta', (req, res) => {
    const { driveSyncFileId } = req.body as { driveSyncFileId?: string };
    if (typeof driveSyncFileId === 'string') {
      vaultState.driveSyncFileId = driveSyncFileId;
      bootstrapMeta.driveSyncUpdatedAt = new Date().toISOString();
      saveBootstrapMetaToDisk(bootstrapMeta);
      saveStateToDisk(vaultState);
    }
    res.json(buildClientStatePayload());
  });

  // 12B. Save local Google OAuth Client ID into `data/vault-bootstrap.json` (excluded from GitHub)
  app.put('/api/vault/oauth-config', (req, res) => {
    const { googleOAuthClientId } = req.body as {
      googleOAuthClientId?: string;
    };
    if (typeof googleOAuthClientId === 'string') {
      bootstrapMeta.googleOAuthClientId = googleOAuthClientId.trim();
      saveBootstrapMetaToDisk(bootstrapMeta);
    }
    res.json(computePublicBootstrapStatus());
  });

  // 13. GET & PUT GitHub CLI Config (Admin Tab 04 — GitHub CLI)
  app.get('/api/github/config', async (_req, res) => {
    const envPat = (
      process.env.GITHUB_PAT ||
      process.env.GITHUB_TOKEN ||
      ''
    ).trim();
    const savedPat = (bootstrapMeta.githubPat || '').trim();
    const activeToken = envPat || savedPat;
    const secretPatSource = envPat
      ? 'GITHUB_PAT_ENV'
      : savedPat
        ? 'SAVED_SERVER_TOKEN'
        : 'NONE';

    let repoOwner = bootstrapMeta.githubConfig?.repoOwner || '';
    if (activeToken && !repoOwner) {
      try {
        const userRes = await githubApiRequest<{ login: string }>(
          'https://api.github.com/user',
          activeToken
        );
        if (userRes.data?.login) {
          repoOwner = userRes.data.login;
          bootstrapMeta.githubConfig.repoOwner = repoOwner;
          saveBootstrapMetaToDisk(bootstrapMeta);
        }
      } catch {
        // Ignore if token check fails during config fetch
      }
    }

    res.json({
      ...bootstrapMeta.githubConfig,
      repoOwner,
      repoName: bootstrapMeta.githubConfig?.repoName || 'familystream-vault',
      branch: bootstrapMeta.githubConfig?.branch || 'main',
      hasServerSecretPat: Boolean(activeToken),
      secretPatSource,
    });
  });

  app.put('/api/github/config', async (req, res) => {
    try {
      const { personalAccessToken, repoName } = req.body as {
        personalAccessToken?: string;
        repoName?: string;
      };
      const cleanToken = (personalAccessToken || '').trim();
      const cleanRepo = (
        repoName ||
        bootstrapMeta.githubConfig?.repoName ||
        'familystream-vault'
      ).trim();

      if (!cleanToken) {
        res.status(400).json({
          error: 'Wklej wygenerowany token GitHub PAT (z uprawnieniem repo).',
        });
        return;
      }

      // Verify token with GitHub API and resolve user login
      const userRes = await githubApiRequest<{ login: string }>(
        'https://api.github.com/user',
        cleanToken
      );

      bootstrapMeta.githubPat = cleanToken;
      bootstrapMeta.githubConfig = {
        ...bootstrapMeta.githubConfig,
        repoOwner: userRes.data.login || '',
        repoName: cleanRepo,
        branch: bootstrapMeta.githubConfig?.branch || 'main',
      };
      saveBootstrapMetaToDisk(bootstrapMeta);

      const envPat = (
        process.env.GITHUB_PAT ||
        process.env.GITHUB_TOKEN ||
        ''
      ).trim();

      res.json({
        ...bootstrapMeta.githubConfig,
        hasServerSecretPat: true,
        secretPatSource: envPat ? 'GITHUB_PAT_ENV' : 'SAVED_SERVER_TOKEN',
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? `Weryfikacja tokenu GitHub nie powiodła się: ${err.message}`
            : 'Nieprawidłowy token GitHub PAT.',
      });
    }
  });

  // 14. POST GitHub CLI Auto-Deploy (Admin Tab 04 - Non-destructive code push, strictly excluding `data/`)
  app.post('/api/github/push', async (req, res) => {
    try {
      const {
        personalAccessToken,
        repoOwner,
        repoName,
        branch = 'main',
        commitMessage,
        createRepoIfMissing = true,
        isPrivateRepo = false,
      } = (req.body || {}) as {
        personalAccessToken?: string;
        repoOwner?: string;
        repoName?: string;
        branch?: string;
        commitMessage?: string;
        createRepoIfMissing?: boolean;
        isPrivateRepo?: boolean;
      };

      const envPat = (
        process.env.GITHUB_PAT ||
        process.env.GITHUB_TOKEN ||
        ''
      ).trim();
      const savedPat = (bootstrapMeta.githubPat || '').trim();
      const providedPat = (personalAccessToken || '').trim();
      const cleanToken = providedPat || envPat || savedPat;

      let cleanOwner = (
        repoOwner ||
        bootstrapMeta.githubConfig?.repoOwner ||
        ''
      ).trim();
      const cleanRepo = (
        repoName ||
        bootstrapMeta.githubConfig?.repoName ||
        'familystream-vault'
      ).trim();
      const cleanBranch = (
        branch ||
        bootstrapMeta.githubConfig?.branch ||
        'main'
      ).trim();
      const finalCommitMessage =
        (commitMessage || '').trim() ||
        `chore(release): auto-deploy FamilyStream Vault (${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC)`;

      if (!cleanToken) {
        res.status(400).json({
          error:
            'Brak tokenu GitHub PAT! Kliknij przycisk „1. Wygeneruj Token GitHub PAT (1-Klik)”, a następnie zapisz go jako sekret GITHUB_PAT w AI Studio lub wklej poniżej.',
        });
        return;
      }

      // 1. Verify token & resolve owner login automatically from GitHub API
      const userRes = await githubApiRequest<{ login: string }>(
        'https://api.github.com/user',
        cleanToken
      );
      cleanOwner = userRes.data.login || cleanOwner;
      if (!cleanOwner) {
        res.status(400).json({
          error: 'Nie udało się rozpoznać właściciela konta GitHub z podanego tokenu PAT.',
        });
        return;
      }

      // Persist token on server if provided so subsequent 1-Click deploys work without re-entering
      if (providedPat) {
        bootstrapMeta.githubPat = providedPat;
      }

      // 2. Check if repository exists; if 404 and createRepoIfMissing is true, create it with auto_init: true
      let repoExists = false;
      let createdNewRepo = false;
      try {
        const existingRepoRes = await githubApiRequest<{ private?: boolean }>(
          `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}`,
          cleanToken
        );
        repoExists = true;
        if (existingRepoRes.data?.private !== isPrivateRepo) {
          try {
            await githubApiRequest(
              `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}`,
              cleanToken,
              {
                method: 'PATCH',
                body: JSON.stringify({
                  private: isPrivateRepo,
                }),
              }
            );
          } catch {
            // Ignore visibility patch error if token lacks admin permission
          }
        }
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 404 && createRepoIfMissing) {
          await githubApiRequest(
            'https://api.github.com/user/repos',
            cleanToken,
            {
              method: 'POST',
              body: JSON.stringify({
                name: cleanRepo,
                description:
                  'FamilyStream Vault — Rodzinny Skarbiec Haseł i Kont VOD (PWA, Czysty kod oddzielony od danych)',
                private: isPrivateRepo,
                auto_init: true,
              }),
            }
          );
          repoExists = true;
          createdNewRepo = true;
          await new Promise((r) => setTimeout(r, 1200));
        } else {
          throw err;
        }
      }

      if (!repoExists) {
        res.status(404).json({
          error: `Repozytorium ${cleanOwner}/${cleanRepo} nie istnieje.`,
        });
        return;
      }

      // 3. Collect all application source files (strictly excluding `data/`, `node_modules/`, `dist/`, `.github/`)
      const sourceFiles = collectProjectSourceFiles(__dirname);

      // Helper to push a set of files to a target branch using delta SHA matching (only uploads changed blobs)
      const pushBranchWithDelta = async (params: {
        targetBranch: string;
        files: Array<{ relativePath: string; buffer: Buffer }>;
        message: string;
        ensureRepoInitialized: boolean;
      }): Promise<{ commitSha: string; updatedBlobsCount: number }> => {
        let parentCommitSha: string | null = null;
        let baseTreeSha: string | null = null;
        const existingBlobShas = new Map<string, string>();

        try {
          const refRes = await githubApiRequest<{
            object: { sha: string };
          }>(
            `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/ref/heads/${encodeURIComponent(params.targetBranch)}`,
            cleanToken
          );
          parentCommitSha = refRes.data.object.sha;

          const commitRes = await githubApiRequest<{
            tree: { sha: string };
          }>(
            `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/commits/${parentCommitSha}`,
            cleanToken
          );
          baseTreeSha = commitRes.data.tree.sha;

          if (baseTreeSha) {
            const existingTreeRes = await githubApiRequest<{
              tree?: Array<{ path?: string; sha?: string; type?: string }>;
            }>(
              `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/trees/${baseTreeSha}?recursive=1`,
              cleanToken
            );
            for (const item of existingTreeRes.data?.tree || []) {
              if (item.type === 'blob' && item.path && item.sha) {
                existingBlobShas.set(item.path, item.sha);
              }
            }
          }
        } catch (err) {
          const status = (err as { status?: number })?.status;
          if ((status === 404 || status === 409) && params.ensureRepoInitialized) {
            try {
              await githubApiRequest(
                `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/contents/README.md`,
                cleanToken,
                {
                  method: 'PUT',
                  body: JSON.stringify({
                    message: 'Initial commit (FamilyStream Vault)',
                    content: Buffer.from(
                      '# FamilyStream Vault\nRodzinny Skarbiec Haseł i Kont VOD (PWA).\n',
                      'utf-8'
                    ).toString('base64'),
                    branch: params.targetBranch,
                  }),
                }
              );
              const refRes = await githubApiRequest<{
                object: { sha: string };
              }>(
                `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/ref/heads/${encodeURIComponent(params.targetBranch)}`,
                cleanToken
              );
              parentCommitSha = refRes.data.object.sha;
            } catch {
              // Proceed if README already exists or branch is being created fresh
            }
          } else if (status !== 404 && status !== 409) {
            throw err;
          }
        }

        const treeItems: Array<{
          path: string;
          mode: '100644';
          type: 'blob';
          sha: string;
        }> = [];
        let updatedBlobsCount = 0;

        for (const file of params.files) {
          const localSha = computeGitBlobSha(file.buffer);
          const remoteSha = existingBlobShas.get(file.relativePath);

          if (remoteSha && remoteSha === localSha) {
            treeItems.push({
              path: file.relativePath,
              mode: '100644',
              type: 'blob',
              sha: remoteSha,
            });
          } else {
            const blobRes = await githubApiRequest<{ sha: string }>(
              `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/blobs`,
              cleanToken,
              {
                method: 'POST',
                body: JSON.stringify({
                  content: file.buffer.toString('base64'),
                  encoding: 'base64',
                }),
              }
            );
            updatedBlobsCount += 1;
            treeItems.push({
              path: file.relativePath,
              mode: '100644',
              type: 'blob',
              sha: blobRes.data.sha,
            });
          }
        }

        const treeRes = await githubApiRequest<{ sha: string }>(
          `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/trees`,
          cleanToken,
          {
            method: 'POST',
            body: JSON.stringify({
              tree: treeItems,
            }),
          }
        );

        const newCommitRes = await githubApiRequest<{
          sha: string;
          html_url?: string;
        }>(
          `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/commits`,
          cleanToken,
          {
            method: 'POST',
            body: JSON.stringify({
              message: params.message,
              tree: treeRes.data.sha,
              parents: parentCommitSha ? [parentCommitSha] : [],
            }),
          }
        );

        const commitSha = newCommitRes.data.sha;

        if (parentCommitSha) {
          await githubApiRequest(
            `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/refs/heads/${encodeURIComponent(params.targetBranch)}`,
            cleanToken,
            {
              method: 'PATCH',
              body: JSON.stringify({
                sha: commitSha,
                force: true,
              }),
            }
          );
        } else {
          await githubApiRequest(
            `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/refs`,
            cleanToken,
            {
              method: 'POST',
              body: JSON.stringify({
                ref: `refs/heads/${params.targetBranch}`,
                sha: commitSha,
              }),
            }
          );
        }

        return { commitSha, updatedBlobsCount };
      };

      // 4. Push source files to main branch (works on 1st creation and every subsequent update)
      const mainPush = await pushBranchWithDelta({
        targetBranch: cleanBranch,
        files: sourceFiles,
        message: finalCommitMessage,
        ensureRepoInitialized: true,
      });
      const newCommitSha = mainPush.commitSha;

      // 5. Build production PWA bundle (`dist/`) and publish directly to `gh-pages` branch using the same `repo` token
      let ghPagesPublished = false;
      try {
        await buildViteBundle({
          root: __dirname,
          logLevel: 'silent',
        });
        const distFiles = collectBuiltDistFiles(path.join(__dirname, 'dist'));
        if (distFiles.length > 0) {
          await pushBranchWithDelta({
            targetBranch: 'gh-pages',
            files: distFiles,
            message: `chore(pages): deploy online PWA build (${newCommitSha.slice(0, 7)})`,
            ensureRepoInitialized: false,
          });
          ghPagesPublished = true;
        }
      } catch (buildOrPagesErr) {
        console.warn('Direct gh-pages build/push warning:', buildOrPagesErr);
      }

      // 6. Enable/Update GitHub Pages pointing to `gh-pages` branch (requires only `repo` scope!)
      const computedPagesUrl = `https://${cleanOwner.toLowerCase()}.github.io/${cleanRepo}/`;
      let pagesEnabled = false;
      const pagesTargetBranch = ghPagesPublished ? 'gh-pages' : cleanBranch;
      try {
        await githubApiRequest(
          `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/pages`,
          cleanToken,
          {
            method: 'POST',
            body: JSON.stringify({
              source: {
                branch: pagesTargetBranch,
                path: '/',
              },
            }),
          }
        );
        pagesEnabled = true;
      } catch (pagesErr) {
        const pStatus = (pagesErr as { status?: number })?.status;
        if (pStatus === 409) {
          pagesEnabled = true;
          try {
            await githubApiRequest(
              `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/pages`,
              cleanToken,
              {
                method: 'PUT',
                body: JSON.stringify({
                  source: {
                    branch: pagesTargetBranch,
                    path: '/',
                  },
                }),
              }
            );
          } catch {
            // already configured
          }
        }
      }

      const pushedAt = new Date().toISOString();
      const repoUrl = `https://github.com/${cleanOwner}/${cleanRepo}`;
      const commitUrl = `${repoUrl}/commit/${newCommitSha}`;

      bootstrapMeta.githubConfig = {
        repoOwner: cleanOwner,
        repoName: cleanRepo,
        branch: cleanBranch,
        lastCommitSha: newCommitSha,
        lastCommitUrl: commitUrl,
        lastPushedAt: pushedAt,
        pagesUrl: computedPagesUrl,
        pagesEnabled,
        isPrivateRepo,
      };
      saveBootstrapMetaToDisk(bootstrapMeta);

      const result: GitHubPushResult = {
        ok: true,
        commitSha: newCommitSha,
        commitUrl,
        repoUrl,
        pagesUrl: computedPagesUrl,
        pagesEnabled,
        ghPagesPublished,
        isPrivateRepo,
        branch: cleanBranch,
        filesCount: sourceFiles.length,
        updatedBlobsCount: mainPush.updatedBlobsCount,
        pushedAt,
        createdNewRepo,
        repoOwner: cleanOwner,
        repoName: cleanRepo,
      };

      res.json(result);
    } catch (err) {
      console.error('GitHub Push Error:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? `Błąd wysyłania kodu na GitHub: ${err.message}`
            : 'Nie udało się wykonać Commit & Push do repozytorium GitHub.',
      });
    }
  });

  // Serve a WebSocket-free /@vite/client module
  app.get('/@vite/client', (_req, res) => {
    res.type('application/javascript').send(`
const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && typeof document !== 'undefined') {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
export class ErrorOverlay {}
`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `FamilyStream Vault API & Web Server running on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
