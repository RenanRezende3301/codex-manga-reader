const { ipcMain, BrowserWindow } = require('electron');
const { getDatabase } = require('../database/init');

// Replace with actual Client ID or fetch from settings
const ANILIST_CLIENT_ID = '22699';

function registerAnilistHandlers() {
  ipcMain.handle('anilist:login', async (event) => {
    return new Promise((resolve) => {
      // Create a popup window for AniList login
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        title: 'Login no AniList',
        autoHideMenuBar: true,
      });

      const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;

      authWindow.loadURL(authUrl);
      authWindow.show();

      // Intercept navigation to capture the implicit token
      authWindow.webContents.on('will-navigate', (e, url) => {
        handleCallback(url);
      });

      authWindow.webContents.on('did-redirect-navigation', (e, url) => {
        handleCallback(url);
      });

      function handleCallback(url) {
        // The implicit grant returns the token in the URL hash fragment
        // e.g. https://anilist.co/api/v2/oauth/pin?access_token=XXXXX&token_type=Bearer&expires_in=31536000
        if (url.includes('access_token=')) {
          const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1]);
          const accessToken = params.get('access_token');

          if (accessToken) {
            // Save token to database settings
            const db = getDatabase();
            db.prepare(`
              INSERT INTO setting (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run('anilist_token', JSON.stringify(accessToken));

            authWindow.close();
            resolve({ success: true, token: accessToken });
          }
        }
      }

      authWindow.on('closed', () => {
        resolve({ success: false, error: 'Janela fechada pelo usuário' });
      });
    });
  });

  ipcMain.handle('anilist:logout', async () => {
    const db = getDatabase();
    db.prepare('DELETE FROM setting WHERE key = ?').run('anilist_token');

    // Clear cookies/storage for AniList so the popup doesn't auto-login next time
    const { session } = require('electron');
    await session.defaultSession.clearStorageData({
      origins: ['https://anilist.co']
    });

    return { success: true };
  });

  ipcMain.handle('anilist:getToken', async () => {
    const db = getDatabase();
    const result = db.prepare('SELECT value FROM setting WHERE key = ?').get('anilist_token');
    return result ? JSON.parse(result.value) : null;
  });
}

module.exports = {
  registerAnilistHandlers,
};
