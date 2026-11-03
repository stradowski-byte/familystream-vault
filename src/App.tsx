/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WifiOff,
  Search,
  Eraser,
} from 'lucide-react';
import {
  ActivityLog,
  BackupFileStructure,
  CoAdminPermissions,
  DecryptedPrivatePayload,
  DEFAULT_CATEGORIES,
  Device,
  getEffectiveCoAdminPermissions,
  InvitationMode,
  InvitationPurpose,
  isAdminOrCoAdmin,
  isCoAdmin,
  isPrimaryAdmin,
  Member,
  parseSubAccounts,
  PasswordRecord,
  SubAccountEntry,
  ThemeMode,
  VaultBootstrapStatus,
  VaultCategory,
  VaultConfig,
  VaultInvitation,
} from './types/vault';
import {
  appendActivityLogOnServer,
  consumeInvitationTokenOnServer,
  createInvitationOnServer,
  deleteDeviceOnServer,
  deleteInvitationOnServer,
  deleteMemberOnServer,
  deletePasswordOnServer,
  establishVaultSessionOnServer,
  fetchBootstrapStatusFromServer,
  fetchVaultStateFromServer,
  mergeMembersOnServer,
  rebindDeviceCertificateOnServer,
  replaceVaultStateOnServer,
  saveDeviceOnServer,
  saveDriveSyncFileIdOnServer,
  saveMemberOnServer,
  savePasswordOnServer,
  saveVaultConfigOnServer,
  ServerVaultState,
  setVaultApiSessionContext,
} from './lib/vaultApiClient';
import {
  connectGoogleDriveOAuthDirect,
  downloadVaultBackupFromDrive,
  getGoogleAccessToken,
  getOAuthClientId,
  pullSharedVaultStateFromAdminDriveForMember,
  pullVaultStateFromDriveAutoSync,
  pushVaultStateToDriveAutoSync,
  setConfiguredGoogleOAuthClientId,
  signInWithGoogleAdminDirect,
  uploadEncryptedVaultToDrive,
} from './lib/googleOAuthAndDriveSync';
import {
  decryptPrivateRecordPayload,
  decryptVaultBackupFile,
  encryptPrivateRecordPayload,
  encryptVaultBackupFile,
  generateRandomDekBase64,
  generateSaltBase64,
  hashPasswordForAuth,
  unwrapDekFromMergeEscrow,
  unwrapDekWithHardwareCertificate,
  unwrapDekWithPassword,
  wrapDekForMergeEscrow,
  wrapDekWithHardwareCertificate,
  wrapDekWithPassword,
} from './lib/crypto';
import {
  authenticateWithBiometrics,
  getDetectedDeviceProfile,
  getStoredBiometricProfile,
  registerBiometricUnlock,
  StoredBiometricProfile,
} from './lib/deviceAndBiometrics';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import { AdminTabId, TopBar } from './components/TopBar';
import { PasswordCard } from './components/PasswordCard';
import { AddPasswordModal } from './components/AddPasswordModal';
import { AuthAndBootstrapView } from './components/AuthAndBootstrapView';
import { AdminTab2AccountsAndDevices } from './components/AdminTab2AccountsAndDevices';
import { AdminTab3ConfigAndBackup } from './components/AdminTab3ConfigAndBackup';
import { AdminTab4GitHubAndUpdates } from './components/AdminTab4GitHubAndUpdates';
import { UserProfileView } from './components/UserProfileView';

function makeId(prefix: string): string {
  const bytes = new Uint8Array(8);
  window.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${hex}`;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install: installPWA } =
    usePWAInstall();
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false);

  const detectedDevice = useMemo(() => getDetectedDeviceProfile(), []);

  // Theme state (Low-Contrast: Soft Slate Dusk vs Warm Linen Paper)
  const [theme, setTheme] = useState<ThemeMode>('dusk');

  // Server-synchronized collections (Zero Firebase)
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<VaultBootstrapStatus | null>(null);
  const [syncEncryptionKey, setSyncEncryptionKey] = useState<string>('');
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [vaultConfig, setVaultConfig] = useState<VaultConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [passwords, setPasswords] = useState<PasswordRecord[]>([]);
  const [invitations, setInvitations] = useState<VaultInvitation[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [driveSyncFileId, setDriveSyncFileId] = useState<string>('');
  const [lastDriveAutoSyncAt, setLastDriveAutoSyncAt] = useState<string | null>(
    null
  );

  // Active authenticated session in memory
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [activeDekBase64, setActiveDekBase64] = useState<string | null>(null);
  const [activeMergedDeks, setActiveMergedDeks] = useState<string[]>([]);
  const [isVaultLockedByTimeout, setIsVaultLockedByTimeout] = useState(false);

  // Pending device / account authorization state
  const [pendingAuthState, setPendingAuthState] = useState<{
    member: Member;
    dekBase64: string;
    mergedDeksBase64: string[];
    passwordPlain?: string;
  } | null>(null);

  // Decrypted private records cache in memory (ONLY for currentMember)
  const [decryptedPrivateMap, setDecryptedPrivateMap] = useState<
    Record<string, DecryptedPrivatePayload>
  >({});

  // Biometric profile on this device
  const [biometricProfile, setBiometricProfile] =
    useState<StoredBiometricProfile | null>(() => getStoredBiometricProfile());

  // Direct Google OAuth token in memory (for automatic Google Drive sync)
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    () => getGoogleAccessToken()
  );

  // UI Navigation & Filtering state
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTabId>('vault');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>('all');
  const [vaultSectionFilter, setVaultSectionFilter] = useState<
    'all' | 'shared' | 'private' | 'revealed'
  >('all');
  const [sortBy, setSortBy] = useState<'alpha' | 'updated' | 'newest'>('alpha');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Clipboard auto-clear timer state
  const [clipboardCountdown, setClipboardCountdown] = useState<{
    secondsLeft: number;
    label: string;
  } | null>(null);
  const clipboardIntervalRef = useRef<number | null>(null);

  // Sync theme class with documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dusk') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Apply server state snapshot to React state
  const applyServerState = useCallback((state: ServerVaultState) => {
    setVaultConfig(state.vaultConfig || null);
    setMembers(Array.isArray(state.members) ? state.members : []);
    setDevices(Array.isArray(state.devices) ? state.devices : []);
    setPasswords(Array.isArray(state.passwords) ? state.passwords : []);
    setInvitations(Array.isArray(state.invitations) ? state.invitations : []);
    setActivityLogs(Array.isArray(state.activityLogs) ? state.activityLogs : []);
    if (state.driveSyncFileId) {
      setDriveSyncFileId(state.driveSyncFileId);
    }
    if (state.syncEncryptionKey) {
      setSyncEncryptionKey(state.syncEncryptionKey);
    }
    if (state.bootstrapStatus) {
      setBootstrapStatus(state.bootstrapStatus);
      if (state.bootstrapStatus.googleOAuthClientId) {
        setConfiguredGoogleOAuthClientId(
          state.bootstrapStatus.googleOAuthClientId
        );
      }
    }
  }, []);

  // Automatically push the latest server state to the single constant encrypted file `FamilyStreamVault_AutoSync.vault.enc` (AES-256-GCM) on Google Drive
  const triggerAutoSyncToGoogleDrive = useCallback(
    async (latestState: ServerVaultState, explicitToken?: string | null) => {
      const tokenToUse =
        explicitToken || googleAccessToken || getGoogleAccessToken();
      if (!tokenToUse) return;

      try {
        const { fileId, modifiedTime } = await pushVaultStateToDriveAutoSync({
          accessToken: tokenToUse,
          state: latestState,
          knownFileId: latestState.driveSyncFileId || driveSyncFileId,
          syncEncryptionKey:
            latestState.syncEncryptionKey || syncEncryptionKey,
        });
        setLastDriveAutoSyncAt(modifiedTime);
        if (fileId && fileId !== latestState.driveSyncFileId) {
          setDriveSyncFileId(fileId);
          await saveDriveSyncFileIdOnServer(fileId).catch(() => {});
        }
      } catch (err) {
        console.warn('Google Drive Auto-Sync background warning:', err);
      }
    },
    [googleAccessToken, driveSyncFileId, syncEncryptionKey]
  );

  // Start clipboard auto-clear countdown
  const startClipboardCountdown = (seconds: number, label: string) => {
    if (clipboardIntervalRef.current) {
      window.clearInterval(clipboardIntervalRef.current);
    }
    setClipboardCountdown({ secondsLeft: seconds, label });
    clipboardIntervalRef.current = window.setInterval(async () => {
      setClipboardCountdown((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          if (clipboardIntervalRef.current) {
            window.clearInterval(clipboardIntervalRef.current);
          }
          navigator.clipboard.writeText('').catch(() => {});
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  };

  // Non-destructive application update handler
  const handleTriggerAppUpdate = useCallback(async () => {
    setIsUpdatingApp(true);
    try {
      setVaultApiSessionContext({
        deviceFingerprint: detectedDevice.deviceFingerprint,
      });

      const [latestBoot, latestState] = await Promise.all([
        fetchBootstrapStatusFromServer().catch(() => null),
        fetchVaultStateFromServer(),
      ]);
      if (latestBoot) {
        setBootstrapStatus(latestBoot);
        if (latestBoot.googleOAuthClientId) {
          setConfiguredGoogleOAuthClientId(latestBoot.googleOAuthClientId);
        }
      }
      applyServerState(latestState);

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }

      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        for (const key of cacheKeys) {
          await window.caches.delete(key).catch(() => {});
        }
      }

      showToast(
        'Zaktualizowano aplikację i zsynchronizowano bazę z serwerem (dane loginów zachowane)!'
      );
    } catch (err) {
      console.warn('App update check error:', err);
      showToast(
        'Sprawdzono aktualizacje — posiadasz najnowszą wersję aplikacji.'
      );
    } finally {
      setIsUpdatingApp(false);
    }
  }, [applyServerState, detectedDevice.deviceFingerprint]);

  const handleInstallPWAOrGuide = useCallback(async () => {
    if (isInstallable) {
      await installPWA();
    } else {
      setShowIOSInstallModal(true);
    }
  }, [isInstallable, installPWA]);

  // Poll server state on initial boot and every 4 seconds for real-time family sync
  useEffect(() => {
    let active = true;
    setVaultApiSessionContext({
      deviceFingerprint: detectedDevice.deviceFingerprint,
    });

    const loadFromServer = async () => {
      try {
        const [boot, state] = await Promise.all([
          fetchBootstrapStatusFromServer().catch(() => null),
          fetchVaultStateFromServer(),
        ]);
        if (active) {
          if (boot) {
            setBootstrapStatus(boot);
            if (boot.googleOAuthClientId) {
              setConfiguredGoogleOAuthClientId(boot.googleOAuthClientId);
            }
          }
          applyServerState(state);
          setIsInitialLoading(false);
        }
      } catch (err) {
        console.warn('Błąd pobierania stanu z serwera:', err);
        if (active) setIsInitialLoading(false);
      }
    };

    loadFromServer();
    const intervalId = window.setInterval(loadFromServer, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [applyServerState, detectedDevice.deviceFingerprint]);

  // Current logged-in member object
  const currentMember = useMemo(() => {
    const found = members.find((m) => m.id === currentMemberId);
    if (!found) return null;
    const isAdminUser =
      found.role === 'admin' ||
      found.username.toLowerCase() === 'admin' ||
      found.id === vaultConfig?.adminMemberId;
    if (isAdminUser) {
      return {
        ...found,
        role: 'admin' as const,
        status: 'active' as const,
      };
    }
    return found.status === 'active' ? found : null;
  }, [members, currentMemberId, vaultConfig?.adminMemberId]);

  // Watch pendingAuthState: if Admin or Co-Admin approves the member & device, automatically seal the Hardware Certificate Envelope and unlock the vault!
  useEffect(() => {
    if (!pendingAuthState) return;
    const liveMember = members.find((m) => m.id === pendingAuthState.member.id);
    if (!liveMember) return;

    const liveDevice = devices.find(
      (d) =>
        d.memberId === liveMember.id &&
        d.deviceFingerprint === detectedDevice.deviceFingerprint
    );

    if (
      liveMember.status === 'active' &&
      liveDevice &&
      liveDevice.status === 'approved'
    ) {
      const finalizeHardwareUnlock = async () => {
        if (
          pendingAuthState.passwordPlain &&
          liveDevice.deviceApprovalToken &&
          !liveDevice.hardwareWrappedDek
        ) {
          try {
            const hwWrapped = await wrapDekWithHardwareCertificate(
              pendingAuthState.dekBase64,
              {
                password: pendingAuthState.passwordPlain,
                saltBase64: liveMember.pbkdf2Salt,
                deviceFingerprint: detectedDevice.deviceFingerprint,
                hardwareModelOs:
                  liveDevice.hardwareModelOs || detectedDevice.hardwareModelOs,
                hardwareDeviceType:
                  liveDevice.hardwareDeviceType ||
                  detectedDevice.hardwareDeviceType,
                clientMode: detectedDevice.clientMode,
                deviceApprovalToken: liveDevice.deviceApprovalToken,
              }
            );
            const updatedState = await saveDeviceOnServer(liveDevice.id, {
              hardwareWrappedDek: hwWrapped,
              hardwareModelOs: detectedDevice.hardwareModelOs,
              hardwareDeviceType: detectedDevice.hardwareDeviceType,
              hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
              lastSeenAt: new Date().toISOString(),
            });
            applyServerState(updatedState);
          } catch (err) {
            console.warn('Automatic hardware envelope seal warning:', err);
          }
        }
        setCurrentMemberId(liveMember.id);
        setActiveDekBase64(pendingAuthState.dekBase64);
        setActiveMergedDeks(pendingAuthState.mergedDeksBase64);
        setPendingAuthState(null);
        showToast(
          'Certyfikat sprzętowy został wydany, a Twoje konto i urządzenie zaakceptowane! Skarbiec odblokowany.'
        );
      };
      finalizeHardwareUnlock();
    }
  }, [
    members,
    devices,
    pendingAuthState,
    detectedDevice,
    applyServerState,
  ]);

  // Decrypt current user's private records in RAM
  useEffect(() => {
    let cancelled = false;
    async function decryptOwnerRecords() {
      if (!currentMember || !activeDekBase64) {
        setDecryptedPrivateMap({});
        return;
      }
      const myPrivateRecords = passwords.filter(
        (p) => p.section === 'private' && p.ownerId === currentMember.id
      );
      const nextMap: Record<string, DecryptedPrivatePayload> = {};
      for (const rec of myPrivateRecords) {
        const decrypted = await decryptPrivateRecordPayload(
          rec.encryptedPayload,
          activeDekBase64,
          activeMergedDeks
        );
        if (decrypted) {
          nextMap[rec.id] = decrypted;
        }
      }
      if (!cancelled) {
        setDecryptedPrivateMap(nextMap);
      }
    }
    decryptOwnerRecords();
    return () => {
      cancelled = true;
    };
  }, [passwords, currentMember, activeDekBase64, activeMergedDeks]);

  // Auto-Lock inactivity timer
  useEffect(() => {
    if (!currentMember || isVaultLockedByTimeout) return;
    const timeoutMinutes = vaultConfig?.autoLockMinutes || 15;
    let timerId: number;

    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        setActiveDekBase64(null);
        setIsVaultLockedByTimeout(true);
      }, timeoutMinutes * 60 * 1000);
    };

    resetTimer();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    return () => {
      window.clearTimeout(timerId);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [currentMember, isVaultLockedByTimeout, vaultConfig?.autoLockMinutes]);

  // Categories parsed from vaultConfig
  const categories: VaultCategory[] = useMemo(() => {
    if (!vaultConfig?.categoriesJson) return DEFAULT_CATEGORIES;
    try {
      const parsed = JSON.parse(vaultConfig.categoriesJson) as VaultCategory[];
      return Array.isArray(parsed) && parsed.length > 0
        ? parsed
        : DEFAULT_CATEGORIES;
    } catch {
      return DEFAULT_CATEGORIES;
    }
  }, [vaultConfig?.categoriesJson]);

  // Helper to log activity on the server and trigger Google Drive Auto-Sync
  const logActivityAndSync = async (
    actorId: string,
    actorName: string,
    actionType: string,
    details: string,
    explicitToken?: string | null
  ) => {
    const logId = makeId('log');
    const entry: ActivityLog = {
      id: logId,
      actorId,
      actorName,
      actionType,
      details: details.slice(0, 490),
      deviceInfo: detectedDevice.deviceName.slice(0, 190),
      timestamp: new Date().toISOString(),
    };
    const updatedState = await appendActivityLogOnServer(entry);
    applyServerState(updatedState);
    await triggerAutoSyncToGoogleDrive(updatedState, explicitToken);
    return updatedState;
  };

  // 1. FIRST-ADMIN CLAIM & ADMIN GOOGLE LOGIN (Always checks Google Drive for existing Vault first!)
  const handleAdminGoogleLogin = async (options?: {
    email?: string;
    displayName?: string;
    masterPassword?: string;
    skipOAuthPopup?: boolean;
  }) => {
    const identity = await signInWithGoogleAdminDirect({
      email: options?.email,
      displayName: options?.displayName,
      skipOAuthPopup: options?.skipOAuthPopup,
    });
    if (identity.accessToken) {
      setGoogleAccessToken(identity.accessToken);
    }

    const sessionHandshake = await establishVaultSessionOnServer({
      mode: 'admin_google',
      googleEmail: identity.email,
      googleUid: identity.uid,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
    });
    let serverState = sessionHandshake.state;
    let activeSyncKey =
      sessionHandshake.syncEncryptionKey || syncEncryptionKey;

    // ALWAYS check the selected Google Account's Google Drive for an existing `FamilyStreamVault_AutoSync.vault.enc` file!
    let restoredExistingVaultFromDrive = false;
    if (identity.accessToken) {
      try {
        const pulled = await pullVaultStateFromDriveAutoSync(
          identity.accessToken,
          activeSyncKey
        );
        if (
          pulled &&
          pulled.state &&
          Array.isArray(pulled.state.members) &&
          pulled.state.members.length > 0
        ) {
          restoredExistingVaultFromDrive = true;
          if (pulled.syncEncryptionKey) {
            activeSyncKey = pulled.syncEncryptionKey;
            setSyncEncryptionKey(pulled.syncEncryptionKey);
          }
          serverState = await replaceVaultStateOnServer({
            ...pulled.state,
            driveSyncFileId: pulled.fileId,
            syncEncryptionKey: activeSyncKey,
          });
          setDriveSyncFileId(pulled.fileId);
          setLastDriveAutoSyncAt(new Date().toISOString());
        }
      } catch (err) {
        console.warn('Sprawdzanie Google Drive przy logowaniu:', err);
      }
    }

    const now = new Date().toISOString();
    let adminMember = serverState.members.find(
      (m) => m.role === 'admin' || m.username.toLowerCase() === 'admin'
    );
    let dekBase64: string;
    let isFirstBootstrap = false;

    if (!adminMember) {
      isFirstBootstrap = true;
      const adminMemberId =
        serverState.vaultConfig?.adminMemberId || makeId('mem_admin');
      const salt = generateSaltBase64(16);
      const effectivePassword =
        options?.masterPassword && options.masterPassword.trim().length >= 4
          ? options.masterPassword.trim()
          : `google_admin_${identity.uid}_${salt}`;
      const passwordHash = await hashPasswordForAuth(effectivePassword, salt);
      dekBase64 = generateRandomDekBase64();
      const wrappedMasterKey = await wrapDekWithPassword(
        dekBase64,
        effectivePassword,
        salt
      );
      const vaultEscrowKey = await wrapDekForMergeEscrow(dekBase64, salt);

      adminMember = {
        id: adminMemberId,
        fullName: identity.displayName || 'Główny Administrator',
        username: 'admin',
        passwordHash,
        pbkdf2Salt: salt,
        wrappedMasterKey,
        vaultEscrowKey,
        mergedVaultKeysJson: '[]',
        role: 'admin',
        status: 'active',
        googleUid: identity.uid,
        createdAt: now,
        updatedAt: now,
      };

      const configDoc: VaultConfig = {
        initialized: true,
        adminUid: identity.uid,
        adminEmail: identity.email,
        adminMemberId,
        templatesLoaded: false,
        categoriesJson: JSON.stringify(DEFAULT_CATEGORIES),
        defaultTheme: theme,
        clipboardClearSeconds: 30,
        autoLockMinutes: 15,
        createdAt: serverState.vaultConfig?.createdAt || now,
        updatedAt: now,
      };

      await saveVaultConfigOnServer(configDoc);
      serverState = await saveMemberOnServer(adminMember.id, adminMember);
    } else {
      const shouldUpdateIdentity =
        adminMember.role !== 'admin' ||
        adminMember.status !== 'active' ||
        adminMember.googleUid !== identity.uid ||
        (identity.displayName &&
          adminMember.fullName === 'Główny Administrator');

      if (shouldUpdateIdentity) {
        adminMember = {
          ...adminMember,
          fullName:
            adminMember.fullName === 'Główny Administrator' &&
            identity.displayName
              ? identity.displayName
              : adminMember.fullName,
          role: 'admin',
          status: 'active',
          googleUid: identity.uid,
          updatedAt: now,
        };
        serverState = await saveMemberOnServer(adminMember.id, adminMember);
      }

      dekBase64 = await unwrapDekFromMergeEscrow(
        adminMember.vaultEscrowKey,
        adminMember.pbkdf2Salt
      );

      const isLocalPlaceholderEmail =
        !serverState.vaultConfig?.adminEmail ||
        serverState.vaultConfig.adminEmail.endsWith('.local');

      if (
        !serverState.vaultConfig ||
        !serverState.vaultConfig.initialized ||
        isLocalPlaceholderEmail
      ) {
        const configDoc: VaultConfig = {
          initialized: true,
          adminUid: identity.uid,
          adminEmail: identity.email,
          adminMemberId: adminMember.id,
          templatesLoaded: serverState.vaultConfig?.templatesLoaded ?? false,
          categoriesJson:
            serverState.vaultConfig?.categoriesJson ||
            JSON.stringify(DEFAULT_CATEGORIES),
          defaultTheme: serverState.vaultConfig?.defaultTheme || theme,
          clipboardClearSeconds:
            serverState.vaultConfig?.clipboardClearSeconds || 30,
          autoLockMinutes: serverState.vaultConfig?.autoLockMinutes || 15,
          createdAt: serverState.vaultConfig?.createdAt || now,
          updatedAt: now,
        };
        serverState = await saveVaultConfigOnServer(configDoc);
      }
    }

    // Automatically pair & approve current device for Admin with Hardware Profile
    const existingDev = serverState.devices.find(
      (d) =>
        d.memberId === adminMember!.id &&
        d.deviceFingerprint === detectedDevice.deviceFingerprint
    );

    if (!existingDev) {
      const devId = makeId('dev');
      const newAdminDev: Device = {
        id: devId,
        memberId: adminMember.id,
        memberName: adminMember.fullName,
        username: adminMember.username,
        deviceFingerprint: detectedDevice.deviceFingerprint,
        deviceName: detectedDevice.deviceName,
        customLabel:
          detectedDevice.clientMode === 'pwa'
            ? 'Główne urządzenie PWA Admina'
            : 'Przeglądarka Admina',
        clientMode: detectedDevice.clientMode,
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
        status: 'approved',
        webAuthnCredentialId: '',
        requestedAt: now,
        lastSeenAt: now,
      };
      serverState = await saveDeviceOnServer(devId, newAdminDev);
    } else if (
      existingDev.status !== 'approved' ||
      !existingDev.hardwareSignatureHash
    ) {
      serverState = await saveDeviceOnServer(existingDev.id, {
        status: 'approved',
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
        lastSeenAt: now,
      });
    }

    applyServerState(serverState);

    let mergedDeks: string[] = [];
    try {
      const parsed = JSON.parse(adminMember.mergedVaultKeysJson || '[]');
      if (Array.isArray(parsed)) mergedDeks = parsed;
    } catch {
      mergedDeks = [];
    }

    await logActivityAndSync(
      adminMember.id,
      adminMember.fullName,
      isFirstBootstrap ? 'VAULT_BOOTSTRAP' : 'ADMIN_GOOGLE_LOGIN',
      isFirstBootstrap
        ? `Zainicjalizowano nowy skarbiec dla Pierwszego Administratora (${identity.email}) i zapisano plik na Google Drive.`
        : restoredExistingVaultFromDrive
          ? `Wykryto istniejący skarbiec na Google Drive (${identity.email}) — pobrano i odblokowano bazę.`
          : `Główny Administrator zalogował się kontem Google (${identity.email}) i zsynchronizował Google Drive.`,
      identity.accessToken
    );

    setCurrentMemberId(adminMember.id);
    setActiveDekBase64(dekBase64);
    setActiveMergedDeks(mergedDeks);
    setIsVaultLockedByTimeout(false);
    showToast(
      restoredExistingVaultFromDrive
        ? `Wykryto istniejący skarbiec na Google Drive (${identity.email}) i przywrócono bazę!`
        : isFirstBootstrap
          ? `Utworzono nowy skarbiec dla ${identity.email} i zapisano na Google Drive!`
          : `Zalogowano przez Google jako ${identity.email}!`
    );
  };

  // Sync shared encrypted vault file from Admin's Google Drive when a Family Member opens a customized invitation link inside the installed PWA
  const handleSyncSharedVaultFromAdminDrive = useCallback(
    async (params: {
      driveFileId?: string;
      syncEncryptionKey: string;
      encryptedSnapshot?: string;
      inviteToken?: string;
    }): Promise<boolean> => {
      const pulled = await pullSharedVaultStateFromAdminDriveForMember({
        driveFileId: params.driveFileId,
        syncEncryptionKey: params.syncEncryptionKey,
        encryptedSnapshot: params.encryptedSnapshot,
      });
      if (
        !pulled ||
        !pulled.state ||
        !Array.isArray(pulled.state.members) ||
        pulled.state.members.length === 0
      ) {
        return false;
      }

      const updatedState = await replaceVaultStateOnServer({
        ...pulled.state,
        driveSyncFileId: params.driveFileId || pulled.state.driveSyncFileId,
        syncEncryptionKey: params.syncEncryptionKey,
      });
      applyServerState(updatedState);
      return true;
    },
    [applyServerState]
  );

  // Reset local standalone state (e.g. clearing old `adm***@familystream.local` cache on phone)
  const handleResetLocalVaultInstance = useCallback(async () => {
    try {
      window.localStorage.removeItem('fsv_standalone_state_v1');
      window.localStorage.removeItem('fsv_standalone_session_v1');
      window.localStorage.removeItem('fsv_pwa_handoff_v1');
      const emptyState = await replaceVaultStateOnServer({
        vaultConfig: null,
        members: [],
        devices: [],
        passwords: [],
        invitations: [],
        activityLogs: [],
        driveSyncFileId: '',
      });
      applyServerState(emptyState);
      const latestBoot = await fetchBootstrapStatusFromServer().catch(
        () => null
      );
      if (latestBoot) setBootstrapStatus(latestBoot);
      showToast(
        'Wyczyszczono lokalny stan testowy! Kliknij teraz „Zaloguj przez Google”, aby wybrać swoje konto Google.'
      );
    } catch (err) {
      console.warn('Reset local instance error:', err);
    }
  }, [applyServerState]);

  
  // 2. LOGIN WITH INTERNAL CREDENTIALS (Family Members, Co-Admins & Admin)
  const handleLoginWithCredentials = async (
    username: string,
    password: string
  ) => {
    let serverState = await fetchVaultStateFromServer();
    applyServerState(serverState);

    const member = serverState.members.find(
      (m) =>
        m.username.toLowerCase() === username.toLowerCase() &&
        m.status !== 'merged'
    );
    if (!member) {
      throw new Error(
        'Nie znaleziono konta o podanym loginie. Jeśli nie masz jeszcze konta, poproś Administratora lub Zaufanego Opiekuna o link zaproszeniowy.'
      );
    }

    const computedHash = await hashPasswordForAuth(password, member.pbkdf2Salt);
    if (computedHash !== member.passwordHash) {
      throw new Error(
        'Nieprawidłowe hasło. Jeśli zapomniałeś hasła (np. Mama), zadzwoń do Administratora lub Zaufanego Opiekuna (np. Brata) po reset hasła lub link ratunkowy.'
      );
    }

    const sessionRes = await establishVaultSessionOnServer({
      mode: 'member_login',
      memberId: member.id,
      username: member.username,
      passwordHash: computedHash,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
    });
    serverState = sessionRes.state;

    let mergedDeks: string[] = [];
    try {
      const parsed = JSON.parse(member.mergedVaultKeysJson || '[]');
      if (Array.isArray(parsed)) mergedDeks = parsed;
    } catch {
      mergedDeks = [];
    }

    const existingDevice =
      serverState.devices.find(
        (d) =>
          d.memberId === member.id &&
          d.deviceFingerprint === detectedDevice.deviceFingerprint
      ) || null;

    if (
      member.role === 'admin' ||
      member.username.toLowerCase() === 'admin' ||
      member.id === serverState.vaultConfig?.adminMemberId
    ) {
      const dekBase64 = await unwrapDekWithPassword(
        member.wrappedMasterKey,
        password,
        member.pbkdf2Salt
      );
      const now = new Date().toISOString();
      if (!existingDevice) {
        const devId = makeId('dev');
        const adminDev: Device = {
          id: devId,
          memberId: member.id,
          memberName: member.fullName,
          username: member.username,
          deviceFingerprint: detectedDevice.deviceFingerprint,
          deviceName: detectedDevice.deviceName,
          customLabel:
            detectedDevice.clientMode === 'pwa'
              ? 'Urządzenie PWA Admina'
              : 'Przeglądarka Admina',
          clientMode: detectedDevice.clientMode,
          hardwareModelOs: detectedDevice.hardwareModelOs,
          hardwareDeviceType: detectedDevice.hardwareDeviceType,
          hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
          status: 'approved',
          webAuthnCredentialId: '',
          requestedAt: now,
          lastSeenAt: now,
        };
        serverState = await saveDeviceOnServer(devId, adminDev);
      } else if (existingDevice.status !== 'approved') {
        serverState = await saveDeviceOnServer(existingDevice.id, {
          status: 'approved',
          hardwareModelOs: detectedDevice.hardwareModelOs,
          hardwareDeviceType: detectedDevice.hardwareDeviceType,
          hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
          lastSeenAt: now,
        });
      }

      applyServerState(serverState);
      setCurrentMemberId(member.id);
      setActiveDekBase64(dekBase64);
      setActiveMergedDeks(mergedDeks);
      setIsVaultLockedByTimeout(false);
      showToast(`Zalogowano jako Administrator (${member.fullName})!`);
      return;
    }

    // HARDCORE HARDWARE-BOUND CRYPTOGRAPHY FOR FAMILY MEMBERS & CO-ADMINS:
    // Only an APPROVED device with a server-issued `deviceApprovalToken` can unlock private passwords!
    if (
      member.status === 'active' &&
      existingDevice &&
      existingDevice.status === 'approved' &&
      existingDevice.deviceApprovalToken
    ) {
      const now = new Date().toISOString();
      const hwParams = {
        password,
        saltBase64: member.pbkdf2Salt,
        deviceFingerprint: detectedDevice.deviceFingerprint,
        hardwareModelOs:
          existingDevice.hardwareModelOs || detectedDevice.hardwareModelOs,
        hardwareDeviceType:
          existingDevice.hardwareDeviceType ||
          detectedDevice.hardwareDeviceType,
        clientMode: detectedDevice.clientMode,
        deviceApprovalToken: existingDevice.deviceApprovalToken,
      };

      let dekBase64: string;
      if (existingDevice.hardwareWrappedDek) {
        try {
          // Derive Hardware-Bound AES-256-GCM key from Password + OS-Free Hardware Model + Device ID + Mode + Server Certificate Token
          dekBase64 = await unwrapDekWithHardwareCertificate(
            existingDevice.hardwareWrappedDek,
            hwParams
          );
          const needsModelNormalization =
            existingDevice.hardwareModelOs !== detectedDevice.hardwareModelOs ||
            existingDevice.hardwareSignatureHash !==
              detectedDevice.hardwareSignatureHash;

          const reSealedDek = needsModelNormalization
            ? await wrapDekWithHardwareCertificate(dekBase64, {
                ...hwParams,
                hardwareModelOs: detectedDevice.hardwareModelOs,
                hardwareDeviceType: detectedDevice.hardwareDeviceType,
              })
            : existingDevice.hardwareWrappedDek;

          serverState = await saveDeviceOnServer(existingDevice.id, {
            lastSeenAt: now,
            clientMode: detectedDevice.clientMode,
            hardwareModelOs: detectedDevice.hardwareModelOs,
            hardwareDeviceType: detectedDevice.hardwareDeviceType,
            hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
            hardwareWrappedDek: reSealedDek,
          });
        } catch {
          // Self-healing migration if OS version string changed before OS-free normalization:
          // Verify password via wrappedMasterKey and re-seal with the OS-independent hardware model
          dekBase64 = await unwrapDekWithPassword(
            member.wrappedMasterKey,
            password,
            member.pbkdf2Salt
          );
          const reSealedHardwareDek = await wrapDekWithHardwareCertificate(
            dekBase64,
            {
              ...hwParams,
              hardwareModelOs: detectedDevice.hardwareModelOs,
              hardwareDeviceType: detectedDevice.hardwareDeviceType,
            }
          );
          serverState = await saveDeviceOnServer(existingDevice.id, {
            lastSeenAt: now,
            clientMode: detectedDevice.clientMode,
            hardwareModelOs: detectedDevice.hardwareModelOs,
            hardwareDeviceType: detectedDevice.hardwareDeviceType,
            hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
            hardwareWrappedDek: reSealedHardwareDek,
          });
        }
      } else {
        // First login after Admin/Co-Admin approved this device or rebound its certificate:
        // Unwrap master DEK and immediately seal it into a Hardware-Bound Envelope for this specific device
        dekBase64 = await unwrapDekWithPassword(
          member.wrappedMasterKey,
          password,
          member.pbkdf2Salt
        );
        const sealedHardwareDek = await wrapDekWithHardwareCertificate(
          dekBase64,
          {
            ...hwParams,
            hardwareModelOs: detectedDevice.hardwareModelOs,
            hardwareDeviceType: detectedDevice.hardwareDeviceType,
          }
        );
        serverState = await saveDeviceOnServer(existingDevice.id, {
          lastSeenAt: now,
          clientMode: detectedDevice.clientMode,
          hardwareModelOs: detectedDevice.hardwareModelOs,
          hardwareDeviceType: detectedDevice.hardwareDeviceType,
          hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
          hardwareWrappedDek: sealedHardwareDek,
        });
      }

      applyServerState(serverState);

      await logActivityAndSync(
        member.id,
        member.fullName,
        'MEMBER_LOGIN',
        `Zalogowano z weryfikacją Certyfikatu Sprzętowego (${
          existingDevice.deviceCertificateFingerprint ||
          detectedDevice.hardwareSignatureHash
        } · ${
          detectedDevice.clientMode === 'pwa' ? 'Aplikacja PWA' : 'Przeglądarka'
        }).`
      );

      setCurrentMemberId(member.id);
      setActiveDekBase64(dekBase64);
      setActiveMergedDeks(mergedDeks);
      setIsVaultLockedByTimeout(false);
      showToast(
        `Zweryfikowano Certyfikat Sprzętowy (${
          existingDevice.deviceCertificateFingerprint ||
          detectedDevice.hardwareSignatureHash
        }) — Witaj, ${member.fullName}!`
      );
      return;
    }

    // Device is NOT approved yet — hold in pendingAuthState until Admin/Co-Admin approves & issues certificate
    const pendingDekBase64 = await unwrapDekWithPassword(
      member.wrappedMasterKey,
      password,
      member.pbkdf2Salt
    );

    setPendingAuthState({
      member,
      dekBase64: pendingDekBase64,
      mergedDeksBase64: mergedDeks,
      passwordPlain: password,
    });
  };

  // 3A. REGISTER NEW FAMILY MEMBER VIA INVITATION LINK ("Załóż mi konto")
  const handleRegisterMemberAccountWithInvite = async (params: {
    inviteToken: string;
    fullName: string;
    username: string;
    password: string;
    setupBiometrics: boolean;
  }) => {
    const serverState = await fetchVaultStateFromServer();
    const duplicate = serverState.members.find(
      (m) =>
        m.username.toLowerCase() === params.username.toLowerCase() &&
        m.status !== 'merged'
    );
    if (duplicate) {
      throw new Error(
        `Konto z loginem „${params.username}” już istnieje w skarbcu. Wybierz inny login lub przejdź do logowania.`
      );
    }

    const now = new Date().toISOString();
    const memberId = makeId('mem');
    const salt = generateSaltBase64(16);
    const passwordHash = await hashPasswordForAuth(params.password, salt);
    const dekBase64 = generateRandomDekBase64();
    const wrappedMasterKey = await wrapDekWithPassword(
      dekBase64,
      params.password,
      salt
    );
    const vaultEscrowKey = await wrapDekForMergeEscrow(dekBase64, salt);

    // Verify & establish bootstrap session with the invitation token
    await establishVaultSessionOnServer({
      mode: 'member_register',
      memberId,
      username: params.username,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
      inviteToken: params.inviteToken,
    });

    // Consume invitation token on server
    await consumeInvitationTokenOnServer(params.inviteToken);

    let credentialId = '';
    if (params.setupBiometrics) {
      try {
        const bioRes = await registerBiometricUnlock({
          memberId,
          username: params.username,
          fullName: params.fullName,
          dekBase64,
          mergedDeksBase64: [],
        });
        credentialId = bioRes.credentialId;
        setBiometricProfile(getStoredBiometricProfile());
      } catch (err) {
        console.warn('Opcjonalna rejestracja biometrii pominięta:', err);
      }
    }

    const newMember: Member = {
      id: memberId,
      fullName: params.fullName,
      username: params.username,
      passwordHash,
      pbkdf2Salt: salt,
      wrappedMasterKey,
      vaultEscrowKey,
      mergedVaultKeysJson: '[]',
      role: 'member',
      status: 'pending',
      googleUid: '',
      invitedByToken: params.inviteToken,
      createdAt: now,
      updatedAt: now,
    };

    const devId = makeId('dev');
    const newDevice: Device = {
      id: devId,
      memberId,
      memberName: params.fullName,
      username: params.username,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
      customLabel:
        detectedDevice.clientMode === 'pwa'
          ? 'Aplikacja PWA (Z zaproszenia)'
          : 'Przeglądarka (Z zaproszenia)',
      clientMode: detectedDevice.clientMode,
      hardwareModelOs: detectedDevice.hardwareModelOs,
      hardwareDeviceType: detectedDevice.hardwareDeviceType,
      hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
      status: 'pending',
      webAuthnCredentialId: credentialId,
      requestedAt: now,
      lastSeenAt: now,
    };

    await saveMemberOnServer(memberId, newMember);
    await saveDeviceOnServer(devId, newDevice);

    await logActivityAndSync(
      memberId,
      params.fullName,
      'MEMBER_INVITE_REGISTER',
      `Domownik ${params.fullName} (login: ${params.username}, sprzęt: ${detectedDevice.hardwareSignatureHash}) kliknął „Załóż mi konto” z linku zaproszeniowego i oczekuje na wydanie Certyfikatu Sprzętowego.`
    );

    setPendingAuthState({
      member: newMember,
      dekBase64,
      mergedDeksBase64: [],
      passwordPlain: params.password,
    });
    showToast(
      'Konto zostało utworzone z zaproszenia! Poczekaj na zatwierdzenie i wydanie Certyfikatu Sprzętowego przez Administratora lub Opiekuna.'
    );
  };

  // 3B. RECOVER EXISTING MEMBER ACCOUNT VIA RECOVERY LINK (np. dla Mamy od Brata lub Admina)
  const handleRecoverMemberAccountWithInvite = async (params: {
    inviteToken: string;
    targetMemberId: string;
    newUsername: string;
    newPassword: string;
    setupBiometrics: boolean;
  }) => {
    const serverState = await fetchVaultStateFromServer();
    const targetMember = serverState.members.find(
      (m) => m.id === params.targetMemberId
    );
    if (!targetMember) {
      throw new Error('Nie znaleziono konta domownika powiązanego z tym linkiem.');
    }

    // Check username collision with other members
    const duplicate = serverState.members.find(
      (m) =>
        m.id !== targetMember.id &&
        m.username.toLowerCase() === params.newUsername.toLowerCase() &&
        m.status !== 'merged'
    );
    if (duplicate) {
      throw new Error('Ten login jest już zajęty przez innego domownika.');
    }

    await establishVaultSessionOnServer({
      mode: 'member_register',
      memberId: targetMember.id,
      username: params.newUsername,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
      inviteToken: params.inviteToken,
    });

    await consumeInvitationTokenOnServer(params.inviteToken);

    // Recover existing DEK from vaultEscrowKey so the member keeps all private entries!
    const dekBase64 = await unwrapDekFromMergeEscrow(
      targetMember.vaultEscrowKey,
      targetMember.pbkdf2Salt
    );
    const newPasswordHash = await hashPasswordForAuth(
      params.newPassword,
      targetMember.pbkdf2Salt
    );
    const newWrappedMasterKey = await wrapDekWithPassword(
      dekBase64,
      params.newPassword,
      targetMember.pbkdf2Salt
    );

    const now = new Date().toISOString();
    const updatedMember: Member = {
      ...targetMember,
      username: params.newUsername,
      passwordHash: newPasswordHash,
      wrappedMasterKey: newWrappedMasterKey,
      status: 'active',
      updatedAt: now,
    };

    await saveMemberOnServer(targetMember.id, updatedMember);

    let mergedDeks: string[] = [];
    try {
      const parsed = JSON.parse(targetMember.mergedVaultKeysJson || '[]');
      if (Array.isArray(parsed)) mergedDeks = parsed;
    } catch {
      mergedDeks = [];
    }

    let credentialId = '';
    if (params.setupBiometrics) {
      try {
        const bioRes = await registerBiometricUnlock({
          memberId: targetMember.id,
          username: params.newUsername,
          fullName: targetMember.fullName,
          dekBase64,
          mergedDeksBase64: mergedDeks,
        });
        credentialId = bioRes.credentialId;
        setBiometricProfile(getStoredBiometricProfile());
      } catch (err) {
        console.warn('Biometria podczas odzyskiwania konta pominięta:', err);
      }
    }

    // Automatically approve current device and seal its Hardware-Bound Certificate Envelope since recovery link was issued by Admin/Co-Admin
    const existingDev = serverState.devices.find(
      (d) =>
        d.memberId === targetMember.id &&
        d.deviceFingerprint === detectedDevice.deviceFingerprint
    );

    let updatedAfterDev: ServerVaultState;
    let targetDevId: string;

    if (existingDev) {
      targetDevId = existingDev.id;
      updatedAfterDev = await saveDeviceOnServer(existingDev.id, {
        status: 'approved',
        username: params.newUsername,
        clientMode: detectedDevice.clientMode,
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
        hardwareWrappedDek: '',
        webAuthnCredentialId: credentialId || existingDev.webAuthnCredentialId,
        lastSeenAt: now,
      });
    } else {
      targetDevId = makeId('dev');
      updatedAfterDev = await saveDeviceOnServer(targetDevId, {
        id: targetDevId,
        memberId: targetMember.id,
        memberName: targetMember.fullName,
        username: params.newUsername,
        deviceFingerprint: detectedDevice.deviceFingerprint,
        deviceName: detectedDevice.deviceName,
        customLabel: 'Odblokowane linkiem ratunkowym',
        clientMode: detectedDevice.clientMode,
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
        status: 'approved',
        webAuthnCredentialId: credentialId,
        requestedAt: now,
        lastSeenAt: now,
      });
    }

    const approvedDevWithToken = updatedAfterDev.devices.find(
      (d) => d.id === targetDevId
    );
    if (approvedDevWithToken && approvedDevWithToken.deviceApprovalToken) {
      const sealedHwDek = await wrapDekWithHardwareCertificate(dekBase64, {
        password: params.newPassword,
        saltBase64: targetMember.pbkdf2Salt,
        deviceFingerprint: detectedDevice.deviceFingerprint,
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        clientMode: detectedDevice.clientMode,
        deviceApprovalToken: approvedDevWithToken.deviceApprovalToken,
      });
      await saveDeviceOnServer(targetDevId, {
        hardwareWrappedDek: sealedHwDek,
      });
    }

    await establishVaultSessionOnServer({
      mode: 'member_login',
      memberId: targetMember.id,
      username: params.newUsername,
      passwordHash: newPasswordHash,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
    });

    await logActivityAndSync(
      targetMember.id,
      targetMember.fullName,
      'MEMBER_ACCOUNT_RECOVERED',
      `Domownik ${targetMember.fullName} ustawił nowe hasło i odzyskał dostęp za pomocą linku ratunkowego.`
    );

    setCurrentMemberId(targetMember.id);
    setActiveDekBase64(dekBase64);
    setActiveMergedDeks(mergedDeks);
    setIsVaultLockedByTimeout(false);
    showToast(
      `Zapisano nowe hasło i odblokowano konto dla ${targetMember.fullName}!`
    );
  };

  // 4. CLICK "AUTORYZUJ MOJE URZĄDZENIE"
  const handleRequestDeviceAuthorization = async (customLabel: string) => {
    if (!pendingAuthState) return;
    const { member } = pendingAuthState;
    const now = new Date().toISOString();

    const existing = devices.find(
      (d) =>
        d.memberId === member.id &&
        d.deviceFingerprint === detectedDevice.deviceFingerprint
    );

    if (existing) {
      await saveDeviceOnServer(existing.id, {
        status: 'pending',
        customLabel: customLabel || existing.customLabel,
        clientMode: detectedDevice.clientMode,
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
        lastSeenAt: now,
      });
    } else {
      const devId = makeId('dev');
      const newDevice: Device = {
        id: devId,
        memberId: member.id,
        memberName: member.fullName,
        username: member.username,
        deviceFingerprint: detectedDevice.deviceFingerprint,
        deviceName: detectedDevice.deviceName,
        customLabel: customLabel || 'Nowe urządzenie',
        clientMode: detectedDevice.clientMode,
        hardwareModelOs: detectedDevice.hardwareModelOs,
        hardwareDeviceType: detectedDevice.hardwareDeviceType,
        hardwareSignatureHash: detectedDevice.hardwareSignatureHash,
        status: 'pending',
        webAuthnCredentialId: '',
        requestedAt: now,
        lastSeenAt: now,
      };
      await saveDeviceOnServer(devId, newDevice);
    }

    await logActivityAndSync(
      member.id,
      member.fullName,
      'DEVICE_AUTH_REQUEST',
      `Wysłano prośbę o autoryzację i Certyfikat Sprzętowy dla: ${detectedDevice.deviceName} (${detectedDevice.hardwareSignatureHash}).`
    );
    showToast('Wysłano prośbę o autoryzację i Certyfikat Sprzętowy urządzenia!');
  };

  // 5. BIOMETRIC WEBAUTHN UNLOCK & REGISTRATION
  const handleRegisterBiometricsForCurrentDevice = async () => {
    if (!currentMember || !activeDekBase64) return;
    const myDevice = devices.find(
      (d) =>
        d.memberId === currentMember.id &&
        d.deviceFingerprint === detectedDevice.deviceFingerprint
    );

    const { credentialId } = await registerBiometricUnlock({
      memberId: currentMember.id,
      username: currentMember.username,
      fullName: currentMember.fullName,
      dekBase64: activeDekBase64,
      mergedDeksBase64: activeMergedDeks,
    });

    if (myDevice) {
      await saveDeviceOnServer(myDevice.id, {
        webAuthnCredentialId: credentialId,
        lastSeenAt: new Date().toISOString(),
      });
    }

    setBiometricProfile(getStoredBiometricProfile());
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'BIOMETRIC_PAIRED',
      `Skonfigurowano logowanie odciskiem palca (WebAuthn) na urządzeniu ${detectedDevice.deviceName}.`
    );
    showToast(
      'Skonfigurowano odblokowywanie odciskiem palca na tym urządzeniu!'
    );
  };

  const handleUnlockWithBiometrics = async () => {
    const stored = await authenticateWithBiometrics();
    const sessionRes = await establishVaultSessionOnServer({
      mode: 'biometric',
      memberId: stored.memberId,
      username: stored.username,
      deviceFingerprint: detectedDevice.deviceFingerprint,
      deviceName: detectedDevice.deviceName,
    });
    const serverState = sessionRes.state;
    applyServerState(serverState);

    const member = serverState.members.find(
      (m) => m.id === stored.memberId && m.status === 'active'
    );
    if (!member) {
      throw new Error('Konto powiązane z odciskiem palca nie jest aktywne.');
    }
    const dev = serverState.devices.find(
      (d) =>
        d.memberId === member.id &&
        d.deviceFingerprint === detectedDevice.deviceFingerprint &&
        d.status === 'approved'
    );
    if (!dev) {
      throw new Error(
        'To urządzenie nie ma aktywnej autoryzacji Administratora.'
      );
    }

    setCurrentMemberId(member.id);
    setActiveDekBase64(stored.dekBase64);
    setActiveMergedDeks(stored.mergedDeksBase64 || []);
    setIsVaultLockedByTimeout(false);
    await logActivityAndSync(
      member.id,
      member.fullName,
      'BIOMETRIC_UNLOCK',
      `Odblokowano skarbiec odciskiem palca (WebAuthn).`
    );
  };

  // 6. PASSWORD CRUD & SUB-ACCOUNTS
  const handleAddPassword = async (params: {
    section: 'shared' | 'private';
    categoryId: string;
    serviceName: string;
    serviceUrl: string;
    login: string;
    password: string;
    allowedMemberIds: string[];
    revealToAdmin?: boolean;
    subAccounts?: SubAccountEntry[];
  }) => {
    if (!currentMember || !activeDekBase64) return;
    const now = new Date().toISOString();
    const pwId = makeId('pw');

    let record: PasswordRecord;
    if (params.section === 'private') {
      const encryptedPayload = await encryptPrivateRecordPayload(
        {
          categoryId: params.categoryId,
          serviceName: params.serviceName,
          serviceUrl: params.serviceUrl,
          login: params.login,
          password: params.password,
        },
        activeDekBase64
      );
      const shouldReveal = Boolean(params.revealToAdmin);
      record = {
        id: pwId,
        section: 'private',
        categoryId: shouldReveal ? params.categoryId : 'ENC[PRIVATE]',
        serviceName: shouldReveal ? params.serviceName : 'ENC[PRIVATE]',
        serviceUrl: shouldReveal ? params.serviceUrl : 'ENC[PRIVATE]',
        login: shouldReveal ? params.login : 'ENC[PRIVATE]',
        passwordValue: shouldReveal
          ? params.password
          : encryptedPayload.slice(0, 96) + '...',
        encryptedPayload,
        keySalt: currentMember.pbkdf2Salt,
        ownerId: currentMember.id,
        ownerName: currentMember.fullName,
        allowedMemberIds: [currentMember.id],
        revealToAdmin: shouldReveal,
        subAccountsJson: '[]',
        createdAt: now,
        updatedAt: now,
        passwordUpdatedAt: now,
      };
    } else {
      const subList = params.subAccounts || [];
      const subMemberIds = subList.map((s) => s.assignedMemberId);
      const mergedAllowed = Array.from(
        new Set([...params.allowedMemberIds, ...subMemberIds, currentMember.id])
      );
      record = {
        id: pwId,
        section: 'shared',
        categoryId: params.categoryId,
        serviceName: params.serviceName,
        serviceUrl: params.serviceUrl,
        login: params.login,
        passwordValue: params.password,
        encryptedPayload: '',
        keySalt: '',
        ownerId: currentMember.id,
        ownerName: currentMember.fullName,
        allowedMemberIds: mergedAllowed,
        revealToAdmin: false,
        subAccountsJson: JSON.stringify(subList),
        createdAt: now,
        updatedAt: now,
        passwordUpdatedAt: now,
      };
    }

    await savePasswordOnServer(pwId, record);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'PASSWORD_CREATED',
      params.section === 'private'
        ? params.revealToAdmin
          ? `Dodano prywatny rekord ujawniony Administratorowi: ${params.serviceName}.`
          : 'Dodano nowy zaszyfrowany rekord prywatny (ENC[AES-256-GCM]).'
        : `Dodano wspólne konto: ${params.serviceName}.`
    );
    showToast(
      googleAccessToken
        ? 'Dodano hasło na serwerze i zsynchronizowano z Google Drive!'
        : 'Dodano nowe hasło do skarbca!'
    );
  };

  const handleUpdateSubAccounts = async (
    record: PasswordRecord,
    nextSubAccounts: SubAccountEntry[],
    additionalAllowedMemberId?: string
  ) => {
    if (!currentMember) return;
    const now = new Date().toISOString();
    const nextAllowed = additionalAllowedMemberId
      ? Array.from(
          new Set([...record.allowedMemberIds, additionalAllowedMemberId])
        )
      : record.allowedMemberIds;

    await savePasswordOnServer(record.id, {
      subAccountsJson: JSON.stringify(nextSubAccounts),
      allowedMemberIds: nextAllowed,
      updatedAt: now,
      passwordUpdatedAt: now,
    });
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'SUBACCOUNTS_UPDATED',
      `Zaktualizowano subkonta domowników dla serwisu ${record.serviceName} (${nextSubAccounts.length} subkont).`
    );
    showToast(`Zaktualizowano subkonta w serwisie ${record.serviceName}!`);
  };

  const handleQuickUpdatePassword = async (
    record: PasswordRecord,
    newPassword: string
  ) => {
    if (!currentMember || !activeDekBase64) return;
    const now = new Date().toISOString();

    if (record.section === 'private') {
      const currentDecrypted = decryptedPrivateMap[record.id];
      if (!currentDecrypted) {
        throw new Error('Nie można odszyfrować rekordu prywatnego do edycji.');
      }
      const reEncrypted = await encryptPrivateRecordPayload(
        {
          ...currentDecrypted,
          password: newPassword,
        },
        activeDekBase64
      );
      await savePasswordOnServer(record.id, {
        passwordValue: record.revealToAdmin
          ? newPassword
          : reEncrypted.slice(0, 96) + '...',
        encryptedPayload: reEncrypted,
        updatedAt: now,
        passwordUpdatedAt: now,
      });
    } else {
      await savePasswordOnServer(record.id, {
        passwordValue: newPassword,
        updatedAt: now,
        passwordUpdatedAt: now,
      });
    }

    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'PASSWORD_QUICK_UPDATE',
      record.section === 'private'
        ? 'Zaktualizowano hasło w istniejącym rekordzie prywatnym (AES-256-GCM).'
        : `Zaktualizowano hasło w istniejącym wpisie wspólnym: ${record.serviceName}.`
    );
    showToast('Zaktualizowano hasło w istniejącym rekordzie!');
  };

  const handleToggleRevealToAdmin = async (
    record: PasswordRecord,
    nextReveal: boolean
  ) => {
    if (!currentMember || record.section !== 'private') return;
    const decrypted = decryptedPrivateMap[record.id];
    if (!decrypted) {
      showToast('Nie można odszyfrować rekordu prywatnego.');
      return;
    }

    const now = new Date().toISOString();
    await savePasswordOnServer(record.id, {
      revealToAdmin: nextReveal,
      categoryId: nextReveal ? decrypted.categoryId : 'ENC[PRIVATE]',
      serviceName: nextReveal ? decrypted.serviceName : 'ENC[PRIVATE]',
      serviceUrl: nextReveal ? decrypted.serviceUrl : 'ENC[PRIVATE]',
      login: nextReveal ? decrypted.login : 'ENC[PRIVATE]',
      passwordValue: nextReveal
        ? decrypted.password
        : record.encryptedPayload.slice(0, 96) + '...',
      updatedAt: now,
    });

    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'PRIVATE_REVEAL_TOGGLED',
      nextReveal
        ? `Włączono jawny podgląd prywatnego wpisu (${decrypted.serviceName}) dla Administratora i Co-Adminów.`
        : 'Wyłączono jawny podgląd prywatnego wpisu dla Administratora (powrót do Zero-Knowledge AES-256-GCM).'
    );
    showToast(
      nextReveal
        ? 'Ujawniono prywatny wpis Administratorowi i Zaufanym Opiekunom.'
        : 'Ukryto prywatny wpis przed Administratorem (Zero-Knowledge).'
    );
  };

  const handleUpdateAllowedMembers = async (
    record: PasswordRecord,
    memberIds: string[]
  ) => {
    if (!currentMember) return;
    const now = new Date().toISOString();
    await savePasswordOnServer(record.id, {
      allowedMemberIds: memberIds,
      updatedAt: now,
    });
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ACCESS_UPDATED',
      `Zaktualizowano uprawnienia dostępu domowników dla serwisu ${record.serviceName}.`
    );
    showToast('Zaktualizowano listę uprawnionych domowników.');
  };

  const handleDeleteRecord = async (record: PasswordRecord) => {
    if (!currentMember) return;
    await deletePasswordOnServer(record.id);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'PASSWORD_DELETED',
      record.section === 'private'
        ? 'Usunięto prywatny rekord hasła.'
        : `Usunięto wspólny wpis: ${record.serviceName}.`
    );
    showToast('Usunięto wpis ze skarbca.');
  };

  // 7. ADMIN & CO-ADMIN TAB 2 ACTIONS: Invites, Approvals, Emergency Reset & Co-Admin Delegation
  const handleCreateInvitation = async (params: {
    purpose: InvitationPurpose;
    mode: InvitationMode;
    invitedLabel: string;
    targetMemberId?: string;
    hoursValid?: number;
  }): Promise<VaultInvitation> => {
    if (!currentMember) {
      throw new Error('Brak aktywnej sesji.');
    }
    const res = await createInvitationOnServer({
      ...params,
      createdByMemberId: currentMember.id,
      createdByMemberName: currentMember.fullName,
    });
    applyServerState(res.state);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'INVITE_CREATED',
      params.purpose === 'account_recovery'
        ? `Utworzono link ratunkowy (${params.invitedLabel}).`
        : `Utworzono link zaproszeniowy dla nowego domownika (${
            params.invitedLabel || 'Domownik'
          }, tryb: ${
            params.mode === 'single_use' ? 'jednorazowy' : 'czasowy 24h'
          }).`
    );
    showToast('Utworzono i skopiowano link do schowka!');
    return res.invitation;
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    if (!currentMember) return;
    const nextState = await deleteInvitationOnServer(invitationId);
    applyServerState(nextState);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'INVITE_DELETED',
      'Unieważniono i usunięto link zaproszeniowy.'
    );
    showToast('Usunięto link zaproszeniowy.');
  };

  const handleResetMemberCredentialsByAdmin = async (params: {
    targetMemberId: string;
    newUsername: string;
    newPassword: string;
    approveAllDevices: boolean;
  }) => {
    if (!currentMember) return;
    const target = members.find((m) => m.id === params.targetMemberId);
    if (!target) return;

    const dekBase64 = await unwrapDekFromMergeEscrow(
      target.vaultEscrowKey,
      target.pbkdf2Salt
    );
    const newPasswordHash = await hashPasswordForAuth(
      params.newPassword,
      target.pbkdf2Salt
    );
    const newWrappedMasterKey = await wrapDekWithPassword(
      dekBase64,
      params.newPassword,
      target.pbkdf2Salt
    );

    const now = new Date().toISOString();
    await saveMemberOnServer(target.id, {
      username: params.newUsername,
      passwordHash: newPasswordHash,
      wrappedMasterKey: newWrappedMasterKey,
      status: 'active',
      updatedAt: now,
    });

    const targetDevs = devices.filter((d) => d.memberId === target.id);
    for (const dev of targetDevs) {
      await saveDeviceOnServer(dev.id, {
        status: params.approveAllDevices ? 'approved' : dev.status,
        username: params.newUsername,
        // Clear old hardwareWrappedDek so the device re-seals with the new password on next login
        hardwareWrappedDek: '',
        lastSeenAt: now,
      });
    }

    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'MEMBER_CREDENTIALS_RESET',
      `Zresetowano login/hasło i odświeżono koperty sprzętowe dla domownika ${target.fullName} (nowy login: ${params.newUsername}).`
    );
    showToast(`Zresetowano hasło i odblokowano konto dla ${target.fullName}!`);
  };

  const handleChangeOwnPassword = async (params: {
    currentPassword: string;
    newPassword: string;
  }) => {
    if (!currentMember || !activeDekBase64) {
      throw new Error('Brak aktywnej sesji skarbca.');
    }

    const verifyHash = await hashPasswordForAuth(
      params.currentPassword,
      currentMember.pbkdf2Salt
    );
    if (verifyHash !== currentMember.passwordHash) {
      throw new Error('Wpisane obecne hasło jest nieprawidłowe.');
    }

    const newPasswordHash = await hashPasswordForAuth(
      params.newPassword,
      currentMember.pbkdf2Salt
    );
    const newWrappedMasterKey = await wrapDekWithPassword(
      activeDekBase64,
      params.newPassword,
      currentMember.pbkdf2Salt
    );

    const now = new Date().toISOString();
    await saveMemberOnServer(currentMember.id, {
      passwordHash: newPasswordHash,
      wrappedMasterKey: newWrappedMasterKey,
      updatedAt: now,
    });

    const myDevs = devices.filter((d) => d.memberId === currentMember.id);
    for (const dev of myDevs) {
      if (
        dev.deviceFingerprint === detectedDevice.deviceFingerprint &&
        dev.status === 'approved'
      ) {
        const reSealedHardwareDek = await wrapDekWithHardwareCertificate(
          activeDekBase64,
          {
            password: params.newPassword,
            saltBase64: currentMember.pbkdf2Salt,
            deviceFingerprint: detectedDevice.deviceFingerprint,
            clientMode: detectedDevice.clientMode,
            deviceApprovalToken: dev.deviceApprovalToken || '',
            hardwareModelOs: detectedDevice.hardwareModelOs,
            hardwareDeviceType: detectedDevice.hardwareDeviceType,
          }
        );
        await saveDeviceOnServer(dev.id, {
          hardwareWrappedDek: reSealedHardwareDek,
          lastSeenAt: now,
        });
      } else {
        await saveDeviceOnServer(dev.id, {
          hardwareWrappedDek: '',
          lastSeenAt: now,
        });
      }
    }

    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'OWN_PASSWORD_CHANGED',
      'Użytkownik samodzielnie zmienił własne hasło główne w zakładce Profil (bez utraty kluczy DEK).'
    );
    showToast('Twoje hasło główne zostało zmienione!');
  };

  const handleUpdateMemberRoleAndPermissions = async (params: {
    targetMemberId: string;
    role: 'co_admin' | 'member';
    coAdminPermissions: CoAdminPermissions;
  }) => {
    if (!currentMember || !isPrimaryAdmin(currentMember)) return;
    const target = members.find((m) => m.id === params.targetMemberId);
    if (!target) return;

    const now = new Date().toISOString();
    await saveMemberOnServer(target.id, {
      role: params.role,
      coAdminPermissions: params.coAdminPermissions,
      updatedAt: now,
    });

    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'CO_ADMIN_UPDATED',
      params.role === 'co_admin'
        ? `Nadano lub zaktualizowano uprawnienia Zaufanego Opiekuna (Co-Admina) dla: ${target.fullName}.`
        : `Odebrano uprawnienia Zaufanego Opiekuna dla: ${target.fullName}.`
    );
    showToast(
      params.role === 'co_admin'
        ? `Mianowano ${target.fullName} Zaufanym Opiekunem (Co-Adminem)!`
        : `Zmieniono rolę ${target.fullName} na standardowego domownika.`
    );
  };

  const handleApproveMemberAndDevices = async (memberId: string) => {
    if (!currentMember) return;
    const target = members.find((m) => m.id === memberId);
    if (!target) return;
    const now = new Date().toISOString();

    await saveMemberOnServer(memberId, {
      status: 'active',
      updatedAt: now,
    });
    const memberDevs = devices.filter((d) => d.memberId === memberId);
    for (const dev of memberDevs) {
      await saveDeviceOnServer(dev.id, {
        status: 'approved',
        lastSeenAt: now,
      });
    }
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_APPROVE_MEMBER',
      `Zatwierdzono nowe konto domownika: ${target.fullName} (${target.username}).`
    );
    showToast(`Zaakceptowano konto i urządzenie dla ${target.fullName}!`);
  };

  const handleRejectPendingMember = async (memberId: string) => {
    if (!currentMember) return;
    const target = members.find((m) => m.id === memberId);
    await deleteMemberOnServer(memberId);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_REJECT_MEMBER',
      `Odrzucono zgłoszenie konta: ${target?.fullName || memberId}.`
    );
    showToast('Odrzucono zgłoszenie nowego konta.');
  };

  const handleApproveDevice = async (deviceId: string) => {
    if (!currentMember) return;
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;
    await saveDeviceOnServer(deviceId, {
      status: 'approved',
      lastSeenAt: new Date().toISOString(),
    });
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_APPROVE_DEVICE',
      `Zatwierdzono urządzenie ${dev.deviceName} i wydano Certyfikat Sprzętowy dla użytkownika ${dev.memberName}.`
    );
    showToast(
      `Wydano Certyfikat Sprzętowy i zatwierdzono urządzenie dla ${dev.memberName}!`
    );
  };

  const handleRebindDeviceCertificate = async (deviceId: string) => {
    if (!currentMember) return;
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;
    const updatedState = await rebindDeviceCertificateOnServer(deviceId);
    applyServerState(updatedState);
    const updatedDev = updatedState.devices.find((d) => d.id === deviceId);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_REBIND_DEVICE_CERT',
      `Przepięto / odnowiono Certyfikat Sprzętowy (${
        updatedDev?.deviceCertificateFingerprint || 'CERT-HW'
      }) dla urządzenia ${dev.deviceName} (${dev.memberName}).`
    );
    showToast(
      `Odnowiono Certyfikat Sprzętowy (${
        updatedDev?.deviceCertificateFingerprint || 'CERT-HW'
      }) dla ${dev.memberName}!`
    );
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!currentMember) return;
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;
    await deleteDeviceOnServer(deviceId);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_REVOKE_DEVICE',
      `Odpięto urządzenie ${dev.deviceName} i unieważniono jego Certyfikat Sprzętowy (${dev.memberName}).`
    );
    showToast('Odpięto urządzenie i unieważniono jego Certyfikat Sprzętowy.');
  };

  const handleManualAddDeviceForMember = async (params: {
    memberId: string;
    deviceName: string;
    customLabel: string;
    clientMode: 'pwa' | 'browser';
  }) => {
    if (!currentMember) return;
    const member = members.find((m) => m.id === params.memberId);
    if (!member) return;
    const now = new Date().toISOString();
    const devId = makeId('dev');
    const newDevice: Device = {
      id: devId,
      memberId: member.id,
      memberName: member.fullName,
      username: member.username,
      deviceFingerprint: `manual_${makeId('fp')}`,
      deviceName: params.deviceName,
      customLabel: params.customLabel,
      clientMode: params.clientMode,
      status: 'approved',
      webAuthnCredentialId: '',
      requestedAt: now,
      lastSeenAt: now,
    };
    await saveDeviceOnServer(devId, newDevice);
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_MANUAL_DEVICE',
      `Dopisano urządzenie ${params.deviceName} do konta ${member.fullName}.`
    );
    showToast('Dopisano nowe urządzenie do konta użytkownika.');
  };

  const handleMergeMemberAccounts = async (
    sourceMemberId: string,
    targetMemberId: string
  ) => {
    if (!currentMember) return;
    const sourceMember = members.find((m) => m.id === sourceMemberId);
    const targetMember = members.find((m) => m.id === targetMemberId);
    if (!sourceMember || !targetMember) return;

    const sourceDek = await unwrapDekFromMergeEscrow(
      sourceMember.vaultEscrowKey,
      sourceMember.pbkdf2Salt
    );
    let existingTargetMergedKeys: string[] = [];
    try {
      existingTargetMergedKeys = JSON.parse(
        targetMember.mergedVaultKeysJson || '[]'
      );
    } catch {
      existingTargetMergedKeys = [];
    }
    const updatedMergedKeys = Array.from(
      new Set([...existingTargetMergedKeys, sourceDek])
    );

    await mergeMembersOnServer({
      sourceMemberId,
      targetMemberId,
      updatedMergedKeysJson: JSON.stringify(updatedMergedKeys),
    });

    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'ADMIN_MERGE_ACCOUNTS',
      `Scalono konto „${sourceMember.fullName} (${sourceMember.username})” do konta „${targetMember.fullName} (${targetMember.username})”.`
    );
    showToast('Pomyślnie scalono konta użytkowników!');
  };

  // 8. ADMIN TAB 3 ACTIONS: Categories, Settings, 1-File Auto-Sync & .vault.enc Backups
  const handleUpdateCategories = async (newCategories: VaultCategory[]) => {
    if (!currentMember || !vaultConfig) return;
    const now = new Date().toISOString();
    await saveVaultConfigOnServer({
      ...vaultConfig,
      categoriesJson: JSON.stringify(newCategories),
      updatedAt: now,
    });
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'CATEGORIES_UPDATED',
      `Zaktualizowano listę kategorii wpisów (${newCategories.length} kategorii).`
    );
    showToast('Zaktualizowano kategorie wpisów.');
  };

  const handleUpdateSystemSettings = async (params: {
    defaultTheme: ThemeMode;
    clipboardClearSeconds: number;
    autoLockMinutes: number;
  }) => {
    if (!currentMember || !vaultConfig) return;
    const now = new Date().toISOString();
    await saveVaultConfigOnServer({
      ...vaultConfig,
      defaultTheme: params.defaultTheme,
      clipboardClearSeconds: params.clipboardClearSeconds,
      autoLockMinutes: params.autoLockMinutes,
      updatedAt: now,
    });
    await logActivityAndSync(
      currentMember.id,
      currentMember.fullName,
      'SETTINGS_UPDATED',
      `Zmieniono ustawienia systemowe (Motyw: ${params.defaultTheme}, Schowek: ${params.clipboardClearSeconds}s, Auto-Lock: ${params.autoLockMinutes}m).`
    );
  };

  const buildEncryptedBackupString = async (
    passphrase: string
  ): Promise<string> => {
    const backupObject: BackupFileStructure = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: currentMember?.fullName || 'Administrator',
      vaultConfig,
      members,
      devices,
      passwords,
      invitations,
      activityLogs: activityLogs.slice(0, 100),
    };
    const plainJson = JSON.stringify(backupObject);
    return encryptVaultBackupFile(plainJson, passphrase);
  };

  const handleConnectGoogleForDrive = async (): Promise<string> => {
    const accessToken = await connectGoogleDriveOAuthDirect();
    setGoogleAccessToken(accessToken);
    const latestState = await fetchVaultStateFromServer();
    await triggerAutoSyncToGoogleDrive(latestState, accessToken);
    showToast('Połączono z Google Drive i zsynchronizowano plik Auto-Sync!');
    return accessToken;
  };

  const handleManualPushAutoSyncToDrive = async () => {
    let token = googleAccessToken;
    if (!token) {
      token = await handleConnectGoogleForDrive();
    }
    const latestState = await fetchVaultStateFromServer();
    await triggerAutoSyncToGoogleDrive(latestState, token);
    showToast(
      'Zaktualizowano zaszyfrowany plik FamilyStreamVault_AutoSync.vault.enc (AES-256-GCM) na Google Drive!'
    );
  };

  const handleManualPullAutoSyncFromDrive = async () => {
    let token = googleAccessToken;
    if (!token) {
      token = await handleConnectGoogleForDrive();
    }
    const pulled = await pullVaultStateFromDriveAutoSync(
      token,
      syncEncryptionKey
    );
    if (!pulled || !pulled.state) {
      showToast(
        'Brak pliku FamilyStreamVault_AutoSync.vault.enc na Twoim Google Drive.'
      );
      return;
    }
    const updated = await replaceVaultStateOnServer({
      ...pulled.state,
      driveSyncFileId: pulled.fileId,
    });
    applyServerState(updated);
    setLastDriveAutoSyncAt(new Date().toISOString());
    showToast(
      'Odszyfrowano i wczytano stan bazy z pliku FamilyStreamVault_AutoSync.vault.enc z Google Drive!'
    );
  };

  const handleExportBackupToGoogleDrive = async (
    passphrase: string,
    existingFileId?: string
  ) => {
    let token = googleAccessToken;
    if (!token) {
      token = await handleConnectGoogleForDrive();
    }
    const encryptedContent = await buildEncryptedBackupString(passphrase);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `FamilyStreamVault_${dateStamp}.vault.enc`;

    await uploadEncryptedVaultToDrive({
      accessToken: token,
      fileName,
      encryptedContent,
      existingFileId,
    });

    if (currentMember) {
      await logActivityAndSync(
        currentMember.id,
        currentMember.fullName,
        'BACKUP_DRIVE_EXPORT',
        `Wyeksportowano zaszyfrowaną kopię bazy (${fileName}) na Google Drive.`,
        token
      );
    }
  };

  const handleDownloadLocalBackupFile = async (passphrase: string) => {
    const encryptedContent = await buildEncryptedBackupString(passphrase);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([encryptedContent], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FamilyStreamVault_${dateStamp}.vault.enc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (currentMember) {
      await logActivityAndSync(
        currentMember.id,
        currentMember.fullName,
        'BACKUP_LOCAL_EXPORT',
        'Pobrano zaszyfrowaną kopię .vault.enc na dysk lokalny.'
      );
    }
  };

  const applyRestoredBackupJson = async (decryptedJson: string) => {
    const parsed = JSON.parse(decryptedJson) as BackupFileStructure;
    if (
      !parsed ||
      !Array.isArray(parsed.members) ||
      !Array.isArray(parsed.passwords)
    ) {
      throw new Error('Plik kopii zapasowej ma nieprawidłową strukturę.');
    }

    const updated = await replaceVaultStateOnServer({
      vaultConfig: parsed.vaultConfig || vaultConfig,
      members: parsed.members,
      devices: parsed.devices || [],
      passwords: parsed.passwords,
      invitations: parsed.invitations || [],
      activityLogs: parsed.activityLogs || [],
    });
    applyServerState(updated);

    if (currentMember) {
      await logActivityAndSync(
        currentMember.id,
        currentMember.fullName,
        'BACKUP_RESTORED',
        `Przywrócono skarbiec z pliku .vault.enc (${parsed.passwords.length} haseł, ${parsed.members.length} kont).`
      );
    }
  };

  const handleRestoreBackupFromFile = async (
    fileContent: string,
    passphrase: string
  ) => {
    const decryptedJson = await decryptVaultBackupFile(fileContent, passphrase);
    await applyRestoredBackupJson(decryptedJson);
  };

  const handleRestoreBackupFromDriveFileId = async (
    fileId: string,
    passphrase: string
  ) => {
    let token = googleAccessToken;
    if (!token) {
      token = await handleConnectGoogleForDrive();
    }
    const encryptedContent = await downloadVaultBackupFromDrive(token, fileId);
    const decryptedJson = await decryptVaultBackupFile(
      encryptedContent,
      passphrase
    );
    await applyRestoredBackupJson(decryptedJson);
  };

  // Filtered & sorted passwords for current user's personal view
  const filterAndSortRecords = (list: PasswordRecord[]) => {
    return list
      .filter((rec) => {
        const isPriv = rec.section === 'private';
        const dec = isPriv ? decryptedPrivateMap[rec.id] : null;
        const catId = isPriv
          ? dec?.categoryId || (rec.revealToAdmin ? rec.categoryId : 'other')
          : rec.categoryId;
        const srvName = isPriv
          ? dec?.serviceName || (rec.revealToAdmin ? rec.serviceName : '')
          : rec.serviceName;
        const loginStr = isPriv
          ? dec?.login || (rec.revealToAdmin ? rec.login : '')
          : rec.login;

        if (
          selectedCategoryFilter !== 'all' &&
          catId !== selectedCategoryFilter
        ) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            srvName.toLowerCase().includes(q) ||
            loginStr.toLowerCase().includes(q) ||
            rec.ownerName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'updated') {
          return (
            new Date(b.passwordUpdatedAt || b.updatedAt).getTime() -
            new Date(a.passwordUpdatedAt || a.updatedAt).getTime()
          );
        }
        if (sortBy === 'newest') {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        const nameA =
          a.section === 'private'
            ? decryptedPrivateMap[a.id]?.serviceName ||
              (a.revealToAdmin ? a.serviceName : '')
            : a.serviceName;
        const nameB =
          b.section === 'private'
            ? decryptedPrivateMap[b.id]?.serviceName ||
              (b.revealToAdmin ? b.serviceName : '')
            : b.serviceName;
        return nameA.localeCompare(nameB, 'pl');
      });
  };

  if (!isOnline) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--vault-bg)] text-[var(--vault-text)]">
        <div className="max-w-md w-full p-8 rounded-xl border border-[var(--vault-danger)] bg-[var(--vault-surface)] text-center space-y-4">
          <WifiOff className="w-10 h-10 text-[var(--vault-danger)] mx-auto" />
          <h1 className="text-xl font-bold font-display">
            Wymagane aktywne połączenie z internetem
          </h1>
          <p className="text-xs text-[var(--vault-muted)]">
            FamilyStream Vault działa w trybie <strong>Online-Only</strong> dla zachowania natychmiastowej synchronizacji haseł i autoryzacji urządzeń domowników. Połącz się z siecią Wi-Fi lub komórkową, aby odblokować skarbiec.
          </p>
        </div>
      </div>
    );
  }

  const pendingApprovalsCount =
    members.filter((m) => m.status === 'pending').length +
    devices.filter(
      (d) =>
        d.status === 'pending' &&
        !members.some((pm) => pm.status === 'pending' && pm.id === d.memberId)
    ).length;

  const isOwnerAdmin = isPrimaryAdmin(currentMember);
  const isTrustedCoAdmin = isCoAdmin(currentMember);
  const canAccessAdminOrCoAdminTab2 = isAdminOrCoAdmin(currentMember);

  // Strict privacy: every user (including Admin) only sees shared passwords where they are owner, in allowedMemberIds, or assigned a subAccount
  const mySharedPasswords = currentMember
    ? filterAndSortRecords(
        passwords.filter(
          (p) =>
            p.section === 'shared' &&
            (p.ownerId === currentMember.id ||
              p.allowedMemberIds.includes(currentMember.id) ||
              parseSubAccounts(p).some(
                (sa) => sa.assignedMemberId === currentMember.id
              ))
        )
      )
    : [];

  const myPrivatePasswords = currentMember
    ? filterAndSortRecords(
        passwords.filter(
          (p) => p.section === 'private' && p.ownerId === currentMember.id
        )
      )
    : [];

  // Section 03 for Admin / Co-Admin: ONLY private passwords of other family members where the owner explicitly enabled `revealToAdmin`
  const revealedByOthersPasswords =
    currentMember && (isOwnerAdmin || isTrustedCoAdmin)
      ? filterAndSortRecords(
          passwords.filter(
            (p) =>
              p.section === 'private' &&
              p.ownerId !== currentMember.id &&
              Boolean(p.revealToAdmin) &&
              p.serviceName !== 'ENC[PRIVATE]'
          )
        )
      : [];

  const currentDeviceDoc = currentMember
    ? devices.find(
        (d) =>
          d.memberId === currentMember.id &&
          d.deviceFingerprint === detectedDevice.deviceFingerprint
      ) || null
    : null;

  const handleLogout = () => {
    setVaultApiSessionContext({ sessionToken: null });
    setCurrentMemberId(null);
    setActiveDekBase64(null);
    setActiveMergedDeks([]);
    setPendingAuthState(null);
    setActiveAdminTab('vault');
  };

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col bg-[var(--vault-bg)] text-[var(--vault-text)]"
    >
      {/* Clean Top Bar: Navigation, + Dodaj hasło, and quick Wyloguj */}
      <TopBar
        currentMember={currentMember}
        activeTab={activeAdminTab}
        onSelectTab={setActiveAdminTab}
        pendingCount={pendingApprovalsCount}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === 'dusk' ? 'linen' : 'dusk'))
        }
        onOpenAddPassword={() => setIsAddModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Live Clipboard Auto-Clear Countdown Bar */}
      {clipboardCountdown && (
        <div className="bg-[var(--vault-surface)] border-b border-[var(--vault-accent)] px-6 py-2 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-[var(--vault-text)] tabular-nums">
            <Eraser className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
            <span>
              Skopiowano hasło (<strong>{clipboardCountdown.label}</strong>). Automatyczne czyszczenie schowka za{' '}
              <strong>{clipboardCountdown.secondsLeft}s</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('').catch(() => {});
              setClipboardCountdown(null);
            }}
            className="text-[var(--vault-accent)] hover:underline font-medium cursor-pointer whitespace-nowrap"
          >
            Wyczyść schowek teraz
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-surface)] text-xs font-medium text-[var(--vault-text)] shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8">
        {isInitialLoading ? (
          <div className="py-16 text-center text-sm text-[var(--vault-muted)]">
            Weryfikacja połączenia z serwerem FamilyStream Vault...
          </div>
        ) : !currentMember || isVaultLockedByTimeout ? (
          <AuthAndBootstrapView
            vaultConfig={vaultConfig}
            bootstrapStatus={bootstrapStatus}
            membersCount={members.length}
            detectedDevice={detectedDevice}
            biometricProfile={biometricProfile}
            pendingAuthState={
              pendingAuthState
                ? {
                    ...pendingAuthState,
                    existingDevice:
                      devices.find(
                        (d) =>
                          d.memberId === pendingAuthState.member.id &&
                          d.deviceFingerprint ===
                            detectedDevice.deviceFingerprint
                      ) || null,
                  }
                : null
            }
            canInstallPWA={!isInstalled}
            isPWAInstalled={isInstalled || detectedDevice.clientMode === 'pwa'}
            onInstallPWA={handleInstallPWAOrGuide}
            onTriggerAppUpdate={handleTriggerAppUpdate}
            isUpdatingApp={isUpdatingApp}
            onAdminGoogleLogin={handleAdminGoogleLogin}
            onLoginWithCredentials={handleLoginWithCredentials}
            onRegisterMemberAccountWithInvite={
              handleRegisterMemberAccountWithInvite
            }
            onRecoverMemberAccountWithInvite={
              handleRecoverMemberAccountWithInvite
            }
            onRequestDeviceAuthorization={handleRequestDeviceAuthorization}
            onUnlockWithBiometrics={handleUnlockWithBiometrics}
            onCancelPendingState={() => setPendingAuthState(null)}
            onSyncSharedVaultFromAdminDrive={
              handleSyncSharedVaultFromAdminDrive
            }
            onResetLocalVaultInstance={handleResetLocalVaultInstance}
                      />
        ) : (
          <div className="space-y-6">
            {activeAdminTab === 'profile' ? (
              /* TAB: PROFIL, POBIERANIE APLIKACJI, AKTUALIZACJE, BIOMETRIA I URZĄDZENIA */
              <UserProfileView
                currentMember={currentMember}
                detectedDevice={detectedDevice}
                currentDeviceDoc={currentDeviceDoc}
                myDevices={devices.filter(
                  (d) => d.memberId === currentMember.id
                )}
                mySharedCount={
                  passwords.filter(
                    (p) =>
                      p.section === 'shared' &&
                      (p.ownerId === currentMember.id ||
                        p.allowedMemberIds.includes(currentMember.id) ||
                        parseSubAccounts(p).some(
                          (sa) => sa.assignedMemberId === currentMember.id
                        ))
                  ).length
                }
                myPrivateCount={
                  passwords.filter(
                    (p) =>
                      p.section === 'private' && p.ownerId === currentMember.id
                  ).length
                }
                myRevealedCount={
                  passwords.filter(
                    (p) =>
                      p.section === 'private' &&
                      p.ownerId === currentMember.id &&
                      Boolean(p.revealToAdmin)
                  ).length
                }
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prev) => (prev === 'dusk' ? 'linen' : 'dusk'))
                }
                isPWAInstalled={
                  isInstalled || detectedDevice.clientMode === 'pwa'
                }
                onInstallPWA={handleInstallPWAOrGuide}
                appVersion={bootstrapStatus?.appVersion || '2026.02-HW-CERT'}
                isUpdatingApp={isUpdatingApp}
                onTriggerAppUpdate={handleTriggerAppUpdate}
                onRegisterBiometrics={handleRegisterBiometricsForCurrentDevice}
                onChangeOwnPassword={handleChangeOwnPassword}
                onLockVault={() => {
                  setActiveDekBase64(null);
                  setIsVaultLockedByTimeout(true);
                }}
              />
            ) : canAccessAdminOrCoAdminTab2 && activeAdminTab === 'approvals' ? (
              /* TAB 2: Domownicy, Urządzenia, Opiekunowie, Zaproszenia i Pomoc Awaryjna (Admin + Co-Admin) */
              <AdminTab2AccountsAndDevices
                members={members}
                devices={devices}
                passwords={passwords}
                invitations={invitations}
                activityLogs={activityLogs}
                currentAdmin={currentMember}
                driveSyncFileId={driveSyncFileId}
                syncEncryptionKey={syncEncryptionKey}
                googleOAuthClientId={
                  bootstrapStatus?.googleOAuthClientId || getOAuthClientId()
                }
                onCreateInvitation={handleCreateInvitation}
                onDeleteInvitation={handleDeleteInvitation}
                onApproveMemberAndDevices={handleApproveMemberAndDevices}
                onRejectPendingMember={handleRejectPendingMember}
                onApproveDevice={handleApproveDevice}
                onRebindDeviceCertificate={handleRebindDeviceCertificate}
                onRevokeDevice={handleRevokeDevice}
                onManualAddDeviceForMember={handleManualAddDeviceForMember}
                onResetMemberCredentialsByAdmin={
                  handleResetMemberCredentialsByAdmin
                }
                onUpdateMemberRoleAndPermissions={
                  handleUpdateMemberRoleAndPermissions
                }
                onMergeMemberAccounts={handleMergeMemberAccounts}
              />
            ) : isOwnerAdmin && activeAdminTab === 'config' ? (
              /* ADMIN TAB 3: Google Drive Auto-Sync, Kopia .vault.enc, Kategorie i Parametry Bezpieczeństwa */
              <AdminTab3ConfigAndBackup
                vaultConfig={
                  vaultConfig || {
                    initialized: true,
                    adminUid: currentMember.googleUid || 'admin',
                    adminEmail: 'admin@familystream.local',
                    adminMemberId: currentMember.id,
                    templatesLoaded: false,
                    categoriesJson: JSON.stringify(DEFAULT_CATEGORIES),
                    defaultTheme: theme,
                    clipboardClearSeconds: 30,
                    autoLockMinutes: 15,
                    createdAt: currentMember.createdAt,
                    updatedAt: currentMember.updatedAt,
                  }
                }
                categories={categories}
                currentTheme={theme}
                googleAccessToken={googleAccessToken}
                lastDriveAutoSyncAt={lastDriveAutoSyncAt}
                onUpdateCategories={handleUpdateCategories}
                onUpdateSystemSettings={handleUpdateSystemSettings}
                onConnectGoogleForDrive={handleConnectGoogleForDrive}
                onManualPushAutoSyncToDrive={handleManualPushAutoSyncToDrive}
                onManualPullAutoSyncFromDrive={handleManualPullAutoSyncFromDrive}
                onExportBackupToGoogleDrive={handleExportBackupToGoogleDrive}
                onDownloadLocalBackupFile={handleDownloadLocalBackupFile}
                onRestoreBackupFromFile={handleRestoreBackupFromFile}
                onRestoreBackupFromDriveFileId={
                  handleRestoreBackupFromDriveFileId
                }
              />
            ) : isOwnerAdmin && activeAdminTab === 'github' ? (
              /* ADMIN TAB 4: GitHub Commit & Push (Czysty Silnik) */
              <AdminTab4GitHubAndUpdates
                onLogActivity={async (actionType: string, details: string) => {
                  await logActivityAndSync(
                    currentMember.id,
                    currentMember.fullName,
                    actionType,
                    details
                  );
                  showToast('Czysty kod aplikacji został wysłany na GitHub!');
                }}
              />
            ) : (
              /* CLEAN PASSWORD VAULT VIEW (Identical privacy rules for all users + Section 03 for revealed entries) */
              <div className="space-y-8">
                {/* Search, Section Quick-Filter, Category Filter & Sort Toolbar */}
                <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-[var(--vault-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Szukaj serwisu VOD, poczty, sklepu lub loginu..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
                      {/* Quick Section Switcher: Wszystkie / Wspólne / Prywatne / Ujawnione */}
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--vault-bg)] border border-[var(--vault-border)] overflow-x-auto">
                        <button
                          type="button"
                          onClick={() => setVaultSectionFilter('all')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                            vaultSectionFilter === 'all'
                              ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                              : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                          }`}
                        >
                          Wszystkie
                        </button>
                        <button
                          type="button"
                          onClick={() => setVaultSectionFilter('shared')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                            vaultSectionFilter === 'shared'
                              ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                              : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                          }`}
                        >
                          Wspólne ({mySharedPasswords.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVaultSectionFilter('private')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                            vaultSectionFilter === 'private'
                              ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                              : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                          }`}
                        >
                          Prywatne ({myPrivatePasswords.length})
                        </button>
                        {(isOwnerAdmin || isTrustedCoAdmin) && (
                          <button
                            type="button"
                            onClick={() => setVaultSectionFilter('revealed')}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                              vaultSectionFilter === 'revealed'
                                ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                                : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                            }`}
                          >
                            Ujawnione ({revealedByOthersPasswords.length})
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-[var(--vault-muted)] hidden sm:inline">
                          Sortuj:
                        </span>
                        <select
                          value={sortBy}
                          onChange={(e) =>
                            setSortBy(
                              e.target.value as 'alpha' | 'updated' | 'newest'
                            )
                          }
                          className="px-3 py-2 text-xs font-medium rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
                        >
                          <option value="alpha">Alfabetycznie (A–Z)</option>
                          <option value="updated">Ostatnio zmienione hasło</option>
                          <option value="newest">Najnowsze wpisy</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Categories Filter Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('all')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategoryFilter === 'all'
                          ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                          : 'bg-[var(--vault-bg)] text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                      }`}
                    >
                      Wszystkie kategorie
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryFilter(cat.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedCategoryFilter === cat.id
                            ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                            : 'bg-[var(--vault-bg)] text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PASSWORD SECTIONS */}
                <div className="space-y-8">
                  {(vaultSectionFilter === 'all' ||
                    vaultSectionFilter === 'shared') && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between border-b border-[var(--vault-border)] pb-2">
                        <h2 className="text-base font-bold font-display text-[var(--vault-text)]">
                          01. Wspólne
                        </h2>
                        <span className="text-xs text-[var(--vault-muted)] tabular-nums">
                          {mySharedPasswords.length}
                        </span>
                      </div>

                      {mySharedPasswords.length === 0 ? (
                        <div className="p-5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] text-center text-xs text-[var(--vault-muted)]">
                          Brak wspólnych haseł przypisanych do Twojego konta w wybranej kategorii. Kliknij „+ Dodaj hasło” w prawym górnym rogu, aby dodać pierwszy serwis lub subkonta.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {mySharedPasswords.map((rec) => (
                            <PasswordCard
                              key={rec.id}
                              record={rec}
                              categories={categories}
                              currentMember={currentMember}
                              allMembers={members}
                              clipboardClearSeconds={
                                vaultConfig?.clipboardClearSeconds || 30
                              }
                              onQuickUpdatePassword={handleQuickUpdatePassword}
                              onUpdateAllowedMembers={handleUpdateAllowedMembers}
                              onUpdateSubAccounts={handleUpdateSubAccounts}
                              onDeleteRecord={handleDeleteRecord}
                              onStartClipboardCountdown={startClipboardCountdown}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {(vaultSectionFilter === 'all' ||
                    vaultSectionFilter === 'private') && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between border-b border-[var(--vault-border)] pb-2">
                        <h2 className="text-base font-bold font-display text-[var(--vault-text)]">
                          02. Prywatne
                        </h2>
                        <span className="text-xs text-[var(--vault-muted)] tabular-nums">
                          {myPrivatePasswords.length}
                        </span>
                      </div>

                      {myPrivatePasswords.length === 0 ? (
                        <div className="p-5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] text-center text-xs text-[var(--vault-muted)]">
                          Brak prywatnych haseł.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {myPrivatePasswords.map((rec) => (
                            <PasswordCard
                              key={rec.id}
                              record={rec}
                              decryptedPrivate={
                                decryptedPrivateMap[rec.id] || null
                              }
                              categories={categories}
                              currentMember={currentMember}
                              allMembers={members}
                              clipboardClearSeconds={
                                vaultConfig?.clipboardClearSeconds || 30
                              }
                              activeHardwareCertFingerprint={
                                currentDeviceDoc?.deviceCertificateFingerprint ||
                                detectedDevice.hardwareSignatureHash
                              }
                              activeHardwareModeLabel={`${
                                detectedDevice.hardwareModelOs
                              } · ${
                                detectedDevice.clientMode === 'pwa'
                                  ? 'PWA'
                                  : 'Browser'
                              } · AES-256-GCM`}
                              onQuickUpdatePassword={handleQuickUpdatePassword}
                              onUpdateAllowedMembers={handleUpdateAllowedMembers}
                              onUpdateSubAccounts={handleUpdateSubAccounts}
                              onToggleRevealToAdmin={handleToggleRevealToAdmin}
                              onDeleteRecord={handleDeleteRecord}
                              onStartClipboardCountdown={startClipboardCountdown}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {/* 03. Ujawnione przez domowników (Visible for Admin / Co-Admin) */}
                  {(isOwnerAdmin || isTrustedCoAdmin) &&
                    (vaultSectionFilter === 'all' ||
                      vaultSectionFilter === 'revealed') && (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between border-b border-[var(--vault-border)] pb-2">
                          <div>
                            <h2 className="text-base font-bold font-display text-[var(--vault-text)]">
                              03. Ujawnione przez domowników
                            </h2>
                            <p className="text-xs text-[var(--vault-muted)]">
                              Prywatne hasła innych członków rodziny, w których właściciel świadomie zaznaczył opcję „Ujawnij hasło administratorowi”.
                            </p>
                          </div>
                          <span className="text-xs text-[var(--vault-muted)] tabular-nums">
                            {revealedByOthersPasswords.length}
                          </span>
                        </div>

                        {revealedByOthersPasswords.length === 0 ? (
                          <div className="p-5 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] text-center text-xs text-[var(--vault-muted)]">
                            Żaden domownik nie ujawnił jeszcze swoich prywatnych haseł Administratorowi.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {revealedByOthersPasswords.map((rec) => (
                              <PasswordCard
                                key={`revealed_${rec.id}`}
                                record={rec}
                                decryptedPrivate={
                                  decryptedPrivateMap[rec.id] || {
                                    categoryId: rec.categoryId,
                                    serviceName: rec.serviceName,
                                    serviceUrl: rec.serviceUrl,
                                    login: rec.login,
                                    password: rec.passwordValue,
                                  }
                                }
                                categories={categories}
                                currentMember={currentMember}
                                allMembers={members}
                                clipboardClearSeconds={
                                  vaultConfig?.clipboardClearSeconds || 30
                                }
                                onQuickUpdatePassword={
                                  handleQuickUpdatePassword
                                }
                                onUpdateAllowedMembers={
                                  handleUpdateAllowedMembers
                                }
                                onUpdateSubAccounts={handleUpdateSubAccounts}
                                onDeleteRecord={handleDeleteRecord}
                                onStartClipboardCountdown={
                                  startClipboardCountdown
                                }
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Password Modal */}
      {currentMember && (
        <AddPasswordModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          categories={categories}
          currentMember={currentMember}
          allMembers={members}
          onSavePassword={handleAddPassword}
        />
      )}

      {/* iOS PWA Installation Guide Modal */}
      {showIOSInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-sm w-full p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-4 text-xs">
            <h3 className="text-base font-bold font-display text-[var(--vault-text)]">
              Instalacja aplikacji PWA na iPhone / iPad
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-[var(--vault-muted)]">
              <li>
                Stuknij ikonę <strong>Udostępnij</strong> na dolnym pasku przeglądarki Safari.
              </li>
              <li>
                Wybierz z listy opcję <strong>Dodaj do ekranu początkowego</strong>.
              </li>
              <li>
                Po otwarciu ikony z ekranu głównego zaloguj się swoim kontem i kliknij <strong>Autoryzuj moje urządzenie</strong>, aby spiąć aplikację PWA ze swoim profilem.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSInstallModal(false)}
              className="w-full py-2 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
            >
              Rozumiem
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
