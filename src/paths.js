/* Slug helpers: what a valid page slug looks like, how to derive one from a title,
and how a slug maps to its public url and its built-file path. */

// a slug is lowercase words joined by single hyphens (e.g. "get-involved")
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// true if slug is a well-formed, not-too-long slug
export function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length <= 60 && SLUG_RE.test(slug);
}

// turn any title into a url-safe slug: strip accents/punctuation, lowercase, hyphen-join
export function slugify(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

// a page's public url - home lives at the site root
export function urlFor(slug) {
  return slug === 'home' ? '/' : `/${slug}`;
}

// where the page's html is written under dist - home is the top-level index.html
export function outputPathFor(slug) {
  return slug === 'home' ? 'index.html' : `${slug}/index.html`;
}
