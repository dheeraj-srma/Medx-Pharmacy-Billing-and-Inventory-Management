const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-base-url'),
  getDesktopSecret: () => ipcRenderer.invoke('desktop:get-desktop-secret'),
  setup: {
    getConfig: () => ipcRenderer.invoke('setup:get-config'),
    testDb: (dbUrl) => ipcRenderer.invoke('setup:test-db', dbUrl),
    saveConfig: (config) => ipcRenderer.invoke('setup:save-config', config),
  },
  safeStorage: {
    isAvailable: () => ipcRenderer.invoke('safe-storage:is-available'),
    encrypt: (plainText) => ipcRenderer.invoke('safe-storage:encrypt', plainText),
    decrypt: (encryptedBase64) => ipcRenderer.invoke('safe-storage:decrypt', encryptedBase64),
  }
});
