const { ipcMain } = require('electron');
const {
  initDownloadManager,
  updatePlugins,
  addToQueue,
  cancelDownload,
  getQueueStatus,
  clearCompleted,
  getLocalPages,
  getDownloadedChapters,
  deleteDownloadedChapter,
} = require('../download/manager');

let mainWindow = null;

/**
 * Register download IPC handlers
 * @param {Electron.BrowserWindow} window - The main browser window
 * @param {Object} plugins - Source plugins object { sourceId: pluginInstance }
 */
function registerDownloadHandlers(window, plugins) {
  mainWindow = window;

  // Initialize download manager with progress callback and source plugins
  initDownloadManager((progress) => {
    // Send progress updates to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:progress', progress);
    }
  }, plugins);

  console.log('[IPC] Registering download handlers...');

  // Start download
  ipcMain.handle('download:start', async (event, manga, chapter) => {
    try {
      const downloadId = addToQueue(manga, chapter);
      return { success: true, downloadId };
    } catch (error) {
      console.error('[Download] Failed to start:', error);
      return { success: false, error: error.message };
    }
  });

  // Get download queue
  ipcMain.handle('download:queue', async () => {
    try {
      return getQueueStatus();
    } catch (error) {
      console.error('[Download] Failed to get queue:', error);
      return [];
    }
  });

  // Cancel download
  ipcMain.handle('download:cancel', async (event, downloadId) => {
    try {
      cancelDownload(downloadId);
      return { success: true };
    } catch (error) {
      console.error('[Download] Failed to cancel:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear completed downloads
  ipcMain.handle('download:clearCompleted', async () => {
    try {
      clearCompleted();
      return { success: true };
    } catch (error) {
      console.error('[Download] Failed to clear:', error);
      return { success: false, error: error.message };
    }
  });

  // Get local pages for a downloaded chapter (returns file:// URLs)
  ipcMain.handle('download:getLocalPages', async (event, chapterId) => {
    try {
      return getLocalPages(chapterId);
    } catch (error) {
      console.error('[Download] Failed to get local pages:', error);
      throw error;
    }
  });

  // Get all downloaded chapters for a manga
  ipcMain.handle('download:getDownloadedChapters', async (event, mangaId) => {
    try {
      return getDownloadedChapters(mangaId);
    } catch (error) {
      console.error('[Download] Failed to get downloaded chapters:', error);
      return [];
    }
  });

  // Delete a downloaded chapter
  ipcMain.handle('download:deleteChapter', async (event, chapterId) => {
    try {
      return deleteDownloadedChapter(chapterId);
    } catch (error) {
      console.error('[Download] Failed to delete chapter:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Download handlers registered');
}

/**
 * Update source plugins in the download manager (called when sources are refreshed)
 */
function updateDownloadPlugins(plugins) {
  updatePlugins(plugins);
}

module.exports = { registerDownloadHandlers, updateDownloadPlugins };
