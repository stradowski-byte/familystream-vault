import React from 'react';
import { Plus, LogOut, ShieldCheck, User, Sun, Moon } from 'lucide-react';
import {
  isCoAdmin,
  isPrimaryAdmin,
  Member,
  ThemeMode,
} from '../types/vault';

export type AdminTabId = 'vault' | 'profile' | 'approvals' | 'config' | 'github';

interface TopBarProps {
  currentMember: Member | null;
  activeTab: AdminTabId;
  onSelectTab: (tab: AdminTabId) => void;
  pendingCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAddPassword: () => void;
  onLogout: () => void;
  }

export const TopBar: React.FC<TopBarProps> = ({
  currentMember,
  activeTab,
  onSelectTab,
  pendingCount,
  theme,
  onToggleTheme,
  onOpenAddPassword,
  onLogout,
  }) => {
  const isAdmin = isPrimaryAdmin(currentMember);
  const isTrustedCoAdmin = isCoAdmin(currentMember);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-[var(--vault-border)] bg-[var(--vault-surface)]">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('vault');
        }}
        className="text-lg font-bold tracking-tight font-display text-[var(--vault-text)] whitespace-nowrap shrink-0"
      >
        FamilyStream Vault
      </a>

      {/* Zone 2: Unified single-row navigation links across all screen sizes */}
      <nav className="order-3 lg:order-2 w-full lg:w-auto flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-[var(--vault-muted)] overflow-x-auto max-w-full py-0.5">
        {currentMember ? (
          <>
            <button
              type="button"
              onClick={() => onSelectTab('vault')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                activeTab === 'vault'
                  ? 'text-[var(--vault-text)] border-[var(--vault-accent)] font-semibold'
                  : 'border-transparent hover:text-[var(--vault-text)]'
              }`}
            >
              Skarbiec haseł
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'profile'
                  ? 'text-[var(--vault-text)] border-[var(--vault-accent)] font-semibold'
                  : 'border-transparent hover:text-[var(--vault-text)]'
              }`}
            >
              <User className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
              <span>Profil ({currentMember.fullName})</span>
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onSelectTab('approvals')}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 tabular-nums cursor-pointer ${
                    activeTab === 'approvals'
                      ? 'text-[var(--vault-text)] border-[var(--vault-accent)] font-semibold'
                      : 'border-transparent hover:text-[var(--vault-text)]'
                  }`}
                >
                  Konta i Domownicy
                  {pendingCount > 0 ? ` (${pendingCount})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('config')}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                    activeTab === 'config'
                      ? 'text-[var(--vault-text)] border-[var(--vault-accent)] font-semibold'
                      : 'border-transparent hover:text-[var(--vault-text)]'
                  }`}
                >
                  Kopie i Konfiguracja
                </button>
                              </>
            )}

            {isTrustedCoAdmin && (
              <button
                type="button"
                onClick={() => onSelectTab('approvals')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 tabular-nums cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === 'approvals'
                    ? 'text-[var(--vault-text)] border-[var(--vault-accent)] font-semibold'
                    : 'border-transparent hover:text-[var(--vault-text)]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                <span>
                  Panel Opiekuna
                  {pendingCount > 0 ? ` (${pendingCount})` : ''}
                </span>
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-[var(--vault-muted)] whitespace-nowrap shrink-0">
            Szyfrowany Skarbiec Rodzinny (AES-256-GCM)
          </span>
        )}
      </nav>

      {/* Zone 3: Primary actions (+ Dodaj hasło, Wyloguj & persistent top-right Theme Toggle Pictogram) */}
      <div className="order-2 lg:order-3 flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
        {currentMember && (
          <>
            <button
              type="button"
              onClick={onOpenAddPassword}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#FAF7F2] bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Dodaj hasło</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-[var(--vault-muted)] hover:text-[var(--vault-danger)] border border-[var(--vault-border)] rounded-lg hover:bg-[var(--vault-bg)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Wyloguj</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          title={
            theme === 'dusk'
              ? 'Przełącz na motyw jasny (Linen)'
              : 'Przełącz na motyw ciemny (Dusk)'
          }
          aria-label={
            theme === 'dusk'
              ? 'Przełącz na motyw jasny (Linen)'
              : 'Przełącz na motyw ciemny (Dusk)'
          }
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] text-[var(--vault-text)] transition-colors shrink-0 cursor-pointer"
        >
          {theme === 'dusk' ? (
            <Sun className="w-4 h-4 text-[var(--vault-accent)]" />
          ) : (
            <Moon className="w-4 h-4 text-[var(--vault-accent)]" />
          )}
        </button>
      </div>
    </header>
  );
};
