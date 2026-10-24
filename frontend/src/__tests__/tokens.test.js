import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');

function readTokens(selector) {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n  }', start);
  const block = css.slice(start, end);
  return Object.fromEntries(
    [...block.matchAll(/--c-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)].map(([, name, r, g, b]) => [
      name,
      [Number(r), Number(g), Number(b)],
    ]),
  );
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = { light: readTokens(':root'), dark: readTokens('.dark') };
const TONES = ['success', 'warning', 'danger', 'info', 'neutral', 'brand'];

describe.each(Object.entries(THEMES))('design tokens (%s)', (_name, t) => {
  it('defines the same token names in light and dark', () => {
    expect(Object.keys(t).sort()).toEqual(Object.keys(THEMES.light).sort());
  });

  it.each(['fg', 'fg-muted', 'fg-subtle'])('text token %s reaches AA (4.5:1) on every surface', (fg) => {
    for (const surface of ['canvas', 'surface', 'surface-muted']) {
      expect(contrast(t[fg], t[surface]), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent text reaches AA on surfaces and on its soft background', () => {
    expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.accent, t['accent-soft'])).toBeGreaterThanOrEqual(4.5);
  });

  it('primary button label is readable, including on hover', () => {
    expect(contrast(t['primary-fg'], t.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['primary-fg'], t['primary-hover'])).toBeGreaterThanOrEqual(4.5);
  });

  it('input borders and focus ring reach 3:1 against the surface (WCAG 1.4.11)', () => {
    expect(contrast(t['line-input'], t.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.focus, t.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.focus, t.canvas)).toBeGreaterThanOrEqual(3);
  });

  it('sidebar text and indicator are readable on every sidebar state', () => {
    for (const state of ['sidebar', 'sidebar-hover', 'sidebar-active']) {
      expect(contrast(t['sidebar-fg'], t[state]), `fg on ${state}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['sidebar-muted'], t[state]), `muted on ${state}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['sidebar-accent'], t[state]), `accent on ${state}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(['chart-success', 'chart-danger', 'chart-warning', 'chart-neutral'])('%s is visible on cards (3:1 for graphics)', (name) => {
    expect(contrast(t[name], t.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(t[name], t.canvas)).toBeGreaterThanOrEqual(3);
  });

  it.each(TONES)('tone %s text reaches AA on its own background', (tone) => {
    expect(contrast(t[`tone-${tone}-fg`], t[`tone-${tone}-bg`])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TONES)('tone %s text stays readable when its badge sits on a card', (tone) => {
    expect(contrast(t[`tone-${tone}-fg`], t.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
