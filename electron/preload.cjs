'use strict';
// Electron preload (feature 145): the panel gets one call, to raise the hidden window. Nothing else from Node.
// Sandboxed preloads may only require 'electron', so the channel name repeats lib.cjs SHOW_WINDOW_CHANNEL.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('homeControl', {
  showWindow: () => ipcRenderer.send('hc:show-window'),
});
