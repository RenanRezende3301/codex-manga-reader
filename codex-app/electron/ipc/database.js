const { ipcMain } = require('electron');
const { MangaDAO, ChapterDAO, CategoryDAO, SettingsDAO, HistoryDAO } = require('../database/dao');

/**
 * Register all IPC handlers for database operations
 */
function registerDatabaseHandlers() {
  console.log('[IPC] Registering database handlers...');

  // ============ MANGA HANDLERS ============

  // Add manga to library
  ipcMain.handle('db:manga:add', async (event, manga) => {
    try {
      const id = MangaDAO.addToLibrary(manga);
      console.log(`[DB] Added manga to library: ${manga.title}`);
      return { success: true, id };
    } catch (error) {
      console.error('[DB] Error adding manga:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all manga in library
  ipcMain.handle('db:manga:getAll', async () => {
    try {
      return MangaDAO.getAll();
    } catch (error) {
      console.error('[DB] Error getting manga:', error);
      return [];
    }
  });

  // Get manga by ID
  ipcMain.handle('db:manga:getById', async (event, id) => {
    return MangaDAO.getById(id);
  });

  // Check if manga is in library
  ipcMain.handle('db:manga:isInLibrary', async (event, sourceUrl) => {
    return MangaDAO.isInLibrary(sourceUrl);
  });

  // Get manga by MAL ID
  ipcMain.handle('db:manga:getByMalId', async (event, malId) => {
    try {
      return MangaDAO.getByMalId(malId);
    } catch (error) {
      console.error('[DB] Error getting manga by MAL ID:', error);
      return null;
    }
  });

  // Get manga by source URL
  ipcMain.handle('db:manga:getByUrl', async (event, sourceUrl) => {
    try {
      return MangaDAO.getBySourceUrl(sourceUrl);
    } catch (error) {
      console.error('[DB] Error getting manga by URL:', error);
      return null;
    }
  });

  // Update manga
  ipcMain.handle('db:manga:update', async (event, id, updates) => {
    return MangaDAO.update(id, updates);
  });

  // Toggle favorite
  ipcMain.handle('db:manga:toggleFavorite', async (event, id) => {
    return MangaDAO.toggleFavorite(id);
  });

  // Remove manga from library
  ipcMain.handle('db:manga:remove', async (event, id) => {
    return MangaDAO.remove(id);
  });

  // Get favorites
  ipcMain.handle('db:manga:getFavorites', async () => {
    return MangaDAO.getFavorites();
  });

  // Get recently read
  ipcMain.handle('db:manga:getRecentlyRead', async (event, limit) => {
    return MangaDAO.getRecentlyRead(limit);
  });

  // ============ CHAPTER HANDLERS ============

  // Add chapters to manga
  ipcMain.handle('db:chapter:addChapters', async (event, mangaId, chapters) => {
    try {
      ChapterDAO.addChapters(mangaId, chapters);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error adding chapters:', error);
      return { success: false, error: error.message };
    }
  });

  // Get chapters for manga
  ipcMain.handle('db:chapter:getByMangaId', async (event, mangaId, sortDesc) => {
    return ChapterDAO.getByMangaId(mangaId, sortDesc);
  });

  // Get chapter by ID
  ipcMain.handle('db:chapter:getById', async (event, id) => {
    return ChapterDAO.getById(id);
  });

  // Mark chapter as read
  ipcMain.handle('db:chapter:markAsRead', async (event, id) => {
    return ChapterDAO.markAsRead(id);
  });

  // Mark chapter as unread
  ipcMain.handle('db:chapter:markAsUnread', async (event, id) => {
    return ChapterDAO.markAsUnread(id);
  });

  // Update reading progress
  ipcMain.handle('db:chapter:updateProgress', async (event, id, lastPageRead, scrollPosition) => {
    return ChapterDAO.updateProgress(id, lastPageRead, scrollPosition);
  });

  // Toggle bookmark
  ipcMain.handle('db:chapter:toggleBookmark', async (event, id) => {
    return ChapterDAO.toggleBookmark(id);
  });

  // Mark all as read
  ipcMain.handle('db:chapter:markAllAsRead', async (event, mangaId) => {
    return ChapterDAO.markAllAsRead(mangaId);
  });

  // ============ CATEGORY HANDLERS ============

  // Get all categories
  ipcMain.handle('db:category:getAll', async () => {
    return CategoryDAO.getAll();
  });

  // Create category
  ipcMain.handle('db:category:create', async (event, name) => {
    return CategoryDAO.create(name);
  });

  // Delete category
  ipcMain.handle('db:category:delete', async (event, id) => {
    return CategoryDAO.delete(id);
  });

  // Get manga categories
  ipcMain.handle('db:category:getMangaCategories', async (event, mangaId) => {
    return CategoryDAO.getMangaCategories(mangaId);
  });

  // Set manga categories
  ipcMain.handle('db:category:setMangaCategories', async (event, mangaId, categoryIds) => {
    return CategoryDAO.setMangaCategories(mangaId, categoryIds);
  });

  // ============ SETTINGS HANDLERS ============

  // Get setting
  ipcMain.handle('db:settings:get', async (event, key, defaultValue) => {
    return SettingsDAO.get(key, defaultValue);
  });

  // Set setting
  ipcMain.handle('db:settings:set', async (event, key, value) => {
    return SettingsDAO.set(key, value);
  });

  // Get all settings
  ipcMain.handle('db:settings:getAll', async () => {
    return SettingsDAO.getAll();
  });

  // ============ HISTORY HANDLERS ============

  // Add to history
  ipcMain.handle('db:history:add', async (event, mangaId, chapterId) => {
    return HistoryDAO.add(mangaId, chapterId);
  });

  // Get recent history
  ipcMain.handle('db:history:getRecent', async (event, limit) => {
    return HistoryDAO.getRecent(limit);
  });

  // Clear all history
  ipcMain.handle('db:history:clearAll', async () => {
    return HistoryDAO.clearAll();
  });

  console.log('[IPC] Database handlers registered');
}

module.exports = { registerDatabaseHandlers };
