// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lib from './lib.cjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const css = fs.readFileSync(path.join(here, '..', 'src', 'index.css'), 'utf8');
const tokens = lib.parseThemeTokens(css);

describe('resolvePanelUrl', () => {
  it('defaults to the production panel', () => {
    expect(lib.resolvePanelUrl({})).toBe(lib.DEFAULT_PANEL_URL);
  });

  it('uses the config file when valid', () => {
    expect(lib.resolvePanelUrl({ fileConfig: { panelUrl: 'http://panel.lan:8080' } })).toBe('http://panel.lan:8080');
  });

  it('ignores invalid config values', () => {
    expect(lib.resolvePanelUrl({ fileConfig: { panelUrl: 'javascript:alert(1)' } })).toBe(lib.DEFAULT_PANEL_URL);
  });

  it('--dev selects the Vite dev server', () => {
    expect(lib.resolvePanelUrl({ argv: ['electron', '.', '--dev'] })).toBe(lib.DEV_PANEL_URL);
  });

  it('env override wins over --dev and config', () => {
    const url = lib.resolvePanelUrl({
      argv: ['--dev'],
      env: { HC_PANEL_URL: 'https://other.example' },
      fileConfig: { panelUrl: 'http://x.lan' },
    });
    expect(url).toBe('https://other.example');
  });

  it('ignores a non-http env value', () => {
    expect(lib.resolvePanelUrl({ env: { HC_PANEL_URL: 'not a url' } })).toBe(lib.DEFAULT_PANEL_URL);
  });
});

describe('clampWindowSize', () => {
  it('keeps sizes above the minimum', () => {
    expect(lib.clampWindowSize({ width: 1600, height: 900 })).toEqual({ width: 1600, height: 900 });
  });

  it('raises sizes below the minimum to 1024x700', () => {
    expect(lib.clampWindowSize({ width: 300, height: 200 })).toEqual({ width: 1024, height: 700 });
  });

  it('uses the default size for missing or invalid values', () => {
    expect(lib.clampWindowSize({})).toEqual({ width: 1280, height: 800 });
    expect(lib.clampWindowSize({ width: 'big', height: NaN })).toEqual({ width: 1280, height: 800 });
  });

  it('rounds fractional sizes', () => {
    expect(lib.clampWindowSize({ width: 1100.6, height: 800.4 })).toEqual({ width: 1101, height: 800 });
  });
});

describe('navigation policy', () => {
  const panel = 'https://home-control.hectorrdez.es/';

  it('allows the panel origin inside the window', () => {
    expect(lib.isPanelUrl('https://home-control.hectorrdez.es/telemetry', panel)).toBe(true);
  });

  it('sends other http(s) links to the system browser', () => {
    expect(lib.shouldOpenExternally('https://example.com/a', panel)).toBe(true);
    expect(lib.isPanelUrl('https://example.com/a', panel)).toBe(false);
  });

  it('does not open panel-origin links externally', () => {
    expect(lib.shouldOpenExternally('https://home-control.hectorrdez.es/x', panel)).toBe(false);
  });

  it('drops non-http schemes', () => {
    expect(lib.shouldOpenExternally('file:///etc/passwd', panel)).toBe(false);
    expect(lib.shouldOpenExternally('javascript:alert(1)', panel)).toBe(false);
  });

  it('treats malformed URLs as not the panel', () => {
    expect(lib.isPanelUrl('::bad::', panel)).toBe(false);
    expect(lib.isPanelUrl('https://example.com', '::bad::')).toBe(false);
  });
});

describe('parseThemeTokens', () => {
  it('extracts color tokens from the @theme block', () => {
    const parsed = lib.parseThemeTokens('@theme { --color-background: #0f131d; --color-error: #ffb4ab; --font-sans: x; }');
    expect(parsed).toEqual({ background: '#0f131d', error: '#ffb4ab' });
  });

  it('reads every required token from src/index.css', () => {
    for (const name of ['background', 'surface-container', 'on-surface', 'on-surface-variant', 'outline-variant', 'error', 'primary-container']) {
      expect(tokens[name], name).toBeTruthy();
    }
  });
});

describe('buildOfflinePage', () => {
  it('inlines token values as CSS variables and escapes the panel URL in text', () => {
    const html = lib.buildOfflinePage({ tokens, panelUrl: 'https://h.example/?a=<b>' });
    expect(html).toContain(`--color-background: ${tokens.background};`);
    expect(html).toContain('Panel unreachable');
    expect(html).toContain('https://h.example/?a=&lt;b&gt;');
    expect(html).not.toContain('?a=<b>');
    expect(html).toContain('id="retry"');
  });

  it('embeds the retry target as a safe JS string', () => {
    const html = lib.buildOfflinePage({ tokens, panelUrl: 'https://h.example/</script>' });
    expect(html).toContain('location.href = "https://h.example/\\u003c/script>"');
  });

  it('fails loudly when a required token is missing', () => {
    expect(() => lib.buildOfflinePage({ tokens: {}, panelUrl: 'https://x' })).toThrow(/missing in src\/index.css/);
  });
});
