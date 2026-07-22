const STORAGE_KEY = 'sac-admin-draft-v3';

// creates a draft with all changes made by admin that are not uploaded
export function createDraft({ headSha, site, pages }) {
  return {
    headSha,
    site: structuredClone(site),
    pages: structuredClone(pages),
  };
}

// page and block indexes handled here for later use
function findPageIndex(state, slug) {
  const i = state.pages.findIndex((p) => p.slug === slug);
  if (i === -1) throw new Error(`No page with slug "${slug}"`);
  return i;
}

function findBlockIndex(page, blockId) {
  const i = page.blocks.findIndex((b) => b.id === blockId);
  if (i === -1) throw new Error(`No block with id "${blockId}" on page "${page.slug}"`);
  return i;
}

// listener in app calls this on every update so draft has all unpublished changes
export function updateBlockField(state, slug, blockId, field, value) {
  const pageIndex = findPageIndex(state, slug);
  const page = state.pages[pageIndex];
  const blockIndex = findBlockIndex(page, blockId);

  const keys = field.split('.');
  const block = structuredClone(page.blocks[blockIndex]);
  let cursor = block;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = cursor[key] && typeof cursor[key] === 'object' ? { ...cursor[key] } : {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;

  const blocks = [...page.blocks];
  blocks[blockIndex] = block;

  const pages = [...state.pages];
  pages[pageIndex] = { ...page, blocks };
  return { ...state, pages };
}

// called by app for very obvious purposes (in the name)
export function toPublishPayload(state, message) {
  return { baseSha: state.headSha, site: state.site, pages: state.pages, message };
}

export function afterPublish(state, headSha) {
  return { ...state, headSha };
}

// this class handles storage of changes, objects of this class are versions 
// of the edits made by admin
export class DraftStore {
  #state;
  #listeners = new Set();

  constructor(initialState) {
    this.#state = initialState;
  }

  get state() {
    return this.#state;
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  apply(transitionFn, ...args) {
    this.#state = transitionFn(this.#state, ...args);
    this.#persist();
    this.#notify();
    return this.#state;
  }

  #persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#state));
    } catch {}
  }

  #notify() {
    for (const fn of this.#listeners) fn(this.#state);
  }

  static loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
