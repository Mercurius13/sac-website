// This page handles rendering the changes made in the admin popups
// directly on the page for admins to clearly see their changes effects
import { esc, renderBlock } from '../../src/blocks.js';
import { renderPage } from '../../src/layout.js';
import { BLOCK_SCHEMA } from '../../src/blocks.js';

// injected into the preview iframe only: the edit-mode characteristics (pointer cursor,
// hover outline, selected outline, empty-block styling) that the live site never has.
// also the block toolbar, which lives inside the selected block so it scrolls with it
const EDIT_CSS = `
[data-block-id] { cursor: pointer; outline-offset: 3px; transition: outline-color .12s ease; }
[data-block-id]:hover { outline: 2px dashed rgb(212 160 60 / 65%); }
[data-block-id].sac-selected { outline: 2px solid #d4a03c; outline-offset: 3px; position: relative; }
.sac-empty-block { outline: 2px dashed #ccc; outline-offset: -2px; }
.sac-empty-note { color: #6b6b76; font-size: .9rem; padding: 1.5rem; }
.sac-blocktools {
  position: absolute; top: 8px; right: 8px; z-index: 50;
  display: flex; gap: 3px; padding: 3px;
  background: #181838; border-radius: 9px;
  box-shadow: 0 6px 20px -6px rgb(20 20 26 / 45%);
}
.sac-blocktools button {
  width: 34px; height: 34px;
  display: grid; place-items: center;
  border: 0; border-radius: 6px;
  background: transparent; color: #e9e5db;
  cursor: pointer; font: inherit; font-size: 1rem; line-height: 1;
}
.sac-blocktools button:hover { background: rgb(255 255 255 / 14%); color: #fff; }
.sac-blocktools button.is-active { background: #a8232b; color: #fff; }
.sac-blocktools__close { font-size: 1.15rem; border-left: 1px solid rgb(255 255 255 / 18%); border-radius: 0 6px 6px 0; }
`;

// stamp the block's id onto its outer tag so a click can map back to which block it was
function tagRoot(html, block) {
  return html.replace(/^(\s*<[a-zA-Z][a-zA-Z0-9]*)/, `$1 data-block-id="${esc(block.id)}"`);
}

// a block with no content yet renders to nothing, so show a selectable stand-in instead
function emptyPlaceholder(block) {
  const label = BLOCK_SCHEMA[block.type]?.label ?? block.type;
  return `<div class="block-shell sac-empty-block" data-block-id="${esc(block.id)}" data-block-type="${esc(block.type)}">
    <div class="wrap"><p class="sac-empty-note">${esc(label)} has no content yet - use its Edit button to fill it in.</p></div>
  </div>`;
}

// render every block on the page to html, each tagged with its id (or a placeholder if empty)
function renderBodyWithIds(page, today) {
  return page.blocks
    .map((block, i) => {
      const html = renderBlock(block, { first: i === 0, today });
      return html ? tagRoot(html, block) : emptyPlaceholder(block);
    })
    .join('\n');
}

let frame = null;

// the preview lives in an iframe so the real site's styles.css applies on its own,
// without admin.css bleeding in - build it once with the site + theme + edit styles, then reuse
function ensureFrame(container) {
  if (frame && frame.isConnected && frame.contentDocument) return frame;

  frame = document.createElement('iframe');
  frame.className = 'sac-frame';
  container.replaceChildren(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8">' +
      `<base href="${location.origin}/">` +
      '<link rel="stylesheet" href="/styles.css">' +
      '<style id="sac-theme"></style>' +
      `<style id="sac-edit">${EDIT_CSS}</style>` +
      '</head><body></body></html>',
  );
  doc.close();
  return frame;
}

// the live document inside the preview iframe
function getPreviewDoc() {
  return frame?.contentDocument ?? null;
}

// a just-uploaded image isn't on the server yet, so point its <img> at the local blob: preview
function resolveBlobImages(doc, blobUrls) {
  if (!blobUrls?.size) return;
  for (const img of doc.querySelectorAll('img[src]')) {
    const raw = img.getAttribute('src');
    const blobUrl = blobUrls.get(raw) ?? blobUrls.get(new URL(raw, location.origin).pathname);
    if (blobUrl) img.src = blobUrl;
  }
}

// one click handler for the whole preview: header links switch pages, everything else
// selects (or deselects) whichever block was clicked
function wireBlockSelection(doc, onSelectBlock, onNavigate) {
  doc.body.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
      e.preventDefault();
      const href = link.getAttribute('href') || '';
      const isInternal = href.startsWith('/') || href.startsWith('#') || href.startsWith(location.origin);
      if (e.target.closest('.site-header') && isInternal) {
        onNavigate?.(new URL(link.href, location.origin).pathname);
        return;
      }
    }

    const root = e.target.closest('[data-block-id]');
    onSelectBlock(root ? root.dataset.blockId : null);
  });
}

/** Outline the selected block in the preview (and clear any previous). */
export function setSelected(blockId) {
  const doc = getPreviewDoc();
  if (!doc) return;
  for (const el of doc.querySelectorAll('.sac-selected')) el.classList.remove('sac-selected');
  if (!blockId) return;
  doc.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`)?.classList.add('sac-selected');
}

// take the toolbar back off (when the block is deselected or a popover takes over)
export function removeBlockTools() {
  getPreviewDoc()?.querySelector('.sac-blocktools')?.remove();
}

// drop the toolbar into the selected block itself, so it sits at the block's top-right corner
// and scrolls with it. tools is [{ key, icon, label, active }]; clicks call back into app.js.
export function mountBlockTools(blockId, tools, { onTool, onClose } = {}) {
  const doc = getPreviewDoc();
  if (!doc) return;
  removeBlockTools();

  const block = doc.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!block) return;

  const bar = doc.createElement('div');
  bar.className = 'sac-blocktools';

  for (const tool of tools) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    if (tool.active) btn.className = 'is-active';
    btn.title = tool.label;
    btn.textContent = tool.icon;
    // stop the click from bubbling to the preview's block-selection handler
    btn.addEventListener('click', (e) => { e.stopPropagation(); onTool?.(tool.key); });
    bar.append(btn);
  }

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'sac-blocktools__close';
  close.title = 'Done';
  close.textContent = '×';
  close.addEventListener('click', (e) => { e.stopPropagation(); onClose?.(); });
  bar.append(close);

  block.append(bar);
}

// rebuild the whole preview from the current draft: swap in the new body html while keeping
// scroll position, refresh the theme styles, then re-point uploaded images and re-wire clicks
export function renderPreview(container, { site, page }, { today = new Date(), blobUrls, onSelectBlock, onNavigate } = {}) {
  const f = ensureFrame(container);
  const doc = f.contentDocument;

  const html = renderPage({ site, page, body: renderBodyWithIds(page, today) });
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  doc.getElementById('sac-theme').textContent = parsed.querySelector('head style')?.textContent ?? '';

  const scrollY = f.contentWindow.scrollY;
  doc.body.innerHTML = parsed.body.innerHTML;
  f.contentWindow.scrollTo(0, scrollY);

  resolveBlobImages(doc, blobUrls);
  wireBlockSelection(doc, onSelectBlock, onNavigate);
}
