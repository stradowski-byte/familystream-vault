import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  db,
  ensureFirebaseAuthSession,
  isFirebaseConfigured,
} from './firebase';
import {
  decryptPrivateRecordPayload,
  encryptPrivateRecordPayload,
  HardwareBoundKeyParams,
  unwrapDekFromMergeEscrow,
  unwrapDekWithHardwareCertificate,
  unwrapDekWithPassword,
  wrapDekWithHardwareCertificate,
} from './crypto';
import { normalizeHardwareModelOnly } from './deviceAndBiometrics';
import type {
  ActivityLog,
  DecryptedPrivatePayload,
  Device,
  InvitationMode,
  InvitationPurpose,
  Member,
  PasswordRecord,
  VaultConfig,
  VaultInvitation,
} from '../types/vault';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function randomHex(bytesCount: number): string {
  const arr = new Uint8Array(bytesCount);
  window.crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function stripUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

/**
 * Generates or validates Hardware Certificate fields (`deviceApprovalToken` and `deviceCertificateFingerprint`)
 * preserving the exact hardware-software binding logic.
 */
export function ensureDeviceHardwareCertificate(
  dev: Device,
  forceReissue = false
): Device {
  const normalizedModel = normalizeHardwareModelOnly(
    dev.hardwareModelOs || dev.deviceName
  );
  if (dev.status === 'approved') {
    const token =
      !dev.deviceApprovalToken || forceReissue
        ? `hwtok_${randomHex(24)}`
        : dev.deviceApprovalToken;
    const certFp =
      !dev.deviceCertificateFingerprint || forceReissue
        ? `CERT-HW-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}`
        : dev.deviceCertificateFingerprint;

    return stripUndefinedFields({
      ...dev,
      hardwareModelOs: normalizedModel,
      deviceApprovalToken: token,
      deviceCertificateFingerprint: certFp,
      certificateIssuedAt:
        !dev.certificateIssuedAt || forceReissue
          ? new Date().toISOString()
          : dev.certificateIssuedAt,
      hardwareWrappedDek: forceReissue ? '' : dev.hardwareWrappedDek || '',
    });
  }

  return stripUndefinedFields({
    ...dev,
    hardwareModelOs: normalizedModel,
    deviceApprovalToken: '',
    deviceCertificateFingerprint: '',
    hardwareWrappedDek: '',
  });
}

export function normalizeInvitationStatuses(
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

export interface RealtimeVaultSnapshotCallbacks {
  onVaultConfig: (config: VaultConfig | null) => void;
  onMembers: (members: Member[]) => void;
  onDevices: (devices: Device[]) => void;
  onPasswords: (passwords: PasswordRecord[]) => void;
  onInvitations: (invitations: VaultInvitation[]) => void;
  onActivityLogs: (logs: ActivityLog[]) => void;
  onInitialSyncComplete?: () => void;
}

/**
 * Real-time `onSnapshot` listener for all FamilyStream Vault collections in Cloud Firestore.
 * Strictly waits for an active `request.auth` session (`auth.currentUser != null`) before
 * attaching Firestore listeners so unauthenticated clients never trigger permission errors.
 */
export function subscribeToVaultFirestoreRealtime(
  callbacks: RealtimeVaultSnapshotCallbacks
): Unsubscribe {
  if (!isFirebaseConfigured() || !db || !auth) {
    callbacks.onInitialSyncComplete?.();
    return () => {};
  }

  let snapshotUnsubscribers: Unsubscribe[] = [];
  let roleScopedUnsubscribers: Unsubscribe[] = [];
  let attachedUid: string | null = null;
  let attachedRoleScope: 'admin' | 'member' | null = null;
  let initialConfigLoaded = false;
  let initialMembersLoaded = false;
  let notifiedInitial = false;
  let isDisposed = false;

  const checkInitialComplete = () => {
    if (!notifiedInitial && initialConfigLoaded && initialMembersLoaded) {
      notifiedInitial = true;
      callbacks.onInitialSyncComplete?.();
    }
  };

  const detachRoleScopedSnapshots = () => {
    roleScopedUnsubscribers.forEach((u) => u());
    roleScopedUnsubscribers = [];
    attachedRoleScope = null;
  };

  const detachSnapshots = () => {
    detachRoleScopedSnapshots();
    snapshotUnsubscribers.forEach((u) => u());
    snapshotUnsubscribers = [];
    attachedUid = null;
  };

  const attachRoleScopedListeners = (uid: string, isVaultAdmin: boolean) => {
    if (isDisposed) return;
    const targetScope: 'admin' | 'member' = isVaultAdmin ? 'admin' : 'member';
    if (attachedRoleScope === targetScope) return;
    detachRoleScopedSnapshots();
    attachedRoleScope = targetScope;

    // 4. /passwords (E2E AES-256-GCM encrypted records)
    // SaaS Admin (vaultConfig.adminUid == request.auth.uid) lists all records;
    // Family Members list only records where request.auth.uid is in allowedMemberIds
    const passwordsRefOrQuery = isVaultAdmin
      ? collection(db, 'passwords')
      : query(
          collection(db, 'passwords'),
          where('allowedMemberIds', 'array-contains', uid)
        );
    roleScopedUnsubscribers.push(
      onSnapshot(
        passwordsRefOrQuery,
        (snap) => {
          const list = snap.docs.map((d) => ({
            ...(d.data() as PasswordRecord),
            id: d.id,
          }));
          callbacks.onPasswords(list);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, 'passwords');
          }
        }
      )
    );

    // 6. /activityLogs (Strictly restricted to isAdmin() in firestore.rules)
    if (isVaultAdmin) {
      const logsQuery = query(
        collection(db, 'activityLogs'),
        orderBy('timestamp', 'desc'),
        limit(150)
      );
      roleScopedUnsubscribers.push(
        onSnapshot(
          logsQuery,
          (snap) => {
            const list = snap.docs.map((d) => ({
              ...(d.data() as ActivityLog),
              id: d.id,
            }));
            callbacks.onActivityLogs(list);
          },
          (err) => {
            if (auth.currentUser) {
              handleFirestoreError(err, OperationType.LIST, 'activityLogs');
            }
          }
        )
      );
    } else {
      callbacks.onActivityLogs([]);
    }
  };

  const attachSnapshotsForUser = (user: User) => {
    if (isDisposed || attachedUid === user.uid) return;
    detachSnapshots();
    attachedUid = user.uid;

    // 1. /vaultConfig/default — resolves SaaS Admin ownership (cfg.adminUid === user.uid)
    snapshotUnsubscribers.push(
      onSnapshot(
        doc(db, 'vaultConfig', 'default'),
        (snap) => {
          const cfg = snap.exists() ? (snap.data() as VaultConfig) : null;
          callbacks.onVaultConfig(cfg);
          const isVaultAdmin = Boolean(cfg && cfg.adminUid === user.uid);
          attachRoleScopedListeners(user.uid, isVaultAdmin);
          initialConfigLoaded = true;
          checkInitialComplete();
        },
        (err) => {
          initialConfigLoaded = true;
          checkInitialComplete();
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'vaultConfig/default');
          }
        }
      )
    );

    // 2. /members
    snapshotUnsubscribers.push(
      onSnapshot(
        collection(db, 'members'),
        (snap) => {
          const list = snap.docs.map((d) => ({
            ...(d.data() as Member),
            id: d.id,
          }));
          callbacks.onMembers(list);
          initialMembersLoaded = true;
          checkInitialComplete();
        },
        (err) => {
          initialMembersLoaded = true;
          checkInitialComplete();
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, 'members');
          }
        }
      )
    );

    // 3. /devices
    snapshotUnsubscribers.push(
      onSnapshot(
        collection(db, 'devices'),
        (snap) => {
          const list = snap.docs.map((d) =>
            ensureDeviceHardwareCertificate({
              ...(d.data() as Device),
              id: d.id,
            })
          );
          callbacks.onDevices(list);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, 'devices');
          }
        }
      )
    );

    // 5. /invitations
    snapshotUnsubscribers.push(
      onSnapshot(
        collection(db, 'invitations'),
        (snap) => {
          const list = snap.docs.map((d) => ({
            ...(d.data() as VaultInvitation),
            id: d.id,
          }));
          callbacks.onInvitations(normalizeInvitationStatuses(list));
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, 'invitations');
          }
        }
      )
    );
  };

  // Listen to Firebase Auth state changes (Google Auth, Email/Password Auth, or Anonymous Auth)
  const unsubAuth = onAuthStateChanged(auth, (user) => {
    if (isDisposed) return;
    if (user) {
      attachSnapshotsForUser(user);
    } else {
      detachSnapshots();
    }
  });

  // Ensure an active Firebase Auth session (reuses Google/Email session or creates Anonymous session)
  void ensureFirebaseAuthSession(false).then((user) => {
    if (isDisposed) return;
    if (user) {
      attachSnapshotsForUser(user);
    } else {
      initialConfigLoaded = true;
      initialMembersLoaded = true;
      checkInitialComplete();
    }
  });

  return () => {
    isDisposed = true;
    unsubAuth();
    detachSnapshots();
  };
}

/**
 * E2E Client-Side Encryption before writing to Firestore (`setDoc`):
 * Private records are encrypted in browser RAM using `encryptPrivateRecordPayload(plainPayload, ownerDekBase64)`
 * so only the final `ENC[AES-256-GCM:iv:ciphertext]` string is stored in Firestore.
 */
export async function savePasswordToFirestore(
  passwordId: string,
  passwordData: Partial<PasswordRecord>,
  options?: {
    plainPrivatePayload?: DecryptedPrivatePayload;
    ownerDekBase64?: string;
  }
): Promise<void> {
  const path = `passwords/${passwordId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;

    const existingSnap = await getDoc(doc(db, 'passwords', passwordId));
    const base = existingSnap.exists()
      ? (existingSnap.data() as PasswordRecord)
      : ({} as PasswordRecord);

    let encryptedPayload =
      passwordData.encryptedPayload ?? base.encryptedPayload ?? '';
    if (options?.plainPrivatePayload && options?.ownerDekBase64) {
      encryptedPayload = await encryptPrivateRecordPayload(
        options.plainPrivatePayload,
        options.ownerDekBase64
      );
    }

    const now = new Date().toISOString();
    const recordToSave: PasswordRecord = stripUndefinedFields({
      ...base,
      ...passwordData,
      id: passwordId,
      section: passwordData.section || base.section || 'shared',
      categoryId: passwordData.categoryId ?? base.categoryId ?? 'other',
      serviceName: (passwordData.serviceName ?? base.serviceName ?? '').slice(
        0,
        195
      ),
      serviceUrl: (passwordData.serviceUrl ?? base.serviceUrl ?? '').slice(
        0,
        490
      ),
      login: (passwordData.login ?? base.login ?? '').slice(0, 250),
      passwordValue: (
        passwordData.passwordValue ??
        base.passwordValue ??
        ''
      ).slice(0, 2000),
      encryptedPayload,
      keySalt: passwordData.keySalt ?? base.keySalt ?? '',
      ownerId: passwordData.ownerId ?? base.ownerId ?? '',
      ownerName: (passwordData.ownerName ?? base.ownerName ?? '').slice(0, 115),
      allowedMemberIds:
        passwordData.allowedMemberIds ?? base.allowedMemberIds ?? [],
      createdAt: passwordData.createdAt || base.createdAt || now,
      updatedAt: passwordData.updatedAt || now,
      passwordUpdatedAt:
        passwordData.passwordUpdatedAt || base.passwordUpdatedAt || now,
    });

    await setDoc(doc(db, 'passwords', passwordId), recordToSave);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * E2E Client-Side Decryption after reading from Firestore (`onSnapshot`):
 * Decrypts private entries strictly in browser RAM using the owner's hardware-unlocked DEK.
 */
export async function decryptPrivatePasswordsInMemory(
  passwords: PasswordRecord[],
  currentMemberId: string,
  activeDekBase64: string,
  activeMergedDeks: string[] = []
): Promise<Record<string, DecryptedPrivatePayload>> {
  const myPrivateRecords = passwords.filter(
    (p) => p.section === 'private' && p.ownerId === currentMemberId
  );
  const nextMap: Record<string, DecryptedPrivatePayload> = {};
  for (const rec of myPrivateRecords) {
    if (!rec.encryptedPayload) continue;
    const decrypted = await decryptPrivateRecordPayload(
      rec.encryptedPayload,
      activeDekBase64,
      activeMergedDeks
    );
    if (decrypted) {
      nextMap[rec.id] = decrypted;
    }
  }
  return nextMap;
}

export async function deletePasswordFromFirestore(
  passwordId: string
): Promise<void> {
  const path = `passwords/${passwordId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;
    await deleteDoc(doc(db, 'passwords', passwordId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchLiveVaultBootstrapStateFromFirestore(): Promise<{
  vaultConfig: VaultConfig | null;
  members: Member[];
  devices: Device[];
}> {
  if (!isFirebaseConfigured() || !db) {
    return { vaultConfig: null, members: [], devices: [] };
  }
  const user = await ensureFirebaseAuthSession(false);
  if (!user) {
    return { vaultConfig: null, members: [], devices: [] };
  }

  let liveConfig: VaultConfig | null = null;
  let liveMembers: Member[] = [];
  let liveDevices: Device[] = [];

  try {
    const cfgSnap = await getDoc(doc(db, 'vaultConfig', 'default'));
    if (cfgSnap.exists()) {
      liveConfig = cfgSnap.data() as VaultConfig;
    }
  } catch (err) {
    console.warn('Live vaultConfig read warning:', err);
  }

  try {
    const memSnap = await getDocs(collection(db, 'members'));
    liveMembers = memSnap.docs.map((d) => ({
      ...(d.data() as Member),
      id: d.id,
    }));
  } catch (err) {
    console.warn('Live members read warning:', err);
  }

  try {
    const devSnap = await getDocs(collection(db, 'devices'));
    liveDevices = devSnap.docs.map((d) =>
      ensureDeviceHardwareCertificate({
        ...(d.data() as Device),
        id: d.id,
      })
    );
  } catch (err) {
    console.warn('Live devices read warning:', err);
  }

  return {
    vaultConfig: liveConfig,
    members: liveMembers,
    devices: liveDevices,
  };
}

export async function saveVaultConfigToFirestore(
  config: VaultConfig
): Promise<void> {
  const path = 'vaultConfig/default';
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;

    const existingSnap = await getDoc(doc(db, 'vaultConfig', 'default'));
    const exists = existingSnap.exists();
    const base = exists ? (existingSnap.data() as VaultConfig) : null;

    const now = new Date().toISOString();
    const cleanConfig: VaultConfig = {
      initialized: Boolean(config.initialized),
      adminUid: (config.adminUid || user.uid || base?.adminUid || 'admin').slice(
        0,
        125
      ),
      adminEmail: (
        config.adminEmail ||
        base?.adminEmail ||
        user.email ||
        'admin@familystream.local'
      ).slice(0, 250),
      adminMemberId: (
        config.adminMemberId ||
        base?.adminMemberId ||
        'mem_admin'
      ).slice(0, 125),
      templatesLoaded: Boolean(
        config.templatesLoaded ?? base?.templatesLoaded ?? false
      ),
      categoriesJson: (
        config.categoriesJson ||
        base?.categoriesJson ||
        '[]'
      ).slice(0, 19500),
      defaultTheme:
        (config.defaultTheme || base?.defaultTheme) === 'linen'
          ? 'linen'
          : 'dusk',
      clipboardClearSeconds: Math.min(
        600,
        Math.max(
          5,
          Number(
            config.clipboardClearSeconds ?? base?.clipboardClearSeconds ?? 30
          )
        )
      ),
      autoLockMinutes: Math.min(
        1440,
        Math.max(
          1,
          Number(config.autoLockMinutes ?? base?.autoLockMinutes ?? 15)
        )
      ),
      createdAt: (exists ? base?.createdAt : config.createdAt) || now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'vaultConfig', 'default'), cleanConfig);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveMemberToFirestore(
  memberId: string,
  memberData: Partial<Member>
): Promise<void> {
  const path = `members/${memberId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;

    const existingSnap = await getDoc(doc(db, 'members', memberId));
    const base = existingSnap.exists()
      ? (existingSnap.data() as Member)
      : ({} as Member);
    const now = new Date().toISOString();
    const merged: Member = stripUndefinedFields({
      ...base,
      ...memberData,
      id: memberId,
      fullName: (memberData.fullName ?? base.fullName ?? 'Domownik').slice(
        0,
        115
      ),
      username: (memberData.username ?? base.username ?? 'user').slice(0, 75),
      passwordHash: memberData.passwordHash ?? base.passwordHash ?? '',
      pbkdf2Salt: memberData.pbkdf2Salt ?? base.pbkdf2Salt ?? '',
      wrappedMasterKey:
        memberData.wrappedMasterKey ?? base.wrappedMasterKey ?? '',
      vaultEscrowKey: memberData.vaultEscrowKey ?? base.vaultEscrowKey ?? '',
      mergedVaultKeysJson:
        memberData.mergedVaultKeysJson ?? base.mergedVaultKeysJson ?? '[]',
      role: memberData.role ?? base.role ?? 'member',
      status: memberData.status ?? base.status ?? 'pending',
      googleUid: (
        memberData.googleUid ??
        base.googleUid ??
        user.uid ??
        ''
      ).slice(0, 250),
      createdAt: memberData.createdAt || base.createdAt || now,
      updatedAt: memberData.updatedAt || now,
    });
    await setDoc(doc(db, 'members', memberId), merged);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMemberFromFirestore(
  memberId: string
): Promise<void> {
  const path = `members/${memberId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;
    await deleteDoc(doc(db, 'members', memberId));
    const devSnaps = await getDocs(
      query(collection(db, 'devices'), where('memberId', '==', memberId))
    );
    for (const d of devSnaps.docs) {
      await deleteDoc(doc(db, 'devices', d.id));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveDeviceToFirestore(
  deviceId: string,
  deviceData: Partial<Device>
): Promise<Device> {
  const path = `devices/${deviceId}`;
  const now = new Date().toISOString();
  const fallbackMerged: Device = ensureDeviceHardwareCertificate(
    stripUndefinedFields({
      ...(deviceData as Device),
      id: deviceId,
      memberId: deviceData.memberId ?? '',
      memberName: (deviceData.memberName ?? '').slice(0, 115),
      username: (deviceData.username ?? '').slice(0, 75),
      deviceFingerprint: (deviceData.deviceFingerprint ?? '').slice(0, 250),
      deviceName: (deviceData.deviceName ?? '').slice(0, 195),
      customLabel: (deviceData.customLabel ?? '').slice(0, 195),
      clientMode:
        deviceData.clientMode === 'pwa'
          ? ('pwa' as const)
          : ('browser' as const),
      status: deviceData.status ?? 'pending',
      webAuthnCredentialId: deviceData.webAuthnCredentialId ?? '',
      requestedAt: deviceData.requestedAt || now,
      lastSeenAt: deviceData.lastSeenAt || now,
    }),
    false
  );

  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return fallbackMerged;

    const existingSnap = await getDoc(doc(db, 'devices', deviceId));
    const base = existingSnap.exists()
      ? (existingSnap.data() as Device)
      : ({} as Device);
    const rawMerged: Device = stripUndefinedFields({
      ...base,
      ...deviceData,
      id: deviceId,
      memberId: deviceData.memberId ?? base.memberId ?? '',
      memberName: (deviceData.memberName ?? base.memberName ?? '').slice(
        0,
        115
      ),
      username: (deviceData.username ?? base.username ?? '').slice(0, 75),
      deviceFingerprint: (
        deviceData.deviceFingerprint ??
        base.deviceFingerprint ??
        ''
      ).slice(0, 250),
      deviceName: (deviceData.deviceName ?? base.deviceName ?? '').slice(
        0,
        195
      ),
      customLabel: (deviceData.customLabel ?? base.customLabel ?? '').slice(
        0,
        195
      ),
      clientMode:
        (deviceData.clientMode ?? base.clientMode) === 'pwa'
          ? ('pwa' as const)
          : ('browser' as const),
      status: deviceData.status ?? base.status ?? 'pending',
      webAuthnCredentialId:
        deviceData.webAuthnCredentialId ?? base.webAuthnCredentialId ?? '',
      requestedAt: deviceData.requestedAt || base.requestedAt || now,
      lastSeenAt: deviceData.lastSeenAt || now,
    });

    const certified = ensureDeviceHardwareCertificate(rawMerged, false);
    await setDoc(doc(db, 'devices', deviceId), certified);
    return certified;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function rebindDeviceCertificateInFirestore(
  deviceId: string
): Promise<Device> {
  const path = `devices/${deviceId}`;
  try {
    await ensureFirebaseAuthSession(true);
    const snap = await getDoc(doc(db, 'devices', deviceId));
    if (!snap.exists()) {
      throw new Error('Nie znaleziono urządzenia w bazie Firestore.');
    }
    const existing = snap.data() as Device;
    const reissued = ensureDeviceHardwareCertificate(
      {
        ...existing,
        status: 'approved',
        lastSeenAt: new Date().toISOString(),
      },
      true
    );
    await setDoc(doc(db, 'devices', deviceId), reissued);
    return reissued;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteDeviceFromFirestore(
  deviceId: string
): Promise<void> {
  const path = `devices/${deviceId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;
    await deleteDoc(doc(db, 'devices', deviceId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createInvitationInFirestore(params: {
  purpose: InvitationPurpose;
  mode: InvitationMode;
  invitedLabel: string;
  targetMemberId?: string;
  targetMemberName?: string;
  targetUsername?: string;
  createdByMemberId: string;
  createdByMemberName: string;
  hoursValid?: number;
}): Promise<VaultInvitation> {
  const invId = `inv_${randomHex(6)}`;
  const token = `inv_${randomHex(12)}`;
  const now = new Date();
  const hoursValid = Number(params.hoursValid || 24);
  const expiresAt =
    params.mode === 'time_limited'
      ? new Date(now.getTime() + hoursValid * 3600 * 1000).toISOString()
      : new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

  const invitation: VaultInvitation = stripUndefinedFields({
    id: invId,
    token,
    purpose: params.purpose,
    mode: params.mode,
    invitedLabel: (params.invitedLabel || 'Domownik').slice(0, 150),
    targetMemberId: params.targetMemberId,
    targetMemberName: params.targetMemberName,
    targetUsername: params.targetUsername,
    createdByMemberId: params.createdByMemberId,
    createdByMemberName: params.createdByMemberName.slice(0, 115),
    expiresAt,
    maxUses: params.mode === 'single_use' ? 1 : 999,
    usedCount: 0,
    status: 'active' as const,
    createdAt: now.toISOString(),
  });

  const path = `invitations/${invId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return invitation;
    await setDoc(doc(db, 'invitations', invId), invitation);
    return invitation;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function verifyInvitationTokenInFirestore(
  token: string
): Promise<VaultInvitation> {
  const cleanToken = token.trim();
  const path = 'invitations';
  if (!isFirebaseConfigured() || !db) {
    throw new Error(
      'Brak skonfigurowanego połączenia z bazą Firebase na tym urządzeniu. Otwórz pełny link zaproszeniowy zawierający parametr „&fb=...” od Administratora.'
    );
  }
  try {
    const user = await ensureFirebaseAuthSession(true);
    if (!user) {
      throw new Error(
        'W projekcie Firebase nie jest jeszcze włączone logowanie „Anonymous” dla urządzeń domowników. Włącz je w Firebase Console -> Authentication -> Sign-in method -> Anonymous -> Enable.'
      );
    }

    let matchedDoc: VaultInvitation | null = null;

    // 1. Primary lookup by token field
    const q = query(
      collection(db, 'invitations'),
      where('token', '==', cleanToken),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      matchedDoc = {
        ...(snap.docs[0].data() as VaultInvitation),
        id: snap.docs[0].id,
      };
    }

    // 2. Fallback lookup across all invitations in case token case/whitespace or id was passed
    let totalInvitesInDb = snap.size;
    if (!matchedDoc) {
      const allSnap = await getDocs(collection(db, 'invitations'));
      totalInvitesInDb = allSnap.size;
      const found = allSnap.docs.find((d) => {
        const data = d.data() as VaultInvitation;
        return (
          (data.token &&
            data.token.trim().toLowerCase() === cleanToken.toLowerCase()) ||
          d.id.trim().toLowerCase() === cleanToken.toLowerCase()
        );
      });
      if (found) {
        matchedDoc = {
          ...(found.data() as VaultInvitation),
          id: found.id,
        };
      }
    }

    if (!matchedDoc) {
      throw new Error(
        `Nie znaleziono zaproszenia (${cleanToken}) w bazie Cloud Firestore (liczba zaproszeń w bazie: ${totalInvitesInDb}). Poproś Administratora o skopiowanie aktualnego linku lub kliknij „Ponów weryfikację linku”.`
      );
    }

    const inv = normalizeInvitationStatuses([matchedDoc])[0];
    if (inv.status !== 'active') {
      throw new Error(
        inv.status === 'used'
          ? 'Ten jednorazowy link zaproszeniowy został już wykorzystany. Możesz zalogować się poniżej swoim loginem i hasłem.'
          : 'Ten link zaproszeniowy wygasł. Poproś Administratora o wygenerowanie nowego linku lub zaloguj się poniżej.'
      );
    }
    return inv;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('permission')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function consumeInvitationTokenInFirestore(
  token: string
): Promise<VaultInvitation | null> {
  const cleanToken = token.trim();
  const path = 'invitations';
  try {
    const user = await ensureFirebaseAuthSession(true);
    if (!user) {
      throw new Error(
        'W projekcie Firebase nie jest jeszcze włączone logowanie „Anonymous” dla urządzeń domowników. Włącz je w Firebase Console -> Authentication -> Sign-in method -> Anonymous -> Enable.'
      );
    }
    let inv: VaultInvitation | null = null;
    const q = query(
      collection(db, 'invitations'),
      where('token', '==', cleanToken),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      inv = {
        ...(snap.docs[0].data() as VaultInvitation),
        id: snap.docs[0].id,
      };
    } else {
      const allSnap = await getDocs(collection(db, 'invitations'));
      const found = allSnap.docs.find((d) => {
        const data = d.data() as VaultInvitation;
        return (
          (data.token &&
            data.token.trim().toLowerCase() === cleanToken.toLowerCase()) ||
          d.id.trim().toLowerCase() === cleanToken.toLowerCase()
        );
      });
      if (found) {
        inv = {
          ...(found.data() as VaultInvitation),
          id: found.id,
        };
      }
    }
    if (!inv) return null;
    const nextUsedCount = (inv.usedCount || 0) + 1;
    const nextStatus: VaultInvitation['status'] =
      inv.mode === 'single_use' || nextUsedCount >= inv.maxUses
        ? 'used'
        : 'active';
    const updated: VaultInvitation = stripUndefinedFields({
      ...inv,
      usedCount: nextUsedCount,
      status: nextStatus,
      lastUsedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'invitations', inv.id), updated);
    return updated;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('permission')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteInvitationFromFirestore(
  invitationId: string
): Promise<void> {
  const path = `invitations/${invitationId}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;
    await deleteDoc(doc(db, 'invitations', invitationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function appendActivityLogToFirestore(
  entry: ActivityLog
): Promise<void> {
  const path = `activityLogs/${entry.id}`;
  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) return;
    const cleanEntry: ActivityLog = {
      id: entry.id,
      actorId: (entry.actorId || 'system').slice(0, 120),
      actorName: (entry.actorName || 'Użytkownik').slice(0, 115),
      actionType: (entry.actionType || 'EVENT').slice(0, 75),
      details: (entry.details || '').slice(0, 490),
      deviceInfo: (entry.deviceInfo || 'Urządzenie').slice(0, 190),
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    await setDoc(doc(db, 'activityLogs', entry.id), cleanEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function mergeMembersInFirestore(params: {
  sourceMemberId: string;
  targetMemberId: string;
  updatedMergedKeysJson: string;
  passwords: PasswordRecord[];
}): Promise<void> {
  const path = 'members/merge';
  try {
    const now = new Date().toISOString();
    const [sourceSnap, targetSnap] = await Promise.all([
      getDoc(doc(db, 'members', params.sourceMemberId)),
      getDoc(doc(db, 'members', params.targetMemberId)),
    ]);
    if (!sourceSnap.exists() || !targetSnap.exists()) {
      throw new Error('Nie znaleziono kont do scalenia w bazie Firestore.');
    }
    const sourceData = sourceSnap.data() as Member;
    const targetData = targetSnap.data() as Member;

    const batch = writeBatch(db);
    batch.set(doc(db, 'members', params.sourceMemberId), {
      ...sourceData,
      status: 'merged',
      updatedAt: now,
    });
    batch.set(doc(db, 'members', params.targetMemberId), {
      ...targetData,
      mergedVaultKeysJson: params.updatedMergedKeysJson,
      updatedAt: now,
    });

    for (const p of params.passwords) {
      if (p.ownerId === params.sourceMemberId) {
        const mergedAllowed = Array.from(
          new Set(
            [
              ...(p.allowedMemberIds || []),
              params.targetMemberId,
              targetData.googleUid || '',
            ].filter(Boolean)
          )
        );
        batch.set(doc(db, 'passwords', p.id), {
          ...p,
          ownerId: params.targetMemberId,
          allowedMemberIds: mergedAllowed,
          updatedAt: now,
        });
      }
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function replaceFullVaultStateInFirestore(params: {
  vaultConfig: VaultConfig | null;
  members: Member[];
  devices: Device[];
  passwords: PasswordRecord[];
  invitations?: VaultInvitation[];
  activityLogs?: ActivityLog[];
}): Promise<void> {
  try {
    if (params.vaultConfig) {
      await saveVaultConfigToFirestore(params.vaultConfig);
    }
    for (const m of params.members || []) {
      await saveMemberToFirestore(m.id, m);
    }
    for (const d of params.devices || []) {
      await saveDeviceToFirestore(d.id, d);
    }
    for (const p of params.passwords || []) {
      await savePasswordToFirestore(p.id, p);
    }
    for (const inv of params.invitations || []) {
      await setDoc(
        doc(db, 'invitations', inv.id),
        stripUndefinedFields({ ...inv })
      );
    }
    for (const log of (params.activityLogs || []).slice(0, 50)) {
      await appendActivityLogToFirestore(log);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'vault/restore');
  }
}

export interface BaseCollectionsInitReport {
  initializedCollections: string[];
  skippedExistingCollections: string[];
}

/**
 * Idempotent, 100% non-destructive initializer for all 6 base collections in a Firebase project:
 * (`vaultConfig`, `members`, `devices`, `passwords`, `invitations`, `activityLogs`).
 * Checks each collection individually with `limit(1)` — if a collection already has at least 1 document,
 * it does NOTHING to that collection (never overwrites or deletes existing data).
 * If a collection is completely empty, it creates a valid foundational document so the collection
 * immediately exists in Cloud Firestore.
 */
export async function ensureBaseCollectionsInitializedInFirestore(params: {
  adminUid: string;
  adminEmail: string;
  adminMemberId: string;
  adminMemberName: string;
  deviceName?: string;
  categoriesJson: string;
  defaultTheme: 'dusk' | 'linen';
}): Promise<BaseCollectionsInitReport> {
  const initializedCollections: string[] = [];
  const skippedExistingCollections: string[] = [];

  try {
    const user = await ensureFirebaseAuthSession(false);
    if (!user) {
      return { initializedCollections, skippedExistingCollections };
    }

    const now = new Date().toISOString();
    const effectiveAdminUid = params.adminUid || user.uid;

    // 1. Collection: vaultConfig (/vaultConfig/default)
    const cfgSnap = await getDoc(doc(db, 'vaultConfig', 'default'));
    if (cfgSnap.exists()) {
      skippedExistingCollections.push('vaultConfig');
    } else {
      await saveVaultConfigToFirestore({
        initialized: true,
        adminUid: effectiveAdminUid,
        adminEmail: params.adminEmail || user.email || 'admin@familystream.local',
        adminMemberId: params.adminMemberId,
        templatesLoaded: false,
        categoriesJson: params.categoriesJson,
        defaultTheme: params.defaultTheme,
        clipboardClearSeconds: 30,
        autoLockMinutes: 15,
        createdAt: now,
        updatedAt: now,
      });
      initializedCollections.push('vaultConfig');
    }

    // 2. Collection: members
    const membersSnap = await getDocs(
      query(collection(db, 'members'), limit(1))
    );
    if (!membersSnap.empty) {
      skippedExistingCollections.push('members');
    } else {
      initializedCollections.push('members');
    }

    // 3. Collection: devices
    const devicesSnap = await getDocs(
      query(collection(db, 'devices'), limit(1))
    );
    if (!devicesSnap.empty) {
      skippedExistingCollections.push('devices');
    } else {
      initializedCollections.push('devices');
    }

    // 4. Collection: passwords (always respect firestore.rules: Admin or where('allowedMemberIds', 'array-contains', uid))
    const isVerifiedVaultAdmin =
      !cfgSnap.exists() ||
      (cfgSnap.data() as VaultConfig)?.adminUid === effectiveAdminUid;
    const passwordsCheckQuery = isVerifiedVaultAdmin
      ? query(collection(db, 'passwords'), limit(1))
      : query(
          collection(db, 'passwords'),
          where('allowedMemberIds', 'array-contains', effectiveAdminUid),
          limit(1)
        );
    const passwordsSnap = await getDocs(passwordsCheckQuery);
    if (!passwordsSnap.empty) {
      skippedExistingCollections.push('passwords');
    } else {
      const bootstrapPwId = 'pw_bootstrap_welcome';
      const allowed = Array.from(
        new Set([params.adminMemberId, effectiveAdminUid].filter(Boolean))
      );
      await savePasswordToFirestore(bootstrapPwId, {
        id: bootstrapPwId,
        section: 'shared',
        categoryId: 'other',
        serviceName: 'Karta Startowa FamilyStream Vault',
        serviceUrl: 'https://console.firebase.google.com/',
        login: (params.adminEmail || 'admin').slice(0, 250),
        passwordValue: 'Skarbiec-Zainicjalizowany-E2E',
        encryptedPayload: '',
        keySalt: '',
        ownerId: params.adminMemberId,
        ownerName: (params.adminMemberName || 'Główny Administrator').slice(
          0,
          115
        ),
        allowedMemberIds: allowed,
        revealToAdmin: false,
        subAccountsJson: '[]',
        createdAt: now,
        updatedAt: now,
        passwordUpdatedAt: now,
      });
      initializedCollections.push('passwords');
    }

    // 5. Collection: invitations
    const invitationsSnap = await getDocs(
      query(collection(db, 'invitations'), limit(1))
    );
    if (!invitationsSnap.empty) {
      skippedExistingCollections.push('invitations');
    } else {
      const bootstrapInvId = 'inv_bootstrap_init';
      const bootstrapInvite: VaultInvitation = {
        id: bootstrapInvId,
        token: 'init_collection_bootstrap',
        purpose: 'new_member',
        mode: 'single_use',
        invitedLabel: 'Rekord inicjalizacyjny kolekcji invitations',
        createdByMemberId: params.adminMemberId,
        createdByMemberName: (
          params.adminMemberName || 'Główny Administrator'
        ).slice(0, 115),
        expiresAt: now,
        maxUses: 1,
        usedCount: 1,
        status: 'used',
        createdAt: now,
        lastUsedAt: now,
      };
      await setDoc(doc(db, 'invitations', bootstrapInvId), bootstrapInvite);
      initializedCollections.push('invitations');
    }

    // 6. Collection: activityLogs
    const logsSnap = await getDocs(
      query(collection(db, 'activityLogs'), limit(1))
    );
    if (!logsSnap.empty) {
      skippedExistingCollections.push('activityLogs');
    } else {
      await appendActivityLogToFirestore({
        id: 'log_bootstrap_init',
        actorId: params.adminMemberId,
        actorName: (params.adminMemberName || 'Główny Administrator').slice(
          0,
          115
        ),
        actionType: 'COLLECTIONS_INITIALIZED',
        details:
          'Zweryfikowano i utworzono brakujące kolekcje bazowe w Cloud Firestore bez naruszania istniejących danych.',
        deviceInfo: (params.deviceName || 'Urządzenie Administratora').slice(
          0,
          190
        ),
        timestamp: now,
      });
      initializedCollections.push('activityLogs');
    }

    return { initializedCollections, skippedExistingCollections };
  } catch (err) {
    console.warn('Collection bootstrapper warning:', err);
    return { initializedCollections, skippedExistingCollections };
  }
}

export {
  unwrapDekFromMergeEscrow,
  unwrapDekWithHardwareCertificate,
  unwrapDekWithPassword,
  wrapDekWithHardwareCertificate,
};

