import React, { useState } from 'react';
import {
  Check,
  X,
  Smartphone,
  Monitor,
  GitMerge,
  ShieldAlert,
  Trash2,
  Plus,
  Activity,
  Link2,
  Copy,
  Share2,
  ShieldCheck,
  KeyRound,
  UserPlus,
  RefreshCw,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { encodeFirebaseConfigForInviteUrl } from '../lib/firebase';
import {
  ActivityLog,
  CoAdminPermissions,
  DEFAULT_CO_ADMIN_PERMISSIONS,
  Device,
  getEffectiveCoAdminPermissions,
  InvitationMode,
  InvitationPurpose,
  isPrimaryAdmin,
  Member,
  PasswordRecord,
  VaultInvitation,
} from '../types/vault';

interface AdminTab2AccountsAndDevicesProps {
  members: Member[];
  devices: Device[];
  passwords: PasswordRecord[];
  invitations: VaultInvitation[];
  activityLogs: ActivityLog[];
  currentAdmin: Member;
  onCreateInvitation: (params: {
    purpose: InvitationPurpose;
    mode: InvitationMode;
    invitedLabel: string;
    targetMemberId?: string;
    hoursValid?: number;
  }) => Promise<VaultInvitation>;
  onDeleteInvitation: (invitationId: string) => Promise<void>;
  onApproveMemberAndDevices: (memberId: string) => Promise<void>;
  onRejectPendingMember: (memberId: string) => Promise<void>;
  onApproveDevice: (deviceId: string) => Promise<void>;
  onRebindDeviceCertificate: (deviceId: string) => Promise<void>;
  onRevokeDevice: (deviceId: string) => Promise<void>;
  onManualAddDeviceForMember: (params: {
    memberId: string;
    deviceName: string;
    customLabel: string;
    clientMode: 'pwa' | 'browser';
  }) => Promise<void>;
  onResetMemberCredentialsByAdmin: (params: {
    targetMemberId: string;
    newUsername: string;
    newPassword: string;
    approveAllDevices: boolean;
  }) => Promise<void>;
  onUpdateMemberRoleAndPermissions: (params: {
    targetMemberId: string;
    role: 'co_admin' | 'member';
    coAdminPermissions: CoAdminPermissions;
  }) => Promise<void>;
  onMergeMemberAccounts: (
    sourceMemberId: string,
    targetMemberId: string
  ) => Promise<void>;
}

export const AdminTab2AccountsAndDevices: React.FC<
  AdminTab2AccountsAndDevicesProps
> = ({
  members,
  devices,
  passwords,
  invitations,
  activityLogs,
  currentAdmin,
  onCreateInvitation,
  onDeleteInvitation,
  onApproveMemberAndDevices,
  onRejectPendingMember,
  onApproveDevice,
  onRebindDeviceCertificate,
  onRevokeDevice,
  onManualAddDeviceForMember,
  onResetMemberCredentialsByAdmin,
  onUpdateMemberRoleAndPermissions,
  onMergeMemberAccounts,
}) => {
  const isOwnerAdmin = isPrimaryAdmin(currentAdmin);
  const myPermissions = getEffectiveCoAdminPermissions(currentAdmin);

  // Invitation generator state
  const [invitePurpose, setInvitePurpose] =
    useState<InvitationPurpose>('new_member');
  const [inviteMode, setInviteMode] = useState<InvitationMode>('single_use');
  const [invitedLabel, setInvitedLabel] = useState('');
  const [recoveryTargetMemberId, setRecoveryTargetMemberId] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [latestCreatedInvite, setLatestCreatedInvite] =
    useState<VaultInvitation | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Account Merging state (Collapsible at bottom)
  const [isMergeSectionOpen, setIsMergeSectionOpen] = useState(false);
  const [sourceMergeId, setSourceMergeId] = useState<string>('');
  const [targetMergeId, setTargetMergeId] = useState<string>('');
  const [confirmMergeOpen, setConfirmMergeOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeFeedback, setMergeFeedback] = useState<string | null>(null);

  // Manual Device Add state
  const [addingDeviceForMemberId, setAddingDeviceForMemberId] = useState<
    string | null
  >(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceLabel, setNewDeviceLabel] = useState('');
  const [newDeviceMode, setNewDeviceMode] = useState<'pwa' | 'browser'>('pwa');

  // Emergency Member Password / Login Reset state
  const [resettingMemberId, setResettingMemberId] = useState<string | null>(
    null
  );
  const [resetUsernameInput, setResetUsernameInput] = useState('');
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetApproveDevices, setResetApproveDevices] = useState(true);
  const [isSavingReset, setIsSavingReset] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  // Co-Admin permissions editor state
  const [editingCoAdminMemberId, setEditingCoAdminMemberId] = useState<
    string | null
  >(null);

  const pendingMembers = members.filter((m) => m.status === 'pending');
  const pendingDevices = devices.filter((d) => d.status === 'pending');
  const pendingOrphanDevices = pendingDevices.filter(
    (dev) => !pendingMembers.some((pm) => pm.id === dev.memberId)
  );
  const hasAnyPendingApprovals =
    pendingMembers.length > 0 || pendingOrphanDevices.length > 0;

  const activeMembers = members.filter((m) => m.status === 'active');
  const nonAdminActiveMembers = activeMembers.filter(
    (m) => !isPrimaryAdmin(m)
  );

  const sourceMember = activeMembers.find((m) => m.id === sourceMergeId);
  const targetMember = activeMembers.find((m) => m.id === targetMergeId);

  const buildInviteUrl = (inv: VaultInvitation): string => {
    const base =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : '';
    const params = new URLSearchParams();
    params.set('invite', inv.token);
    const fbEncoded = encodeFirebaseConfigForInviteUrl();
    if (fbEncoded) {
      params.set('fb', fbEncoded);
    }
    return `${base}?${params.toString()}`;
  };

  const handleCopyInviteUrl = async (inv: VaultInvitation) => {
    const url = buildInviteUrl(inv);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteId(inv.id);
      setTimeout(() => setCopiedInviteId(null), 2500);
    } catch {
      // ignore
    }
  };

  const handleShareInviteUrl = async (inv: VaultInvitation) => {
    const url = buildInviteUrl(inv);
    const title =
      inv.purpose === 'account_recovery'
        ? `Link ratunkowy do skarbca FamilyStream Vault (${inv.targetMemberName || inv.invitedLabel})`
        : `Zaproszenie do skarbca FamilyStream Vault (${inv.invitedLabel})`;
    const text =
      inv.purpose === 'account_recovery'
        ? `Kliknij ten link, aby ustawić nowe hasło i odblokować swoje konto w skarbcu rodzinnym: ${url}`
        : `Kliknij ten link, wpisz swoje imię i nazwisko oraz kliknij „Załóż mi konto” w naszym rodzinnym skarbcu haseł: ${url}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await handleCopyInviteUrl(inv);
  };

  const handleCreateInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingInvite(true);
    try {
      const targetId =
        invitePurpose === 'account_recovery'
          ? recoveryTargetMemberId || nonAdminActiveMembers[0]?.id
          : undefined;
      const created = await onCreateInvitation({
        purpose: invitePurpose,
        mode: inviteMode,
        invitedLabel: invitedLabel.trim(),
        targetMemberId: targetId,
        hoursValid: 24,
      });
      setLatestCreatedInvite(created);
      setInvitedLabel('');
      await handleCopyInviteUrl(created);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleQuickCreateRecoveryLinkForMember = async (member: Member) => {
    setIsCreatingInvite(true);
    try {
      const created = await onCreateInvitation({
        purpose: 'account_recovery',
        mode: 'single_use',
        invitedLabel: `Link ratunkowy dla: ${member.fullName}`,
        targetMemberId: member.id,
        hoursValid: 24,
      });
      setLatestCreatedInvite(created);
      await handleCopyInviteUrl(created);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleOpenResetForMember = (member: Member) => {
    if (resettingMemberId === member.id) {
      setResettingMemberId(null);
      return;
    }
    setResettingMemberId(member.id);
    setResetUsernameInput(member.username);
    setResetPasswordInput('');
    setResetApproveDevices(true);
    setResetSuccessMsg(null);
  };

  const handleResetMemberSubmit = async (
    e: React.FormEvent,
    member: Member
  ) => {
    e.preventDefault();
    if (!resetUsernameInput.trim() || resetPasswordInput.length < 4) return;
    setIsSavingReset(true);
    setResetSuccessMsg(null);
    try {
      await onResetMemberCredentialsByAdmin({
        targetMemberId: member.id,
        newUsername: resetUsernameInput.trim().toLowerCase(),
        newPassword: resetPasswordInput,
        approveAllDevices: resetApproveDevices,
      });
      setResetSuccessMsg(
        `Zapisano nowy login („${resetUsernameInput
          .trim()
          .toLowerCase()}”) i nowe hasło dla ${member.fullName}! Może się już od razu zalogować.`
      );
      setResetPasswordInput('');
    } finally {
      setIsSavingReset(false);
    }
  };

  const handleToggleCoAdminRole = async (member: Member) => {
    const nextRole = member.role === 'co_admin' ? 'member' : 'co_admin';
    const nextPerms =
      member.coAdminPermissions || DEFAULT_CO_ADMIN_PERMISSIONS;
    await onUpdateMemberRoleAndPermissions({
      targetMemberId: member.id,
      role: nextRole,
      coAdminPermissions: nextPerms,
    });
    if (nextRole === 'co_admin') {
      setEditingCoAdminMemberId(member.id);
    } else if (editingCoAdminMemberId === member.id) {
      setEditingCoAdminMemberId(null);
    }
  };

  const handleToggleSingleCoAdminPermission = async (
    member: Member,
    permKey: keyof CoAdminPermissions
  ) => {
    const currentPerms = {
      ...DEFAULT_CO_ADMIN_PERMISSIONS,
      ...(member.coAdminPermissions || {}),
    };
    const updatedPerms: CoAdminPermissions = {
      ...currentPerms,
      [permKey]: !currentPerms[permKey],
    };
    await onUpdateMemberRoleAndPermissions({
      targetMemberId: member.id,
      role: 'co_admin',
      coAdminPermissions: updatedPerms,
    });
  };

  const handleConfirmMerge = async () => {
    if (!sourceMergeId || !targetMergeId || sourceMergeId === targetMergeId) {
      return;
    }
    setIsMerging(true);
    setMergeFeedback(null);
    try {
      await onMergeMemberAccounts(sourceMergeId, targetMergeId);
      setMergeFeedback(
        `Pomyślnie scalono konto „${sourceMember?.fullName} (${sourceMember?.username})” do konta „${targetMember?.fullName} (${targetMember?.username})” wraz ze wszystkimi urządzeniami i loginami wewnątrz.`
      );
      setSourceMergeId('');
      setTargetMergeId('');
      setConfirmMergeOpen(false);
    } finally {
      setIsMerging(false);
    }
  };

  const handleManualAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingDeviceForMemberId || !newDeviceName.trim()) return;
    await onManualAddDeviceForMember({
      memberId: addingDeviceForMemberId,
      deviceName: newDeviceName.trim(),
      customLabel: newDeviceLabel.trim() || 'Autoryzowane przez Opiekuna/Admina',
      clientMode: newDeviceMode,
    });
    setAddingDeviceForMemberId(null);
    setNewDeviceName('');
    setNewDeviceLabel('');
  };

  return (
    <div className="space-y-8">
      {/* Banner informacyjny dla Zaufanego Opiekuna (np. Brata) */}
      {!isOwnerAdmin && (
        <div className="p-4 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 font-semibold text-[var(--vault-accent)]">
              <ShieldCheck className="w-4 h-4" />
              <span>
                Tryb Zaufanego Opiekuna Rodziny (Co-Admin: {currentAdmin.fullName})
              </span>
            </div>
            <p className="text-[var(--vault-muted)]">
              Posiadasz delegowane uprawnienia do pomocy domownikom (np. mamie): możesz zresetować zapomniany login lub hasło, wygenerować link ratunkowy lub zaproszeniowy oraz zatwierdzić nowe urządzenie.
            </p>
          </div>
        </div>
      )}

      {/* CONDITIONAL TOP ALERT: Pending Approvals (Visible ONLY when someone is actually waiting in queue!) */}
      {myPermissions.canApproveDevicesAndMembers && hasAnyPendingApprovals && (
        <section className="p-6 rounded-xl border-2 border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--vault-border)] pb-3">
            <div>
              <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
                Oczekujące prośby o akceptację kont i urządzeń ({pendingMembers.length + pendingOrphanDevices.length})
              </h2>
              <p className="text-xs text-[var(--vault-muted)]">
                Zatwierdź jednym kliknięciem konta założone przez domowników z Twoich linków zaproszeniowych oraz nowe telefony lub przeglądarki.
              </p>
            </div>
            <div className="text-xs text-[var(--vault-accent)] font-semibold tabular-nums">
              Oczekujące konta: {pendingMembers.length} · Oczekujące urządzenia:{' '}
              {pendingOrphanDevices.length}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingMembers.map((member) => {
              const memberDevs = devices.filter(
                (d) => d.memberId === member.id
              );
              return (
                <div
                  key={member.id}
                  className="p-5 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-[var(--vault-accent)]">
                        Nowe konto domownika (z linku zaproszeniowego)
                      </div>
                      <h3 className="text-base font-semibold font-display text-[var(--vault-text)]">
                        {member.fullName}
                      </h3>
                      <div className="text-xs text-[var(--vault-muted)] font-mono">
                        Login: {member.username} · Zgłoszono:{' '}
                        {new Date(member.createdAt).toLocaleString('pl-PL')}
                      </div>
                    </div>
                  </div>

                  {memberDevs.length > 0 && (
                    <div className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-xs space-y-1">
                      <span className="text-[var(--vault-muted)] block">
                        Wykryte urządzenie podczas rejestracji:
                      </span>
                      {memberDevs.map((d) => (
                        <div
                          key={d.id}
                          className="font-mono text-[var(--vault-text)] flex items-center justify-between"
                        >
                          <span>{d.deviceName}</span>
                          <span>
                            {d.clientMode === 'pwa'
                              ? 'PWA App'
                              : 'Przeglądarka'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onApproveMemberAndDevices(member.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-success)] hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Akceptuj konto i urządzenie</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectPendingMember(member.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--vault-danger)] border border-[var(--vault-danger)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>Odrzuć</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {pendingOrphanDevices.map((dev) => (
              <div
                key={dev.id}
                className="p-5 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-3"
              >
                <div>
                  <div className="text-xs font-medium text-[var(--vault-accent)]">
                    Nowe urządzenie istniejącego użytkownika
                  </div>
                  <h3 className="text-base font-semibold font-display text-[var(--vault-text)]">
                    {dev.memberName} ({dev.username})
                  </h3>
                  <div className="text-xs text-[var(--vault-muted)] tabular-nums">
                    Prośba wysłana:{' '}
                    {new Date(dev.requestedAt).toLocaleString('pl-PL')}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--vault-muted)]">
                      Urządzenie i przeglądarka:
                    </span>
                    <span className="font-mono font-semibold text-[var(--vault-text)]">
                      {dev.deviceName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--vault-muted)]">Tryb:</span>
                    <span className="text-[var(--vault-text)]">
                      {dev.clientMode === 'pwa'
                        ? 'Aplikacja PWA (Standalone)'
                        : 'Przeglądarka WWW'}
                    </span>
                  </div>
                  {dev.hardwareSignatureHash && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--vault-muted)]">
                        Sygnatura sprzętowa:
                      </span>
                      <span className="font-mono text-[var(--vault-accent)]">
                        {dev.hardwareSignatureHash}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onApproveDevice(dev.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-success)] hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Akceptuj i wydaj Certyfikat Sprzętowy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevokeDevice(dev.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--vault-danger)] border border-[var(--vault-danger)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Odrzuć</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 01 (PRIMARY): Domownicy, Rola „Zaufany Opiekun” oraz Pomoc Awaryjna (Reset hasła Mamy) */}
      <section className="space-y-4">
        <div className="border-b border-[var(--vault-border)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
              01. Domownicy, Urządzenia, Zaufani Opiekunowie i Pomoc Awaryjna ({activeMembers.length})
            </h2>
            <p className="text-xs text-[var(--vault-muted)]">
              Zarządzaj kontami rodziny, sprawdzaj liczniki haseł bez naruszania prywatności, mianuj osobę zaufaną <strong>Zaufanym Opiekunem (Co-Adminem)</strong> oraz w każdej chwili zresetuj zapomniany login lub hasło domownikowi. Zmiany synchronizują się w czasie rzeczywistym przez Cloud Firestore (<code className="font-mono">onSnapshot</code>).
            </p>
          </div>
        </div>

        {/* Highlight box if a quick recovery link was just generated from a member card */}
        {latestCreatedInvite && (
          <div className="p-4 rounded-xl border border-[var(--vault-success)] bg-[var(--vault-surface)] space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--vault-text)]">
                Gotowy link ({latestCreatedInvite.invitedLabel} ·{' '}
                {latestCreatedInvite.mode === 'single_use'
                  ? 'Jednorazowy'
                  : 'Ważny 24h'}
                ):
              </span>
              <span className="text-[var(--vault-success)] font-medium">
                Wyślij ten link domownikowi (np. SMS / WhatsApp / Messenger)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={buildInviteUrl(latestCreatedInvite)}
                className="flex-1 px-3 py-2 font-mono text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyInviteUrl(latestCreatedInvite)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {copiedInviteId === latestCreatedInvite.id
                      ? 'Skopiowano!'
                      : 'Kopiuj link'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleShareInviteUrl(latestCreatedInvite)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 font-medium text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] rounded-lg cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  <span>Udostępnij</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {activeMembers.map((member) => {
            const memberIsOwnerAdmin = isPrimaryAdmin(member);
            const memberIsCoAdmin = member.role === 'co_admin';
            const memberPerms = {
              ...DEFAULT_CO_ADMIN_PERMISSIONS,
              ...(member.coAdminPermissions || {}),
            };
            const memberDevices = devices.filter(
              (d) => d.memberId === member.id
            );
            const sharedAccessCount = passwords.filter(
              (p) =>
                p.section === 'shared' &&
                (p.ownerId === member.id ||
                  p.allowedMemberIds.includes(member.id))
            ).length;
            const privateRecordsCount = passwords.filter(
              (p) => p.section === 'private' && p.ownerId === member.id
            ).length;
            const revealedToAdminCount = passwords.filter(
              (p) =>
                p.section === 'private' &&
                p.ownerId === member.id &&
                Boolean(p.revealToAdmin)
            ).length;
            const approvedDevicesCount = memberDevices.filter(
              (d) => d.status === 'approved'
            ).length;

            const canResetThisMember =
              !memberIsOwnerAdmin && myPermissions.canResetMemberCredentials;

            return (
              <div
                key={member.id}
                className={`p-5 rounded-xl border bg-[var(--vault-surface)] space-y-4 ${
                  memberIsCoAdmin
                    ? 'border-[var(--vault-accent)]'
                    : 'border-[var(--vault-border)]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold font-display text-[var(--vault-text)]">
                        {member.fullName}
                      </h3>
                      <span className="text-xs font-mono text-[var(--vault-muted)]">
                        (login: {member.username})
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          memberIsOwnerAdmin
                            ? 'text-[var(--vault-accent)]'
                            : memberIsCoAdmin
                              ? 'text-[var(--vault-success)]'
                              : 'text-[var(--vault-muted)]'
                        }`}
                      >
                        ·{' '}
                        {memberIsOwnerAdmin
                          ? 'Główny Administrator'
                          : memberIsCoAdmin
                            ? 'Zaufany Opiekun (Co-Admin)'
                            : 'Domownik'}
                      </span>
                    </div>

                    {/* Числоwe liczniki bez ujawniania treści prywatnych haseł */}
                    <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-[var(--vault-muted)]">
                      <span>
                        Prywatne hasła:{' '}
                        <strong className="text-[var(--vault-text)] font-mono">
                          {privateRecordsCount}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Współdzielone hasła:{' '}
                        <strong className="text-[var(--vault-text)] font-mono">
                          {sharedAccessCount}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Ujawnione Adminowi:{' '}
                        <strong className="text-[var(--vault-accent)] font-mono">
                          {revealedToAdminCount}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Aktywne urządzenia:{' '}
                        <strong className="text-[var(--vault-text)] font-mono">
                          {approvedDevicesCount}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons for this Member */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* 1. Emergency Reset Login/Password button */}
                    {canResetThisMember && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenResetForMember(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
                        >
                          <LifeBuoy className="w-3.5 h-3.5" />
                          <span>
                            {resettingMemberId === member.id
                              ? 'Zamknij panel pomocy'
                              : 'Pomoc / Resetuj login lub hasło'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={isCreatingInvite}
                          onClick={() =>
                            handleQuickCreateRecoveryLinkForMember(member)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-accent)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer"
                        >
                          <Link2 className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                          <span>Wyślij link rejestracyjny / ratunkowy</span>
                        </button>
                      </>
                    )}

                    {/* 2. Delegate Co-Admin Role button */}
                    {isOwnerAdmin && !memberIsOwnerAdmin && (
                      <button
                        type="button"
                        onClick={() => handleToggleCoAdminRole(member)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          memberIsCoAdmin
                            ? 'border-[var(--vault-success)] text-[var(--vault-success)] hover:bg-[var(--vault-bg)]'
                            : 'border-[var(--vault-border)] text-[var(--vault-text)] hover:bg-[var(--vault-surface-hover)]'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          {memberIsCoAdmin
                            ? 'Zaufany Opiekun (Aktywny)'
                            : 'Mianuj Zaufanym Opiekunem'}
                        </span>
                      </button>
                    )}

                    {/* 3. Add another device */}
                    {myPermissions.canApproveDevicesAndMembers && (
                      <button
                        type="button"
                        onClick={() =>
                          setAddingDeviceForMemberId(
                            addingDeviceForMemberId === member.id
                              ? null
                              : member.id
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                        <span>Dopisz urządzenie</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* PANEL A: Co-Admin Granular Permissions */}
                {memberIsCoAdmin && (
                  <div className="p-4 rounded-xl border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="font-semibold text-[var(--vault-text)]">
                          Uprawnienia Zaufanego Opiekuna ({member.fullName}):
                        </strong>
                        <p className="text-[11px] text-[var(--vault-muted)]">
                          Ta osoba może pomóc innym domownikom (np. mamie), gdy Główny Administrator jest niedostępny pod telefonem.
                        </p>
                      </div>
                      {isOwnerAdmin && (
                        <button
                          type="button"
                          onClick={() => handleToggleCoAdminRole(member)}
                          className="text-[11px] text-[var(--vault-danger)] hover:underline cursor-pointer"
                        >
                          Odbierz status Zaufanego Opiekuna
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-[var(--vault-text)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={!isOwnerAdmin}
                          checked={memberPerms.canResetMemberCredentials}
                          onChange={() =>
                            handleToggleSingleCoAdminPermission(
                              member,
                              'canResetMemberCredentials'
                            )
                          }
                        />
                        <span>
                          Resetowanie loginów i haseł domowników + linki ratunkowe (np. pomoc mamie)
                        </span>
                      </label>

                      <label className="flex items-center gap-2 text-[var(--vault-text)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={!isOwnerAdmin}
                          checked={memberPerms.canApproveDevicesAndMembers}
                          onChange={() =>
                            handleToggleSingleCoAdminPermission(
                              member,
                              'canApproveDevicesAndMembers'
                            )
                          }
                        />
                        <span>
                          Zatwierdzanie kont z poczekalni oraz odblokowywanie urządzeń
                        </span>
                      </label>

                      <label className="flex items-center gap-2 text-[var(--vault-text)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={!isOwnerAdmin}
                          checked={memberPerms.canCreateInvites}
                          onChange={() =>
                            handleToggleSingleCoAdminPermission(
                              member,
                              'canCreateInvites'
                            )
                          }
                        />
                        <span>
                          Generowanie nowych linków zaproszeniowych dla rodziny
                        </span>
                      </label>

                      <label className="flex items-center gap-2 text-[var(--vault-text)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={!isOwnerAdmin}
                          checked={memberPerms.canManagePasswordsAndVod}
                          onChange={() =>
                            handleToggleSingleCoAdminPermission(
                              member,
                              'canManagePasswordsAndVod'
                            )
                          }
                        />
                        <span>
                          Zarządzanie wspólnymi hasłami i przypisywanie subkont VOD
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* PANEL B: Emergency Password / Login Reset Panel */}
                {resettingMemberId === member.id && canResetThisMember && (
                  <div className="p-4 rounded-xl border-2 border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-4 text-xs">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--vault-border)] pb-2.5">
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--vault-accent)] flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Pomoc Awaryjna — Reset dostępu dla: {member.fullName}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--vault-muted)]">
                          Możesz podyktować nowe hasło przez telefon (Sposób A) lub wysłać jednorazowy link ratunkowy SMS-em/WhatsAppem (Sposób B). Wszystkie przypisane subkonta VOD i wpisy pozostają zachowane!
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isCreatingInvite}
                        onClick={() =>
                          handleQuickCreateRecoveryLinkForMember(member)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-[var(--vault-text)] border border-[var(--vault-accent)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] rounded-lg cursor-pointer text-left leading-snug self-start md:self-center"
                      >
                        <Link2 className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                        <span>
                          Sposób B: Skopiuj jednorazowy Link Ratunkowy dla tej osoby
                        </span>
                      </button>
                    </div>

                    <form
                      onSubmit={(e) => handleResetMemberSubmit(e, member)}
                      className="space-y-3"
                    >
                      <div className="font-semibold text-[var(--vault-text)]">
                        Sposób A: Ustaw nowy login lub hasło bezpośrednio teraz (np. podczas rozmowy telefonicznej)
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                            Login domownika (możesz przypomnieć lub uprościć)
                          </label>
                          <input
                            type="text"
                            value={resetUsernameInput}
                            onChange={(e) =>
                              setResetUsernameInput(e.target.value)
                            }
                            required
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] text-[var(--vault-muted)]">
                              Nowe hasło dla {member.fullName} (min. 4 znaki)
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setResetPasswordInput(
                                  `Dom${Math.floor(1000 + Math.random() * 9000)}`
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] text-[var(--vault-accent)] hover:underline cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Wstaw proste hasło (np. Dom1234)</span>
                            </button>
                          </div>
                          <input
                            type="text"
                            value={resetPasswordInput}
                            onChange={(e) =>
                              setResetPasswordInput(e.target.value)
                            }
                            placeholder="Wpisz nowe hasło..."
                            required
                            minLength={4}
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                          />
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-xs text-[var(--vault-text)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={resetApproveDevices}
                          onChange={(e) =>
                            setResetApproveDevices(e.target.checked)
                          }
                        />
                        <span>
                          Zatwierdź jednocześnie wszystkie urządzenia przypisane do tego konta
                        </span>
                      </label>

                      {resetSuccessMsg && (
                        <div className="p-2.5 rounded-lg border border-[var(--vault-success)] bg-[var(--vault-surface)] text-xs text-[var(--vault-text)]">
                          {resetSuccessMsg}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={isSavingReset}
                          className="px-4 py-2 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
                        >
                          {isSavingReset
                            ? 'Zapisywanie...'
                            : 'Zapisz nowe hasło i odblokuj dostęp'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResettingMemberId(null)}
                          className="px-3 py-2 text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
                        >
                          Zamknij
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* PANEL C: Manual Add Device Form */}
                {addingDeviceForMemberId === member.id && (
                  <form
                    onSubmit={handleManualAddDevice}
                    className="p-3.5 rounded-lg border border-[var(--vault-accent)] bg-[var(--vault-bg)] grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
                  >
                    <div>
                      <label className="block text-xs text-[var(--vault-muted)] mb-1">
                        Model / Przeglądarka
                      </label>
                      <input
                        type="text"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder="np. Telefon Mamy · PWA"
                        required
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--vault-muted)] mb-1">
                        Etykieta własna
                      </label>
                      <input
                        type="text"
                        value={newDeviceLabel}
                        onChange={(e) => setNewDeviceLabel(e.target.value)}
                        placeholder="np. Telefon w salonie"
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--vault-muted)] mb-1">
                        Tryb narzędzia
                      </label>
                      <select
                        value={newDeviceMode}
                        onChange={(e) =>
                          setNewDeviceMode(e.target.value as 'pwa' | 'browser')
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      >
                        <option value="pwa">Aplikacja PWA</option>
                        <option value="browser">Przeglądarka WWW</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded cursor-pointer"
                      >
                        Zatwierdź
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingDeviceForMemberId(null)}
                        className="px-2 py-1.5 text-xs text-[var(--vault-muted)] cursor-pointer"
                      >
                        Anuluj
                      </button>
                    </div>
                  </form>
                )}

                {/* Member's Paired Devices List */}
                {memberDevices.length === 0 ? (
                  <div className="text-xs text-[var(--vault-muted)]">
                    Brak sparowanych urządzeń dla tego konta.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {memberDevices.map((dev) => (
                      <div
                        key={dev.id}
                        className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          {dev.clientMode === 'pwa' ? (
                            <Smartphone className="w-4 h-4 text-[var(--vault-accent)] shrink-0 mt-0.5" />
                          ) : (
                            <Monitor className="w-4 h-4 text-[var(--vault-muted)] shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-medium text-[var(--vault-text)] truncate">
                              {dev.deviceName}{' '}
                              {dev.customLabel ? `· ${dev.customLabel}` : ''}
                            </div>
                            <div className="text-[var(--vault-muted)] font-mono text-[11px] truncate tabular-nums">
                              {dev.clientMode === 'pwa'
                                ? 'Tryb: Aplikacja PWA'
                                : 'Tryb: Przeglądarka'}{' '}
                              · Status:{' '}
                              {dev.status === 'approved'
                                ? 'Autoryzowane'
                                : dev.status === 'pending'
                                  ? 'Oczekuje'
                                  : 'Odpięte'}{' '}
                              {dev.webAuthnCredentialId
                                ? '· Odcisk palca aktywny'
                                : ''}
                            </div>
                            {dev.status === 'approved' && (
                              <div className="text-[11px] font-mono flex flex-wrap items-center gap-1.5">
                                <span className="text-[var(--vault-accent)] font-semibold">
                                  {dev.deviceCertificateFingerprint ||
                                    'CERT-HW-AKTYWNY'}
                                </span>
                                <span className="text-[var(--vault-muted)]">·</span>
                                <span
                                  className={
                                    dev.hardwareWrappedDek
                                      ? 'text-[var(--vault-success)]'
                                      : 'text-[var(--vault-muted)]'
                                  }
                                >
                                  {dev.hardwareWrappedDek
                                    ? 'Klucz sprzętowy spięty (AES-256-GCM)'
                                    : 'Certyfikat gotowy (spięcie przy logowaniu)'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {myPermissions.canApproveDevicesAndMembers && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {dev.status !== 'approved' ? (
                              <button
                                type="button"
                                onClick={() => onApproveDevice(dev.id)}
                                className="px-2.5 py-1 text-xs font-medium text-[#FAF7F2] bg-[var(--vault-success)] rounded cursor-pointer"
                              >
                                Akceptuj
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRebindDeviceCertificate(dev.id)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded hover:bg-[var(--vault-surface)] cursor-pointer"
                                  title="Odnów lub przepnij certyfikat sprzętowy dla tego urządzenia"
                                >
                                  <RefreshCw className="w-3 h-3 text-[var(--vault-accent)]" />
                                  <span>Przepnij Certyfikat</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRevokeDevice(dev.id)}
                                  className="p-1.5 text-[var(--vault-muted)] hover:text-[var(--vault-danger)] rounded cursor-pointer"
                                  title="Odepnij autoryzację i unieważnij certyfikat sprzętowy tego urządzenia"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 02: GENERATOR LINKÓW ZAPROSZENIOWYCH I RATUNKOWYCH */}
      {(myPermissions.canCreateInvites ||
        myPermissions.canResetMemberCredentials) && (
        <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--vault-border)] pb-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--vault-accent)]">
                <Link2 className="w-4 h-4" />
                <span>
                  Zamknięta Rejestracja i Pomoc Zdalna · Linki Kryptograficzne
                </span>
              </div>
              <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
                02. Utwórz link zaproszeniowy dla nowego domownika lub link ratunkowy
              </h2>
              <p className="text-xs text-[var(--vault-muted)]">
                Domownicy nie pobierają kodu z GitHuba. Wygeneruj poniżej link i wyślij go domownikowi — po kliknięciu wpisze swoje Imię i nazwisko oraz kliknie „Załóż mi konto” (lub ustawi nowe hasło).
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateInviteSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Cel linku */}
              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Rodzaj linku
                </label>
                <select
                  value={invitePurpose}
                  onChange={(e) => {
                    const next = e.target.value as InvitationPurpose;
                    setInvitePurpose(next);
                    if (
                      next === 'account_recovery' &&
                      !recoveryTargetMemberId &&
                      nonAdminActiveMembers.length > 0
                    ) {
                      setRecoveryTargetMemberId(nonAdminActiveMembers[0].id);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                >
                  <option value="new_member">
                    Nowe konto domownika („Załóż mi konto”)
                  </option>
                  {nonAdminActiveMembers.length > 0 && (
                    <option value="account_recovery">
                      Link ratunkowy — Reset zapomnianego hasła (np. dla Mamy)
                    </option>
                  )}
                </select>
              </div>

              {/* 2. Tryb ważności */}
              <div>
                <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                  Tryb ważności linku
                </label>
                <select
                  value={inviteMode}
                  onChange={(e) =>
                    setInviteMode(e.target.value as InvitationMode)
                  }
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                >
                  <option value="single_use">
                    Jednorazowy (wygasa od razu po 1 użyciu)
                  </option>
                  <option value="time_limited">
                    Czasowy — ważny przez 24 godziny
                  </option>
                </select>
              </div>

              {/* 3. Dla kogo */}
              {invitePurpose === 'account_recovery' ? (
                <div>
                  <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                    Wybierz domownika, któremu resetujesz dostęp
                  </label>
                  <select
                    value={recoveryTargetMemberId}
                    onChange={(e) => setRecoveryTargetMemberId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                  >
                    {nonAdminActiveMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} (login: {m.username})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                    Dla kogo (etykieta pomocnicza)
                  </label>
                  <input
                    type="text"
                    value={invitedLabel}
                    onChange={(e) => setInvitedLabel(e.target.value)}
                    placeholder="np. Dla Mamy, Dla Brata, Dla Kasi"
                    maxLength={80}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isCreatingInvite}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-xl transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {isCreatingInvite
                    ? 'Generowanie linku...'
                    : invitePurpose === 'account_recovery'
                      ? 'Utwórz i skopiuj link ratunkowy'
                      : 'Utwórz link zaproszeniowy'}
                </span>
              </button>
            </div>
          </form>

          {/* List of existing invitations */}
          {invitations.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--vault-border)]">
              <div className="text-xs font-semibold text-[var(--vault-muted)]">
                Utworzone linki zaproszeniowe i ratunkowe ({invitations.length}):
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {invitations.map((inv) => {
                  const isActive = inv.status === 'active';
                  return (
                    <div
                      key={inv.id}
                      className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="font-semibold text-[var(--vault-text)]">
                            {inv.invitedLabel}
                          </strong>
                          <span className="font-mono text-[11px] text-[var(--vault-muted)]">
                            ·{' '}
                            {inv.purpose === 'account_recovery'
                              ? `Reset konta (${inv.targetMemberName || ''})`
                              : 'Nowe konto'}{' '}
                            ·{' '}
                            {inv.mode === 'single_use'
                              ? 'Jednorazowy'
                              : 'Czasowy 24h'}
                          </span>
                          <span
                            className={`font-semibold ${
                              isActive
                                ? 'text-[var(--vault-success)]'
                                : 'text-[var(--vault-muted)]'
                            }`}
                          >
                            ·{' '}
                            {inv.status === 'active'
                              ? 'Aktywny'
                              : inv.status === 'used'
                                ? 'Wykorzystany'
                                : 'Wygasł'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--vault-muted)] font-mono truncate">
                          Utworzył: {inv.createdByMemberName} · Użyć:{' '}
                          {inv.usedCount}/{inv.maxUses} ·{' '}
                          {new Date(inv.createdAt).toLocaleString('pl-PL')}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCopyInviteUrl(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded hover:bg-[var(--vault-surface)] cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                              <span>
                                {copiedInviteId === inv.id
                                  ? 'Skopiowano'
                                  : 'Kopiuj link'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareInviteUrl(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded hover:bg-[var(--vault-surface)] cursor-pointer"
                            >
                              <Share2 className="w-3 h-3 text-[var(--vault-accent)]" />
                              <span>Wyślij</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteInvitation(inv.id)}
                          className="p-1.5 text-[var(--vault-muted)] hover:text-[var(--vault-danger)] rounded cursor-pointer"
                          title="Unieważnij i usuń link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION 03: Real-time Activity Log */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--vault-border)] pb-3">
          <Activity className="w-4 h-4 text-[var(--vault-accent)]" />
          <h2 className="text-lg font-bold font-display text-[var(--vault-text)]">
            03. Dziennik Aktywności w Czasie Rzeczywistym
          </h2>
        </div>

        <div className="rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] overflow-hidden">
          {activityLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--vault-muted)]">
              Brak zarejestrowanych zdarzeń w dzienniku.
            </div>
          ) : (
            <div className="divide-y divide-[var(--vault-border)] max-h-80 overflow-y-auto">
              {activityLogs.slice(0, 40).map((log) => (
                <div
                  key={log.id}
                  className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs hover:bg-[var(--vault-surface-hover)]"
                >
                  <div className="space-x-1.5">
                    <strong className="font-semibold text-[var(--vault-text)]">
                      {log.actorName}
                    </strong>
                    <span className="text-[var(--vault-muted)]">·</span>
                    <span className="text-[var(--vault-text)]">
                      {log.details}
                    </span>
                  </div>
                  <div className="text-[var(--vault-muted)] font-mono text-[11px] tabular-nums shrink-0">
                    {log.deviceInfo} ·{' '}
                    {new Date(log.timestamp).toLocaleString('pl-PL')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 04 (COLLAPSIBLE AT BOTTOM): Account Merging (Scalanie Kont Użytkowników) */}
      {isOwnerAdmin && (
        <section className="p-6 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-bold font-display text-[var(--vault-text)] flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-[var(--vault-accent)]" />
                <span>
                  04. Zaawansowane — Scalanie Zduplikowanych Kont Użytkowników
                </span>
              </h2>
              <p className="text-xs text-[var(--vault-muted)]">
                Jeśli domownik przypadkowo założył dwa osobne konta, możesz scalić je w jedno wraz ze wszystkimi urządzeniami i subkontami VOD.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsMergeSectionOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--vault-text)] border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              {isMergeSectionOpen ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  <span>Ukryj narzędzie scalania</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  <span>Rozwiń narzędzie scalania kont</span>
                </>
              )}
            </button>
          </div>

          {(isMergeSectionOpen || mergeFeedback) && (
            <div className="space-y-4 pt-4 border-t border-[var(--vault-border)]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                    Konto źródłowe (zostanie wchłonięte)
                  </label>
                  <select
                    value={sourceMergeId}
                    onChange={(e) => {
                      setSourceMergeId(e.target.value);
                      setConfirmMergeOpen(false);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                  >
                    <option value="">Wybierz konto do scalenia...</option>
                    {activeMembers
                      .filter(
                        (m) => m.id !== currentAdmin.id && m.id !== targetMergeId
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} (login: {m.username})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                    Konto docelowe (główne konto, które zostaje)
                  </label>
                  <select
                    value={targetMergeId}
                    onChange={(e) => {
                      setTargetMergeId(e.target.value);
                      setConfirmMergeOpen(false);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                  >
                    <option value="">Wybierz konto główne...</option>
                    {activeMembers
                      .filter((m) => m.id !== sourceMergeId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} (login: {m.username})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    disabled={!sourceMergeId || !targetMergeId}
                    onClick={() => setConfirmMergeOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>Przygotuj scalenie kont</span>
                  </button>
                </div>
              </div>

              {confirmMergeOpen && sourceMember && targetMember && (
                <div className="p-4 rounded-xl border border-[var(--vault-warning)] bg-[var(--vault-bg)] space-y-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-[var(--vault-text)]">
                    <ShieldAlert className="w-4 h-4 text-[var(--vault-warning)]" />
                    <span>
                      Potwierdzenie konsolidacji konta „{sourceMember.fullName} (
                      {sourceMember.username})” → „{targetMember.fullName} (
                      {targetMember.username})”
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isMerging}
                      onClick={handleConfirmMerge}
                      className="px-4 py-2 font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
                    >
                      {isMerging ? 'Scalanie kont...' : 'Potwierdź i scal konta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmMergeOpen(false)}
                      className="px-3 py-2 text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}

              {mergeFeedback && (
                <div className="p-3 rounded-lg border border-[var(--vault-success)] bg-[var(--vault-bg)] text-xs text-[var(--vault-text)]">
                  {mergeFeedback}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
