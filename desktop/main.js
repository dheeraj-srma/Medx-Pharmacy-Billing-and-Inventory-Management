const { app, BrowserWindow, protocol, net, shell, ipcMain, safeStorage, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const netModule = require('net');
const { spawn, execSync, exec } = require('child_process');

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
const logsDir = path.join(userDataDir, 'logs');
const backendLogPath = path.join(logsDir, 'backend.log');
const uploadsDir = path.join(userDataDir, 'uploads');

let backendLogStream = null;
let recentBackendErrors = [];

function ensureDirectories() {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

/**
 * Sanitizes log output so database passwords, connection strings,
 * and secret keys are never written to disk or console.
 */
function sanitizeLogText(text) {
  if (!text) return '';
  return String(text)
    // Redact PostgreSQL credentials in URIs: postgresql://user:password@host:port/db
    .replace(/([a-zA-Z0-9_+.-]+:\/\/[^:\s]+:)([^@\s]+)(@[^\s]+)/g, '$1***$3')
    // Redact DATABASE_URL, SECRET_KEY, passwords, and tokens in key=val or JSON
    .replace(/(DATABASE_URL\s*[:=]\s*["']?)([^"'\r\n\s]+)(["']?)/gi, '$1***$3')
    .replace(/(SECRET_KEY\s*[:=]\s*["']?)([^"'\r\n\s]+)(["']?)/gi, '$1***$3')
    .replace(/(password\s*[:=]\s*["']?)([^"'\r\n\s,]+)(["']?)/gi, '$1***$3')
    .replace(/(token\s*[:=]\s*["']?)([^"'\r\n\s,]+)(["']?)/gi, '$1***$3');
}

function writeBackendLog(message) {
  try {
    ensureDirectories();
    const sanitized = sanitizeLogText(message);
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${sanitized}\n`;

    if (!backendLogStream) {
      backendLogStream = fs.createWriteStream(backendLogPath, { flags: 'a', encoding: 'utf8' });
    }
    backendLogStream.write(formatted);
  } catch (err) {
    console.error('Failed to write to backend.log:', err);
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
function checkBackendHealth(port, maxRetries = 35, interval = 400, isExited = () => false) {
  return new Promise((resolve) => {
    let attempts = 0;
    const intervalId = setInterval(() => {
      if (isExited()) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(intervalId);
          resolve(true);
        }
      });
      req.on('error', () => {
        if (attempts >= maxRetries || isExited()) {
          clearInterval(intervalId);
          resolve(false);
        }
      });
      req.setTimeout(350, () => {
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

function getPythonExecutable() {
  const venvPython = path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  const rootVenvPython = path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(rootVenvPython)) {
    return rootVenvPython;
  }
  return 'python';
}

function startBackendServer() {
  return new Promise(async (resolve) => {
    killBackend();
    recentBackendErrors = [];

    backendPort = await getAvailablePort(8000);
    const exePath = getBackendExecutablePath();

    writeBackendLog(`\n=======================================================`);
    writeBackendLog(`Starting MedX Pharmacy Backend on 127.0.0.1:${backendPort}`);
    writeBackendLog(`Target binary / script: ${exePath || 'python backend/server.py'}`);
    writeBackendLog(`Config file: ${configFilePath}`);
    writeBackendLog(`User data directory: ${userDataDir}`);
    writeBackendLog(`=======================================================`);

    const args = [
      '--port', String(backendPort),
      '--host', '127.0.0.1',
      '--config-file', configFilePath,
      '--user-data-dir', userDataDir,
      '--desktop-secret', desktopSecret
    ];

    let backendExitedEarly = false;
    let exitDetails = null;

    const spawnOptions = {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MEDX_CONFIG_FILE: configFilePath,
        MEDX_UPLOAD_DIR: uploadsDir,
        MEDX_DESKTOP_SECRET: desktopSecret,
      }
    };

    console.log(`Starting MedX backend on 127.0.0.1:${backendPort}...`);

    if (exePath && fs.existsSync(exePath)) {
      writeBackendLog(`Launching compiled executable: ${exePath}`);
      backendProcess = spawn(exePath, args, spawnOptions);
    } else {
      // Development fallback: run with python virtual environment
      const pythonExe = getPythonExecutable();
      const pythonScript = path.join(__dirname, '..', 'backend', 'server.py');
      writeBackendLog(`Launching development server via ${pythonExe}: ${pythonScript}`);
      backendProcess = spawn(pythonExe, [pythonScript, ...args], spawnOptions);
    }

    backendProcess.stdout.on('data', (data) => {
      const text = data.toString();
      writeBackendLog(`[STDOUT] ${text.trim()}`);
      console.log(`[Backend stdout]: ${sanitizeLogText(text.trim())}`);
    });

    backendProcess.stderr.on('data', (data) => {
      const text = data.toString();
      const sanitized = sanitizeLogText(text.trim());
      writeBackendLog(`[STDERR] ${sanitized}`);
      console.error(`[Backend stderr]: ${sanitized}`);
      recentBackendErrors.push(sanitized);
      if (recentBackendErrors.length > 30) {
        recentBackendErrors.shift();
      }
    });

    backendProcess.on('error', (err) => {
      writeBackendLog(`[SPAWN ERROR] ${err.message}`);
      console.error(`Backend process spawn error:`, err);
      backendExitedEarly = true;
      exitDetails = err.message;
    });

    backendProcess.on('exit', (code, signal) => {
      const msg = `Backend process exited with code ${code}, signal ${signal}`;
      writeBackendLog(`[EXIT] ${msg}`);
      console.log(msg);
      backendExitedEarly = true;
      exitDetails = msg;
      backendProcess = null;
    });

    // Wait for health endpoint
    const isHealthy = await checkBackendHealth(backendPort, 35, 400, () => backendExitedEarly);
    if (isHealthy) {
      writeBackendLog(`Backend health check PASSED on port ${backendPort}. Ready for connections.`);
      console.log(`Backend is ready on port ${backendPort}`);
      resolve({ success: true, port: backendPort });
    } else {
      const errorSummary = exitDetails || (recentBackendErrors.length > 0 ? recentBackendErrors.slice(-3).join('\n') : 'Backend failed to respond on health check endpoint.');
      writeBackendLog(`Backend health check FAILED: ${errorSummary}`);
      console.error('Backend failed to respond on health check.');
      resolve({ success: false, error: errorSummary });
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
    `CORS_ORIGINS=["http://127.0.0.1:${backendPort}","http://localhost:3000","app://bundle"]`,
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

  // Start backend and await health response
  const result = await startBackendServer();
  if (result.success) {
    if (process.env.ELECTRON_DEV === 'true') {
      mainWindow.loadURL('http://localhost:3000');
    } else {
      mainWindow.loadURL('app://bundle/index.html');
    }
  } else {
    // Show helpful diagnostic dialog rather than broken screen
    const errorDetails = result.error || 'The backend process terminated unexpectedly or failed the health check.';
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: 'MedX Pharmacy - Backend Startup Failure',
      message: 'Unable to start the MedX local backend service.',
      detail: `The desktop application failed to start the local backend service or connect to the database.\n\n` +
        `Error details:\n${errorDetails}\n\n` +
        `Logs saved at:\n${backendLogPath}\n\n` +
        `Would you like to verify your database connection string in the setup wizard?`,
      buttons: ['Open Setup Wizard', 'Open Log File', 'Exit Application'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    });

    if (choice === 0) {
      mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    } else if (choice === 1) {
      try {
        shell.openPath(backendLogPath);
      } catch (e) {}
      mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    } else {
      app.quit();
    }
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
          "img-src 'self' app: file: data: blob: http://127.0.0.1:* http://localhost:* https://* http://*; " +
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

  ipcMain.handle('desktop:open-log-file', () => {
    try {
      shell.openPath(backendLogPath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
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

    const pythonExe = getPythonExecutable();

    return new Promise((resolve) => {
      const pyCode = `from sqlalchemy import create_engine, text; engine = create_engine('${normalizedUrl.replace(/'/g, "\\'")}', pool_pre_ping=True); conn = engine.connect(); conn.execute(text('SELECT 1')); conn.close(); print('OK')`;
      exec(`"${pythonExe}" -c "${pyCode}"`, { timeout: 15000 }, (error, stdout, stderr) => {
        if (!error && stdout.includes('OK')) {
          resolve({ success: true });
        } else {
          const sanitizedErr = sanitizeLogText(error ? error.message : (stderr || 'Connection test failed.'));
          resolve({ success: false, error: sanitizedErr });
        }
      });
    });
  });

  ipcMain.handle('setup:save-config', async (_, config) => {
    try {
      writeConfigFile(config);
      const result = await startBackendServer();
      if (result.success) {
        if (process.env.ELECTRON_DEV === 'true') {
          mainWindow.loadURL('http://localhost:3000');
        } else {
          mainWindow.loadURL('app://bundle/index.html');
        }
        return { success: true };
      } else {
        return { 
          success: false, 
          error: `Backend failed to start: ${result.error || 'Health check timed out'}. See logs at: ${backendLogPath}` 
        };
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
