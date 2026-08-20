/* The GitHub side of the store: reads content through the Contents API and publishes as one
atomic commit built through the Git Data API (blobs -> tree -> commit -> move the branch ref).
The commit is refused if the branch moved since the editor loaded, so edits never clobber. */
import { requireEnv } from './auth.js';

const API = 'https://api.github.com';

// repo + branch + token, read fresh from the env each call
function config() {
  return {
    token: requireEnv('GITHUB_TOKEN'),
    repo: requireEnv('GITHUB_REPO'),
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

export class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

// thin wrapper around the GitHub REST API: sets the auth/version headers, throws on non-2xx
async function api(path, { token, ...init } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sac-admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GitHubError(`GitHub ${init.method || 'GET'} ${path} -> ${res.status}: ${body.message || res.statusText}`, res.status);
  }

  return res.status === 204 ? null : res.json();
}

// the commit sha the branch currently points at - used as the version/baseSha
export async function getHeadSha() {
  const { token, repo, branch } = config();
  const ref = await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token });
  return ref.object.sha;
}

// read one file's text (null if it doesn't exist)
export async function readFile(path) {
  const { token, repo, branch } = config();
  try {
    const entry = await api(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { token });
    if (Array.isArray(entry) || entry.type !== 'file') throw new GitHubError(`${path} is not a file`, 422);
    return Buffer.from(entry.content, 'base64').toString('utf8');
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

// the file names directly inside a directory
export async function listDir(path) {
  const { token, repo, branch } = config();
  const entries = await api(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { token });
  return Array.isArray(entries) ? entries.filter((e) => e.type === 'file').map((e) => e.name) : [];
}

// every file under public/media/, as web paths the picker can use
export async function listMedia() {
  const { token, repo, branch } = config();
  const headSha = await getHeadSha();
  const tree = await api(`/repos/${repo}/git/trees/${headSha}?recursive=1`, { token });

  return tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith('public/media/'))
    .map((entry) => ({ path: entry.path.replace(/^public\//, '/'), size: entry.size }));
}

// load site.json + every page json in one go, along with the head sha they're read at
export async function readSiteContent() {
  const [headSha, siteRaw, pageFiles] = await Promise.all([getHeadSha(), readFile('content/site.json'), listDir('content/pages')]);

  const pages = await Promise.all(
    pageFiles
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => ({ file: f, json: JSON.parse(await readFile(`content/pages/${f}`)) })),
  );

  return { headSha, site: JSON.parse(siteRaw), pages };
}

// commit a set of files in one shot: refuse if the branch moved, upload any binary blobs,
// build a tree on top of the base commit, create the commit, then fast-forward the branch ref
export async function commitFiles({ baseSha, files, message }) {
  const { token, repo, branch } = config();

  const currentSha = await getHeadSha();
  if (currentSha !== baseSha) {
    throw new ConflictError('The site was published by someone else since you loaded this page. Reload and reapply your changes.');
  }

  const baseCommit = await api(`/repos/${repo}/git/commits/${baseSha}`, { token });

  const deletions = files.filter((f) => f.delete);
  const textFiles = files.filter((f) => !f.delete && f.encoding !== 'base64');
  const binaryFiles = files.filter((f) => !f.delete && f.encoding === 'base64');

  const binaryBlobs = await Promise.all(
    binaryFiles.map(async (f) => {
      const blob = await api(`/repos/${repo}/git/blobs`, {
        token,
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: 'base64' }),
      });
      return { path: f.path, sha: blob.sha };
    }),
  );

  const tree = await api(`/repos/${repo}/git/trees`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: [
        ...textFiles.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
        ...binaryBlobs.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: f.sha })),
        ...deletions.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: null })),
      ],
    }),
  });

  const commit = await api(`/repos/${repo}/git/commits`, {
    token,
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });

  try {
    await api(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      token,
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 422 || err.status === 409)) {
      throw new ConflictError('The site changed while publishing. Reload and reapply your changes.');
    }
    throw err;
  }

  return { sha: commit.sha };
}
