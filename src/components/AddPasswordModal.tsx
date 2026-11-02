import React, { useState } from 'react';
import { X, RefreshCw, Lock, Users, UserPlus, Trash2 } from 'lucide-react';
import { Member, SubAccountEntry, VaultCategory } from '../types/vault';
import { generateStrongPassword } from '../lib/crypto';

interface AddPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: VaultCategory[];
  currentMember: Member;
  allMembers: Member[];
  onSavePassword: (params: {
    section: 'shared' | 'private';
    categoryId: string;
    serviceName: string;
    serviceUrl: string;
    login: string;
    password: string;
    allowedMemberIds: string[];
    revealToAdmin?: boolean;
    subAccounts?: SubAccountEntry[];
  }) => Promise<void>;
}

export const AddPasswordModal: React.FC<AddPasswordModalProps> = ({
  isOpen,
  onClose,
  categories,
  currentMember,
  allMembers,
  onSavePassword,
}) => {
  const [section, setSection] = useState<'shared' | 'private'>('shared');
  const [categoryId, setCategoryId] = useState<string>(
    categories[0]?.id || 'vod'
  );
  const [serviceName, setServiceName] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [revealToAdmin, setRevealToAdmin] = useState(false);
  const [allowedMemberIds, setAllowedMemberIds] = useState<string[]>(
    allMembers.filter((m) => m.status === 'active').map((m) => m.id)
  );

  // Optional initial sub-accounts (e.g. Netflix Pakiet Rodzinny +10 zł)
  const [subAccounts, setSubAccounts] = useState<SubAccountEntry[]>([]);
  const [isAddingSub, setIsAddingSub] = useState(false);
  const [subMemberId, setSubMemberId] = useState('');
  const [subLabel, setSubLabel] = useState('Subkonto dodatkowe (+10 zł)');
  const [subLogin, setSubLogin] = useState('');
  const [subPassword, setSubPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeMembers = allMembers.filter((m) => m.status === 'active');

  const handleToggleMember = (memberId: string) => {
    if (memberId === currentMember.id) return;
    setAllowedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleAddDraftSubAccount = () => {
    if (!subMemberId || !subLogin.trim() || !subPassword.trim()) return;
    const assignedMember = activeMembers.find((m) => m.id === subMemberId);
    if (!assignedMember) return;

    const newSub: SubAccountEntry = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      assignedMemberId: assignedMember.id,
      assignedMemberName: assignedMember.fullName,
      label: subLabel.trim() || `Subkonto (${assignedMember.fullName})`,
      login: subLogin.trim(),
      passwordValue: subPassword.trim(),
      updatedAt: new Date().toISOString(),
    };

    setSubAccounts((prev) => [...prev, newSub]);
    if (!allowedMemberIds.includes(assignedMember.id)) {
      setAllowedMemberIds((prev) => [...prev, assignedMember.id]);
    }
    setSubLogin('');
    setSubPassword('');
    setIsAddingSub(false);
  };

  const handleRemoveDraftSubAccount = (subId: string) => {
    setSubAccounts((prev) => prev.filter((s) => s.id !== subId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!serviceName.trim() || !login.trim() || !password.trim()) {
      setErrorMsg('Uzupełnij nazwę serwisu, login oraz hasło.');
      return;
    }

    setIsSubmitting(true);
    try {
      const subAssignedIds = subAccounts.map((s) => s.assignedMemberId);
      const finalAllowed =
        section === 'private'
          ? [currentMember.id]
          : Array.from(
              new Set([
                ...allowedMemberIds,
                ...subAssignedIds,
                currentMember.id,
              ])
            );

      await onSavePassword({
        section,
        categoryId,
        serviceName: serviceName.trim(),
        serviceUrl: serviceUrl.trim(),
        login: login.trim(),
        password: password.trim(),
        allowedMemberIds: finalAllowed,
        revealToAdmin: section === 'private' ? revealToAdmin : false,
        subAccounts: section === 'shared' ? subAccounts : [],
      });

      setServiceName('');
      setServiceUrl('');
      setLogin('');
      setPassword('');
      setRevealToAdmin(false);
      setSubAccounts([]);
      setIsAddingSub(false);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Nie udało się zapisać hasła.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--vault-border)] bg-[var(--vault-surface)] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--vault-border)] pb-3">
          <h2 className="text-lg font-semibold font-display text-[var(--vault-text)]">
            Dodaj nowe hasło do skarbca
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--vault-muted)] hover:text-[var(--vault-text)] rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Selector: Wspólne vs Prywatne */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[var(--vault-bg)] border border-[var(--vault-border)]">
          <button
            type="button"
            onClick={() => setSection('shared')}
            className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              section === 'shared'
                ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Wspólne (Rodzinne VOD / WWW)</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('private')}
            className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              section === 'private'
                ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Prywatne (Szyfrowane AES-256)</span>
          </button>
        </div>

        {section === 'private' && (
          <div className="space-y-2.5">
            <div className="p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-xs text-[var(--vault-muted)]">
              {revealToAdmin ? (
                <span>
                  Wybrano <strong>jawny podgląd dla Administratora</strong>: wpis pozostaje prywatny i ukryty przed zwykłymi domownikami, ale Główny Administrator oraz Zaufani Opiekunowie (Co-Admini) będą widzieć nazwę serwisu, URL, login i hasło.
                </span>
              ) : (
                <span>
                  Wpis prywatny zostanie w całości zaszyfrowany w przeglądarce (nazwa serwisu, kategoria, URL, login i hasło) kluczem osobistym Twojego konta. W bazie danych oraz u Administratora będzie widoczny wyłącznie jako zaszyfrowany ciąg <code className="font-mono">ENC[AES-256-GCM:...]</code>.
                </span>
              )}
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:border-[var(--vault-accent)] transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={revealToAdmin}
                onChange={(e) => setRevealToAdmin(e.target.checked)}
                className="mt-0.5 rounded border-[var(--vault-border)] cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-[var(--vault-text)] block">
                  Ujawnij hasło administratorowi
                </span>
                <span className="text-[11px] text-[var(--vault-muted)]">
                  Jeśli zaznaczysz tę opcję, Główny Administrator oraz Zaufani Opiekunowie (Co-Admini) zobaczą pełny wpis (serwis, URL, login i hasło). Pozostali domownicy nadal nie będą mieli do niego dostępu.
                </span>
              </div>
            </label>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                Kategoria / Typ wpisu
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
                Nazwa serwisu / konta
              </label>
              <input
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="np. Netflix, Allegro, Poczta Gmail"
                maxLength={120}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
              Adres URL strony logowania (opcjonalnie)
            </label>
            <input
              type="text"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="https://www.netflix.com/pl/login"
              maxLength={400}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--vault-muted)] mb-1">
              Login głównego konta lub adres e-mail
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="rodzina@dom.pl"
              maxLength={120}
              required
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[var(--vault-muted)]">
                Hasło głównego konta
              </label>
              <button
                type="button"
                onClick={() => setPassword(generateStrongPassword(16))}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vault-accent)] hover:underline cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Wygeneruj silne hasło</span>
              </button>
            </div>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Wpisz lub wygeneruj hasło..."
              maxLength={256}
              required
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
            />
          </div>

          {section === 'shared' && (
            <>
              {/* Optional Sub-Accounts Section (e.g., Netflix +10 zł) */}
              <div className="p-3.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-[var(--vault-text)] block">
                      Multikonta / Subkonta domowników (np. Netflix +10 zł)
                    </span>
                    <span className="text-[11px] text-[var(--vault-muted)]">
                      Domownik z przypisanym subkontem widzi w karcie wyłącznie swój własny login i hasło.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!subMemberId && activeMembers.length > 0) {
                        const firstOther =
                          activeMembers.find((m) => m.id !== currentMember.id) ||
                          activeMembers[0];
                        setSubMemberId(firstOther.id);
                      }
                      setIsAddingSub((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-md cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isAddingSub ? 'Zamknij' : '+ Dodaj subkonto'}</span>
                  </button>
                </div>

                {isAddingSub && (
                  <div className="p-3 rounded-lg border border-[var(--vault-accent)] bg-[var(--vault-surface)] space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                          Przypisz do domownika
                        </label>
                        <select
                          value={subMemberId}
                          onChange={(e) => setSubMemberId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
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
                          Etykieta pakietu
                        </label>
                        <input
                          type="text"
                          value={subLabel}
                          onChange={(e) => setSubLabel(e.target.value)}
                          placeholder="np. Subkonto +10 zł"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                          Login subkonta
                        </label>
                        <input
                          type="text"
                          value={subLogin}
                          onChange={(e) => setSubLogin(e.target.value)}
                          placeholder="login.subkonta@dom.pl"
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--vault-muted)] mb-1">
                          Hasło subkonta
                        </label>
                        <input
                          type="text"
                          value={subPassword}
                          onChange={(e) => setSubPassword(e.target.value)}
                          placeholder="Hasło subkonta..."
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-[var(--vault-border)] bg-[var(--vault-bg)] text-[var(--vault-text)]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleAddDraftSubAccount}
                        className="px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] rounded-md cursor-pointer"
                      >
                        Dodaj do listy subkont
                      </button>
                    </div>
                  </div>
                )}

                {subAccounts.length > 0 && (
                  <div className="space-y-1.5">
                    {subAccounts.map((sa) => (
                      <div
                        key={sa.id}
                        className="flex items-center justify-between gap-2 p-2 rounded border border-[var(--vault-border)] bg-[var(--vault-surface)] text-xs"
                      >
                        <div className="min-w-0">
                          <strong className="text-[var(--vault-text)]">
                            {sa.assignedMemberName}
                          </strong>{' '}
                          <span className="text-[var(--vault-muted)]">
                            ({sa.label}) ·{' '}
                          </span>
                          <span className="font-mono text-[var(--vault-text)]">
                            {sa.login}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftSubAccount(sa.id)}
                          className="p-1 text-[var(--vault-muted)] hover:text-[var(--vault-danger)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--vault-text)]">
                    Domownicy z dostępem do tej karty:
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setAllowedMemberIds(activeMembers.map((m) => m.id))
                      }
                      className="text-[var(--vault-accent)] hover:underline cursor-pointer"
                    >
                      Wszyscy
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setAllowedMemberIds([currentMember.id])}
                      className="text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
                    >
                      Tylko ja
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                  {activeMembers.map((member) => {
                    const checked =
                      member.id === currentMember.id ||
                      allowedMemberIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 text-xs text-[var(--vault-text)] cursor-pointer py-1"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={member.id === currentMember.id}
                          onChange={() => handleToggleMember(member.id)}
                        />
                        <span className="truncate">
                          {member.fullName} ({member.username})
                          {member.id === currentMember.id ? ' · Ty' : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg border border-[var(--vault-danger)] text-xs text-[var(--vault-danger)]">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--vault-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[var(--vault-muted)] hover:text-[var(--vault-text)] cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors cursor-pointer"
            >
              {isSubmitting ? 'Zapisywanie...' : 'Dodaj do skarbca'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
