export interface ElectronAPI {
  isDesktop: boolean;
  getAppVersion: () => Promise<string>;
  getApiBaseUrl: () => Promise<string>;
  getDesktopSecret: () => Promise<string>;
  setup: {
    getConfig: () => Promise<{ DATABASE_URL?: string }>;
    testDb: (dbUrl: string) => Promise<{ success: boolean; error?: string }>;
    saveConfig: (config: { DATABASE_URL: string }) => Promise<{ success: boolean; error?: string }>;
  };
  safeStorage: {
    isAvailable: () => Promise<boolean>;
    encrypt: (plainText: string) => Promise<string | null>;
    decrypt: (encryptedBase64: string) => Promise<string | null>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
