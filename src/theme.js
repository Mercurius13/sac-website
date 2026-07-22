export const FONT_STACKS = {
  system: {
    label: 'System (clean, modern)',
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  georgia: { label: 'Georgia (classic serif)', stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  palatino: { label: 'Palatino (elegant serif)', stack: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  garamond: { label: 'Garamond (traditional)', stack: 'Garamond, Baskerville, "Times New Roman", serif' },
  helvetica: { label: 'Helvetica (neutral sans)', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  verdana: { label: 'Verdana (high legibility)', stack: 'Verdana, Geneva, "DejaVu Sans", sans-serif' },
  trebuchet: { label: 'Trebuchet (friendly sans)', stack: '"Trebuchet MS", "Lucida Grande", Tahoma, sans-serif' },
  mono: { label: 'Monospace (technical)', stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
};

export const COLOR_TOKENS = {
  gold: '#d4a03c',
  goldDeep: '#a8761f',
  red: '#a8232b',
  ink: '#14141a',
  paper: '#ffffff',
  paperAlt: '#f7f5f1',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeVars(theme = {}) {
  const vars = [];

  for (const key of Object.keys(COLOR_TOKENS)) {
    const value = theme[key];
    if (typeof value === 'string' && HEX.test(value.trim())) {
      vars.push(`--c-${kebab(key)}:${value.trim()}`);
    }
  }

  const display = FONT_STACKS[theme.fontDisplay];
  const body = FONT_STACKS[theme.fontBody];
  if (display) vars.push(`--font-display:${display.stack}`);
  if (body) vars.push(`--font-body:${body.stack}`);

  return vars.length ? `:root{${vars.join(';')}}` : '';
}

export const HERO_HEIGHTS = { short: 'short', medium: 'medium', tall: 'tall', full: 'full' };
export const HERO_ALIGN = { left: 'left', center: 'center' };

export function heroOverlay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(95, Math.max(0, Math.round(n)));
}

export function heroClasses(block = {}) {
  const height = HERO_HEIGHTS[block.height] ?? 'medium';
  const align = HERO_ALIGN[block.align] ?? 'left';
  return `hero--h-${height} hero--align-${align}`;
}

export const BLOCK_SWATCHES = {
  paper: { label: 'Paper (default)', bg: 'var(--c-paper)', fg: 'var(--c-text)' },
  gold: { label: 'Light gold', bg: '#fbf1de', fg: 'var(--c-ink)' },
  grey: { label: 'Light grey', bg: 'var(--c-paper-alt)', fg: 'var(--c-text)' },
  ink: { label: 'Ink (dark)', bg: 'var(--c-ink)', fg: '#ffffff' },
  red: { label: 'Red', bg: 'var(--c-red)', fg: '#ffffff' },
};

const CUSTOM_FG = { light: '#ffffff', dark: '#14141a' };

export const TEXT_SWATCHES = {
  default: { label: 'Default', color: '' },
  ink: { label: 'Ink', color: 'var(--c-ink)' },
  red: { label: 'Red', color: 'var(--c-red)' },
  gold: { label: 'Gold', color: 'var(--c-gold-deep)' },
  white: { label: 'White', color: '#ffffff' },
  muted: { label: 'Muted grey', color: 'var(--c-muted)' },
};

function backgroundDecls(background) {
  if (!background || typeof background !== 'object') return [];

  if (background.swatch && background.swatch !== 'paper' && BLOCK_SWATCHES[background.swatch]) {
    const { bg, fg } = BLOCK_SWATCHES[background.swatch];
    return [`--block-bg:${bg}`, `--block-fg:${fg}`];
  }
  if (typeof background.custom === 'string' && HEX.test(background.custom.trim())) {
    return [`--block-bg:${background.custom.trim()}`, `--block-fg:${CUSTOM_FG[background.text] ?? CUSTOM_FG.dark}`];
  }
  return [];
}

function textColorDecl(textColor) {
  if (!textColor || typeof textColor !== 'object') return null;
  if (textColor.swatch && TEXT_SWATCHES[textColor.swatch]?.color) return `--block-fg:${TEXT_SWATCHES[textColor.swatch].color}`;
  if (typeof textColor.custom === 'string' && HEX.test(textColor.custom.trim())) return `--block-fg:${textColor.custom.trim()}`;
  return null;
}

export function blockShellStyle(block) {
  const decls = backgroundDecls(block?.background);
  const fg = textColorDecl(block?.textColor);
  if (fg) decls.push(fg);
  return decls.length ? ` style="${decls.join(';')}"` : '';
}

const IMAGE_WIDTHS = new Set([25, 33, 50, 67, 75, 100]);
const IMAGE_ALIGNS = new Set(['left', 'center', 'right']);
const IMAGE_SPACING = new Set(['s', 'm', 'l', 'xl']);

export function imageSizeClass({ width, align, spacing } = {}) {
  const classes = [];
  const w = Number(width);
  if (IMAGE_WIDTHS.has(w)) classes.push(`img-w-${w}`);
  if (IMAGE_ALIGNS.has(align)) classes.push(`img-align-${align}`);
  if (IMAGE_SPACING.has(spacing)) classes.push(`img-space-${spacing}`);
  return classes.join(' ');
}
