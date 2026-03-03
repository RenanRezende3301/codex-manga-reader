const { Notification } = require('electron');
const { getDatabase } = require('../database/init');

// Configuration
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
let checkInterval = null;
let isChecking = false;

/**
 * Initialize the update checker
 */
function initUpdateChecker() {
  console.log('[UpdateChecker] Initializing...');

  // Start periodic checks
  checkInterval = setInterval(checkForUpdates, CHECK_INTERVAL_MS);

  // Do initial check after 5 seconds (let app fully load)
  setTimeout(checkForUpdates, 5000);
}

/**
 * Stop the update checker
 */
function stopUpdateChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

/**
 * Manually trigger update check
 */
async function checkForUpdates() {
  if (isChecking) {
    console.log('[UpdateChecker] Already checking, skipping...');
    return;
  }

  isChecking = true;
  console.log('[UpdateChecker] Checking for new chapters...');

  try {
    const db = getDatabase();

    // Get all manga in library that should be checked
    const mangas = db.prepare(`
      SELECT m.*, 
             (SELECT COUNT(*) FROM chapter c WHERE c.manga_id = m.id) as chapter_count
      FROM manga m
      WHERE m.in_library = 1
      ORDER BY m.last_read DESC
      LIMIT 50
    `).all();

    if (mangas.length === 0) {
      console.log('[UpdateChecker] No manga in library to check');
      isChecking = false;
      return;
    }

    console.log(`[UpdateChecker] Checking ${mangas.length} manga...`);

    const newChapters = [];

    for (const manga of mangas) {
      try {
        // Fetch current chapters from source
        const sourceChapters = await fetchChaptersFromSource(manga.source_id, manga.source_url);

        if (!sourceChapters || sourceChapters.length === 0) continue;

        // Get existing chapters from DB
        const existingChapters = db.prepare(`
          SELECT chapter_number FROM chapter WHERE manga_id = ?
        `).all(manga.id);

        const existingNumbers = new Set(existingChapters.map(c => c.chapter_number));

        // Find new chapters
        const newForThisManga = sourceChapters.filter(c =>
          !existingNumbers.has(parseFloat(c.number) || 0)
        );

        if (newForThisManga.length > 0) {
          console.log(`[UpdateChecker] Found ${newForThisManga.length} new chapters for "${manga.title}"`);

          // Insert new chapters into DB
          const insertStmt = db.prepare(`
            INSERT INTO chapter (manga_id, source_url, name, chapter_number, date_added)
            VALUES (?, ?, ?, ?, ?)
          `);

          for (const chapter of newForThisManga) {
            insertStmt.run(
              manga.id,
              chapter.url || '',
              chapter.name || `Chapter ${chapter.number}`,
              parseFloat(chapter.number) || 0,
              Math.floor(Date.now() / 1000)
            );
          }

          // Update manga unread count
          db.prepare(`
            UPDATE manga SET unread_count = unread_count + ? WHERE id = ?
          `).run(newForThisManga.length, manga.id);

          newChapters.push({
            manga: manga.title,
            count: newForThisManga.length,
          });
        }

        // Small delay between requests to not overwhelm sources
        await sleep(1000);

      } catch (err) {
        console.error(`[UpdateChecker] Error checking "${manga.title}":`, err.message);
      }
    }

    // Show notification if new chapters found
    if (newChapters.length > 0) {
      showNewChaptersNotification(newChapters);
    }

    console.log(`[UpdateChecker] Check complete. Found updates for ${newChapters.length} manga.`);

  } catch (error) {
    console.error('[UpdateChecker] Error:', error);
  } finally {
    isChecking = false;
  }
}

/**
 * Fetch chapters from source using the new plugin system
 */
async function fetchChaptersFromSource(sourceId, mangaUrl) {
  try {
    const path = require('path');
    const fs = require('fs');

    // Determine sources directory
    const isPackaged = require('electron').app.isPackaged || __dirname.includes('app.asar');
    const isDev = !isPackaged;
    const sourcesDir = isDev
      ? path.join(__dirname, '../../sources')
      : path.join(require('electron').app.getPath('userData'), 'sources');

    // Load JS plugin
    const pluginPath = path.join(sourcesDir, `${sourceId}.js`);
    if (!fs.existsSync(pluginPath)) {
      console.warn(`[UpdateChecker] Plugin not found: ${sourceId}.js`);
      return [];
    }

    // Clear require cache to get fresh plugin
    delete require.cache[require.resolve(pluginPath)];
    const plugin = require(pluginPath);

    if (typeof plugin.getChapters !== 'function') {
      console.warn(`[UpdateChecker] Plugin ${sourceId} has no getChapters method`);
      return [];
    }

    const chapters = await plugin.getChapters(mangaUrl);
    return chapters.map(ch => ({
      name: ch.name || `Chapter ${ch.chapterNumber}`,
      number: String(ch.chapterNumber || 0),
      url: ch.sourceUrl || '',
    }));

  } catch (error) {
    console.error(`[UpdateChecker] Failed to fetch chapters:`, error.message);
    return [];
  }
}

/**
 * Show system notification for new chapters
 */
function showNewChaptersNotification(newChapters) {
  const total = newChapters.reduce((sum, item) => sum + item.count, 0);

  let body;
  if (newChapters.length === 1) {
    body = `${newChapters[0].count} new chapter${newChapters[0].count > 1 ? 's' : ''} for "${newChapters[0].manga}"`;
  } else {
    body = `${total} new chapters across ${newChapters.length} manga`;
  }

  const notification = new Notification({
    title: 'New Chapters Available',
    body,
    icon: require('path').join(__dirname, '../../public/codex-icon.png'),
    silent: false,
  });

  notification.show();

  notification.on('click', () => {
    // Could focus the app and navigate to library
    console.log('[UpdateChecker] Notification clicked');
  });
}

/**
 * Get recent updates for UI
 */
function getRecentUpdates() {
  const db = getDatabase();

  return db.prepare(`
    SELECT m.id as mangaId, m.title as mangaTitle, m.thumbnail_url as thumbnailUrl,
           c.id as chapterId, c.name as chapterName, c.chapter_number as chapterNumber,
           c.date_added as dateAdded
    FROM chapter c
    JOIN manga m ON c.manga_id = m.id
    WHERE m.in_library = 1 
      AND c.date_added > COALESCE(m.last_updates_seen, 0)
      AND c.date_added > (strftime('%s', 'now') - 86400 * 7)
    ORDER BY c.date_added DESC
    LIMIT 20
  `).all();
}

/**
 * Mark updates as seen for a specific manga
 * Called when user visits the manga details page
 */
function markUpdatesAsSeen(mangaId) {
  const db = getDatabase();

  try {
    // Update last_updates_seen timestamp
    db.prepare(`
      UPDATE manga SET last_updates_seen = strftime('%s', 'now')
      WHERE id = ?
    `).run(mangaId);

    console.log(`[UpdateChecker] Marked updates as seen for manga ${mangaId}`);
    return true;
  } catch (error) {
    console.error('[UpdateChecker] Failed to mark updates as seen:', error);
    return false;
  }
}

// Utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  initUpdateChecker,
  stopUpdateChecker,
  checkForUpdates,
  getRecentUpdates,
  markUpdatesAsSeen,
};
