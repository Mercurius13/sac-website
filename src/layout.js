/* Layout of the entire site, handles site behaviour, functionality of nav bar
renders the entire page, has code for functionality of arrows, etc*/
import { esc, safeHref } from './blocks.js';
import { urlFor } from './paths.js';
import { themeVars } from './theme.js';

// nav bar, gallery, scrolling, resizing
function siteBehaviour() {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    var close = function (refocus) {
      if (!nav.classList.contains('is-open')) return;
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (refocus) toggle.focus();
    };

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) close(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close(true);
    });
  }

  var galleries = document.querySelectorAll('[data-gallery]');

  for (var i = 0; i < galleries.length; i++) {
    (function (gallery) {
      var track = gallery.querySelector('.gallery__track');
      var prev = gallery.querySelector('[data-gallery-prev]');
      var next = gallery.querySelector('[data-gallery-next]');
      if (!track) return;

      var step = function () {
        var slide = track.querySelector('.gallery__slide');
        return slide ? slide.offsetWidth : track.clientWidth * 0.8;
      };

      var scrollByStep = function (dir) {
        track.scrollBy({
          left: dir * (step() + 16),
          behavior: reduceMotion.matches ? 'auto' : 'smooth',
        });
      };

      if (prev) prev.addEventListener('click', function () { scrollByStep(-1); });
      if (next) next.addEventListener('click', function () { scrollByStep(1); });

      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); scrollByStep(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); scrollByStep(-1); }
      });

      var setDisabled = function (btn, disabled, sibling) {
        if (!btn || btn.disabled === disabled) return;
        if (disabled && document.activeElement === btn && sibling && !sibling.disabled) sibling.focus();
        btn.disabled = disabled;
      };

      var sync = function () {
        var max = track.scrollWidth - track.clientWidth - 2;
        setDisabled(prev, track.scrollLeft <= 2, next);
        setDisabled(next, track.scrollLeft >= max, prev);
      };

      track.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
    })(galleries[i]);
  }
}

// DOM loader
function inlineScript() {
  return `document.addEventListener('DOMContentLoaded',${siteBehaviour.toString()});`;
}

// what even is this for
function announcementBar(announcement) {
  if (!announcement?.enabled || !announcement.text) return '';

  const href = safeHref(announcement.href);
  const tone = ['info', 'alert'].includes(announcement.tone) ? announcement.tone : 'info';

  const text = href
    ? `<a class="announce__link" href="${href}">${esc(announcement.text)}</a>`
    : `<span>${esc(announcement.text)}</span>`;

  return `
  <div class="announce announce--${tone}" id="announcement" role="region" aria-label="Announcement">
    <div class="wrap announce__inner">
      ${text}
      <a class="announce__close" href="#announcement" aria-label="Dismiss announcement">&times;</a>
    </div>
  </div>`;
}

// socials in footer
function footerSocials(items = []) {
  const links = (items ?? [])
    .filter((item) => item.image)
    .map((item) => {
      const href = safeHref(item.href);
      const icon = `<img src="${safeHref(item.image)}" alt="${esc(item.label || '')}" width="40" height="40" loading="lazy">`;
      return href
        ? `<li><a class="site-footer__social" href="${href}" target="_blank" rel="noopener noreferrer">${icon}</a></li>`
        : `<li><span class="site-footer__social">${icon}</span></li>`;
    })
    .join('');
  return links ? `<ul class="site-footer__socials">${links}</ul>` : '';
}

// rendering the entire page, body comes from build
export function renderPage({ site, page, body }) {
  const nav = (site.nav ?? [])
    .map((item) => {
      const href = urlFor(item.slug);
      const current = item.slug === page.slug;
      return `<li><a href="${esc(href)}"${current ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`;
    })
    .join('\n            ');

  const pageTitle = page.slug === 'home' ? `${esc(site.fullName)}` : `${esc(page.title)} · ${esc(site.title)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <meta name="description" content="${esc(page.description || site.tagline)}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${esc(page.description || site.tagline)}">
  <meta property="og:type" content="website">
  ${site.logo ? `<meta property="og:image" content="${safeHref(site.logo)}">` : ''}
  <link rel="icon" href="${safeHref(site.logo) || '/favicon.ico'}">
  <link rel="stylesheet" href="/styles.css">
  <style>${themeVars(site.theme)}</style>
  <script>${inlineScript()}</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
${announcementBar(site.announcement)}
  <header class="site-header">
    <div class="wrap site-header__inner">
      <a class="brand" href="/">
        ${site.logo ? `<img class="brand__mark" src="${safeHref(site.logo)}" alt="" width="44" height="44">` : ''}
        <span class="brand__text">
          <span class="brand__short">${esc(site.title)}</span>
          <span class="brand__full">${esc(site.fullName)}</span>
        </span>
      </a>

      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
        <span class="nav-toggle__bar"></span>
        <span class="nav-toggle__bar"></span>
        <span class="nav-toggle__bar"></span>
      </button>

      <nav class="site-nav" id="site-nav" aria-label="Main" >
        <ul>
            ${nav}
        </ul>
      </nav>
    </div>
  </header>

  <main id="main">
${body}
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      ${site.logo ? `<img class="site-footer__mark" src="${safeHref(site.logo)}" alt="" width="56" height="56" loading="lazy">` : ''}
      <div>
        <p class="site-footer__text">${esc(site.footer?.text ?? '')}</p>
        ${site.footer?.note ? `<p class="site-footer__note">${esc(site.footer.note)}</p>` : ''}
      </div>
      ${footerSocials(site.footer?.socials)}
    </div>
  </footer>
</body>
</html>
`;
}
