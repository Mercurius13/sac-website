/* Turns block JSON into the site's html - one renderer per block type. Also holds
BLOCK_SCHEMA (what fields each block exposes, which the admin reads) and the helpers
that keep admin-entered text/links/html from injecting anything unsafe. */
import { blockShellStyle, heroClasses, heroOverlay, imageSizeClass } from './theme.js';

// escape text so admin input can't break out into html
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// same as esc, but keeps line breaks the admin typed by turning them into <br>.
// use for text CONTENT only, never for attribute values.
export function escLines(value) {
  return esc(value).replace(/\r?\n/g, '<br>');
}

// only let through links we trust (site-relative, http(s), mailto, tel) - drops javascript: etc.
export function safeHref(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^(\/|#|\.\/|\.\.\/)/.test(raw)) return esc(raw);
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return esc(raw);
  return '';
}

// the small set of formatting tags allowed inside body text
const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4']);

// keep the allowed tags (with safe hrefs on links), escape everything else
export function sanitizeHtml(input) {
  const html = String(input ?? '');
  let out = '';
  let last = 0;

  for (const m of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const [full, rawName, rawAttrs] = m;
    const name = rawName.toLowerCase();

    out += esc(html.slice(last, m.index));
    last = m.index + full.length;

    if (!ALLOWED_TAGS.has(name)) continue;

    if (full.startsWith('</')) {
      out += `</${name}>`;
      continue;
    }

    if (name === 'a') {
      const href = safeHref(/href\s*=\s*"([^"]*)"/i.exec(rawAttrs)?.[1] ?? '');
      out += href
        ? `<a href="${href}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>`
        : '<a>';
      continue;
    }

    out += `<${name}>`;
  }

  return out + esc(html.slice(last));
}

// sanitize body text; if it's plain text, wrap it in a paragraph and keep its line breaks
function asProse(body) {
  const clean = sanitizeHtml(body).trim();
  if (!clean) return '';
  if (/^<(p|ul|ol|h3|h4)\b/i.test(clean)) return clean;
  return `<p>${clean.replace(/\r?\n/g, '<br>')}</p>`;
}

// build an <img> tag; returns nothing if the src isn't a safe url. eager = load it right away (hero)
function img(src, alt, { eager = false } = {}) {
  const url = safeHref(src);
  if (!url) return '';
  return (
    `<img src="${url}" alt="${esc(alt)}"` +
    (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
    ' decoding="async">'
  );
}

// one function per block type - each takes the block's JSON and returns a <section> of html
const renderers = {
  hero(block, { first = false } = {}) {
    const button = block.button?.label && safeHref(block.button.href)
      ? `<a class="btn btn--gold" href="${safeHref(block.button.href)}">${esc(block.button.label)}</a>`
      : '';

    const overlay = heroOverlay(block.overlay);
    const style = overlay === null ? '' : ` style="--hero-overlay:${overlay / 100}"`;

    return `
<section class="block hero ${heroClasses(block)}${block.image ? '' : ' hero--plain'}"${style}>
  ${block.image ? `<div class="hero__media">${img(block.image, block.imageAlt, { eager: first })}</div>` : ''}
  <div class="hero__inner">
    <h1 class="hero__title">${escLines(block.heading)}</h1>
    ${block.subheading ? `<p class="hero__sub">${escLines(block.subheading)}</p>` : ''}
    ${button}
  </div>
</section>`;
  },

  richText(block) {
    return `
<section class="block prose-block">
  <div class="wrap">
    ${block.heading ? `<h2 class="section-title">${escLines(block.heading)}</h2>` : ''}
    <div class="prose">${asProse(block.body)}</div>
  </div>
</section>`;
  },

  image(block) {
    const sizeClass = imageSizeClass(block);

    return `
<section class="block image-block">
  <div class="wrap wrap--narrow">
    <figure class="figure${sizeClass ? ` ${sizeClass}` : ''}">
      ${img(block.image, block.imageAlt)}
      ${block.caption ? `<figcaption>${escLines(block.caption)}</figcaption>` : ''}
    </figure>
  </div>
</section>`;
  },

  gallery(block) {
    const items = (block.items ?? []).filter((i) => i.image);
    if (!items.length) return '';

    const slides = items
      .map(
        (item, i) => `
      <li class="gallery__slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${items.length}">
        ${img(item.image, item.alt)}
      </li>`,
      )
      .join('');

    return `
<section class="block gallery-block">
  <div class="wrap">
    ${block.heading ? `<h2 class="section-title">${escLines(block.heading)}</h2>` : ''}
    <div class="gallery" data-gallery>
      <button class="gallery__nav gallery__nav--prev" type="button" data-gallery-prev aria-label="Previous photo">&#8249;</button>
      <ul class="gallery__track" tabindex="0" aria-label="${esc(block.heading || 'Photo gallery')}">${slides}
      </ul>
      <button class="gallery__nav gallery__nav--next" type="button" data-gallery-next aria-label="Next photo">&#8250;</button>
    </div>
  </div>
</section>`;
  },

  cardGrid(block) {
    const variant = ['people', 'tiles', 'text'].includes(block.variant) ? block.variant : 'tiles';

    const cards = (block.items ?? [])
      .map((item) => {
        const media = item.image
          ? `<div class="card__media">${img(item.image, item.imageAlt || item.title)}</div>`
          : '';
        const body = item.body ? `<p class="card__body">${escLines(item.body)}</p>` : '';
        const inner = `
        ${media}
        <div class="card__text">
          ${item.title ? `<h3 class="card__title">${escLines(item.title)}</h3>` : ''}
          ${item.subtitle ? `<p class="card__subtitle">${escLines(item.subtitle)}</p>` : ''}
          ${body}
        </div>`;

        const href = safeHref(item.href);
        return href
          ? `<li class="card"><a class="card__link" href="${href}">${inner}</a></li>`
          : `<li class="card">${inner}</li>`;
      })
      .join('');

    if (!cards) return '';

    return `
<section class="block cards-block">
  <div class="wrap">
    ${block.heading ? `<h2 class="section-title">${escLines(block.heading)}</h2>` : ''}
    ${block.subheading ? `<p class="section-sub">${escLines(block.subheading)}</p>` : ''}
    <ul class="cards cards--${variant}">${cards}
    </ul>
  </div>
</section>`;
  },

  buttonLink(block) {
    const href = safeHref(block.href);
    if (!href) return '';
    const external = /^https?:/i.test(href);

    return `
<section class="block cta-block">
  <div class="wrap wrap--narrow">
    <div class="cta">
      ${block.heading ? `<h2 class="cta__title">${escLines(block.heading)}</h2>` : ''}
      ${block.body ? `<p class="cta__body">${escLines(block.body)}</p>` : ''}
      <a class="btn btn--gold" href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escLines(block.label || 'Open')}</a>
    </div>
  </div>
</section>`;
  },

  // two lists: upcoming (start/end/details) and past (thumbnail + name). an upcoming event
  // whose END date has passed migrates itself to the top of past, at render time only
  eventList(block, { today = new Date() } = {}) {
    const cutoff = new Date(today);
    cutoff.setHours(0, 0, 0, 0);

    const parseDate = (raw) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? '').trim());
      if (!m) return null;
      const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(date.getTime()) ? null : { date, iso: m[0] };
    };

    const upcomingRaw = (block.upcoming ?? []).map((item) => {
      const start = parseDate(item.startDate ?? item.date);
      // end date drives the move to Past; if there's no end, the start date is the last day
      const end = parseDate(item.endDate) ?? start;
      return { ...item, _start: start, _end: end };
    });

    // the event stays under Upcoming until its end date passes, then drops to the top of Past
    // (most recent first). the dates stay in the file; they just aren't shown in the Past design.
    const stillUpcoming = upcomingRaw
      .filter((item) => !item._end || item._end.date >= cutoff)
      .sort((a, b) => (a._start ? a._start.date : Infinity) - (b._start ? b._start.date : Infinity));

    const migratedPast = upcomingRaw
      .filter((item) => item._end && item._end.date < cutoff)
      .sort((a, b) => b._end.date - a._end.date)
      .map((item) => ({ title: item.title, image: item.image, imageAlt: item.imageAlt }));

    const past = [...migratedPast, ...(block.past ?? [])];

    const fmtFull = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const fmtRange = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const dateLabel = (item) => {
      if (!item._start) return '';
      const oneDay = !item._end || item._end.iso === item._start.iso;
      if (oneDay) return `<time datetime="${esc(item._start.iso)}">${esc(fmtFull.format(item._start.date))}</time>`;
      return `<time datetime="${esc(item._start.iso)}">${esc(fmtRange.format(item._start.date))}</time> &ndash; <time datetime="${esc(item._end.iso)}">${esc(fmtFull.format(item._end.date))}</time>`;
    };

    const upcomingRow = (item) => {
      const meta = [
        dateLabel(item),
        item.time ? `<span>${esc(item.time)}</span>` : '',
        item.location ? `<span>${esc(item.location)}</span>` : '',
      ]
        .filter(Boolean)
        .join('<span class="event__dot">·</span>');

      return `
      <li class="event">
        ${item.image ? `<div class="event__media">${img(item.image, item.imageAlt || item.title)}</div>` : ''}
        <div class="event__text">
          ${item.title ? `<h3 class="event__title">${escLines(item.title)}</h3>` : ''}
          ${meta ? `<p class="event__meta">${meta}</p>` : ''}
          ${item.description ? `<p class="event__desc">${escLines(item.description)}</p>` : ''}
        </div>
      </li>`;
    };

    const pastTile = (item) => `
      <li class="card">
        ${item.image ? `<div class="card__media">${img(item.image, item.imageAlt || item.title)}</div>` : ''}
        <div class="card__text">${item.title ? `<h3 class="card__title">${escLines(item.title)}</h3>` : ''}</div>
      </li>`;

    const upcomingSection = stillUpcoming.length
      ? `
    <h3 class="events__group">${esc(block.upcomingLabel || 'Upcoming')}</h3>
    <ul class="events">${stillUpcoming.map(upcomingRow).join('')}
    </ul>`
      : '';

    const pastSection = past.length
      ? `
    <h3 class="events__group">${esc(block.pastLabel || 'Past events')}</h3>
    <ul class="cards cards--tiles">${past.map(pastTile).join('')}
    </ul>`
      : '';

    if (!upcomingSection && !pastSection) return '';

    return `
<section class="block events-block">
  <div class="wrap">
    ${block.heading ? `<h2 class="section-title">${escLines(block.heading)}</h2>` : ''}
    ${block.note ? `<p class="section-sub">${escLines(block.note)}</p>` : ''}${upcomingSection}${pastSection}
  </div>
</section>`;
  },

  // a share link that expires: while today is on or before "active until", show the SignUp
  // button; after that day passes the link auto-disappears and the fallback message shows instead
  volunteer(block, { today = new Date() } = {}) {
    const href = safeHref(block.link);
    const cutoff = new Date(today);
    cutoff.setHours(0, 0, 0, 0);

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(block.activeUntil ?? '').trim());
    const end = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    const active = href && (!end || Number.isNaN(end.getTime()) || end >= cutoff);

    const cta = active
      ? `<a class="signup-btn" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="View volunteer opportunities on SignUp (opens in a new tab)">${img('https://signup.com/imgs/icons/signup-choose-a-spot-btn.png', 'View volunteer opportunities on SignUp')}</a>`
      : `<p class="volunteer__note">${escLines(block.fallbackText || 'No volunteers needed yet, please wait until our next event.')}</p>`;

    return `
<section class="block volunteer-block">
  <div class="wrap">
    ${block.heading ? `<h2 class="section-title">${escLines(block.heading)}</h2>` : ''}
    ${cta}
  </div>
</section>`;
  },

};

// the admin reads this to know which fields each block type exposes (and, for lists,
// which fields each item has). the renderers above and the inspector both lean on it.
export const BLOCK_SCHEMA = {
  hero: {
    label: 'Hero banner',
    group: 'Basics',
    fields: ['heading', 'subheading', 'image', 'imageAlt', 'button', 'height', 'overlay', 'align'],
  },
  richText: { label: 'Text section', group: 'Basics', fields: ['heading', 'body'] },
  image: {
    label: 'Single image',
    group: 'Basics',
    fields: ['image', 'imageAlt', 'caption', 'width', 'align', 'spacing'],
  },
  gallery: {
    label: 'Photo gallery',
    group: 'Basics',
    fields: ['heading', 'items'],
    itemFields: ['image', 'alt'],
  },
  cardGrid: {
    label: 'Card grid',
    group: 'Basics',
    fields: ['heading', 'subheading', 'variant', 'items'],
    itemFields: ['image', 'imageAlt', 'title', 'subtitle', 'body', 'href'],
  },
  buttonLink: { label: 'Button / link', group: 'Basics', fields: ['heading', 'body', 'label', 'href'] },

  eventList: {
    label: 'Events list',
    group: 'Content',
    fields: ['heading', 'note', 'upcomingLabel', 'pastLabel', 'upcoming', 'past'],
    upcomingFields: ['startDate', 'endDate', 'time', 'location', 'title', 'description', 'image'],
    pastFields: ['image', 'title'],
  },
  volunteer: {
    label: 'Volunteer sign-up',
    group: 'Content',
    fields: ['heading', 'link', 'activeUntil', 'fallbackText'],
  },
};

// every block except the hero can also take a background + text colour
for (const [type, entry] of Object.entries(BLOCK_SCHEMA)) {
  if (type === 'hero') continue;
  if (!entry.fields.includes('background')) entry.fields.push('background');
  if (!entry.fields.includes('textColor')) entry.fields.push('textColor');
}

// the hero paints its own full-bleed background, so it skips the colour-carrying shell wrapper
const NO_BACKGROUND_SHELL = new Set(['hero']);

// render one block, wrapping it in the shell that carries its background/text colour.
// an unknown type becomes an html comment rather than blowing up the page.
export function renderBlock(block, context = {}) {
  const fn = renderers[block?.type];
  if (!fn) return `<!-- unknown block type: ${esc(block?.type)} -->`;

  const html = fn(block, context);
  if (!html || NO_BACKGROUND_SHELL.has(block?.type)) return html;

  const style = blockShellStyle(block);
  return `<div class="block-shell" data-block-type="${esc(block?.type)}"${style}>${html}</div>`;
}

// render a page's whole block list. first lets the hero eager-load its image;
// today drives the events block's upcoming-to-past migration.
export function renderBlocks(blocks = [], { today = new Date() } = {}) {
  return blocks.map((block, i) => renderBlock(block, { first: i === 0, today })).join('\n');
}
