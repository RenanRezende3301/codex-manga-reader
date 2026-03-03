const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function getSourcesDir() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, '../../sources');
  }

  const userDataPath = app.getPath('userData');
  const userSourcesDir = path.join(userDataPath, 'sources');

  if (!fs.existsSync(userSourcesDir)) {
    fs.mkdirSync(userSourcesDir, { recursive: true });

    // Copy ALL bundled sources (including lib folder) on first run
    const bundledSourcesDir = path.join(__dirname, '../../sources');
    if (fs.existsSync(bundledSourcesDir)) {
      try {
        copyDirSync(bundledSourcesDir, userSourcesDir);
      } catch (err) {
        console.error('[Sources] Failed to copy bundled sources:', err);
      }
    }
  }

  return userSourcesDir;
}

// Reference to loaded source plugins (accessible externally)
let loadedSources = {};

// Simple in-memory cache for requests to prevent rate limiting and speed up navigation
const cache = {
  search: new Map(),
  chapters: new Map(),
  pages: new Map(),
};
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

/**
 * Load source plugins from the sources/ directory.
 * Each plugin is a .js file that exports: { id, name, baseUrl, search, getChapters, getPages, ... }
 */
function loadSources() {
  const sourcesDir = getSourcesDir();
  const sources = {};

  try {
    const files = fs.readdirSync(sourcesDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const filePath = path.join(sourcesDir, file);
        try {
          // Clear require cache so hot-reloading works on refresh
          delete require.cache[require.resolve(filePath)];
          const plugin = require(filePath);

          // Validate plugin structure
          if (!plugin.id || !plugin.name || !plugin.baseUrl) {
            console.warn(`[Sources] Skipping ${file}: missing id, name, or baseUrl`);
            continue;
          }
          if (typeof plugin.search !== 'function') {
            console.warn(`[Sources] Skipping ${file}: missing search() function`);
            continue;
          }
          if (typeof plugin.getChapters !== 'function') {
            console.warn(`[Sources] Skipping ${file}: missing getChapters() function`);
            continue;
          }
          if (typeof plugin.getPages !== 'function') {
            console.warn(`[Sources] Skipping ${file}: missing getPages() function`);
            continue;
          }

          sources[plugin.id] = plugin;
          console.log(`[Sources] Loaded plugin: ${plugin.name} (${plugin.id})`);
        } catch (err) {
          console.error(`[Sources] Failed to load plugin ${file}:`, err.message);
        }
      }
    }
  } catch (error) {
    console.error('[Sources] Failed to read sources directory:', error);
  }

  return sources;
}

/**
 * Register all IPC handlers for the Source Engine
 */
function registerSourceHandlers() {
  let sources = loadSources();
  loadedSources = sources;
  console.log('[IPC] Loaded sources:', Object.keys(sources));

  // Get all available sources
  ipcMain.handle('sources:getAll', async () => {
    return Object.values(sources).map(source => ({
      id: source.id,
      name: source.name,
      baseUrl: source.baseUrl,
      version: source.version || '1.0.0',
      language: source.language || 'en',
      iconUrl: source.iconUrl || '',
    }));
  });

  // Search manga — delegates to plugin.search()
  ipcMain.handle('source:search', async (event, sourceId, query) => {
    console.log(`[IPC] source:search - ${sourceId}: ${query}`);

    const source = sources[sourceId];
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const cacheKey = `${sourceId}:${query}`;
    if (cache.search.has(cacheKey)) {
      const cached = cache.search.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[IPC] source:search - returning cached results for ${cacheKey}`);
        return cached.data;
      }
    }

    try {
      const results = await source.search(query);
      console.log(`[IPC] Found ${results.length} results for "${query}"`);

      cache.search.set(cacheKey, { data: results, timestamp: Date.now() });
      return results;
    } catch (error) {
      console.error(`[IPC] Search error:`, error.message);
      throw error;
    }
  });

  // Get manga details — delegates to plugin.getDetails()
  ipcMain.handle('source:details', async (event, sourceId, mangaUrl) => {
    console.log(`[IPC] source:details - ${sourceId}: ${mangaUrl}`);

    const source = sources[sourceId];
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    try {
      if (typeof source.getDetails === 'function') {
        return await source.getDetails(mangaUrl);
      }
      // Fallback: return minimal data
      return { title: '', description: '' };
    } catch (error) {
      console.error(`[IPC] Details error:`, error.message);
      throw error;
    }
  });

  // Get chapters — delegates to plugin.getChapters()
  ipcMain.handle('source:chapters', async (event, sourceId, mangaUrl) => {
    console.log(`[IPC] source:chapters - ${sourceId}: ${mangaUrl}`);

    const source = sources[sourceId];
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const cacheKey = `${sourceId}:${mangaUrl}`;
    if (cache.chapters.has(cacheKey)) {
      const cached = cache.chapters.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[IPC] source:chapters - returning cached results for ${cacheKey}`);
        return cached.data;
      }
    }

    try {
      const chapterList = await source.getChapters(mangaUrl);
      console.log(`[IPC] Found ${chapterList.length} chapters`);

      cache.chapters.set(cacheKey, { data: chapterList, timestamp: Date.now() });
      return chapterList;
    } catch (error) {
      console.error(`[IPC] Chapters error:`, error.message);
      throw error;
    }
  });

  // Get pages — delegates to plugin.getPages()
  ipcMain.handle('source:pages', async (event, sourceId, chapterUrl) => {
    console.log(`[IPC] source:pages - ${sourceId}: ${chapterUrl}`);

    const source = sources[sourceId];
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const cacheKey = `${sourceId}:${chapterUrl}`;
    if (cache.pages.has(cacheKey)) {
      const cached = cache.pages.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[IPC] source:pages - returning cached results for ${cacheKey}`);
        return cached.data;
      }
    }

    try {
      const pageUrls = await source.getPages(chapterUrl);
      console.log(`[IPC] Found ${pageUrls.length} pages`);

      cache.pages.set(cacheKey, { data: pageUrls, timestamp: Date.now() });
      return pageUrls;
    } catch (error) {
      console.error(`[IPC] Pages error:`, error.message);
      throw error;
    }
  });

  // Refresh sources from disk
  ipcMain.handle('sources:refresh', async () => {
    console.log('[IPC] sources:refresh');
    sources = loadSources();
    return true;
  });

  // Add source repository
  ipcMain.handle('sources:addRepo', async (event, url) => {
    console.log(`[IPC] sources:addRepo - ${url}`);
    // TODO: Implement repository fetching
    return true;
  });

  // Install source from URL (downloads a .js plugin file)
  ipcMain.handle('sources:install', async (event, url) => {
    console.log(`[IPC] sources:install - ${url}`);

    try {
      const axios = require('axios');
      const response = await axios.get(url, { timeout: 30000 });
      const content = response.data;

      // Determine filename from URL
      const urlParts = url.split('/');
      let fileName = urlParts[urlParts.length - 1];
      if (!fileName.endsWith('.js')) {
        fileName = `source_${Date.now()}.js`;
      }

      const sourcesDir = getSourcesDir();
      const filePath = path.join(sourcesDir, fileName);

      fs.writeFileSync(filePath, content, 'utf-8');

      // Reload sources
      sources = loadSources();

      console.log(`[IPC] Source installed: ${fileName}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Install source error:', error.message);
      throw error;
    }
  });

  // Install source from local file content (a .js plugin as string)
  ipcMain.handle('sources:installLocal', async (event, jsContent) => {
    console.log('[IPC] sources:installLocal');

    try {
      // Try to extract the id from the JS content to name the file
      const idMatch = jsContent.match(/(?:const|let|var)\s+id\s*=\s*['"]([^'"]+)['"]/);
      const fileName = idMatch ? `${idMatch[1]}.js` : `source_${Date.now()}.js`;

      const sourcesDir = getSourcesDir();
      const filePath = path.join(sourcesDir, fileName);

      fs.writeFileSync(filePath, jsContent, 'utf-8');

      // Reload sources
      sources = loadSources();

      console.log(`[IPC] Source installed locally: ${fileName}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Install local source error:', error.message);
      throw error;
    }
  });

  // Remove source
  ipcMain.handle('sources:remove', async (event, sourceId) => {
    console.log(`[IPC] sources:remove - ${sourceId}`);

    try {
      const sourcesDir = getSourcesDir();

      // Try .js extension
      const jsPath = path.join(sourcesDir, `${sourceId}.js`);

      // Also search all .js files for the matching id
      let targetPath = null;
      if (fs.existsSync(jsPath)) {
        targetPath = jsPath;
      } else {
        // Search through source files to find the one with this id
        const files = fs.readdirSync(sourcesDir);
        for (const file of files) {
          if (file.endsWith('.js')) {
            const filePath = path.join(sourcesDir, file);
            try {
              delete require.cache[require.resolve(filePath)];
              const plugin = require(filePath);
              if (plugin.id === sourceId) {
                targetPath = filePath;
                break;
              }
            } catch (e) {
              // Skip files that can't be loaded
            }
          }
        }
      }

      if (targetPath && fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        delete sources[sourceId];
        // Clear require cache for the removed file
        delete require.cache[require.resolve(targetPath)];
        console.log(`[IPC] Source removed: ${sourceId}`);
        return { success: true };
      } else {
        throw new Error('Fonte não encontrada');
      }
    } catch (error) {
      console.error('[IPC] Remove source error:', error.message);
      throw error;
    }
  });

  console.log('[IPC] Source handlers registered');
}

module.exports = { registerSourceHandlers, getLoadedSources: () => loadedSources };
