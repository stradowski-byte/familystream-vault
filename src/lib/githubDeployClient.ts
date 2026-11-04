import type { GitHubPushResult, GitHubSyncConfig } from '../types/vault';

async function githubApiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    let errText = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(errText) as { error?: string };
      if (parsed?.error) errText = parsed.error;
    } catch {
      // keep raw text
    }
    throw new Error(
      errText || `Błąd komunikacji z endpointem GitHub (${res.status})`
    );
  }

  return (await res.json()) as T;
}

export async function fetchGitHubSyncConfigFromServer(): Promise<GitHubSyncConfig> {
  return githubApiRequest<GitHubSyncConfig>('/api/github/config');
}

export async function saveGitHubPatOnServer(params: {
  personalAccessToken: string;
  repoName?: string;
}): Promise<GitHubSyncConfig> {
  return githubApiRequest<GitHubSyncConfig>('/api/github/config', {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

export async function pushProjectCodeToGitHubOnServer(params?: {
  personalAccessToken?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  commitMessage?: string;
  createRepoIfMissing?: boolean;
  isPrivateRepo?: boolean;
}): Promise<GitHubPushResult> {
  return githubApiRequest<GitHubPushResult>('/api/github/push', {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

export async function checkGitHubPagesLiveStatus(url: string): Promise<{
  live: boolean;
  status: number;
  url: string;
  checkedAt?: string;
}> {
  return githubApiRequest<{
    live: boolean;
    status: number;
    url: string;
    checkedAt?: string;
  }>(`/api/github/pages-status?url=${encodeURIComponent(url)}`);
}
