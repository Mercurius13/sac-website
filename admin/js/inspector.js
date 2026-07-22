/* This file imports all blocks SCHEMAS and styles from theme.
Each Field Has its own attributes which admins are allowed to change, all listed in field config */
import { BLOCK_SCHEMA } from '../../src/blocks.js';
import { BLOCK_SWATCHES, FONT_STACKS, HERO_ALIGN, HERO_HEIGHTS, TEXT_SWATCHES } from '../../src/theme.js';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const FIELD_CONFIG = {
  heading: { label: 'Heading', input: 'text' },
  subheading: { label: 'Subheading', input: 'text' },
  title: { label: 'Title', input: 'text' },
  subtitle: { label: 'Subtitle', input: 'text' },
  label: { label: 'Button label', input: 'text' },
  caption: { label: 'Caption', input: 'text' },
  note: { label: 'Note', input: 'textarea' },
  description: { label: 'Description', input: 'textarea' },
  body: { label: 'Body text', input: 'textarea' },
  href: { label: 'Link', input: 'url' },
  image: { label: 'Image', input: 'image' },
  imageAlt: { label: 'Alt text (for screen readers)', input: 'text' },
  alt: { label: 'Alt text (for screen readers)', input: 'text' },
  button: { label: 'Button', input: 'button' },
  items: { label: 'Items', input: 'items' },
  upcoming: { label: 'Upcoming events', input: 'events', itemsKey: 'upcomingFields' },
  past: { label: 'Past events', input: 'events', itemsKey: 'pastFields' },
  background: { label: 'Background', input: 'background' },
  textColor: { label: 'Text color', input: 'textColor' },
  width: { label: 'Width', input: 'select', options: [25, 33, 50, 67, 75, 100].map((n) => [String(n), `${n}%`]) },
  align: {
    label: 'Alignment',
    input: 'select',
    options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']],
  },
  spacing: {
    label: 'Spacing',
    input: 'select',
    options: [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']],
  },
  height: {
    label: 'Height',
    input: 'select',
    options: Object.keys(HERO_HEIGHTS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]),
  },
  overlay: { label: 'Image darkness', input: 'range', min: 0, max: 95, step: 5, suffix: '%' },
  variant: {
    label: 'Style',
    input: 'select',
    options: [['tiles', 'Photo tiles'], ['people', 'People (circular)'], ['text', 'Text cards']],
  },
  upcomingLabel: { label: '"Upcoming" section label', input: 'text' },
  pastLabel: { label: '"Past" section label', input: 'text' },
  date: { label: 'Date', input: 'date' },
  time: { label: 'Time', input: 'text' },
  location: { label: 'Location', input: 'text' },
};

// Hero Blocks alignment gets its own options 
// Everything else gets its fields from FIELD_CONFIG
function configFor(block, field) {
  if (field === 'align' && block.type === 'hero') {
    return {
      label: 'Text alignment',
      input: 'select',
      options: Object.keys(HERO_ALIGN).map((k) => [k, k[0].toUpperCase() + k.slice(1)]),
    };
  }
  return FIELD_CONFIG[field] ?? { label: field, input: 'text' };
}

// Create an HTML element with the given tag, attributes, and child nodes
// This will be displayed in the popup for admin to edit
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

// Create a row with label and a control (input, select, etc.) for the inspector popup
function row(labelText, control) {
  return el('label', { class: 'sac-field' }, [el('span', { class: 'sac-field__label', text: labelText }), control]);
}

// Text input field and an event listener for when the value changes
function textInput(value, onChange, { type = 'text', placeholder } = {}) {
  const input = el('input', { type, value: value ?? '', placeholder });
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

// Larger field for descriptions, same purpose as above
function textareaInput(value, onChange) {
  const textarea = el('textarea', { rows: 4, text: value ?? '' });
  textarea.addEventListener('change', () => onChange(textarea.value));
  return textarea;
}

// For select input fields
function selectInput(value, onChange, options) {
  const select = el('select');
  for (const [optValue, optLabel] of options) {
    select.append(el('option', { value: optValue, text: optLabel, selected: String(value) === String(optValue) }));
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

// For fields with range inputs
function rangeInput(value, onChange, { min, max, step, suffix }) {
  const wrap = el('div', { class: 'sac-range' });
  const input = el('input', { type: 'range', min, max, step, value: value ?? min });
  const readout = el('span', { class: 'sac-range__value', text: `${input.value}${suffix ?? ''}` });
  input.addEventListener('input', () => {
    readout.textContent = `${input.value}${suffix ?? ''}`;
  });
  input.addEventListener('change', () => onChange(Number(input.value)));
  wrap.append(input, readout);
  return wrap;
}

// For image picker
function imagePicker(value, onChange, { openLibrary, upload }) {
  const wrap = el('div', { class: 'sac-image-picker' });
  const preview = el('img', { class: 'sac-image-picker__preview', src: value || '', alt: '' });
  if (!value) preview.style.display = 'none';

  const chooseBtn = el('button', { type: 'button', class: 'sac-btn sac-btn--sm', text: 'Choose from library' });
  chooseBtn.addEventListener('click', async () => {
    const picked = await openLibrary();
    if (picked) {
      preview.src = picked;
      preview.style.display = '';
      onChange(picked);
    }
  });

  const fileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sac-visually-hidden' });
  const uploadBtn = el('button', { type: 'button', class: 'sac-btn sac-btn--sm', text: 'Upload new' });
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';
    try {
      const result = await upload(file);
      preview.src = result.blobUrl ?? result.path;
      preview.style.display = '';
      onChange(result.path);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload new';
      fileInput.value = '';
    }
  });

  wrap.append(preview, el('div', { class: 'sac-image-picker__actions' }, [chooseBtn, uploadBtn, fileInput]));
  return wrap;
}

// For color picker, text swatches gives the theme colors , one for custom too
function textColorPicker(value, onChange) {
  const wrap = el('div', { class: 'sac-swatches' });
  const current = value?.swatch ?? (value?.custom ? 'custom' : 'default');

  for (const [key, swatch] of Object.entries(TEXT_SWATCHES)) {
    const btn = el('button', {
      type: 'button',
      class: `sac-swatch sac-swatch--text${current === key ? ' is-active' : ''}`,
      style: `--sw-fg:${swatch.color || 'var(--admin-text)'}`,
      title: swatch.label,
      text: 'A',
    });
    btn.addEventListener('click', () => onChange({ swatch: key }));
    wrap.append(btn);
  }

  const customBtn = el('button', {
    type: 'button',
    class: `sac-swatch sac-swatch--custom${current === 'custom' ? ' is-active' : ''}`,
    title: 'Custom color',
    text: '+',
  });
  wrap.append(customBtn);

  const customRow = el('div', { class: 'sac-swatches__custom' });
  customRow.style.display = current === 'custom' ? '' : 'none';
  const colorInput = el('input', { type: 'color', value: HEX.test(value?.custom) ? value.custom : '#000000' });
  const applyCustom = () => onChange({ custom: colorInput.value });
  colorInput.addEventListener('change', applyCustom);
  customRow.append(colorInput);
  customBtn.addEventListener('click', () => {
    customRow.style.display = '';
    applyCustom();
  });

  wrap.append(customRow);
  return wrap;
}

// For bg color picker, same as above
function backgroundPicker(value, onChange) {
  const wrap = el('div', { class: 'sac-swatches' });
  const current = value?.swatch ?? (value?.custom ? 'custom' : 'paper');

  for (const [key, swatch] of Object.entries(BLOCK_SWATCHES)) {
    const btn = el('button', {
      type: 'button',
      class: `sac-swatch${current === key ? ' is-active' : ''}`,
      style: `--sw-bg:${swatch.bg};--sw-fg:${swatch.fg}`,
      title: swatch.label,
    });
    btn.addEventListener('click', () => onChange({ swatch: key }));
    wrap.append(btn);
  }
  
  // the button for custom color generation
  const customBtn = el('button', {
    type: 'button',
    class: `sac-swatch sac-swatch--custom${current === 'custom' ? ' is-active' : ''}`,
    title: 'Custom color',
    text: '+',
  });
  wrap.append(customBtn);

  // and the row for custom color button
  const customRow = el('div', { class: 'sac-swatches__custom' });
  customRow.style.display = current === 'custom' ? '' : 'none';

  // color picker 
  const colorInput = el('input', { type: 'color', value: HEX.test(value?.custom) ? value.custom : '#ffffff' });
  const applyCustom = () => {
    const hex = colorInput.value;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    onChange({ custom: hex, text: luminance > 0.6 ? 'dark' : 'light' });
  };
  // this will add custom color to the pallette
  colorInput.addEventListener('change', applyCustom);
  customRow.append(colorInput);

  // this will apply the custom color
  customBtn.addEventListener('click', () => {
    customRow.style.display = '';
    applyCustom();
  });

  wrap.append(customRow);
  return wrap;
}

// items editor deals with events, etc. which have multiple components in them
// useful in gallery, card, FAQ, even lists, all crud and reorder operations allowed
function itemsEditor(items, itemFields, onChange, imageHelpers) {
  const wrap = el('div', { class: 'sac-items' });

  // all items rendered based on el from above
  const renderItem = (item, index) => {
    const card = el('div', { class: 'sac-item' });
    const fields = el('div', { class: 'sac-item__fields' });

    for (const field of itemFields) {
      const cfg = FIELD_CONFIG[field] ?? { label: field, input: 'text' };
      const setField = (value) => {
        const next = items.map((it, i) => (i === index ? { ...it, [field]: value } : it));
        onChange(next);
      };
      fields.append(row(cfg.label, buildControl(cfg, item[field], setField, imageHelpers)));
    }

    // remove button to remove new things
    const removeBtn = el('button', { type: 'button', class: 'sac-btn sac-btn--sm sac-btn--danger', text: 'Remove' });
    removeBtn.addEventListener('click', () => onChange(items.filter((_, i) => i !== index)));

    // moves the item up
    const upBtn = el('button', { type: 'button', class: 'sac-btn sac-btn--sm', text: '↑', title: 'Move up' });
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      const next = [...items];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      onChange(next);
    });

    // moves the item down
    const downBtn = el('button', { type: 'button', class: 'sac-btn sac-btn--sm', text: '↓', title: 'Move down' });
    downBtn.disabled = index === items.length - 1;
    downBtn.addEventListener('click', () => {
      const next = [...items];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      onChange(next);
    });

    card.append(el('div', { class: 'sac-item__controls' }, [upBtn, downBtn, removeBtn]), fields);
    return card;
  };

  items.forEach((item, i) => wrap.append(renderItem(item, i)));

  const addBtn = el('button', { type: 'button', class: 'sac-btn', text: '+ Add item' });
  addBtn.addEventListener('click', () => onChange([...items, {}]));
  wrap.append(addBtn);

  return wrap;
}

function buttonEditor(value, onChange) {
  const wrap = el('div', { class: 'sac-button-editor' });
  const button = value ?? {};
  wrap.append(
    row('Label', textInput(button.label, (v) => onChange({ ...button, label: v }))),
    row('Link', textInput(button.href, (v) => onChange({ ...button, href: v }), { type: 'url' })),
  );
  return wrap;
}

// Build a control (input, select, etc.) based on its configuration
function buildControl(cfg, value, onChange, imageHelpers) {
  switch (cfg.input) {
    case 'textarea':
      return textareaInput(value, onChange);
    case 'select':
      return selectInput(value, onChange, cfg.options);
    case 'range':
      return rangeInput(value, onChange, cfg);
    case 'image':
      return imagePicker(value, onChange, imageHelpers);
    case 'background':
      return backgroundPicker(value, onChange);
    case 'textColor':
      return textColorPicker(value, onChange);
    case 'button':
      return buttonEditor(value, onChange);
    case 'url':
      return textInput(value, onChange, { type: 'url', placeholder: 'https://…' });
    case 'date':
      return textInput(value, onChange, { type: 'date' });
    default:
      return textInput(value, onChange);
  }
}

// All the field group customisations
const FIELD_GROUP = {
  image: 'image', imageAlt: 'image', width: 'image', align: 'image', spacing: 'image',
  background: 'bg', textColor: 'fg',
  items: 'items',
  upcoming: 'events', past: 'events',
  variant: 'more', height: 'more', overlay: 'more',
};

const GROUP_META = {
  text: { icon: '✎', label: 'Text' },
  image: { icon: '▨', label: 'Image' },
  items: { icon: '▤', label: 'Items' },
  events: { icon: '📅', label: 'Events' },
  bg: { icon: '◑', label: 'Background' },
  fg: { icon: 'A', label: 'Text colour' },
  more: { icon: '⚙', label: 'Options' },
};

const GROUP_ORDER = ['text', 'image', 'items', 'events', 'bg', 'fg', 'more'];

/** Toolbar groups for a block: [{ key, icon, label, fields }] - only groups that apply. */
export function blockToolGroups(block) {
  const schema = BLOCK_SCHEMA[block?.type];
  if (!schema) return [];

  const byGroup = {};
  for (const field of schema.fields) {
    const g = FIELD_GROUP[field] ?? 'text';
    (byGroup[g] ??= []).push(field);
  }

  return GROUP_ORDER.filter((g) => byGroup[g]?.length).map((g) => ({ key: g, ...GROUP_META[g], fields: byGroup[g] }));
}

/** Render a specific subset of a block's fields into `container` (one popover's worth). */
export function renderFields(container, block, fields, onFieldChange, imageHelpers) {
  container.replaceChildren();
  const schema = BLOCK_SCHEMA[block.type] ?? {};

  for (const field of fields) {
    const cfg = configFor(block, field);

    if (field === 'items') {
      container.append(row(cfg.label, itemsEditor(block.items ?? [], schema.itemFields ?? [], (v) => onFieldChange('items', v), imageHelpers)));
      continue;
    }
    if (field === 'upcoming' || field === 'past') {
      const itemFields = schema[cfg.itemsKey] ?? [];
      container.append(el('h4', { class: 'sac-fieldgroup__title', text: cfg.label }));
      container.append(itemsEditor(block[field] ?? [], itemFields, (v) => onFieldChange(field, v), imageHelpers));
      continue;
    }

    container.append(row(cfg.label, buildControl(cfg, block[field], (v) => onFieldChange(field, v), imageHelpers)));
  }
}

export { FONT_STACKS };
