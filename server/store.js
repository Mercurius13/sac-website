/* Where content reads and writes go. Two interchangeable backends behind one interface:
GitHub (commits to the repo, used in production) or local disk (straight to the working
tree, for zero-setup local dev). getStore() picks one based on whether GITHUB_* env is set. */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processImage, uploadFilename } from './media.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// thrown when a publish is based on a stale version - the routes turn this into a 409
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

function pagePath(slug) {
  return `content/pages/${slug}.json`;
}

// production backend: reads via the GitHub API, publishes as an atomic commit
async function githubStore() {
  const gh = await import('./github.js');

  return {
    kind: 'github',

    async readContent() {
      const { headSha, site, pages } = await gh.readSiteContent();
      return { headSha, site, pages: pages.map((p) => p.json) };
    },

    async listMedia() {
      return gh.listMedia();
    },

    async publish({ baseSha, site, pages, message }) {
      const files = [
        { path: 'content/site.json', content: JSON.stringify(site, null, 2) + '\n', encoding: 'utf-8' },
        ...pages.map((page) => ({
          path: pagePath(page.slug),
          content: JSON.stringify(page, null, 2) + '\n',
          encoding: 'utf-8',
        })),
      ];

      try {
        const { sha } = await gh.commitFiles({ baseSha, files, message });
        return { headSha: sha };
      } catch (err) {
        if (err instanceof gh.ConflictError) throw new ConflictError(err.message);
        throw err;
      }
    },

    async upload(file) {
      const { buffer, ext } = await processImage(file.buffer);
      const filename = uploadFilename(file.originalname, ext);
      const path = `public/media/uploads/${filename}`;

      // committing the image moves the branch head; hand the new sha back so the draft's
      // baseSha can advance - otherwise the admin's own upload looks like a conflict at publish
      const baseSha = await gh.getHeadSha();
      const { sha } = await gh.commitFiles({
        baseSha,
        files: [{ path, content: buffer.toString('base64'), encoding: 'base64' }],
        message: `Upload ${filename}`,
      });

      return { path: `/media/uploads/${filename}`, headSha: sha };
    },

    async deleteMedia(webPath) {
      // /media/foo.jpg -> public/media/foo.jpg; deleting is a commit, so it moves the head too
      const path = `public${webPath}`;
      const baseSha = await gh.getHeadSha();
      const { sha } = await gh.commitFiles({ baseSha, files: [{ path, delete: true }], message: `Delete ${path}` });
      return { headSha: sha };
    },
  };
}

// a fingerprint of the current content, so the admin can tell when the files changed
// underneath it (a direct edit, a git pull) instead of only noticing after a publish
function contentSha(site, pages) {
  const ordered = [...pages].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const hash = createHash('sha1');
  hash.update(JSON.stringify(site));
  hash.update(JSON.stringify(ordered));
  return `local-${hash.digest('hex').slice(0, 12)}`;
}

// recursively list every file under a directory
async function walkFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(full)));
    else out.push(full);
  }
  return out;
}

// local-dev backend: reads and writes content/ and public/media/ straight on disk
function localStore() {
  return {
    kind: 'local',

    async readContent() {
      const site = JSON.parse(await readFile(join(root, 'content/site.json'), 'utf8'));
      const files = (await readdir(join(root, 'content/pages'))).filter((f) => f.endsWith('.json'));
      const pages = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(root, 'content/pages', f), 'utf8'))));
      return { headSha: contentSha(site, pages), site, pages };
    },

    async listMedia() {
      const mediaDir = join(root, 'public/media');
      const files = await walkFiles(mediaDir).catch(() => []);
      return Promise.all(
        files.map(async (f) => ({
          path: `/media/${relative(mediaDir, f).split('\\').join('/')}`,
          size: (await stat(f)).size,
        })),
      );
    },

    async publish({ baseSha, site, pages }) {
      const current = await this.readContent();
      if (baseSha !== current.headSha) {
        throw new ConflictError('The site changed since you loaded this page. Reload and reapply your changes.');
      }

      await writeFile(join(root, 'content/site.json'), JSON.stringify(site, null, 2) + '\n');
      for (const page of pages) {
        await writeFile(join(root, pagePath(page.slug)), JSON.stringify(page, null, 2) + '\n');
      }

      return { headSha: contentSha(site, pages) };
    },

    async upload(file) {
      const { buffer, ext } = await processImage(file.buffer);
      const filename = uploadFilename(file.originalname, ext);
      const dir = join(root, 'public/media/uploads');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, filename), buffer);
      // no headSha: writing an image doesn't touch the content hash, so the draft's baseSha
      // stays put (and keeps detecting genuine content changes)
      return { path: `/media/uploads/${filename}` };
    },

    async deleteMedia(webPath) {
      // stay inside public/media no matter what path the client sends
      const mediaDir = join(root, 'public/media');
      const target = join(mediaDir, webPath.replace(/^\/media\//, ''));
      if (!target.startsWith(mediaDir)) throw new Error('Invalid media path');
      await unlink(target).catch(() => {});
      return {};
    },
  };
}

let cached = null;

// pick the backend once (GitHub if its env is set, else local disk) and reuse it
export async function getStore() {
  if (cached) return cached;

  const hasGitHub = process.env.GITHUB_TOKEN && process.env.GITHUB_REPO;
  cached = hasGitHub ? await githubStore() : localStore();

  console.log(
    hasGitHub
      ? `[store] GitHub-backed: ${process.env.GITHUB_REPO} (${process.env.GITHUB_BRANCH || 'main'})`
      : '[store] Local disk (no GITHUB_TOKEN/GITHUB_REPO set) - writes go straight to the working tree, nothing is committed.',
  );

  return cached;
}
