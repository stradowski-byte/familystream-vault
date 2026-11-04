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
  GitHubPushResult,
  GitHubSyncConfig,
} from './src/types/vault.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PersistedGitHubDeployMetadata {
  githubConfig: GitHubSyncConfig;
  githubPat?: string;
  updatedAt: string;
}

const DATA_DIR = path.join(__dirname, 'data');
const DEPLOY_META_FILE_PATH = path.join(DATA_DIR, 'github-deploy-meta.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrCreateDeployMeta(): PersistedGitHubDeployMetadata {
  ensureDataDir();
  if (fs.existsSync(DEPLOY_META_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(DEPLOY_META_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedGitHubDeployMetadata>;
      return {
        githubConfig: parsed.githubConfig || {
          repoOwner: '',
          repoName: 'familystream-vault',
          branch: 'main',
        },
        githubPat: parsed.githubPat || '',
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch (err) {
      console.warn('Reinitializing github-deploy-meta.json:', err);
    }
  }

  const initialMeta: PersistedGitHubDeployMetadata = {
    githubConfig: {
      repoOwner: '',
      repoName: 'familystream-vault',
      branch: 'main',
    },
    githubPat: '',
    updatedAt: new Date().toISOString(),
  };
  saveDeployMetaToDisk(initialMeta);
  return initialMeta;
}

function saveDeployMetaToDisk(
  meta: PersistedGitHubDeployMetadata
): PersistedGitHubDeployMetadata {
  ensureDataDir();
  meta.updatedAt = new Date().toISOString();
  const tempPath = `${DEPLOY_META_FILE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(meta, null, 2), 'utf-8');
  fs.renameSync(tempPath, DEPLOY_META_FILE_PATH);
  return meta;
}

let deployMeta: PersistedGitHubDeployMetadata = loadOrCreateDeployMeta();

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
    'github-deploy-meta.json',
    'package-lock.json',
    'AdminTab4GitHubAndUpdates.tsx',
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

  // 1. GET & PUT GitHub CLI Config (Admin Tab 04 — GitHub CLI in AI Studio)
  app.get('/api/github/config', async (_req, res) => {
    const envPat = (
      process.env.GITHUB_PAT ||
      process.env.GITHUB_TOKEN ||
      ''
    ).trim();
    const savedPat = (deployMeta.githubPat || '').trim();
    const activeToken = envPat || savedPat;
    const secretPatSource = envPat
      ? 'GITHUB_PAT_ENV'
      : savedPat
        ? 'SAVED_SERVER_TOKEN'
        : 'NONE';

    let repoOwner = deployMeta.githubConfig?.repoOwner || '';
    if (activeToken && !repoOwner) {
      try {
        const userRes = await githubApiRequest<{ login: string }>(
          'https://api.github.com/user',
          activeToken
        );
        if (userRes.data?.login) {
          repoOwner = userRes.data.login;
          deployMeta.githubConfig.repoOwner = repoOwner;
          saveDeployMetaToDisk(deployMeta);
        }
      } catch {
        // Ignore if token check fails during config fetch
      }
    }

    res.json({
      ...deployMeta.githubConfig,
      repoOwner,
      repoName: deployMeta.githubConfig?.repoName || 'familystream-vault',
      branch: deployMeta.githubConfig?.branch || 'main',
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
        deployMeta.githubConfig?.repoName ||
        'familystream-vault'
      ).trim();

      if (!cleanToken) {
        res.status(400).json({
          error: 'Wklej wygenerowany token GitHub PAT (z uprawnieniem repo).',
        });
        return;
      }

      const userRes = await githubApiRequest<{ login: string }>(
        'https://api.github.com/user',
        cleanToken
      );

      deployMeta.githubPat = cleanToken;
      deployMeta.githubConfig = {
        ...deployMeta.githubConfig,
        repoOwner: userRes.data.login || '',
        repoName: cleanRepo,
        branch: deployMeta.githubConfig?.branch || 'main',
      };
      saveDeployMetaToDisk(deployMeta);

      const envPat = (
        process.env.GITHUB_PAT ||
        process.env.GITHUB_TOKEN ||
        ''
      ).trim();

      res.json({
        ...deployMeta.githubConfig,
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

  // 2. POST GitHub CLI Auto-Deploy (Admin Tab 04 - Non-destructive code push, strictly excluding `data/`)
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
      const savedPat = (deployMeta.githubPat || '').trim();
      const providedPat = (personalAccessToken || '').trim();
      const cleanToken = providedPat || envPat || savedPat;

      let cleanOwner = (
        repoOwner ||
        deployMeta.githubConfig?.repoOwner ||
        ''
      ).trim();
      const cleanRepo = (
        repoName ||
        deployMeta.githubConfig?.repoName ||
        'familystream-vault'
      ).trim();
      const cleanBranch = (
        branch ||
        deployMeta.githubConfig?.branch ||
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

      if (providedPat) {
        deployMeta.githubPat = providedPat;
      }

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
                  'FamilyStream Vault — Rodzinny Skarbiec Haseł i Kont VOD (PWA, Cloud Firestore + E2E Hardware Crypto)',
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

      const sourceFiles = collectProjectSourceFiles(__dirname);

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
                      '# FamilyStream Vault\nRodzinny Skarbiec Haseł i Kont VOD (PWA · Cloud Firestore · E2E Crypto).\n',
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

      const mainPush = await pushBranchWithDelta({
        targetBranch: cleanBranch,
        files: sourceFiles,
        message: finalCommitMessage,
        ensureRepoInitialized: true,
      });
      const newCommitSha = mainPush.commitSha;

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

      deployMeta.githubConfig = {
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
      saveDeployMetaToDisk(deployMeta);

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

  // 3. CHECK LIVE GITHUB PAGES CDN STATUS
  app.get('/api/github/pages-status', async (req, res) => {
    const rawUrl =
      typeof req.query.url === 'string' && req.query.url.trim()
        ? req.query.url.trim()
        : deployMeta.githubConfig?.pagesUrl || '';

    if (!rawUrl || !rawUrl.startsWith('https://')) {
      res.json({ live: false, status: 0, url: rawUrl });
      return;
    }

    try {
      const separator = rawUrl.includes('?') ? '&' : '?';
      const probeUrl = `${rawUrl}${separator}_cb=${Date.now()}`;
      const pageRes = await fetch(probeUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'FamilyStream-Vault-Pages-Probe',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      res.json({
        live: pageRes.ok,
        status: pageRes.status,
        url: rawUrl,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      res.json({
        live: false,
        status: 0,
        url: rawUrl,
        checkedAt: new Date().toISOString(),
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
      `FamilyStream Vault Web Server running on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
