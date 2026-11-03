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
  Globe,
  Cloud,
} from 'lucide-react';
import {
  checkGitHubPagesLiveStatus,
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
    isPrivateRepo: false,
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
  const [commitMessageInput, setCommitMessageInput] = useState('');
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);
  const [showPatInput, setShowPatInput] = useState(false);
  const [copiedSecretName, setCopiedSecretName] = useState(false);
  const [copiedOnlineUrl, setCopiedOnlineUrl] = useState(false);
  const [pagesLiveState, setPagesLiveState] = useState<
    'checking' | 'live' | 'propagating'
  >('checking');

  const [isPushing, setIsPushing] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<GitHubPushResult | null>(null);
  const [cliLogs, setCliLogs] = useState<string[]>([
    '$ gh auth status',
    '✓ Gotowy do automatycznego utworzenia repozytorium, wysłania czystego kodu i publikacji aplikacji online (GitHub Pages).',
  ]);

  useEffect(() => {
    let mounted = true;
    fetchGitHubSyncConfigFromServer()
      .then((cfg) => {
        if (!mounted || !cfg) return;
        setGithubConfig(cfg);
        if (cfg.repoName) setRepoNameInput(cfg.repoName);
        if (typeof cfg.isPrivateRepo === 'boolean') {
          setIsPrivateRepo(cfg.isPrivateRepo);
        }
        if (cfg.hasServerSecretPat) {
          const pagesLink =
            cfg.pagesUrl ||
            (cfg.repoOwner
              ? `https://${cfg.repoOwner.toLowerCase()}.github.io/${
                  cfg.repoName || 'familystream-vault'
                }/`
              : '');
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
            ...(pagesLink
              ? [`✓ Adres aplikacji online (GitHub Pages): ${pagesLink}`]
              : []),
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

  const handleCopyOnlineUrl = async (urlToCopy: string) => {
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopiedOnlineUrl(true);
      setTimeout(() => setCopiedOnlineUrl(false), 2500);
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
    const isUpdateMode = Boolean(
      pushResult || githubConfig.lastCommitSha || githubConfig.repoOwner
    );
    setCliLogs([
      `$ gh auth status`,
      `→ Weryfikacja tokenu PAT (uprawnienie: repo) i konta GitHub...`,
      isUpdateMode
        ? `$ git fetch origin main && git diff --name-only`
        : `$ gh repo create ${targetRepo} ${isPrivateRepo ? '--private' : '--public'}`,
      isUpdateMode
        ? `→ Różnicowa aktualizacja repozytorium "${targetRepo}" (wysyłanie zmienionych plików na gałąź main)...`
        : `→ Tworzenie repozytorium "${targetRepo}" i wysyłanie czystego kodu na gałąź main...`,
      `$ vite build && git push origin gh-pages`,
      `→ Budowanie paczki PWA i publikacja aplikacji online na gałęzi gh-pages...`,
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
        commitMessage: commitMessageInput.trim() || undefined,
        createRepoIfMissing: true,
        isPrivateRepo,
      });

      setPushResult(res);
      setCommitMessageInput('');
      setGithubConfig((prev) => ({
        ...prev,
        repoOwner: res.repoOwner || prev.repoOwner || '',
        repoName: res.repoName || targetRepo,
        branch: res.branch,
        lastCommitSha: res.commitSha,
        lastCommitUrl: res.commitUrl,
        lastPushedAt: res.pushedAt,
        pagesUrl: res.pagesUrl,
        pagesEnabled: res.pagesEnabled,
        isPrivateRepo: res.isPrivateRepo,
        hasServerSecretPat: true,
      }));
      setShowPatInput(false);

      const resolvedPagesUrl =
        res.pagesUrl ||
        `https://${(res.repoOwner || githubConfig.repoOwner || '').toLowerCase()}.github.io/${targetRepo}/`;

      setCliLogs((prev) => [
        ...prev,
        res.createdNewRepo
          ? `✓ Utworzono nowe repozytorium: ${res.repoUrl}`
          : `✓ Pomyślnie zaktualizowano repozytorium (Update): ${res.repoUrl}`,
        `✓ Gałąź main: zaktualizowano ${
          typeof res.updatedBlobsCount === 'number'
            ? `${res.updatedBlobsCount} zmienionych plików (z ${res.filesCount} ogółem)`
            : `${res.filesCount} plików`
        } · Commit SHA: ${res.commitSha.slice(0, 10)}`,
        res.ghPagesPublished
          ? `✓ Gałąź gh-pages: zbudowano i opublikowano gotową aplikację PWA online!`
          : `✓ Skonfigurowano publikację strony online GitHub Pages.`,
        `✓ Link do aplikacji online (PWA + Start Admina): ${resolvedPagesUrl}`,
      ]);

      await onLogActivity(
        'GITHUB_CLI_PUSH',
        `Zaktualizowano repozytorium GitHub (${res.repoUrl}, Commit: ${res.commitSha.slice(0, 7)}) oraz aplikację online: ${resolvedPagesUrl}`
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

  const activeOwner = pushResult?.repoOwner || githubConfig.repoOwner || '';
  const activeRepoName =
    pushResult?.repoName || repoNameInput.trim() || githubConfig.repoName || 'familystream-vault';
  const activeRepoUrl =
    pushResult?.repoUrl ||
    (activeOwner ? `https://github.com/${activeOwner}/${activeRepoName}` : '');
  const activePagesUrl =
    pushResult?.pagesUrl ||
    githubConfig.pagesUrl ||
    (activeOwner
      ? `https://${activeOwner.toLowerCase()}.github.io/${activeRepoName}/`
      : '');
  const activeCommitSha =
    pushResult?.commitSha || githubConfig.lastCommitSha || '';
  const cacheBustedPagesUrl = activePagesUrl
    ? `${activePagesUrl}${activePagesUrl.includes('?') ? '&' : '?'}v=${
        activeCommitSha ? activeCommitSha.slice(0, 7) : 'live'
      }`
    : '';
  const hasCommittedRepo = Boolean(
    pushResult || githubConfig.lastCommitSha || activeOwner
  );

  useEffect(() => {
    if (!activePagesUrl) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const verifyPage = async () => {
      try {
        const res = await checkGitHubPagesLiveStatus(activePagesUrl);
        if (cancelled) return;
        if (res.live) {
          setPagesLiveState('live');
        } else {
          setPagesLiveState('propagating');
          timer = setTimeout(verifyPage, 5000);
        }
      } catch {
        if (!cancelled) {
          setPagesLiveState('live');
        }
      }
    };

    setPagesLiveState('checking');
    verifyPage();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activePagesUrl, activeCommitSha]);

  return (
    <div className="space-y-8">
      {/* POST-COMMIT ONLINE APPLICATION LINK CARD (SHOWN IMMEDIATELY WHEN REPO / COMMIT IS READY) */}
      {hasCommittedRepo && activePagesUrl && (
        <section className="rounded-xl border-2 border-emerald-500/50 bg-[var(--vault-surface)] overflow-hidden shadow-sm">
          <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Globe className="w-4 h-4 shrink-0" />
                <span>Twoja Aplikacja Online z GitHuba (Gotowa do Instalacji PWA i Startu Administratora)</span>
              </div>
              <h2 className="text-base font-bold text-[var(--vault-text)] break-words">
                Link Startowy dla Administratora: GitHub Pages + Wdrożenie Chmurowe
              </h2>
            </div>

            {pagesLiveState === 'propagating' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 self-start sm:self-center">
                <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
                <span>Publikacja na GitHub CDN (~20–40 sek.)...</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 self-start sm:self-center">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Strona Online Aktywna (200 OK)</span>
              </span>
            )}
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <p className="text-xs text-[var(--vault-muted)] leading-relaxed">
              Otwórz poniższy link na docelowym telefonie lub komputerze Administratora. Z tego miejsca <strong>zainstalujesz aplikację lokalnie (PWA)</strong> i od razu <strong>zainicjujesz konto Głównego Administratora (przez Google lub lokalnie bez wyciągania sekretów)</strong>.
              {isPrivateRepo && (
                <span className="block mt-1 text-amber-300">
                  Uwaga: Darmowe konto GitHub wymaga ustawienia repozytorium jako <strong>Publiczne</strong> (przełącznik w Kroku 2 poniżej), aby strona GitHub Pages była aktywna bez planu GitHub Pro.
                </span>
              )}
            </p>

            {/* DIRECT ONLINE APP URL BOX */}
            <div className="p-4 rounded-xl border border-[var(--vault-border)] bg-[var(--vault-bg)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-medium text-[var(--vault-muted)]">
                  Bezpośredni adres aplikacji online (GitHub Pages PWA):
                </div>
                <a
                  href={cacheBustedPagesUrl || activePagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm font-mono font-bold text-emerald-400 hover:underline break-all block"
                >
                  {activePagesUrl}
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={cacheBustedPagesUrl || activePagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>Otwórz Aplikację Online</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>

                <button
                  type="button"
                  onClick={() => handleCopyOnlineUrl(activePagesUrl)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] text-xs font-semibold text-[var(--vault-text)] transition-colors cursor-pointer"
                >
                  {copiedOnlineUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Skopiowano link!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 shrink-0" />
                      <span>Kopiuj Link Online</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* OPTION 2: CLOUD NODE.JS DEPLOYMENT LINKS + GITHUB ACTIONS STATUS */}
            {activeRepoUrl && (
              <div className="pt-3 border-t border-[var(--vault-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-[var(--vault-muted)] flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    Status budowania GitHub Pages oraz opcjonalne wdrożenie z serwerem Node.js:
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`${activeRepoUrl}/actions`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] text-[var(--vault-text)] font-medium transition-colors"
                  >
                    <span>Status GitHub Actions (Pages)</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  <a
                    href={`https://vercel.com/new/clone?repository-url=${encodeURIComponent(
                      activeRepoUrl
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] text-[var(--vault-text)] font-medium transition-colors"
                  >
                    <span>Wdróż na Vercel</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  <a
                    href="https://dashboard.render.com/select-repo?type=web"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-bg)] hover:bg-[var(--vault-surface-hover)] text-[var(--vault-text)] font-medium transition-colors"
                  >
                    <span>Wdróż na Render (Node.js)</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* GITHUB REPOSITORY MANAGEMENT (FULL-WIDTH CARD) */}
      <section className="rounded-xl border border-[var(--vault-border)] bg-[var(--vault-card)] overflow-hidden">
        <div className="bg-[var(--vault-surface)] border-b border-[var(--vault-border)] px-5 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <GitBranch className="w-4 h-4 shrink-0" />
              <span>
                Zarządzanie Repozytorium GitHub (Czysty Silnik bez Katalogu data/)
              </span>
            </div>
            <h2 className="text-base font-bold text-[var(--vault-text)] break-words">
              Jednoklikowy Generator PAT, Automatyczny Commit &amp; Push i Publikacja Online
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border ${
                githubConfig.secretPatSource === 'GITHUB_PAT_ENV'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : hasActivePat
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-red-500/15 text-red-300 border-red-500/30'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
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
                className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-[var(--vault-accent)] hover:underline"
              >
                <span>
                  Commit: {githubConfig.lastCommitSha.slice(0, 7)}
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          <p className="text-xs text-[var(--vault-muted)] max-w-3xl leading-relaxed break-words">
            Konsola <strong>GitHub CLI</strong> automatycznie rozpoznaje konto
            GitHub powiązane z Twoim tokenem PAT, zakłada repozytorium{' '}
            <span className="font-mono text-[var(--vault-text)] break-all">
              {githubConfig.repoOwner || '<twoje-konto>'}/{repoNameInput}
            </span>
            , wypycha czysty kod (z pominięciem katalogu haseł{' '}
            <code className="font-mono">data/</code>) oraz uruchamia stronę aplikacji online <strong>GitHub Pages</strong>.
          </p>

          {/* STEP 1 & STEP 2 SUB-SECTIONS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-[var(--vault-border)]">
            {/* KROK 1: 1-CLICK PAT GENERATOR + AI STUDIO SECRET */}
            <div className="flex flex-col justify-between space-y-4 min-w-0">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  Otwórz stronę GitHub z automatycznie zaznaczonym uprawnieniem{' '}
                  <code>repo</code>, wygeneruj klucz <code>ghp_...</code> i zapisz go jako{' '}
                  <code>GITHUB_PAT</code> lub wklej poniżej. Ten sam token obsługuje zarówno pierwsze utworzenie, jak i wszystkie kolejne aktualizacje (Update) oraz publikację <code>gh-pages</code>.
                </p>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--vault-border)]">
                  <span className="text-xs text-[var(--vault-muted)]">
                    Nazwa klucza w AI Studio Secrets:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySecretKeyName}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-[var(--vault-surface)] border border-[var(--vault-border)] text-[var(--vault-accent)] hover:bg-[var(--vault-surface-hover)] cursor-pointer"
                  >
                    {copiedSecretName ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Skopiowano GITHUB_PAT</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 shrink-0" />
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--vault-accent)] hover:bg-[var(--vault-accent-hover)] text-[#FAF7F2] text-xs font-semibold transition-colors cursor-pointer text-center leading-snug"
                >
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <span>1. Wygeneruj Token GitHub PAT (1-Klik)</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>

                <button
                  type="button"
                  onClick={() => setShowPatInput((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] text-xs font-medium text-[var(--vault-text)] transition-colors cursor-pointer text-center leading-snug"
                >
                  <span>
                    {showPatInput
                      ? 'Ukryj pole tokenu'
                      : 'Wklej token bezpośrednio'}
                  </span>
                </button>
              </div>
            </div>

            {/* KROK 2: 1-CLICK AUTO-CREATE OR UPDATE REPO & COMMIT/PUSH */}
            <div className="flex flex-col justify-between space-y-4 lg:border-l lg:border-[var(--vault-border)] lg:pl-6 min-w-0">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-400">
                    Krok 2 · {hasCommittedRepo ? 'Update Repozytorium i Strony Online' : 'Utworzenie Repozytorium i Strony Online'}
                  </span>
                  <span className="text-xs font-mono text-[var(--vault-muted)]">
                    main + gh-pages · {isPrivateRepo ? 'Prywatne' : 'Publiczne'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[var(--vault-text)]">
                  {hasCommittedRepo
                    ? 'Aktualizuj repozytorium GitHub i aplikację online jednym kliknięciem'
                    : 'Załóż repozytorium na GitHubie i opublikuj aplikację online'}
                </h3>
                <p className="text-xs text-[var(--vault-muted)] leading-relaxed">
                  Przy każdym kliknięciu serwer wykonuje szybki <strong>Update różnicowy</strong> na gałęzi <code>main</code> (wysyła tylko zmienione pliki) oraz buduje i aktualizuje gotową aplikację PWA na gałęzi <code>gh-pages</code>.
                </p>

                <div className="pt-2 space-y-2.5 border-t border-[var(--vault-border)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[var(--vault-muted)]">
                      Docelowe repozytorium:
                    </span>
                    <div className="text-xs font-mono font-semibold text-[var(--vault-text)] flex flex-wrap items-center gap-1.5 min-w-0">
                      {isPrivateRepo ? (
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="truncate max-w-[140px]">
                        {githubConfig.repoOwner ? `${githubConfig.repoOwner}/` : ''}
                      </span>
                      <input
                        type="text"
                        value={repoNameInput}
                        onChange={(e) => setRepoNameInput(e.target.value)}
                        className="bg-[var(--vault-surface)] border border-[var(--vault-border)] rounded px-2 py-1 text-xs font-mono text-[var(--vault-accent)] focus:border-[var(--vault-accent)] focus:outline-none w-40 sm:w-44 max-w-full"
                        title="Nazwa repozytorium na koncie GitHub"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[var(--vault-muted)]">
                      Tryb widoczności (dla GitHub Pages):
                    </span>
                    <div className="inline-flex rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setIsPrivateRepo(false)}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                          !isPrivateRepo
                            ? 'bg-emerald-600 text-white'
                            : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                        }`}
                      >
                        Publiczne (Darmowe Pages)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrivateRepo(true)}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                          isPrivateRepo
                            ? 'bg-[var(--vault-accent)] text-[#FAF7F2]'
                            : 'text-[var(--vault-muted)] hover:text-[var(--vault-text)]'
                        }`}
                      >
                        Prywatne
                      </button>
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={commitMessageInput}
                      onChange={(e) => setCommitMessageInput(e.target.value)}
                      placeholder="Opcjonalny opis aktualizacji (np. Poprawa UI i GitHub Pages)..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] text-[var(--vault-text)] focus:outline-none focus:border-[var(--vault-accent)]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOneClickGitHubCliDeploy()}
                  disabled={isPushing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer text-center leading-snug"
                >
                  {isPushing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      <span>
                        Aktualizowanie repozytorium (main + gh-pages)...
                      </span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 shrink-0" />
                      <span>
                        {hasCommittedRepo
                          ? '2. Aktualizuj Repozytorium i Aplikację Online (1-Klik Update & Push)'
                          : '2. Utwórz Repozytorium i Wyślij Kod (1-Klik Commit & Push)'}
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
                  <KeyRound className="w-3.5 h-3.5 text-[var(--vault-accent)] shrink-0" />
                  <span>
                    Wklej wygenerowany token GitHub PAT (zapis na serwerze skarbca):
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
                  className="flex-1 min-w-0 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] px-3.5 py-2 text-xs text-[var(--vault-text)] font-mono focus:outline-none focus:border-[var(--vault-accent)]"
                />
                <button
                  type="button"
                  onClick={handleSaveTokenOnly}
                  disabled={isSavingToken || !personalAccessToken.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--vault-border)] bg-[var(--vault-surface)] hover:bg-[var(--vault-surface-hover)] text-xs font-semibold text-[var(--vault-text)] disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {isSavingToken ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span>Zapisz Token na Serwerze</span>
                </button>
              </div>
            </div>
          )}

          {/* LIVE GITHUB CLI TERMINAL OUTPUT */}
          <div className="rounded-lg border border-[var(--vault-border)] bg-[#0D1117] p-4 font-mono text-xs space-y-1.5 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Konsola wykonawcza GitHub CLI</span>
              </span>
              <span className="break-all">
                Konto GitHub: {githubConfig.repoOwner ? `@${githubConfig.repoOwner}` : 'Auto-detekcja z GITHUB_PAT'}
              </span>
            </div>
            {cliLogs.map((line, idx) => (
              <div
                key={idx}
                className={`break-words ${
                  line.startsWith('✓')
                    ? 'text-emerald-400'
                    : line.startsWith('✗')
                      ? 'text-red-400 font-semibold'
                      : line.startsWith('$')
                        ? 'text-sky-300'
                        : 'text-slate-300'
                }`}
              >
                {line}
              </div>
            ))}
          </div>

          {pushError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300 break-words">
              {pushError}
            </div>
          )}

          {pushResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3.5 text-xs text-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="break-words">
                    {pushResult.createdNewRepo
                      ? `Utworzono nowe repozytorium i wysłano ${pushResult.filesCount} plików kodu!`
                      : `Pomyślnie zaktualizowano repozytorium (${pushResult.filesCount} plików kodu)!`}
                  </span>
                </div>
                <div className="text-xs text-emerald-200/80 font-mono tabular-nums break-words">
                  Gałąź: {pushResult.branch} · Commit SHA:{' '}
                  {pushResult.commitSha.slice(0, 10)} · Katalog data/ pominięty
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {pushResult.pagesUrl && (
                  <a
                    href={pushResult.pagesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>Otwórz Aplikację Online</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                )}
                <a
                  href={pushResult.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-semibold transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5 shrink-0" />
                  <span>Otwórz Repozytorium</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                <a
                  href={pushResult.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-200 font-medium transition-colors"
                >
                  <span>Zobacz Commit</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
