
/* Responsible for building the entire html of the website from the blocks */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderBlocks } from './blocks.js';
import { renderPage } from './layout.js';
import { isValidSlug, outputPathFor, urlFor } from './paths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

// reads all the json files in content
async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }
}

// loads the content page by page and orders it correctly
export async function loadContent() {
  const site = await readJson(join(root, 'content/site.json'));

  const files = (await readdir(join(root, 'content/pages'))).filter((f) => f.endsWith('.json'));
  const pages = await Promise.all(files.map((f) => readJson(join(root, 'content/pages', f))));

  const seen = new Set();
  for (const page of pages) {
    if (!isValidSlug(page.slug)) {
      throw new Error(`Invalid page slug ${JSON.stringify(page.slug)} - use lowercase words joined by hyphens`);
    }
    if (seen.has(page.slug)) throw new Error(`Duplicate page slug "${page.slug}"`);
    seen.add(page.slug);
  }

  const order = new Map((site.nav ?? []).map((n, i) => [n.slug, i]));
  pages.sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));

  for (const item of site.nav ?? []) {
    if (!seen.has(item.slug)) console.warn(`  ! nav links "/${item.slug}" but no such page exists`);
  }

  return { site, pages };
}

// builds the html files of each page using the blocks, stuff from public
// styles and themes. Also handles the 404 NOT FOUND page
export async function build({ quiet = false } = {}) {
  const { site, pages } = await loadContent();
  const log = quiet ? () => {} : console.log;

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  for (const page of pages) {
    const html = renderPage({ site, page, body: renderBlocks(page.blocks) });
    const out = join(dist, outputPathFor(page.slug));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html);
    log(`  ${urlFor(page.slug).padEnd(20)} -> ${outputPathFor(page.slug)}`);
  }

  await cp(join(root, 'public'), dist, { recursive: true });
  await cp(join(root, 'src/styles.css'), join(dist, 'styles.css'));

  const notFound = renderPage({
    site,
    page: { slug: '404', title: 'Page not found', description: 'That page does not exist.' },
    body: `
<section class="block hero hero--plain">
  <div class="hero__inner">
    <h1 class="hero__title">Page not found</h1>
    <p class="hero__sub">That page doesn't exist. Try the menu above.</p>
    <a class="btn btn--gold" href="/">Back to home</a>
  </div>
</section>`,
  });
  await writeFile(join(dist, '404.html'), notFound);

  log(`\nBuilt ${pages.length} pages + 404 into dist/`);
  return pages.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
}
