import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Terminal,
  Copy,
  Check,
  Rocket,
  Lock,
} from 'lucide-react';
import {
  fetchGitHubSyncConfigFromServer,
  pushProjectCodeToGitHubOnServer,
  saveGitHubPatOnServer,
} from '../lib/vaultApiClient';
import {
  GitHubPushResult,
  GitHubSyncConfig,
} from '../types/vault';

interface AdminTab4GitHubAndUpdatesProps {
  onLogActivity: (actionType: string, details: string) => Promise<void>;
}

const GITHUB_TOKEN_STORAGE_KEY = 'fsv_github_pat_v1';
const GITHUB_ONE_CLICK_PAT_URL =
  'https://github.com/settings/tokens/new?description=FamilyStream-Vault-AI-Studio&scopes=repo';

export const AdminTab4GitHubAndUpdates: React.FC<
  AdminTab4GitHubAndUpdatesProps
> = ({
  onLogActivity,
}) => {
  const [githubConfig, setGithubConfig] = useState<GitHubSyncConfig>({
    repoOwner: '',
    repoName: 'familystream-vault',
    branch: 'main',
    hasServerSecretPat: false,
    secretPatSource: 'NONE',
  });

  const [personalAccessToken, setPersonalAccessToken] = useState<string>(() => {
    try {
      return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [repoNameInput, setRepoNameInput] = useState('familystream-vault');
  const [showPatInput, setShowPatInput] = useState(false);
  const [copiedSecretName, setCopiedSecretName] = useState(false);

  const [isPushing, setIsPushing] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<GitHubPushResult | null>(null);
  const [cliLogs, setCliLogs] = useState<string[]>([
    '$ gh auth status',
    '✓ Gotowy do automatycznego utworzenia repozytorium i wdrożenia czystego kodu (bez katalogu data/).',
  ]);

  useEffect(() => {
    let mounted = true;
    fetchGitHubSyncConfigFromServer()
      .then((cfg) => {
        if (!mounted || !cfg) return;
        setGithubConfig(cfg);
        if (cfg.repoName) setRepoNameInput(cfg.repoName);
        if (cfg.hasServerSecretPat) {
          setCliLogs([
            `$ gh auth status`,
            `✓ Wykryto aktywny token GitHub PAT na serwerze (${
              cfg.secretPatSource === 'GITHUB_PAT_ENV'
                ? 'Sekret Google AI Studio: GITHUB_PAT'
                : 'Zapisany Token Serwera'
            })${cfg.repoOwner ? ` dla konta: @${cfg.repoOwner}` : ''}`,
            `✓ Docelowe repozytorium: https://github.com/${
              cfg.repoOwner || '<twoje-konto>'
            }/${cfg.repoName || 'familystream-vault'} (gałąź: ${
              cfg.branch || 'main'
            })`,
          ]);
        }
      })
      .catch(() => {
        // ignore initial fetch error
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopySecretKeyName = async () => {
    try {
      await navigator.clipboard.writeText('GITHUB_PAT');
      setCopiedSecretName(true);
      setTimeout(() => setCopiedSecretName(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleSaveTokenOnly = async () => {
    const cleanToken = personalAccessToken.trim();
    if (!cleanToken) {
      setPushError(
        'Najpierw wygeneruj token przyciskiem „1. Wygeneruj Token GitHub PAT” i wklej go w pole poniżej.'
      );
      return;
    }
    setPushError(null);
    setIsSavingToken(true);
    setCliLogs((prev) => [
      ...prev,
      `$ gh auth login --with-token (weryfikacja konta GitHub)...`,
    ]);
    try {
      try {
        localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, cleanToken);
      } catch {
        // ignore
      }
      const updatedCfg = await saveGitHubPatOnServer({
        personalAccessToken: cleanToken,
        repoName: repoNameInput.trim() || 'familystream-vault',
      });
      setGithubConfig(updatedCfg);
      setShowPatInput(false);
      setCliLogs((prev) => [
        ...prev,
        `✓ Zweryfikowano konto GitHub: @${updatedCfg.repoOwner} i zapisano token na serwerze.`,
      ]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Nie udało się zweryfikować tokenu GitHub PAT.';
      setPushError(msg);
      setCliLogs((prev) => [...prev, `✗ Błąd autoryzacji: ${msg}`]);
    } finally {
      setIsSavingToken(false);
    }
  };

  const handleOneClickGitHubCliDeploy = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPushError(null);
    setPushResult(null);

    const cleanToken = personalAccessToken.trim();
    const hasReadyToken = Boolean(
      cleanToken || githubConfig.hasServerSecretPat
    );

    if (!hasReadyToken) {
      setShowPatInput(true);
      setPushError(
        'Brak skonfigurowanego tokenu GITHUB_PAT. Kliknij „1. Wygeneruj Token GitHub PAT (1-Klik)”, a następnie dodaj go w Secrets jako GITHUB_PAT lub wklej bezpośrednio w pole poniżej.'
      );
      return;
    }

    setIsPushing(true);
    const targetRepo = repoNameInput.trim() || 'familystream-vault';
    setCliLogs([
      `$ gh auth status`,
      `→ Weryfikacja tokenu PAT i konta GitHub...`,
      `$ gh repo view ${githubConfig.repoOwner || '<twoje-konto>'}/${targetRepo} || gh repo create ${targetRepo} --private`,
      `→ Sprawdzanie / automatyczne zakładanie prywatnego repozytorium "${targetRepo}"...`,
      `$ git add --all --exclude="data/*" --exclude=".env"`,
      `→ Pakowanie czystych plików źródłowych projektu i wysyłanie drzewa Git do gałęzi main...`,
    ]);

    try {
      if (cleanToken) {
        try {
          localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, cleanToken);
        } catch {
          // ignore
        }
      }

      const res = await pushProjectCodeToGitHubOnServer({
        personalAccessToken: cleanToken || undefined,
        repoName: targetRepo,
        branch: 'main',
        createRepoIfMissing: true,
        isPrivateRepo: true,
      });

      setPushResult(res);
      setGithubConfig((prev) => ({
        ...prev,
        repoOwner: res.repoOwner || prev.repoOwner || '',
        repoName: res.repoName || targetRepo,
        branch: res.branch,
        lastCommitSha: res.commitSha,
        lastCommitUrl: res.commitUrl,
        lastPushedAt: res.pushedAt,
        hasServerSecretPat: true,
      }));
      setShowPatInput(false);

      setCliLogs((prev) => [
        ...prev,
        res.createdNewRepo
          ? `✓ Utworzono nowe prywatne repozytorium: ${res.repoUrl}`
          : `✓ Połączono z istniejącym repozytorium: ${res.repoUrl}`,
        `✓ Wysłano ${res.filesCount} czystych plików kodu (Commit SHA: ${res.commitSha.slice(
          0,
          10
        )})`,
        `✓ Dane domowników (data/vault-db.json) pozostały w 100% odizolowane poza GitHubem!`,
      ]);

      await onLogActivity(
        'GITHUB_CLI_PUSH',
        `Wdrożono kod przez GitHub CLI (${res.filesCount} plików) do ${res.repoUrl} (Commit: ${res.commitSha.slice(0, 7)}).`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Nie udało się wykonać wdrożenia GitHub CLI.';
      setPushError(msg);
      setCliLogs((prev) => [...prev, `✗ BŁĄD GITHUB CLI: ${msg}`]);
    } finally {
      setIsPushing(false);
    }
  };

  const hasActivePat = Boolean(
    githubConfig.hasServerSecretPat || personalAccessToken.trim()
  );

  return (
    <div className="space-y-8">
      {/* GITHUB REPOSITORY MANAGEMENT (FULL-WIDTH CARD) */}
      <section className="rounded-xl border border-[var(--vault-border)] bg-[var(--vault-card)] overflow-hidden">
        <div className="bg-[var(--vault-surface)] border-b border-[var(--vault-border)] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <GitBranch className="w-4 h-4 shrink-0" />
              <span>
                Zarządzanie Repozytorium GitHub (Czysty Silnik bez Katalogu data/)
              </span>
            </div>
            <h2 className="text-base font-bold text-[var(--vault-text)]">
              Jednoklikowy Generator PAT, Sekret AI Studio i Automatyczny Commit
              &amp; Push
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border whitespace-nowrap ${
                githubConfig.secretPatSource === 'GITHUB_PAT_ENV'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : hasActivePat
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-red-500/15 text-red-300 border-red-500/30'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>
                {githubConfig.secretPatSource === 'GITHUB_PAT_ENV'
                  ? 'Sekret GITHUB_PAT: Aktywny'
                  : hasActivePat
                    ? 'Token PAT: Skonfigurowany'
                    : 'Token PAT: Wymagana konfiguracja'}
              </span>
            </span>

            {githubConfig.lastCommitSha && githubConfig.lastCommitUrl && (
              <a
                href={githubConfig.lastCommitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-[var(--vault-accent)] hover:underline whitespace-nowrap"
              >
                <span>
                  Commit: {githubConfig.lastCommitSha.slice(0, 7)}
                </span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-xs text-[var(--vault-muted)] max-w-3xl leading-relaxed">
            Konsola <strong>GitHub CLI</strong> automatycznie rozpoznaje konto
            GitHub powiązane z Twoim tokenem PAT, zakłada prywatne repozytorium{' '}
            <span className="font-mono text-[var(--vault-text)]">
              {githubConfig.repoOwner || '<twoje-konto>'}/{repoNameInput}
            </span>{' '}
            i jednym kliknięciem wypycha czysty kod aplikacji (z pominięciem
            katalogu haseł <code className="font-mono">data/</code>).
          </p>

          {/* STEP 1 & STEP 2 SUB-SECTIONS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-[var(--vault-border)]">
            {/* KROK 1: 1-CLICK PAT GENERATOR + AI STUDIO SECRET */}
            <div className="flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--vault-accent)]">
                    Krok 1 · Autoryzacja GitHub PAT + Secret
                  </span>
                  <span className="text-xs font-mono text-[var(--vault-muted)]">
                     Zakres: repo
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[var(--vault-text)]">
                  Wygeneruj token PAT jednym kliknięciem i zapisz jako Secret
                </h3>
                <p className="text-xs text-[var(--vault-muted)] leading-relaxed">
                  Otwórz stronę GitHub z automatycznie wypełnionym opisem i
                  zaznaczonym uprawnieniem <code>repo</code>, wygeneruj klucz{' '}
                  <code>ghp_...</code> i zapisz go w panelu{' '}
                  <strong>Secrets</strong> w Google AI Studio pod nazwą{' '}
                  <code>GITHUB_PAT</code>.
                </p>

                <div className="pt-2 flex items-center justify-between gap-3 border-t border-[var(--vault-border)]">
                  <span className="text-xs text-[var(--vault-muted)]">
                    Nazwa klucza w AI Studio Secrets:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySecretKeyName}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-[var(--vault-surface)] border border-[var(--vault-border)] text-[var(--vault-accent)] hover:bg-[var(--vault-surface-hover)] cursor-pointer whitespace-nowrap"
                  >
                    {copiedSecretName ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Skopiowano GITHUB_PAT</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>GITHUB_PAT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <a
                  href={GITHUB_ONE_CLICK_PAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowPatInput(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] text-[#FAF7F2] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>1. Wygeneruj Token GitHub PAT (1-Klik)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setShowPatInput((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] text-xs font-medium text-[var(--vault-text)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>
                    {showPatInput
                      ? 'Ukryj pole tokenu'
                      : 'Wklej token bezpośrednio'}
                  </span>
                </button>
              </div>
            </div>

            {/* KROK 2: 1-CLICK AUTO-CREATE REPO & COMMIT/PUSH */}
            <div className="flex flex-col justify-between space-y-4 lg:border-l lg:border-[var(--vault-border)] lg:pl-6">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-400">
                    Krok 2 · Automatyczne Repozytorium i Commit
                  </span>
                  <span className="text-xs font-mono text-[var(--vault-muted)]">
                    Gałąź: main · Prywatne
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[var(--vault-text)]">
                  Załóż projekt na GitHubie i wyślij kod jednym przyciskiem
                </h3>
                <p className="text-xs text-[var(--vault-muted)] leading-relaxed">
                  Serwer automatycznie zweryfikuje Twoje konto GitHub, utworzy
                  prywatne repozytorium (jeśli jeszcze nie istnieje) i wykona
                  pełny <strong>Commit &amp; Push</strong> wszystkich plików
                  źródłowych.
                </p>

                <div className="pt-2 flex items-center justify-between gap-3 border-t border-[var(--vault-border)]">
                  <span className="text-xs text-[var(--vault-muted)]">
                    Docelowe repozytorium:
                  </span>
                  <div className="text-xs font-mono font-semibold text-[var(--vault-text)] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{githubConfig.repoOwner ? `${githubConfig.repoOwner}/` : ''}</span>
                    <input
                      type="text"
                      value={repoNameInput}
                      onChange={(e) => setRepoNameInput(e.target.value)}
                      className="bg-[var(--vault-surface)] border border-[var(--vault-border)] rounded px-2 py-0.5 text-xs font-mono text-[var(--vault-accent)] focus:border-[var(--vault-accent)] focus:outline-none w-44"
                      title="Nazwa repozytorium na koncie GitHub"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOneClickGitHubCliDeploy()}
                  disabled={isPushing}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isPushing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        Wykonywanie Commit &amp; Push przez GitHub CLI...
                      </span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      <span>
                        2. Utwórz Repozytorium i Wyślij Kod (1-Klik Commit &amp;
                        Push)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* COLLAPSIBLE / INSTANT PAT INPUT */}
          {(showPatInput || !hasActivePat) && (
            <div className="pt-4 border-t border-[var(--vault-border)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[var(--vault-text)] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[var(--vault-accent)]" />
                  <span>
                    Wklej wygenerowany token GitHub PAT (zapis na serwerze
                    skarbca):
                  </span>
                </label>
                <span className="text-xs font-mono text-[var(--vault-muted)]">
                  ghp_... / github_pat_...
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="password"
                  value={personalAccessToken}
                  onChange={(e) => setPersonalAccessToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="flex-1 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] px-3.5 py-2 text-xs text-[var(--vault-text)] font-mono focus:outline-none focus:border-[var(--vault-accent)]"
                />
                <button
                  type="button"
                  onClick={handleSaveTokenOnly}
                  disabled={isSavingToken || !personalAccessToken.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] text-xs font-semibold text-[var(--vault-text)] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isSavingToken ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>Zapisz Token na Serwerze</span>
                </button>
              </div>
            </div>
          )}

          {/* LIVE GITHUB CLI TERMINAL OUTPUT */}
          <div className="rounded-lg border border-[var(--vault-border)] bg-[#0D1117] p-4 font-mono text-xs space-y-1.5 overflow-x-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Konsola wykonawcza GitHub CLI</span>
              </span>
              <span>
                Konto GitHub: {githubConfig.repoOwner ? `@${githubConfig.repoOwner}` : 'Auto-detekcja z GITHUB_PAT'}
              </span>
            </div>
            {cliLogs.map((line, idx) => (
              <div
                key={idx}
                className={
                  line.startsWith('✓')
                    ? 'text-emerald-400'
                    : line.startsWith('✗')
                      ? 'text-red-400 font-semibold'
                      : line.startsWith('$')
                        ? 'text-sky-300'
                        : 'text-slate-300'
                }
              >
                {line}
              </div>
            ))}
          </div>

          {pushError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
              {pushError}
            </div>
          )}

          {pushResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3.5 text-xs text-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {pushResult.createdNewRepo
                      ? `Utworzono nowe repozytorium i wysłano ${pushResult.filesCount} plików kodu!`
                      : `Pomyślnie zaktualizowano repozytorium (${pushResult.filesCount} plików kodu)!`}
                  </span>
                </div>
                <div className="text-xs text-emerald-200/80 font-mono tabular-nums">
                  Gałąź: {pushResult.branch} · Commit SHA:{' '}
                  {pushResult.commitSha.slice(0, 10)} · Katalog data/ pominięty
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={pushResult.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-semibold transition-colors whitespace-nowrap"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Otwórz Repozytorium</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={pushResult.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-200 font-medium transition-colors whitespace-nowrap"
                >
                  <span>Zobacz Commit</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
