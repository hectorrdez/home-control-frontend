'use strict';
// Electron main process: window on the panel URL, tray, autostart, remembered size.
// No preload and no Node exposure to the page (contextIsolation on, nodeIntegration off, sandbox on).

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const lib = require('./lib.cjs');

// HC_DATA_DIR isolates config/window state (used by the Playwright smoke test).
if (process.env.HC_DATA_DIR) app.setPath('userData', process.env.HC_DATA_DIR);

const dataDir = app.getPath('userData');
const configPath = path.join(dataDir, 'config.json');
const statePath = path.join(dataDir, 'window-state.json');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch (err) {
    console.error('could not write', file, err.message);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  const panelUrl = lib.resolvePanelUrl({
    argv: process.argv,
    env: process.env,
    fileConfig: readJson(configPath),
  });
  // Packaged: index.css ships as an extra resource (see package.json build.extraResources).
  const cssPath = app.isPackaged
    ? path.join(process.resourcesPath, 'index.css')
    : path.join(__dirname, '..', 'src', 'index.css');
  const tokens = lib.parseThemeTokens(fs.readFileSync(cssPath, 'utf8'));
  const offlineHtml = lib.buildOfflinePage({ tokens, panelUrl });
  const offlineUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(offlineHtml);

  let win = null;
  let tray = null;
  let quitting = false;

  function showWindow() {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function toggleWindow() {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else showWindow();
  }

  function createWindow() {
    const size = lib.clampWindowSize(readJson(statePath));
    win = new BrowserWindow({
      ...size,
      minWidth: lib.MIN_WIDTH,
      minHeight: lib.MIN_HEIGHT,
      title: 'Home Control',
      show: false,
      autoHideMenuBar: true,
      backgroundColor: tokens.background,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const saveSize = () => {
      const bounds = win.getNormalBounds();
      writeJson(statePath, { width: bounds.width, height: bounds.height });
    };
    let resizeTimer = null;
    win.on('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(saveSize, 400);
    });

    // Close hides to the tray; only the tray "Quit" item (or before-quit) really exits.
    win.on('close', (event) => {
      saveSize();
      if (!quitting) {
        event.preventDefault();
        win.hide();
      }
    });
    win.once('ready-to-show', () => win.show());

    const wc = win.webContents;
    // Links to other sites open in the system browser; the window never navigates away from the panel.
    wc.setWindowOpenHandler(({ url }) => {
      if (lib.shouldOpenExternally(url, panelUrl)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (lib.isPanelUrl(url, panelUrl)) return;
      event.preventDefault();
      if (lib.shouldOpenExternally(url, panelUrl)) shell.openExternal(url);
    });
    wc.on('did-fail-load', (_event, errorCode, _desc, failedUrl, isMainFrame) => {
      // -3 = ERR_ABORTED (navigation superseded); never loop on our own offline page.
      if (!isMainFrame || errorCode === -3 || failedUrl.startsWith('data:')) return;
      win.loadURL(offlineUrl).catch(() => {});
    });

    win.loadURL(panelUrl).catch(() => {});
  }

  function setAutostart(openAtLogin) {
    app.setLoginItemSettings({ openAtLogin });
  }

  function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
    tray.setToolTip('Home Control');
    tray.on('click', toggleWindow);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show / hide', click: toggleWindow },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          enabled: app.isPackaged,
          click: (item) => setAutostart(item.checked),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  }

  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', () => {
    quitting = true;
  });
  // Tray keeps the app alive when the window is hidden.
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}
