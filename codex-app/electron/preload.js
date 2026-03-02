const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('codex', {
  // ============ SOURCE ENGINE ============
  fetchMangaSearch: (sourceId, query) =>
    ipcRenderer.invoke('source:search', sourceId, query),
  fetchMangaDetails: (sourceId, url) =>
    ipcRenderer.invoke('source:details', sourceId, url),
  fetchChapterList: (sourceId, url) =>
    ipcRenderer.invoke('source:chapters', sourceId, url),
  fetchChapterPages: (sourceId, url) =>
    ipcRenderer.invoke('source:pages', sourceId, url),

  // Sources management
  getSources: () => ipcRenderer.invoke('sources:getAll'),
  addSourceRepository: (url) => ipcRenderer.invoke('sources:addRepo', url),
  refreshSources: () => ipcRenderer.invoke('sources:refresh'),

  // ============ MANGA DATABASE ============
  getLibrary: () => ipcRenderer.invoke('db:manga:getAll'),
  addToLibrary: (manga) => ipcRenderer.invoke('db:manga:add', manga),
  removeFromLibrary: (mangaId) => ipcRenderer.invoke('db:manga:remove', mangaId),
  updateManga: (mangaId, updates) => ipcRenderer.invoke('db:manga:update', mangaId, updates),
  getManga: (mangaId) => ipcRenderer.invoke('db:manga:getById', mangaId),
  getMangaByUrl: (sourceUrl) => ipcRenderer.invoke('db:manga:getByUrl', sourceUrl),
  isInLibrary: (sourceUrl) => ipcRenderer.invoke('db:manga:isInLibrary', sourceUrl),
  toggleFavorite: (mangaId) => ipcRenderer.invoke('db:manga:toggleFavorite', mangaId),
  getFavorites: () => ipcRenderer.invoke('db:manga:getFavorites'),
  getRecentlyRead: (limit) => ipcRenderer.invoke('db:manga:getRecentlyRead', limit),

  // ============ CHAPTERS DATABASE ============
  getChapters: (mangaId, sortDesc) => ipcRenderer.invoke('db:chapter:getByMangaId', mangaId, sortDesc),
  addChapters: (mangaId, chapters) => ipcRenderer.invoke('db:chapter:addChapters', mangaId, chapters),
  getChapter: (chapterId) => ipcRenderer.invoke('db:chapter:getById', chapterId),
  markChapterRead: (chapterId) => ipcRenderer.invoke('db:chapter:markAsRead', chapterId),
  markChapterUnread: (chapterId) => ipcRenderer.invoke('db:chapter:markAsUnread', chapterId),
  updateReadingProgress: (chapterId, lastPageRead, scrollPosition) =>
    ipcRenderer.invoke('db:chapter:updateProgress', chapterId, lastPageRead, scrollPosition),
  toggleChapterBookmark: (chapterId) => ipcRenderer.invoke('db:chapter:toggleBookmark', chapterId),
  markAllChaptersRead: (mangaId) => ipcRenderer.invoke('db:chapter:markAllAsRead', mangaId),

  // ============ CATEGORIES ============
  getCategories: () => ipcRenderer.invoke('db:category:getAll'),
  createCategory: (name) => ipcRenderer.invoke('db:category:create', name),
  deleteCategory: (categoryId) => ipcRenderer.invoke('db:category:delete', categoryId),
  getMangaCategories: (mangaId) => ipcRenderer.invoke('db:category:getMangaCategories', mangaId),
  setMangaCategories: (mangaId, categoryIds) => ipcRenderer.invoke('db:category:setMangaCategories', mangaId, categoryIds),

  // ============ SETTINGS ============
  getSetting: (key, defaultValue) => ipcRenderer.invoke('db:settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('db:settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('db:settings:getAll'),

  // ============ HISTORY ============
  addToHistory: (mangaId, chapterId) => ipcRenderer.invoke('db:history:add', mangaId, chapterId),
  getReadingHistory: (limit) => ipcRenderer.invoke('db:history:getRecent', limit),
  clearHistory: () => ipcRenderer.invoke('db:history:clearAll'),

  // ============ DOWNLOADS ============
  downloadChapter: (manga, chapter) =>
    ipcRenderer.invoke('download:start', manga, chapter),
  getDownloadQueue: () => ipcRenderer.invoke('download:queue'),
  cancelDownload: (downloadId) => ipcRenderer.invoke('download:cancel', downloadId),
  clearCompletedDownloads: () => ipcRenderer.invoke('download:clearCompleted'),
  onDownloadProgress: (callback) =>
    ipcRenderer.on('download:progress', (event, data) => callback(data)),
  getLocalPages: (chapterId) =>
    ipcRenderer.invoke('download:getLocalPages', chapterId),
  getDownloadedChapters: (mangaId) =>
    ipcRenderer.invoke('download:getDownloadedChapters', mangaId),
  deleteDownloadedChapter: (chapterId) =>
    ipcRenderer.invoke('download:deleteChapter', chapterId),

  // ============ UPDATES ============
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getRecentUpdates: () => ipcRenderer.invoke('updates:getRecent'),
  markUpdatesAsSeen: (mangaId) => ipcRenderer.invoke('updates:markSeen', mangaId),

  // ============ SOURCES ============
  getSources: () => ipcRenderer.invoke('sources:getAll'),
  addSourceRepository: (url) => ipcRenderer.invoke('sources:addRepo', url),
  refreshSources: () => ipcRenderer.invoke('sources:refresh'),
  installSource: (url) => ipcRenderer.invoke('sources:install', url),
  installLocalSource: (jsonContent) => ipcRenderer.invoke('sources:installLocal', jsonContent),
  removeSource: (sourceId) => ipcRenderer.invoke('sources:remove', sourceId),

  // ============ ANILIST ============
  anilistLogin: () => ipcRenderer.invoke('anilist:login'),
  anilistLogout: () => ipcRenderer.invoke('anilist:logout'),
  getAnilistToken: () => ipcRenderer.invoke('anilist:getToken'),
});
