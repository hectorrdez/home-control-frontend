'use strict';
// Pure main-process helpers (no Electron import) so they can be unit-tested with vitest.

const DEFAULT_PANEL_URL = 'https://home-control.hectorrdez.es';
const DEV_PANEL_URL = 'http://localhost:5173';
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 700;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
// Tokens the offline page needs; read from src/index.css @theme (feature 109).
const REQUIRED_TOKENS = [
  'background',
  'surface-container',
  'on-surface',
  'on-surface-variant',
  'outline-variant',
  'error',
  'primary-container',
];

function isHttpUrl(value) {
  if (typeof value !== 'string' || value === '') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Precedence: HC_PANEL_URL env > --dev flag > config file > built-in default.
function resolvePanelUrl({ argv = [], env = {}, fileConfig = {} } = {}) {
  if (isHttpUrl(env.HC_PANEL_URL)) return env.HC_PANEL_URL;
  if (argv.includes('--dev')) return DEV_PANEL_URL;
  if (isHttpUrl(fileConfig.panelUrl)) return fileConfig.panelUrl;
  return DEFAULT_PANEL_URL;
}

function clampWindowSize(size = {}) {
  const width = Number.isFinite(size.width) ? Math.round(size.width) : DEFAULT_WIDTH;
  const height = Number.isFinite(size.height) ? Math.round(size.height) : DEFAULT_HEIGHT;
  return { width: Math.max(MIN_WIDTH, width), height: Math.max(MIN_HEIGHT, height) };
}

// Only the panel origin may load inside the app window.
function isPanelUrl(target, panelUrl) {
  const origin = originOf(target);
  return origin !== null && origin === originOf(panelUrl);
}

// Other http(s) links leave the app and open in the system browser; other schemes are dropped.
function shouldOpenExternally(target, panelUrl) {
  return isHttpUrl(target) && !isPanelUrl(target, panelUrl);
}

// Parses `--color-<name>: <value>;` declarations (src/index.css @theme) into { name: value }.
function parseThemeTokens(css) {
  const tokens = {};
  const pattern = /--color-([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = pattern.exec(String(css))) !== null) {
    tokens[match[1].toLowerCase()] = match[2].trim();
  }
  return tokens;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Offline/unreachable page (Tailscale down). Colors come from the parsed tokens, never hand-copied.
function buildOfflinePage({ tokens, panelUrl }) {
  const missing = REQUIRED_TOKENS.filter((name) => !tokens[name]);
  if (missing.length > 0) {
    throw new Error(`theme tokens missing in src/index.css: ${missing.join(', ')}`);
  }
  const vars = REQUIRED_TOKENS.map((name) => `--color-${name}: ${tokens[name]};`).join('\n      ');
  const target = JSON.stringify(panelUrl).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Home Control</title>
  <style>
    :root {
      ${vars}
    }
    html, body { margin: 0; height: 100%; background: var(--color-background); color: var(--color-on-surface); }
    body { font-family: "Space Grotesk", system-ui, sans-serif; display: grid; place-items: center; }
    main { max-width: 28rem; padding: 2rem; border: 1px solid var(--color-outline-variant); border-radius: 4px; background: var(--color-surface-container); }
    .label { font-family: "JetBrains Mono", ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: var(--color-error); }
    h1 { font-size: 1.5rem; font-weight: 500; margin: 0.5rem 0 1rem; }
    p { color: var(--color-on-surface-variant); line-height: 1.5; word-break: break-all; }
    button { min-height: 44px; min-width: 44px; padding: 0 1.25rem; border-radius: 4px; border: 1px solid var(--color-primary-container); background: transparent; color: var(--color-primary-container); font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--color-primary-container); outline-offset: 2px; }
  </style>
</head>
<body>
  <main>
    <div class="label">Connection lost</div>
    <h1>Panel unreachable</h1>
    <p>${escapeHtml(panelUrl)}</p>
    <p>Check that Tailscale is connected, then retry.</p>
    <button id="retry" type="button">Retry</button>
  </main>
  <script>
    document.getElementById('retry').addEventListener('click', function () {
      location.href = ${target};
    });
  </script>
</body>
</html>`;
}

// Feature 145: the preload exposes one call (window.homeControl.showWindow) that sends this channel.
// The preload cannot require this file (sandboxed preloads load only electron), so it repeats the string.
const SHOW_WINDOW_CHANNEL = "hc:show-window";

// Restores and raises the app window (hidden in the tray or minimised). Returns the handler for IPC and tray use.
function createShowWindow(getWindow) {
  return function showWindow() {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };
}

module.exports = {
  DEFAULT_PANEL_URL,
  SHOW_WINDOW_CHANNEL,
  createShowWindow,
  DEV_PANEL_URL,
  MIN_WIDTH,
  MIN_HEIGHT,
  isHttpUrl,
  resolvePanelUrl,
  clampWindowSize,
  isPanelUrl,
  shouldOpenExternally,
  parseThemeTokens,
  buildOfflinePage,
};
