const { ipcMain } = require('electron');
const { checkForUpdates, getRecentUpdates, markUpdatesAsSeen } = require('../updates/checker');

/**
 * Register update-related IPC handlers
 */
function registerUpdateHandlers() {
  console.log('[IPC] Registering update handlers...');

  // Manually check for updates
  ipcMain.handle('updates:check', async () => {
    try {
      await checkForUpdates();
      return { success: true };
    } catch (error) {
      console.error('[Updates] Check failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Get recent updates for UI
  ipcMain.handle('updates:getRecent', async () => {
    try {
      return getRecentUpdates();
    } catch (error) {
      console.error('[Updates] Failed to get recent:', error);
      return [];
    }
  });

  // Mark updates as seen for a manga
  ipcMain.handle('updates:markSeen', async (event, mangaId) => {
    try {
      return markUpdatesAsSeen(mangaId);
    } catch (error) {
      console.error('[Updates] Failed to mark as seen:', error);
      return false;
    }
  });

  console.log('[IPC] Update handlers registered');
}

module.exports = { registerUpdateHandlers };
