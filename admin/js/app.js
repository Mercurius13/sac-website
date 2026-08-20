/* The editor's controller: wires the login/publish/logout buttons, tracks which page and
block are selected, and drives the preview + toolbar + popover as the admin edits */
import { api, ApiError } from './api.js';
import { createDraft, DraftStore, toPublishPayload, updateBlockField, updateFooterField, afterPublish } from './draft.js';
import { renderPreview, setSelected, mountBlockTools, removeBlockTools, FOOTER_BLOCK_ID } from './render.js';
import { blockToolGroups, renderFields, FOOTER_TYPE } from './inspector.js';

// grab every element the editor touches once, up front
const els = {
  login: document.getElementById('sac-login'),
  loginForm: document.getElementById('sac-login-form'),
  loginError: document.getElementById('sac-login-error'),
  editor: document.getElementById('sac-editor'),
  preview: document.getElementById('sac-preview'),

  // the popover the block toolbar opens for editing the selected block
  // (the toolbar itself lives inside the preview iframe, mounted by render.js)
  popover: document.getElementById('sac-popover'),
  popoverTitle: document.getElementById('sac-popover-title'),
  popoverBody: document.getElementById('sac-popover-body'),
  popoverClose: document.getElementById('sac-popover-close'),

  publishBtn: document.getElementById('sac-publish'),
  publishStatus: document.getElementById('sac-publish-status'),
  logoutBtn: document.getElementById('sac-logout'),

  mediaLibrary: document.getElementById('sac-media-library'),
  mediaLibraryGrid: document.getElementById('sac-media-library-grid'),
  mediaLibraryClose: document.getElementById('sac-media-library-close'),
};

// maps a server image path to its local blob: url until the upload is published
const blobUrls = new Map();

let store = null;
let activeSlug = null;
let selectedBlockId = null;
let openGroupKey = null;

// entry point: skip to the editor if already logged in, otherwise show the login screen
async function boot() {
  const session = await api.session();
  if (!session.authenticated) return showLogin();
  await enterEditor();
}

function showLogin(message) {
  els.login.hidden = false;
  els.editor.hidden = true;
  els.loginError.textContent = message ?? '';
}

// load the published content, then either resume the admin's saved draft or start fresh
async function enterEditor() {
  const server = await api.content();
  const persisted = DraftStore.loadPersisted();

  let initial;
  if (persisted && persisted.headSha === server.headSha) {
    initial = persisted;
  } else if (persisted) {
    const keep = await confirmResume();
    initial = keep ? persisted : createDraft(server);
  } else {
    initial = createDraft(server);
  }

  store = new DraftStore(initial);
  store.subscribe(onStateChange);

  els.login.hidden = true;
  els.editor.hidden = false;

  activeSlug = defaultActiveSlug();
  renderActivePage();
}

// custom yes/no dialog - native confirm() can't relabel its OK/Cancel buttons. text goes in
// via textContent so dynamic values (a filename, a page name) can't inject markup.
// resolves true for the primary button, false for the secondary.
function confirmDialog({ title, body, confirmLabel = 'Continue', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sac-modal';

    const panel = document.createElement('div');
    panel.className = 'sac-modal__panel sac-confirm';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'sac-modal__body';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    bodyEl.append(h, p);

    const actions = document.createElement('div');
    actions.className = 'sac-confirm__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'sac-btn';
    cancel.textContent = cancelLabel;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'sac-btn ' + (danger ? 'sac-btn--danger' : 'sac-btn--primary');
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);

    const done = (val) => { overlay.remove(); resolve(val); };
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));

    panel.append(bodyEl, actions);
    overlay.append(panel);
    document.body.append(overlay);
  });
}

// the resume-draft prompt (shown when a saved draft is found on load)
function confirmResume() {
  return confirmDialog({
    title: 'YOU FORGOT TO PUBLISH CHANGES',
    body: "Do you want to continue with the changes you've made? or start fresh?",
    confirmLabel: 'Continue',
    cancelLabel: 'Discard',
  });
}

// open on the home page if there is one, else the first page
function defaultActiveSlug() {
  if (store.state.pages.some((p) => p.slug === 'home')) return 'home';
  return store.state.pages[0]?.slug ?? null;
}

function currentPage() {
  return store.state.pages.find((p) => p.slug === activeSlug) ?? null;
}

function selectedBlock() {
  return currentPage()?.blocks.find((b) => b.id === selectedBlockId) ?? null;
}

// the thing currently being edited: a page block, or the footer as a pseudo-block
function currentEditable() {
  if (selectedBlockId === FOOTER_BLOCK_ID) {
    return { id: FOOTER_BLOCK_ID, type: FOOTER_TYPE, ...store.state.site.footer };
  }
  return selectedBlock();
}

function isFooterSelected() {
  return selectedBlockId === FOOTER_BLOCK_ID;
}

// the draft store notifies us on every edit; re-render the preview to reflect it
function onStateChange() {
  renderActivePage();
}

// switch pages (from a nav-link click in the preview), dropping any selection
function goToPage(slug) {
  if (!store.state.pages.some((p) => p.slug === slug)) return;
  activeSlug = slug;
  deselect();
  renderActivePage();
}

// turn a preview link's pathname into a page slug ("/" -> "home", "/events" -> "events")
function slugForPath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? 'home' : trimmed.replace(/^\/+/, '');
}

// redraw the active page in the preview and re-apply the current selection outline
function renderActivePage() {
  const page = currentPage();
  if (!page) {
    els.preview.replaceChildren();
    return;
  }
  renderPreview(els.preview, { site: store.state.site, page }, {
    blobUrls,
    onSelectBlock: selectBlock,
    onNavigate: (pathname) => goToPage(slugForPath(pathname)),
  });
  // re-rendering wipes the iframe, so re-apply the outline and re-mount the toolbar -
  // unless a popover is open, in which case the toolbar stays hidden behind it
  setSelected(selectedBlockId);
  if (selectedBlockId && !openGroupKey) showTools();
}

// ---------------------------------------------------------- selection ------

// clicking a block selects it: outline it and show its toolbar, closing any open popover
function selectBlock(id) {
  if (!id) return deselect();

  selectedBlockId = id;
  openGroupKey = null;
  setSelected(id);
  els.popover.hidden = true;
  showTools();
}

// clear the selection and take the toolbar and popover away
function deselect() {
  selectedBlockId = null;
  openGroupKey = null;
  setSelected(null);
  removeBlockTools();
  els.popover.hidden = true;
}

// mount the toolbar inside the selected block: one icon per applicable field group, plus a done button
function showTools() {
  const block = currentEditable();
  if (!block) return removeBlockTools();

  const groups = blockToolGroups(block);
  mountBlockTools(
    selectedBlockId,
    groups.map((g) => ({ key: g.key, icon: g.icon, label: g.label, active: g.key === openGroupKey })),
    {
      onTool: (key) => openGroup(groups.find((g) => g.key === key)),
      onClose: deselect,
    },
  );
}

// clicking a toolbar icon opens its popover with just that group's fields, hiding the toolbar behind it
function openGroup(group) {
  if (!group) return;
  openGroupKey = group.key;
  els.popoverTitle.textContent = group.label;
  renderPopoverBody(group);
  els.popover.hidden = false;
  removeBlockTools();
}

// fill the popover with the group's fields; editing one writes to the draft and re-renders.
// footer edits go to site.footer, block edits to the page block.
function renderPopoverBody(group) {
  const block = currentEditable();
  if (!block) {
    els.popover.hidden = true;
    return;
  }
  renderFields(
    els.popoverBody,
    block,
    group.fields,
    (field, value) => {
      if (isFooterSelected()) store.apply(updateFooterField, field, value);
      else store.apply(updateBlockField, activeSlug, selectedBlockId, field, value);
      renderPopoverBody(group);
    },
    { openLibrary, upload: uploadImage },
  );
}

// closing the popover keeps the block selected, so bring its toolbar back
els.popoverClose.addEventListener('click', () => {
  openGroupKey = null;
  els.popover.hidden = true;
  showTools();
});

// ------------------------------------------------------------ media / img -

// open the media library and resolve with the path the admin picks (or null if cancelled)
function openLibrary() {
  return new Promise(async (resolve) => {
    const media = await api.media().catch(() => []);
    els.mediaLibraryGrid.replaceChildren();

    for (const item of media) {
      const cell = document.createElement('div');
      cell.className = 'sac-media-cell';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sac-media-item';
      const img = document.createElement('img');
      img.src = blobUrls.get(item.path) ?? item.path;
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);
      btn.addEventListener('click', () => {
        els.mediaLibrary.hidden = true;
        resolve(item.path);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sac-media-del';
      del.title = 'Delete image';
      del.textContent = '×';
      del.addEventListener('click', () => deleteFromLibrary(item.path, cell));

      cell.append(btn, del);
      els.mediaLibraryGrid.append(cell);
    }

    els.mediaLibraryClose.onclick = () => {
      els.mediaLibrary.hidden = true;
      resolve(null);
    };

    els.mediaLibrary.hidden = false;
  });
}

// true if the draft references this image path anywhere (so we can warn before deleting)
function usesMedia(path) {
  return JSON.stringify(store.state).includes(`"${path}"`);
}

// confirm, then delete an image from the library; drop its tile and advance the head if it moved
async function deleteFromLibrary(path, cell) {
  const inUse = usesMedia(path);
  const ok = await confirmDialog({
    title: 'Delete image',
    body: inUse
      ? "This image is still used somewhere on the site - deleting it will leave a broken image there. Delete it anyway?"
      : "Delete this image permanently? This can't be undone.",
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await api.deleteMedia(path);
    if (res?.headSha) store.apply(afterPublish, res.headSha);
    cell.remove();
  } catch (err) {
    alert(err instanceof ApiError ? err.message : 'Delete failed.');
  }
}

// upload a file and remember its blob: url so the preview shows it before publishing
async function uploadImage(file) {
  const blobUrl = URL.createObjectURL(file);
  try {
    const { path, headSha } = await api.upload(file);
    blobUrls.set(path, blobUrl);
    // in github mode the upload committed the image and moved the head - advance the draft's
    // baseSha to match, so publishing our own edits doesn't false-conflict with our own upload
    if (headSha) store.apply(afterPublish, headSha);
    return { path, blobUrl };
  } catch (err) {
    URL.revokeObjectURL(blobUrl);
    alert(err instanceof ApiError ? err.message : 'Upload failed.');
    throw err;
  }
}

// -------------------------------------------------------------- publish ----

// publish the whole draft; on success adopt the new headSha, on 409 surface the conflict
els.publishBtn.addEventListener('click', async () => {
  const message = prompt('Describe this change (optional):', '') ?? '';
  els.publishBtn.disabled = true;
  els.publishStatus.textContent = 'Publishing…';

  try {
    const result = await api.publish(toPublishPayload(store.state, message));
    store.apply(afterPublish, result.headSha);
    els.publishStatus.textContent = 'Published. The live site will update in a minute or two.';
  } catch (err) {
    els.publishStatus.textContent =
      err instanceof ApiError && err.status === 409 ? `${err.message}` : `Publish failed: ${err.message}`;
  } finally {
    els.publishBtn.disabled = false;
  }
});

// ----------------------------------------------------------------- auth ----

// log in with the password, then drop into the editor
els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = new FormData(els.loginForm).get('password');
  try {
    await api.login(password);
    await enterEditor();
  } catch (err) {
    showLogin(err instanceof ApiError ? err.message : 'Login failed.');
  }
});

// log out, drop the in-memory draft, and return to the login screen
els.logoutBtn.addEventListener('click', async () => {
  await api.logout();
  store = null;
  showLogin();
});

boot();
