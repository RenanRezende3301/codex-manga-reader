const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');

// IPC Handlers
const { registerSourceHandlers, getLoadedSources } = require('./ipc/sources');
const { registerDatabaseHandlers } = require('./ipc/database');
const { registerDownloadHandlers } = require('./ipc/downloads');
const { registerUpdateHandlers } = require('./ipc/updates');
const { registerAnilistHandlers } = require('./ipc/anilist');

// Database
const { initDatabase, closeDatabase } = require('./database/init');

// Update Checker
const { initUpdateChecker, stopUpdateChecker } = require('./updates/checker');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Register codex-local as a privileged scheme (must be done before app.ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'codex-local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0a0a12',
    icon: path.join(__dirname, '../public/codex-icon.png'),
  });

  // Load the app
  const isPackaged = app.isPackaged || __dirname.includes('app.asar');
  const isDev = !isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return mainWindow;
};

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Register custom protocol for serving local downloaded images
  // Handles URLs like: codex-local:///absolute/path/to/image.jpg
  protocol.handle('codex-local', (request) => {
    let filePath = request.url.replace(/^codex-local:\/\//i, '');

    // Chromium URL normalization might strip the third slash (e.g. codex-local://home/...)
    // We need to ensure Linux/Mac absolute paths start with a slash.
    // For Windows, paths like C:/... shouldn't start with a slash, but macOS/Linux paths like home/... must be /home/...
    if (!filePath.startsWith('/') && !/^[A-Za-z]:\//.test(filePath)) {
      filePath = '/' + filePath;
    }

    filePath = decodeURIComponent(filePath);
    const { pathToFileURL } = require('url');
    const fileUrl = pathToFileURL(filePath).toString();
    return net.fetch(fileUrl);
  });

  // Initialize database
  console.log('[App] Initializing database...');
  initDatabase();

  // Register IPC handlers
  registerSourceHandlers();
  registerDatabaseHandlers();
  registerUpdateHandlers();
  registerAnilistHandlers();

  // Create window first, then register download handlers with window reference and source plugins
  const window = createWindow();
  registerDownloadHandlers(window, getLoadedSources());

  // Initialize update checker for new chapters
  initUpdateChecker();

  // On macOS, re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = createWindow();
      registerDownloadHandlers(window, getLoadedSources());
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up on app quit
app.on('will-quit', () => {
  console.log('[App] Cleaning up...');
  stopUpdateChecker();
  closeDatabase();
});
