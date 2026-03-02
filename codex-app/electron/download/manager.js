const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getDatabase } = require('../database/init');

// Download status enum
const DownloadStatus = {
  PENDING: 'PENDING',
  DOWNLOADING: 'DOWNLOADING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

// Download manager configuration
const CONFIG = {
  maxConcurrent: 2,          // Max concurrent chapter downloads
  maxImagesPerChapter: 3,    // Max concurrent image downloads per chapter
  retryAttempts: 3,          // Retry failed downloads
  retryDelay: 1000,          // Delay between retries (ms)
  downloadPath: null,        // Will be set on init
};

// Active downloads tracking
let activeDownloads = new Map();
let downloadQueue = [];
let isProcessing = false;
let progressCallback = null;

// Source plugins reference — set by initDownloadManager
let sourcePlugins = {};

/**
 * Initialize download manager
 * @param {Function} onProgress - Callback for progress updates
 * @param {Object} plugins - Source plugins object { sourceId: pluginInstance }
 */
function initDownloadManager(onProgress, plugins) {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    CONFIG.downloadPath = path.join(__dirname, '../../downloads');
  } else {
    CONFIG.downloadPath = path.join(app.getPath('userData'), 'downloads');
  }

  // Ensure download directory exists
  if (!fs.existsSync(CONFIG.downloadPath)) {
    fs.mkdirSync(CONFIG.downloadPath, { recursive: true });
  }

  progressCallback = onProgress;
  sourcePlugins = plugins || {};
  console.log(`[DownloadManager] Initialized. Path: ${CONFIG.downloadPath}`);
  console.log(`[DownloadManager] Available sources: ${Object.keys(sourcePlugins).join(', ')}`);

  // Load pending downloads from database on startup
  loadPendingDownloads();
}

/**
 * Update source plugins reference (called when sources are refreshed)
 */
function updatePlugins(plugins) {
  sourcePlugins = plugins || {};
}

/**
 * Load pending downloads from database
 */
function loadPendingDownloads() {
  try {
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT dq.*, c.source_url as chapterUrl, c.manga_id as mangaId,
             m.source_id as sourceId
      FROM download_queue dq
      JOIN chapter c ON dq.chapter_id = c.id
      JOIN manga m ON c.manga_id = m.id
      WHERE dq.status = 'PENDING' OR dq.status = 'DOWNLOADING'
      ORDER BY dq.date_added ASC
    `).all();

    downloadQueue = pending.map(item => ({
      id: item.id,
      chapterId: item.chapter_id,
      mangaId: item.mangaId,
      mangaTitle: item.manga_title,
      chapterName: item.chapter_name,
      chapterUrl: item.chapterUrl,
      sourceId: item.sourceId,
      status: DownloadStatus.PENDING,
    }));

    console.log(`[DownloadManager] Loaded ${downloadQueue.length} pending downloads`);
    processQueue();
  } catch (error) {
    console.error('[DownloadManager] Failed to load pending downloads:', error);
  }
}

/**
 * Add chapter to download queue
 */
function addToQueue(manga, chapter) {
  const db = getDatabase();

  // Check if already in queue
  const existing = db.prepare(`
    SELECT id, status FROM download_queue WHERE chapter_id = ?
  `).get(chapter.id);

  if (existing) {
    // If it was previously failed/cancelled, reset it
    if (existing.status === 'FAILED' || existing.status === 'CANCELLED') {
      db.prepare(`UPDATE download_queue SET status = 'PENDING', progress = 0, error_message = NULL WHERE id = ?`)
        .run(existing.id);

      downloadQueue.push({
        id: existing.id,
        chapterId: chapter.id,
        mangaId: manga.id,
        mangaTitle: manga.title,
        chapterName: chapter.name,
        chapterUrl: chapter.sourceUrl,
        sourceId: manga.sourceId,
        status: DownloadStatus.PENDING,
      });

      processQueue();
      return existing.id;
    }
    console.log(`[DownloadManager] Chapter ${chapter.name} already in queue`);
    return existing.id;
  }

  // Add to database queue
  const result = db.prepare(`
    INSERT INTO download_queue (chapter_id, manga_title, chapter_name, status)
    VALUES (?, ?, ?, 'PENDING')
  `).run(chapter.id, manga.title, chapter.name);

  const queueItem = {
    id: result.lastInsertRowid,
    chapterId: chapter.id,
    mangaId: manga.id,
    mangaTitle: manga.title,
    chapterName: chapter.name,
    chapterUrl: chapter.sourceUrl,
    sourceId: manga.sourceId,
    status: DownloadStatus.PENDING,
  };

  downloadQueue.push(queueItem);
  console.log(`[DownloadManager] Added to queue: ${manga.title} - ${chapter.name}`);

  // Start processing if not already
  processQueue();

  return result.lastInsertRowid;
}

/**
 * Process download queue
 */
async function processQueue() {
  if (isProcessing) return;
  if (downloadQueue.length === 0) return;
  if (activeDownloads.size >= CONFIG.maxConcurrent) return;

  isProcessing = true;

  while (downloadQueue.length > 0 && activeDownloads.size < CONFIG.maxConcurrent) {
    const item = downloadQueue.find(i => i.status === DownloadStatus.PENDING);
    if (!item) break;

    item.status = DownloadStatus.DOWNLOADING;
    activeDownloads.set(item.id, item);

    // Start download in background
    downloadChapter(item).catch(err => {
      console.error(`[DownloadManager] Download failed: ${item.chapterName}`, err);
    });
  }

  isProcessing = false;
}

/**
 * Download a single chapter using the source plugin
 */
async function downloadChapter(item) {
  const db = getDatabase();

  try {
    // Update status in DB
    db.prepare(`UPDATE download_queue SET status = 'DOWNLOADING' WHERE id = ?`).run(item.id);
    sendProgress(item.id, 0, 'DOWNLOADING');

    // Create chapter directory
    const sanitizedManga = sanitizeFilename(item.mangaTitle);
    const sanitizedChapter = sanitizeFilename(item.chapterName);
    const chapterPath = path.join(CONFIG.downloadPath, sanitizedManga, sanitizedChapter);

    if (!fs.existsSync(chapterPath)) {
      fs.mkdirSync(chapterPath, { recursive: true });
    }

    // Fetch page URLs using the source plugin
    const sourcePlugin = sourcePlugins[item.sourceId];
    if (!sourcePlugin) {
      throw new Error(`Source plugin not found: ${item.sourceId}`);
    }

    console.log(`[DownloadManager] Fetching pages via plugin: ${item.sourceId}`);
    const pageUrls = await sourcePlugin.getPages(item.chapterUrl);

    if (!pageUrls || pageUrls.length === 0) {
      throw new Error('No pages found');
    }

    console.log(`[DownloadManager] Found ${pageUrls.length} pages to download`);

    // Download images with progress
    const totalPages = pageUrls.length;
    let downloadedPages = 0;

    // Download in batches
    for (let i = 0; i < pageUrls.length; i += CONFIG.maxImagesPerChapter) {
      // Check if cancelled
      if (!activeDownloads.has(item.id)) {
        console.log(`[DownloadManager] Download cancelled: ${item.chapterName}`);
        return;
      }

      const batch = pageUrls.slice(i, i + CONFIG.maxImagesPerChapter);

      await Promise.all(batch.map(async (url, batchIndex) => {
        const pageNum = i + batchIndex + 1;
        const ext = getImageExtension(url);
        const filename = `${String(pageNum).padStart(3, '0')}.${ext}`;
        const filepath = path.join(chapterPath, filename);

        await downloadImage(url, filepath, sourcePlugin.baseUrl);
        downloadedPages++;

        // Report progress
        const progress = (downloadedPages / totalPages) * 100;
        sendProgress(item.id, progress, 'DOWNLOADING');
        db.prepare(`UPDATE download_queue SET progress = ? WHERE id = ?`).run(progress, item.id);
      }));
    }

    // Update chapter in database — mark as downloaded with local path
    db.prepare(`
      UPDATE chapter SET is_downloaded = 1, local_path = ? WHERE id = ?
    `).run(chapterPath, item.chapterId);

    // Mark as completed
    db.prepare(`UPDATE download_queue SET status = 'COMPLETED', progress = 100 WHERE id = ?`).run(item.id);
    item.status = DownloadStatus.COMPLETED;
    sendProgress(item.id, 100, 'COMPLETED');

    console.log(`[DownloadManager] Completed: ${item.mangaTitle} - ${item.chapterName} (${totalPages} pages)`);

  } catch (error) {
    console.error(`[DownloadManager] Failed: ${item.chapterName}`, error.message);
    db.prepare(`UPDATE download_queue SET status = 'FAILED', error_message = ? WHERE id = ?`)
      .run(error.message, item.id);
    item.status = DownloadStatus.FAILED;
    sendProgress(item.id, 0, 'FAILED', error.message);
  } finally {
    activeDownloads.delete(item.id);
    downloadQueue = downloadQueue.filter(i => i.id !== item.id);
    processQueue();
  }
}

/**
 * Download a single image with retry logic
 */
async function downloadImage(url, filepath, referer, attempt = 1) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
        'Referer': referer || new URL(url).origin,
      },
      timeout: 60000,
    });

    fs.writeFileSync(filepath, response.data);
    return true;
  } catch (error) {
    if (attempt < CONFIG.retryAttempts) {
      await sleep(CONFIG.retryDelay * attempt);
      return downloadImage(url, filepath, referer, attempt + 1);
    }
    throw error;
  }
}

/**
 * Send progress update to renderer
 */
function sendProgress(downloadId, progress, status, errorMessage) {
  if (progressCallback) {
    progressCallback({
      id: downloadId,
      progress,
      status,
      errorMessage,
    });
  }
}

/**
 * Get local page file:// URLs for a downloaded chapter
 */
function getLocalPages(chapterId) {
  const db = getDatabase();
  const chapter = db.prepare(`SELECT local_path FROM chapter WHERE id = ? AND is_downloaded = 1`).get(chapterId);

  if (!chapter || !chapter.local_path) {
    throw new Error('Chapter not downloaded');
  }

  const chapterPath = chapter.local_path;
  if (!fs.existsSync(chapterPath)) {
    // Files were deleted externally, reset DB flags
    db.prepare(`UPDATE chapter SET is_downloaded = 0, local_path = NULL WHERE id = ?`).run(chapterId);
    throw new Error('Downloaded files not found');
  }

  // Read all image files, sorted by name
  const files = fs.readdirSync(chapterPath)
    .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    .sort()
    .map(f => `codex-local://${path.join(chapterPath, f)}`);

  return files;
}

/**
 * Get all downloaded chapters for a manga
 */
function getDownloadedChapters(mangaId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, name, chapter_number, source_url, local_path
    FROM chapter 
    WHERE manga_id = ? AND is_downloaded = 1
    ORDER BY chapter_number DESC
  `).all(mangaId);
}

/**
 * Delete a downloaded chapter (remove files and reset DB)
 */
function deleteDownloadedChapter(chapterId) {
  const db = getDatabase();
  const chapter = db.prepare(`SELECT local_path, manga_id FROM chapter WHERE id = ?`).get(chapterId);

  if (chapter && chapter.local_path && fs.existsSync(chapter.local_path)) {
    // Remove the chapter directory
    fs.rmSync(chapter.local_path, { recursive: true, force: true });
    console.log(`[DownloadManager] Deleted files: ${chapter.local_path}`);

    // Check if parent manga folder is now empty, if so remove it too
    const parentDir = path.dirname(chapter.local_path);
    try {
      const remaining = fs.readdirSync(parentDir);
      if (remaining.length === 0) {
        fs.rmSync(parentDir, { recursive: true, force: true });
        console.log(`[DownloadManager] Removed empty manga folder: ${parentDir}`);
      }
    } catch (e) {
      // Parent dir might already not exist
    }
  }

  // Reset DB flags
  db.prepare(`UPDATE chapter SET is_downloaded = 0, local_path = NULL WHERE id = ?`).run(chapterId);

  // Remove from download queue
  db.prepare(`DELETE FROM download_queue WHERE chapter_id = ?`).run(chapterId);

  return { success: true };
}

/**
 * Cancel a download
 */
function cancelDownload(downloadId) {
  const db = getDatabase();
  db.prepare(`UPDATE download_queue SET status = 'CANCELLED' WHERE id = ?`).run(downloadId);

  const item = downloadQueue.find(i => i.id === downloadId);
  if (item) {
    item.status = DownloadStatus.CANCELLED;
    downloadQueue = downloadQueue.filter(i => i.id !== downloadId);
  }

  activeDownloads.delete(downloadId);
}

/**
 * Get download queue status
 */
function getQueueStatus() {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, chapter_id as chapterId, manga_title as mangaTitle, 
           chapter_name as chapterName, status, progress, error_message as errorMessage
    FROM download_queue
    ORDER BY date_added DESC
    LIMIT 100
  `).all();
}

/**
 * Clear completed downloads from queue
 */
function clearCompleted() {
  const db = getDatabase();
  db.prepare(`DELETE FROM download_queue WHERE status = 'COMPLETED'`).run();
}

// Utility functions
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}

function getImageExtension(url) {
  const match = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  initDownloadManager,
  updatePlugins,
  addToQueue,
  cancelDownload,
  getQueueStatus,
  clearCompleted,
  getLocalPages,
  getDownloadedChapters,
  deleteDownloadedChapter,
  DownloadStatus,
};
