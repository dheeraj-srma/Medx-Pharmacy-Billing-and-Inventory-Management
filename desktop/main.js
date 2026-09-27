const { app, BrowserWindow, protocol, net, shell, ipcMain, safeStorage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const netModule = require('net');
const { spawn, execSync, exec } = require('child_process');
const { pathToFileURL } = require('url');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// 1. Register custom 'app' scheme
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow = null;
let backendProcess = null;
let backendPort = 8000;
const desktopSecret = crypto.randomBytes(32).toString('hex');

// Application paths
const userDataDir = path.join(app.getPath('appData'), 'MedX Pharmacy');
const configFilePath = path.join(userDataDir, 'config.env');
const uploadsDir = path.join(userDataDir, 'uploads');

function ensureDirectories() {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

// Find an available port on loopback (127.0.0.1)
function getAvailablePort(startPort = 8000) {
  return new Promise((resolve) => {
    const server = netModule.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
}

// Check backend health endpoint
function checkBackendHealth(port, maxRetries = 30, interval = 500) {
  return new Promise((resolve) => {
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(intervalId);
          resolve(true);
        }
      });
      req.on('error', () => {
        if (attempts >= maxRetries) {
          clearInterval(intervalId);
          resolve(false);
        }
      });
      req.setTimeout(400, () => {
        req.destroy();
      });
    }, interval);
  });
}

function getBackendExecutablePath() {
  // Check packaged resources directory first
  const packagedPath = path.join(process.resourcesPath, 'medx-backend.exe');
  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }
  // Check backend/dist built executable
  const localDistPath = path.join(__dirname, '..', 'backend', 'dist', 'medx-backend.exe');
  if (fs.existsSync(localDistPath)) {
    return localDistPath;
  }
  return null;
}

function startBackendServer() {
  return new Promise(async (resolve, reject) => {
    killBackend();

    backendPort = await getAvailablePort(8000);
    const exePath = getBackendExecutablePath();

    const args = [
      '--port', String(backendPort),
      '--host', '127.0.0.1',
      '--config-file', configFilePath,
      '--user-data-dir', userDataDir,
      '--desktop-secret', desktopSecret
    ];

    console.log(`Starting MedX backend on 127.0.0.1:${backendPort}...`);

    if (exePath && fs.existsSync(exePath)) {
      backendProcess = spawn(exePath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      // Development fallback: run with python
      const pythonScript = path.join(__dirname, '..', 'backend', 'server.py');
      backendProcess = spawn('python', [pythonScript, ...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend stdout]: ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend stderr]: ${data.toString().trim()}`);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend process exited with code ${code}, signal ${signal}`);
      backendProcess = null;
    });

    const isHealthy = await checkBackendHealth(backendPort, 30, 500);
    if (isHealthy) {
      console.log(`Backend is ready on port ${backendPort}`);
      resolve(true);
    } else {
      console.error('Backend failed to respond on health check.');
      resolve(false);
    }
  });
}

function killBackend() {
  if (backendProcess && backendProcess.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch {
      // Process already terminated
    }
    backendProcess = null;
  }
}

function parseConfigFile() {
  if (!fs.existsSync(configFilePath)) return {};
  try {
    const content = fs.readFileSync(configFilePath, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          config[key] = val;
        }
      }
    });
    return config;
  } catch {
    return {};
  }
}

function writeConfigFile(config) {
  ensureDirectories();
  const secretKey = config.SECRET_KEY || crypto.randomBytes(32).toString('hex');
  const envContent = [
    `# MedX Pharmacy Desktop Configuration`,
    `ENVIRONMENT=production`,
    `DATABASE_URL="${config.DATABASE_URL || ''}"`,
    `SECRET_KEY="${secretKey}"`,
    `ALGORITHM=HS256`,
    `ACCESS_TOKEN_EXPIRE_MINUTES=120`,
    `CORS_ORIGINS=["http://127.0.0.1:${backendPort}","app://bundle"]`,
    ''
  ].join('\n');

  fs.writeFileSync(configFilePath, envContent, { mode: 0o600 });
}

function getAppIconPath() {
  const possiblePaths = [
    path.join(process.resourcesPath, 'appicon.ico'),
    path.join(process.resourcesPath, 'appicon.png'),
    path.join(__dirname, '..', 'frontend', 'public', 'appicon.ico'),
    path.join(__dirname, '..', 'frontend', 'public', 'appicon.png'),
    path.join(__dirname, '..', 'frontend', 'dist', 'appicon.png'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MedX Pharmacy',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  if (app.isPackaged) {
    mainWindow.removeMenu();
  }

  // Security: External links open in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.protocol !== 'app:' && parsedUrl.protocol !== 'file:') {
        event.preventDefault();
        if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
          if (!navigationUrl.startsWith('http://localhost') && !navigationUrl.startsWith('http://127.0.0.1')) {
            shell.openExternal(navigationUrl);
          }
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Load Failed]: ${errorCode} - ${errorDescription} (${validatedURL})`);
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log(`[Renderer DOM Ready]: ${mainWindow.webContents.getURL()}`);
    setTimeout(() => {
      mainWindow.webContents.executeJavaScript(`({
        rootChildren: document.getElementById('root')?.childElementCount,
        bodyText: document.body.innerText.substring(0, 100),
        title: document.title,
        url: window.location.href
      })`).then((info) => {
        console.log('[Renderer Mounted State]:', JSON.stringify(info));
      }).catch(err => {
        console.error('[Renderer Check Error]:', err);
      });
    }, 500);
  });

  loadAppOrSetup();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function loadAppOrSetup() {
  ensureDirectories();
  const config = parseConfigFile();

  if (!config.DATABASE_URL) {
    // Open Setup wizard
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    return;
  }

  // Start backend
  const ready = await startBackendServer();
  if (ready) {
    if (process.env.ELECTRON_DEV === 'true') {
      mainWindow.loadURL('http://localhost:3000');
    } else {
      mainWindow.loadURL('app://bundle/index.html');
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
  }
}

// 2. App Lifecycle & Protocols Setup
app.whenReady().then(() => {
  ensureDirectories();
  const distDir = path.join(__dirname, '..', 'frontend', 'dist');

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };

  // Handle 'app://' protocol to serve frontend static files with SPA fallback
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/')) pathname = pathname.slice(1);

      if (!pathname || pathname === '/') {
        pathname = 'index.html';
      }

      const targetPath = path.join(distDir, pathname);

      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        const ext = path.extname(targetPath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const data = fs.readFileSync(targetPath);
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': contentType }
        });
      }

      const indexPath = path.join(distDir, 'index.html');
      const data = fs.readFileSync(indexPath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (err) {
      console.error('Error in app protocol handler:', err);
      const indexPath = path.join(distDir, 'index.html');
      try {
        const data = fs.readFileSync(indexPath);
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      } catch (e) {
        return new Response('File not found', { status: 404 });
      }
    }
  });

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' app: file:; " +
          "script-src 'self' app: file: 'unsafe-inline' 'wasm-unsafe-eval'; " +
          "style-src 'self' app: file: 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' app: file: https://fonts.gstatic.com data:; " +
          "img-src 'self' app: file: data: blob: http://127.0.0.1:* https://* http://*; " +
          "connect-src 'self' app: file: http://127.0.0.1:* http://localhost:* https://*; " +
          "object-src 'none'; " +
          "base-uri 'self' app:; " +
          "frame-ancestors 'none';"
        ],
      },
    });
  });

  // IPC Handlers
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('desktop:get-api-base-url', () => {
    return `http://127.0.0.1:${backendPort}/api/v1`;
  });

  ipcMain.handle('desktop:get-desktop-secret', () => {
    return desktopSecret;
  });

  ipcMain.handle('setup:get-config', () => {
    return parseConfigFile();
  });

  ipcMain.handle('setup:test-db', async (_, dbUrl) => {
    if (!dbUrl || typeof dbUrl !== 'string') {
      return { success: false, error: 'Database URL is empty.' };
    }
    const normalizedUrl = dbUrl.trim()
      .replace(/^postgres:\/\//, 'postgresql+psycopg2://')
      .replace(/^postgresql:\/\//, 'postgresql+psycopg2://');

    // Perform test using Python check
    return new Promise((resolve) => {
      const pyCode = `from sqlalchemy import create_engine, text; engine = create_engine('${normalizedUrl.replace(/'/g, "\\'")}', pool_pre_ping=True); conn = engine.connect(); conn.execute(text('SELECT 1')); conn.close(); print('OK')`;
      exec(`python -c "${pyCode}"`, { timeout: 15000 }, (error, stdout) => {
        if (!error && stdout.includes('OK')) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: error ? error.message : 'Connection test failed.' });
        }
      });
    });
  });

  ipcMain.handle('setup:save-config', async (_, config) => {
    try {
      writeConfigFile(config);
      const ready = await startBackendServer();
      if (ready) {
        if (process.env.ELECTRON_DEV === 'true') {
          mainWindow.loadURL('http://localhost:3000');
        } else {
          mainWindow.loadURL('app://bundle/index.html');
        }
        return { success: true };
      } else {
        return { success: false, error: 'Backend failed to start with the provided credentials. Please verify your connection string.' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('safe-storage:is-available', () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('safe-storage:encrypt', (_, plainText) => {
    if (!plainText || typeof plainText !== 'string') return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.encryptString(plainText).toString('base64');
    } catch {
      return null;
    }
  });

  ipcMain.handle('safe-storage:decrypt', (_, encryptedBase64) => {
    if (!encryptedBase64 || typeof encryptedBase64 !== 'string') return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  killBackend();
});

app.on('will-quit', () => {
  killBackend();
});

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
