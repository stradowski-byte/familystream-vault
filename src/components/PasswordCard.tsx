import React, { useState } from 'react';
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Trash2,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
  UserPlus,
} from 'lucide-react';
import {
  DecryptedPrivatePayload,
  getEffectiveCoAdminPermissions,
  isPrimaryAdmin,
  Member,
  parseSubAccounts,
  PasswordRecord,
  SubAccountEntry,
  VaultCategory,
} from '../types/vault';
import { generateStrongPassword } from '../lib/crypto';
import { prepareOneClickLaunch } from '../lib/deviceAndBiometrics';

interface PasswordCardProps {
  record: PasswordRecord;
  decryptedPrivate?: DecryptedPrivatePayload | null;
  categories: VaultCategory[];
  currentMember: Member;
  allMembers: Member[];
  clipboardClearSeconds: number;
  activeHardwareCertFingerprint?: string | null;
  activeHardwareModeLabel?: string | null;
  onQuickUpdatePassword: (record: PasswordRecord, newPassword: string) => Promise<void>;
  onUpdateAllowedMembers: (record: PasswordRecord, memberIds: string[]) => Promise<void>;
  onUpdateSubAccounts: (
    record: PasswordRecord,
    nextSubAccounts: SubAccountEntry[],
    additionalAllowedMemberId?: string
  ) => Promise<void>;
  onToggleRevealToAdmin?: (
    record: PasswordRecord,
    nextReveal: boolean
  ) => Promise<void>;
  onDeleteRecord: (record: PasswordRecord) => Promise<void>;
  onStartClipboardCountdown: (seconds: number, label: string) => void;
}

export const PasswordCard: React.FC<PasswordCardProps> = ({
  record,
  decryptedPrivate,
  categories,
  currentMember,
  allMembers,
  clipboardClearSeconds,
  activeHardwareCertFingerprint,
  activeHardwareModeLabel,
  onQuickUpdatePassword,
  onUpdateAllowedMembers,
  onUpdateSubAccounts,
  onToggleRevealToAdmin,
  onDeleteRecord,
  onStartClipboardCountdown,
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isEditingAccess, setIsEditingAccess] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    record.allowedMemberIds
  );
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [isTogglingReveal, setIsTogglingReveal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sub-accounts state (for Netflix +10 zł / family multi-accounts)
  const [revealedSubPassIds, setRevealedSubPassIds] = useState<string[]>([]);
  const [editingSubAccountId, setEditingSubAccountId] = useState<string | null>(
    null
  );
  const [subNewPasswordInput, setSubNewPasswordInput] = useState('');
  const [isAddingSubAccount, setIsAddingSubAccount] = useState(false);
  const [newSubMemberId, setNewSubMemberId] = useState<string>('');
  const [newSubLabel, setNewSubLabel] = useState('Subkonto dodatkowe (+10 zł)');
  const [newSubLogin, setNewSubLogin] = useState('');
  const [newSubPassword, setNewSubPassword] = useState('');
  const [isSavingSubAccount, setIsSavingSubAccount] = useState(false);

  const isPrivate = record.section === 'private';
  const isOwner = record.ownerId === currentMember.id;
  const isAdmin =
    isPrimaryAdmin(currentMember) ||
    getEffectiveCoAdminPermissions(currentMember).canManagePasswordsAndVod;
  const isOwnerOrAdmin = isOwner || isAdmin;
  const canManageAccess = !isPrivate && isOwnerOrAdmin;

  const subAccounts = !isPrivate ? parseSubAccounts(record) : [];
  const myAssignedSubAccount =
    subAccounts.find((sa) => sa.assignedMemberId === currentMember.id) || null;

  // Regular member who has an assigned sub-account sees ONLY their own sub-account
  const isSubAccountOnlyView = !isOwnerOrAdmin && Boolean(myAssignedSubAccount);

  const displayServiceName = isPrivate
    ? decryptedPrivate?.serviceName ||
      (record.revealToAdmin && record.serviceName !== 'ENC[PRIVATE]'
        ? record.serviceName
        : 'Zaszyfrowany wpis prywatny')
    : record.serviceName;

  const displayServiceUrl = isPrivate
    ? decryptedPrivate?.serviceUrl ??
      (record.revealToAdmin && record.serviceUrl !== 'ENC[PRIVATE]'
        ? record.serviceUrl
        : '')
    : record.serviceUrl;

  const displayLogin = isPrivate
    ? decryptedPrivate?.login ||
      (record.revealToAdmin && record.login !== 'ENC[PRIVATE]'
        ? record.login
        : 'ENC[PRIVATE]')
    : isSubAccountOnlyView && myAssignedSubAccount
      ? myAssignedSubAccount.login
      : record.login;

  const displayPassword = isPrivate
    ? decryptedPrivate?.password ||
      (record.revealToAdmin ? record.passwordValue : '')
    : isSubAccountOnlyView && myAssignedSubAccount
      ? myAssignedSubAccount.passwordValue
      : record.passwordValue;

  const canUpdatePrimaryDisplayedPassword =
    isOwner || (!isPrivate && isAdmin) || isSubAccountOnlyView;

  const displayCategoryId = isPrivate
    ? decryptedPrivate?.categoryId ||
      (record.revealToAdmin && record.categoryId !== 'ENC[PRIVATE]'
        ? record.categoryId
        : 'other')
    : record.categoryId;

  const categoryName =
    categories.find((c) => c.id === displayCategoryId)?.name || 'Inne';

  const activeMembers = allMembers.filter((m) => m.status === 'active');
  const allowedMemberNames = activeMembers
    .filter((m) => record.allowedMemberIds.includes(m.id))
    .map((m) => m.fullName);

  const handleCopy = async (
    text: string,
    fieldKey: string,
    isSecretPassword = false
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      if (isSecretPassword) {
        onStartClipboardCountdown(clipboardClearSeconds, displayServiceName);
      }
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleOneClickLaunch = async () => {
    await prepareOneClickLaunch({
      serviceName: displayServiceName,
      serviceUrl: displayServiceUrl,
      login: displayLogin,
      password: displayPassword,
    });
    setCopiedField('launch');
    onStartClipboardCountdown(clipboardClearSeconds, displayServiceName);
    setTimeout(() => setCopiedField(null), 2500);

    if (displayServiceUrl) {
      const targetUrl = displayServiceUrl.startsWith('http')
        ? displayServiceUrl
        : `https://${displayServiceUrl}`;
      const anchor = document.createElement('a');
      anchor.href = targetUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPasswordInput.trim();
    if (!trimmed) return;
    setIsSavingPassword(true);
    try {
      if (isSubAccountOnlyView && myAssignedSubAccount) {
        const now = new Date().toISOString();
        const updatedList = subAccounts.map((sa) =>
          sa.id === myAssignedSubAccount.id
            ? { ...sa, passwordValue: trimmed, updatedAt: now }
            : sa
        );
        await onUpdateSubAccounts(record, updatedList);
      } else {
        await onQuickUpdatePassword(record, trimmed);
      }
      setIsUpdatingPassword(false);
      setNewPasswordInput('');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveSubAccountPassword = async (
    e: React.FormEvent,
    subAccountId: string
  ) => {
    e.preventDefault();
    const trimmed = subNewPasswordInput.trim();
    if (!trimmed) return;
    setIsSavingSubAccount(true);
    try {
      const now = new Date().toISOString();
      const updatedList = subAccounts.map((sa) =>
        sa.id === subAccountId
          ? { ...sa, passwordValue: trimmed, updatedAt: now }
          : sa
      );
      await onUpdateSubAccounts(record, updatedList);
      setEditingSubAccountId(null);
      setSubNewPasswordInput('');
    } finally {
      setIsSavingSubAccount(false);
    }
  };

  const handleAddSubAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubLogin.trim() || !newSubPassword.trim()) return;
    const targetMember =
      activeMembers.find((m) => m.id === newSubMemberId) || activeMembers[0];
    if (!targetMember) return;

    setIsSavingSubAccount(true);
    try {
      const now = new Date().toISOString();
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const newEntry: SubAccountEntry = {
        id: `sub_${randomSuffix}`,
        assignedMemberId: targetMember.id,
        assignedMemberName: targetMember.fullName,
        label: newSubLabel.trim() || 'Subkonto dodatkowe (+10 zł)',
        login: newSubLogin.trim(),
        passwordValue: newSubPassword.trim(),
        updatedAt: now,
      };
      const updatedList = [...subAccounts, newEntry];
      await onUpdateSubAccounts(record, updatedList, targetMember.id);
      setIsAddingSubAccount(false);
      setNewSubLogin('');
      setNewSubPassword('');
    } finally {
      setIsSavingSubAccount(false);
    }
  };

  const handleDeleteSubAccount = async (subAccountId: string) => {
    setIsSavingSubAccount(true);
    try {
      const updatedList = subAccounts.filter((sa) => sa.id !== subAccountId);
      await onUpdateSubAccounts(record, updatedList);
    } finally {
      setIsSavingSubAccount(false);
    }
  };

  const handleToggleMemberAccess = (memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSaveAccess = async () => {
    setIsSavingAccess(true);
    try {
      const ensuredOwner = selectedMemberIds.includes(record.ownerId)
        ? selectedMemberIds
        : [...selectedMemberIds, record.ownerId];
      await onUpdateAllowedMembers(record, ensuredOwner);
      setIsEditingAccess(false);
    } finally {
      setIsSavingAccess(false);
    }
  };

  const effectiveUpdatedIso =
    isSubAccountOnlyView && myAssignedSubAccount
      ? myAssignedSubAccount.updatedAt
      : record.passwordUpdatedAt;

  const formattedPasswordUpdated = effectiveUpdatedIso
    ? new Date(effectiveUpdatedIso).toLocaleString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] flex flex-col gap-3 transition-colors">
      {/* Compact Primary Row: Service Name, Record Type & Owner + Actions ("Uruchom i zaloguj" + "Pokaż detale") */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          onClick={() => setIsDetailsOpen((v) => !v)}
          className="min-w-0 cursor-pointer select-none"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-semibold font-display text-[var(--vault-text)] truncate">
              {displayServiceName}
            </h3>
            <span className="text-xs text-[var(--vault-muted)] shrink-0">
              · {categoryName} (
              {isPrivate
                ? record.revealToAdmin
                  ? 'Prywatny · Ujawniony Adminowi'
                  : 'Prywatny'
                : isSubAccountOnlyView
                  ? 'Twoje Subkonto'
                  : 'Wspólny'}
              )
            </span>
            {isOwnerOrAdmin && subAccounts.length > 0 && (
              <span className="text-xs font-medium text-[var(--vault-accent)] shrink-0 tabular-nums">
                · Subkonta: {subAccounts.length}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--vault-muted)] mt-0.5 truncate">
            Właściciel:{' '}
            <strong className="font-medium text-[var(--vault-text)]">
              {record.ownerName}
            </strong>
            {isSubAccountOnlyView && myAssignedSubAccount && (
              <span>
                {' '}
                · Subkonto dla:{' '}
                <strong className="font-medium text-[var(--vault-accent)]">
                  {myAssignedSubAccount.assignedMemberName}
                </strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOneClickLaunch}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>
              {copiedField === 'launch'
                ? 'Skopiowano i otwarto!'
                : 'Uruchom i zaloguj'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsDetailsOpen((v) => !v)}
            className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] hover:bg-[var(--vault-surface-hover)] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{isDetailsOpen ? 'Ukryj detale' : 'Pokaż detale'}</span>
            {isDetailsOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--vault-muted)]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--vault-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details Section — visible ONLY after clicking "Pokaż detale" */}
      {isDetailsOpen && (
        <div className="pt-3 border-t border-[var(--vault-border)] space-y-3">
          {/* Top Action Bar inside details: URL, Last Updated, Zmień hasło, Usuń */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vault-muted)]">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {displayServiceUrl && (
                <span className="font-mono truncate max-w-[220px]">
                  {displayServiceUrl}
                </span>
              )}
              {displayServiceUrl && formattedPasswordUpdated && (
                <span aria-hidden="true">·</span>
              )}
              {formattedPasswordUpdated && (
                <span className="tabular-nums">
                  Zmieniono: {formattedPasswordUpdated}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canUpdatePrimaryDisplayedPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setIsUpdatingPassword((v) => !v);
                    setNewPasswordInput(displayPassword);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  <span>
                    {isSubAccountOnlyView
                      ? 'Zmień hasło mojego subkonta'
                      : 'Zmień hasło'}
                  </span>
                </button>
              )}

              {isOwnerOrAdmin && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="p-1 text-[var(--vault-muted)] hover:text-[var(--vault-danger)] rounded-lg hover:bg-[var(--vault-surface-hover)] transition-colors cursor-pointer"
                  title="Usuń wpis"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Delete confirmation bar */}
          {confirmDelete && (
            <div className="p-3 rounded-lg border border-[var(--vault-danger)] bg-[var(--vault-bg)] flex items-center justify-between gap-3 text-xs">
              <span className="text-[var(--vault-text)]">
                Czy na pewno usunąć wpis <strong>{displayServiceName}</strong>?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onDeleteRecord(record)}
                  className="px-3 py-1 font-medium text-[#FAF7F2] bg-[var(--vault-danger)] rounded-md cursor-pointer whitespace-nowrap"
                >
                  Usuń
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 font-medium text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer whitespace-nowrap"
                >
                  Anuluj
                </button>
              </div>
            </div>
          )}

          {/* Primary Credentials block (either Main Account for Owner/Admin, or Assigned Sub-Account for Family Member) */}
          <div className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2.5">
            <div className="text-[11px] font-semibold text-[var(--vault-muted)]">
              {isSubAccountOnlyView && myAssignedSubAccount
                ? `Twoje przypisane subkonto (${myAssignedSubAccount.label || 'Subkonto rodzinne'})`
                : isOwnerOrAdmin && subAccounts.length > 0
                  ? 'Konto główne (Właściciel abonomentu)'
                  : 'Dane logowania'}
            </div>

            {/* Login Row */}
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="text-xs text-[var(--vault-muted)] block">
                  Login
                </span>
                <span className="font-mono text-sm text-[var(--vault-text)] truncate block">
                  {displayLogin}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(displayLogin, 'login', false)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--vault-muted)] hover:text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedField === 'login' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--vault-success)]" />
                    <span>Skopiowano</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopiuj login</span>
                  </>
                )}
              </button>
            </div>

            {/* Password Row */}
            <div className="flex items-center justify-between gap-3 text-sm pt-2 border-t border-[var(--vault-border)]">
              <div className="min-w-0">
                <span className="text-xs text-[var(--vault-muted)] block">
                  Hasło
                </span>
                <span className="font-mono text-sm text-[var(--vault-text)] truncate block tabular-nums">
                  {showPassword
                    ? displayPassword
                    : '•'.repeat(
                        Math.min(Math.max(displayPassword.length, 10), 18)
                      )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1.5 text-[var(--vault-muted)] hover:text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface)] transition-colors cursor-pointer"
                  title={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(displayPassword, 'password', true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--vault-muted)] hover:text-[var(--vault-text)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-surface)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedField === 'password' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--vault-success)]" />
                      <span>Skopiowano</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopiuj hasło</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Inline Quick Password Update (for primary displayed password / subaccount) */}
          {isUpdatingPassword && (
            <form
              onSubmit={handleSaveNewPassword}
              className="p-3.5 rounded-lg border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs font-medium text-[var(--vault-text)]">
                <span>
                  {isSubAccountOnlyView
                    ? 'Aktualizacja hasła w Twoim subkoncie'
                    : 'Aktualizacja hasła w istniejącym rekordzie'}
                </span>
                <button
                  type="button"
                  onClick={() => setNewPasswordInput(generateStrongPassword(16))}
                  className="inline-flex items-center gap-1 text-[var(--vault-accent)] hover:underline cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Generuj silne hasło</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Wpisz nowe hasło..."
                  maxLength={256}
                  required
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                />
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  className="px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isSavingPassword ? 'Zapisywanie...' : 'Zapisz nowe hasło'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsUpdatingPassword(false)}
                  className="px-2.5 py-1.5 text-xs text-[var(--vault-muted)] hover:text-[var(--vault-text)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}

          {/* MULTIKONTA / SUBKONTA SECTION (Visible to Owner and Admin on Shared records, e.g. Netflix +10 zł) */}
          {!isPrivate && isOwnerOrAdmin && (
            <div className="pt-2 border-t border-[var(--vault-border)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--vault-text)]">
                    Multikonta / Subkonta domowników (np. Netflix +10 zł)
                  </h4>
                  <p className="text-[11px] text-[var(--vault-muted)]">
                    Każdy przypisany domownik widzi w tej karcie wyłącznie swoje subkonto i może aktualizować swoje hasło.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newSubMemberId && activeMembers.length > 0) {
                      const firstOther =
                        activeMembers.find((m) => m.id !== currentMember.id) ||
                        activeMembers[0];
                      setNewSubMemberId(firstOther.id);
                    }
                    setIsAddingSubAccount((v) => !v);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Dodaj subkonto</span>
                </button>
              </div>

              {/* Add New Sub-Account Form */}
              {isAddingSubAccount && (
                <form
                  onSubmit={handleAddSubAccountSubmit}
                  className="p-3.5 rounded-lg border border-[var(--vault-accent)] bg-[var(--vault-bg)] space-y-3 text-xs"
                >
                  <div className="font-semibold text-[var(--vault-text)]">
                    Nowe subkonto w ramach konta {displayServiceName}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                        Przypisz do domownika
                      </label>
                      <select
                        value={newSubMemberId}
                        onChange={(e) => setNewSubMemberId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      >
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName} ({m.username})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                        Opis / pakiet subkonta
                      </label>
                      <input
                        type="text"
                        value={newSubLabel}
                        onChange={(e) => setNewSubLabel(e.target.value)}
                        placeholder="np. Subkonto dodatkowe (+10 zł)"
                        maxLength={80}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                        Indywidualny login subkonta
                      </label>
                      <input
                        type="text"
                        value={newSubLogin}
                        onChange={(e) => setNewSubLogin(e.target.value)}
                        placeholder="np. anna@dom.pl"
                        required
                        maxLength={120}
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] text-[var(--vault-muted)]">
                          Indywidualne hasło subkonta
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setNewSubPassword(generateStrongPassword(14))
                          }
                          className="text-[11px] text-[var(--vault-accent)] hover:underline cursor-pointer"
                        >
                          Generuj
                        </button>
                      </div>
                      <input
                        type="text"
                        value={newSubPassword}
                        onChange={(e) => setNewSubPassword(e.target.value)}
                        placeholder="Hasło subkonta..."
                        required
                        maxLength={256}
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingSubAccount(false)}
                      className="px-3 py-1 text-xs text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
                    >
                      Anuluj
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingSubAccount}
                      className="px-3.5 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-lg cursor-pointer"
                    >
                      {isSavingSubAccount
                        ? 'Zapisywanie...'
                        : 'Zapisz subkonto'}
                    </button>
                  </div>
                </form>
              )}

              {/* Existing Sub-Accounts List */}
              {subAccounts.length > 0 && (
                <div className="space-y-2">
                  {subAccounts.map((sa) => {
                    const isSubPassRevealed = revealedSubPassIds.includes(
                      sa.id
                    );
                    const isEditingThisSub = editingSubAccountId === sa.id;
                    return (
                      <div
                        key={sa.id}
                        className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <strong className="font-semibold text-[var(--vault-text)]">
                              Osoba: {sa.assignedMemberName}
                            </strong>
                            <span className="text-[var(--vault-muted)]">
                              {' '}
                              · {sa.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingThisSub) {
                                  setEditingSubAccountId(null);
                                } else {
                                  setEditingSubAccountId(sa.id);
                                  setSubNewPasswordInput(sa.passwordValue);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--vault-text)] border border-[var(--vault-border)] rounded hover:bg-[var(--vault-surface)] cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3 text-[var(--vault-accent)]" />
                              <span>Zmień hasło</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubAccount(sa.id)}
                              disabled={isSavingSubAccount}
                              className="p-1 text-[var(--vault-muted)] hover:text-[var(--vault-danger)] rounded cursor-pointer"
                              title="Usuń subkonto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[var(--vault-border)]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] text-[var(--vault-muted)] block">
                                Login subkonta
                              </span>
                              <span className="font-mono text-xs text-[var(--vault-text)] truncate block">
                                {sa.login}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(sa.login, `sub_login_${sa.id}`, false)
                              }
                              className="px-2 py-1 text-[11px] text-[var(--vault-muted)] hover:text-[var(--vault-text)] border border-[var(--vault-border)] rounded cursor-pointer shrink-0"
                            >
                              {copiedField === `sub_login_${sa.id}`
                                ? 'Skopiowano'
                                : 'Kopiuj'}
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] text-[var(--vault-muted)] block">
                                Hasło subkonta
                              </span>
                              <span className="font-mono text-xs text-[var(--vault-text)] truncate block tabular-nums">
                                {isSubPassRevealed
                                  ? sa.passwordValue
                                  : '•'.repeat(12)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedSubPassIds((prev) =>
                                    prev.includes(sa.id)
                                      ? prev.filter((id) => id !== sa.id)
                                      : [...prev, sa.id]
                                  )
                                }
                                className="p-1 text-[var(--vault-muted)] hover:text-[var(--vault-text)] border border-[var(--vault-border)] rounded cursor-pointer"
                              >
                                {isSubPassRevealed ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    sa.passwordValue,
                                    `sub_pass_${sa.id}`,
                                    true
                                  )
                                }
                                className="px-2 py-1 text-[11px] text-[var(--vault-muted)] hover:text-[var(--vault-text)] border border-[var(--vault-border)] rounded cursor-pointer"
                              >
                                {copiedField === `sub_pass_${sa.id}`
                                  ? 'Skopiowano'
                                  : 'Kopiuj'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {isEditingThisSub && (
                          <form
                            onSubmit={(e) =>
                              handleSaveSubAccountPassword(e, sa.id)
                            }
                            className="pt-2 border-t border-[var(--vault-border)] flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={subNewPasswordInput}
                              onChange={(e) =>
                                setSubNewPasswordInput(e.target.value)
                              }
                              placeholder="Nowe hasło subkonta..."
                              required
                              maxLength={256}
                              className="flex-1 px-2.5 py-1 text-xs font-mono rounded border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)]"
                            />
                            <button
                              type="submit"
                              disabled={isSavingSubAccount}
                              className="px-3 py-1 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded cursor-pointer shrink-0"
                            >
                              Zapisz
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Shared Access List & Editor (visible to Owner/Admin) */}
          {!isPrivate && isOwnerOrAdmin ? (
            <div className="pt-2 border-t border-[var(--vault-border)] space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--vault-muted)]">
                <span className="truncate">
                  Uprawnieni ({allowedMemberNames.length}):{' '}
                  <strong className="font-medium text-[var(--vault-text)]">
                    {allowedMemberNames.join(', ') || 'Tylko właściciel'}
                  </strong>
                </span>
                {canManageAccess && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberIds(record.allowedMemberIds);
                      setIsEditingAccess((v) => !v);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vault-accent)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{isEditingAccess ? 'Zamknij' : 'Edytuj dostęp'}</span>
                  </button>
                )}
              </div>

              {isEditingAccess && (
                <div className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2.5">
                  <div className="text-xs font-medium text-[var(--vault-text)]">
                    Wybierz domowników uprawnionych do tego konta:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {activeMembers.map((member) => {
                      const isChecked = selectedMemberIds.includes(member.id);
                      const isCreator = member.id === record.ownerId;
                      return (
                        <label
                          key={member.id}
                          className="flex items-center gap-2 text-xs text-[var(--vault-text)] cursor-pointer select-none py-1"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isCreator}
                            onChange={() => handleToggleMemberAccess(member.id)}
                            className="rounded border-[var(--vault-border)]"
                          />
                          <span className="truncate">
                            {member.fullName} ({member.username})
                            {isCreator ? ' · Właściciel' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingAccess(false)}
                      className="px-3 py-1 text-xs text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAccess}
                      disabled={isSavingAccess}
                      className="px-3 py-1 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-md cursor-pointer"
                    >
                      {isSavingAccess ? 'Zapisywanie...' : 'Zapisz uprawnienia'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : isPrivate ? (
            <div className="pt-2 border-t border-[var(--vault-border)] space-y-2.5">
              {isOwner && onToggleRevealToAdmin && (
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:border-[var(--vault-accent)] transition-colors cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(record.revealToAdmin)}
                    disabled={isTogglingReveal}
                    onChange={async (e) => {
                      const nextVal = e.target.checked;
                      setIsTogglingReveal(true);
                      try {
                        await onToggleRevealToAdmin(record, nextVal);
                      } finally {
                        setIsTogglingReveal(false);
                      }
                    }}
                    className="mt-0.5 rounded border-[var(--vault-border)] cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-[var(--vault-text)] block">
                      Ujawnij hasło administratorowi
                    </span>
                    <span className="text-[11px] text-[var(--vault-muted)]">
                      {record.revealToAdmin
                        ? 'Włączone: Główny Administrator oraz Zaufani Opiekunowie (Co-Admini) widzą ten wpis jawnie. Odznacz, aby ukryć wpis w trybie Zero-Knowledge.'
                        : 'Wyłączone (Zero-Knowledge): Wpis jest całkowicie zaszyfrowany i niewidoczny dla Administratora. Zaznacz, jeśli chcesz udostępnić mu podgląd.'}
                    </span>
                  </div>
                </label>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vault-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[var(--vault-success)] shrink-0" />
                  <span>
                    {isOwner
                      ? 'Odszyfrowano kluczem sprzętowym urządzenia (Hasło + Profil Sprzętowy + Certyfikat)'
                      : 'Wpis prywatny dobrowolnie ujawniony Administratorowi przez właściciela konta'}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-[var(--vault-text)]">
                  {activeHardwareCertFingerprint || 'CERT-HW-BOUND'} ·{' '}
                  {activeHardwareModeLabel || 'AES-256-GCM'}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
