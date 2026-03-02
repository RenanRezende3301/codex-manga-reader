const { getDatabase } = require('./init');

/**
 * Manga Data Access Object
 */
const MangaDAO = {
  /**
   * Add manga to library
   */
  addToLibrary(manga) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO manga (source_id, source_url, title, author, artist, description, status, thumbnail_url, mal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      manga.sourceId,
      manga.sourceUrl,
      manga.title,
      manga.author || null,
      manga.artist || null,
      manga.description || null,
      manga.status || 'UNKNOWN',
      manga.thumbnailUrl || null,
      manga.malId || null
    );

    return result.lastInsertRowid;
  },

  /**
   * Get all manga in library
   */
  getAll() {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        m.id, m.source_id as sourceId, m.source_url as sourceUrl, m.title, 
        m.author, m.artist, m.description, m.status, m.thumbnail_url as thumbnailUrl,
        m.local_cover_path as localCoverPath, m.favorite, m.last_read as lastRead,
        m.in_library as inLibrary, m.mal_id as malId, m.date_added as dateAdded, m.date_updated as dateUpdated,
        (SELECT COUNT(*) FROM chapter WHERE manga_id = m.id AND is_read = 0) as unreadCount,
        (SELECT c.id FROM chapter c WHERE c.manga_id = m.id AND c.last_page_read > 0 
         ORDER BY c.chapter_number DESC LIMIT 1) as lastChapterId,
        (SELECT c.name FROM chapter c WHERE c.manga_id = m.id AND c.last_page_read > 0 
         ORDER BY c.chapter_number DESC LIMIT 1) as lastChapterName,
        (SELECT c.source_url FROM chapter c WHERE c.manga_id = m.id AND c.last_page_read > 0 
         ORDER BY c.chapter_number DESC LIMIT 1) as lastChapterUrl,
        (SELECT c.last_page_read FROM chapter c WHERE c.manga_id = m.id AND c.last_page_read > 0 
         ORDER BY c.chapter_number DESC LIMIT 1) as lastPageRead
      FROM manga m
      ORDER BY m.date_updated DESC
    `).all();
  },

  /**
   * Get manga by ID
   */
  getById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        id, source_id as sourceId, source_url as sourceUrl, title, 
        author, artist, description, status, thumbnail_url as thumbnailUrl,
        local_cover_path as localCoverPath, favorite, last_read as lastRead,
        in_library as inLibrary, mal_id as malId, date_added as dateAdded, date_updated as dateUpdated
      FROM manga WHERE id = ?
    `).get(id);
  },

  /**
   * Get manga by source URL
   */
  getBySourceUrl(sourceUrl) {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        id, source_id as sourceId, source_url as sourceUrl, title, 
        author, artist, description, status, thumbnail_url as thumbnailUrl,
        local_cover_path as localCoverPath, favorite, last_read as lastRead,
        in_library as inLibrary, mal_id as malId, date_added as dateAdded, date_updated as dateUpdated
      FROM manga WHERE source_url = ?
    `).get(sourceUrl);
  },

  /**
   * Check if manga is in library
   */
  isInLibrary(sourceUrl) {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 FROM manga WHERE source_url = ?').get(sourceUrl);
    return !!result;
  },

  /**
   * Update manga
   */
  update(id, updates) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.author !== undefined) { fields.push('author = ?'); values.push(updates.author); }
    if (updates.artist !== undefined) { fields.push('artist = ?'); values.push(updates.artist); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.thumbnailUrl !== undefined) { fields.push('thumbnail_url = ?'); values.push(updates.thumbnailUrl); }
    if (updates.localCoverPath !== undefined) { fields.push('local_cover_path = ?'); values.push(updates.localCoverPath); }
    if (updates.favorite !== undefined) { fields.push('favorite = ?'); values.push(updates.favorite ? 1 : 0); }
    if (updates.lastRead !== undefined) { fields.push('last_read = ?'); values.push(updates.lastRead); }
    if (updates.malId !== undefined) { fields.push('mal_id = ?'); values.push(updates.malId); }

    fields.push("date_updated = strftime('%s', 'now')");
    values.push(id);

    const stmt = db.prepare(`UPDATE manga SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  /**
   * Toggle favorite status
   */
  toggleFavorite(id) {
    const db = getDatabase();
    return db.prepare('UPDATE manga SET favorite = 1 - favorite WHERE id = ?').run(id);
  },

  /**
   * Remove manga from library
   */
  remove(id) {
    const db = getDatabase();
    return db.prepare('DELETE FROM manga WHERE id = ?').run(id);
  },

  /**
   * Get favorites
   */
  getFavorites() {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        id, source_id as sourceId, source_url as sourceUrl, title, 
        author, status, thumbnail_url as thumbnailUrl, favorite,
        mal_id as malId,
        (SELECT COUNT(*) FROM chapter WHERE manga_id = manga.id AND is_read = 0) as unreadCount
      FROM manga WHERE favorite = 1
      ORDER BY title
    `).all();
  },

  /**
   * Get recently read manga
   */
  getRecentlyRead(limit = 10) {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        id, source_id as sourceId, source_url as sourceUrl, title, 
        author, status, thumbnail_url as thumbnailUrl, last_read as lastRead,
        mal_id as malId,
        (SELECT COUNT(*) FROM chapter WHERE manga_id = manga.id AND is_read = 0) as unreadCount
      FROM manga 
      WHERE last_read IS NOT NULL
      ORDER BY last_read DESC
      LIMIT ?
    `).all(limit);
  }
};

/**
 * Chapter Data Access Object
 */
const ChapterDAO = {
  /**
   * Add chapters to manga
   */
  addChapters(mangaId, chapters) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO chapter (manga_id, source_url, name, chapter_number, scanlator)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((chapters) => {
      for (const ch of chapters) {
        stmt.run(mangaId, ch.sourceUrl, ch.name, ch.chapterNumber || 0, ch.scanlator || null);
      }
    });

    insertMany(chapters);
  },

  /**
   * Get chapters for manga
   */
  getByMangaId(mangaId, sortDesc = true) {
    const db = getDatabase();
    const order = sortDesc ? 'DESC' : 'ASC';
    return db.prepare(`
      SELECT 
        id, manga_id as mangaId, source_url as sourceUrl, name, 
        chapter_number as chapterNumber, scanlator, is_read as isRead,
        is_bookmarked as isBookmarked, last_page_read as lastPageRead,
        scroll_position as scrollPosition, is_downloaded as isDownloaded,
        local_path as localPath, date_fetch as dateFetch
      FROM chapter 
      WHERE manga_id = ?
      ORDER BY chapter_number ${order}
    `).all(mangaId);
  },

  /**
   * Get chapter by ID
   */
  getById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        id, manga_id as mangaId, source_url as sourceUrl, name, 
        chapter_number as chapterNumber, scanlator, is_read as isRead,
        is_bookmarked as isBookmarked, last_page_read as lastPageRead,
        scroll_position as scrollPosition, is_downloaded as isDownloaded,
        local_path as localPath
      FROM chapter WHERE id = ?
    `).get(id);
  },

  /**
   * Mark chapter as read
   */
  markAsRead(id) {
    const db = getDatabase();
    return db.prepare('UPDATE chapter SET is_read = 1 WHERE id = ?').run(id);
  },

  /**
   * Mark chapter as unread
   */
  markAsUnread(id) {
    const db = getDatabase();
    return db.prepare('UPDATE chapter SET is_read = 0, last_page_read = 0, scroll_position = 0 WHERE id = ?').run(id);
  },

  /**
   * Update reading progress
   */
  updateProgress(id, lastPageRead, scrollPosition = 0) {
    const db = getDatabase();
    return db.prepare(`
      UPDATE chapter 
      SET last_page_read = ?, scroll_position = ?
      WHERE id = ?
    `).run(lastPageRead, scrollPosition, id);
  },

  /**
   * Toggle bookmark
   */
  toggleBookmark(id) {
    const db = getDatabase();
    return db.prepare('UPDATE chapter SET is_bookmarked = 1 - is_bookmarked WHERE id = ?').run(id);
  },

  /**
   * Get unread count for manga
   */
  getUnreadCount(mangaId) {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM chapter WHERE manga_id = ? AND is_read = 0').get(mangaId);
    return result ? result.count : 0;
  },

  /**
   * Mark all as read
   */
  markAllAsRead(mangaId) {
    const db = getDatabase();
    return db.prepare('UPDATE chapter SET is_read = 1 WHERE manga_id = ?').run(mangaId);
  }
};

/**
 * Category Data Access Object
 */
const CategoryDAO = {
  getAll() {
    const db = getDatabase();
    return db.prepare('SELECT id, name, sort_order as sortOrder FROM category ORDER BY sort_order').all();
  },

  create(name) {
    const db = getDatabase();
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM category').get();
    const order = (maxOrder?.max || 0) + 1;
    return db.prepare('INSERT INTO category (name, sort_order) VALUES (?, ?)').run(name, order);
  },

  delete(id) {
    const db = getDatabase();
    return db.prepare('DELETE FROM category WHERE id = ?').run(id);
  },

  getMangaCategories(mangaId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT c.id, c.name 
      FROM category c
      JOIN manga_category mc ON c.id = mc.category_id
      WHERE mc.manga_id = ?
    `).all(mangaId);
  },

  setMangaCategories(mangaId, categoryIds) {
    const db = getDatabase();
    const deleteStmt = db.prepare('DELETE FROM manga_category WHERE manga_id = ?');
    const insertStmt = db.prepare('INSERT INTO manga_category (manga_id, category_id) VALUES (?, ?)');

    const transaction = db.transaction(() => {
      deleteStmt.run(mangaId);
      for (const catId of categoryIds) {
        insertStmt.run(mangaId, catId);
      }
    });

    transaction();
  }
};

/**
 * Settings Data Access Object
 */
const SettingsDAO = {
  get(key, defaultValue = null) {
    const db = getDatabase();
    const result = db.prepare('SELECT value FROM setting WHERE key = ?').get(key);
    return result ? JSON.parse(result.value) : defaultValue;
  },

  set(key, value) {
    const db = getDatabase();
    return db.prepare(`
      INSERT INTO setting (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  },

  getAll() {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM setting').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value);
    }
    return settings;
  }
};

/**
 * History Data Access Object
 */
const HistoryDAO = {
  add(mangaId, chapterId) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO reading_history (manga_id, chapter_id)
      VALUES (?, ?)
    `).run(mangaId, chapterId);

    // Update manga last_read
    db.prepare("UPDATE manga SET last_read = strftime('%s', 'now') WHERE id = ?").run(mangaId);
  },

  getRecent(limit = 50) {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        h.id, h.date_read as dateRead,
        m.id as mangaId, m.title as mangaTitle, m.thumbnail_url as thumbnailUrl,
        c.id as chapterId, c.name as chapterName, c.chapter_number as chapterNumber
      FROM reading_history h
      JOIN manga m ON h.manga_id = m.id
      JOIN chapter c ON h.chapter_id = c.id
      ORDER BY h.date_read DESC
      LIMIT ?
    `).all(limit);
  },

  clearAll() {
    const db = getDatabase();
    return db.prepare('DELETE FROM reading_history').run();
  }
};

module.exports = {
  MangaDAO,
  ChapterDAO,
  CategoryDAO,
  SettingsDAO,
  HistoryDAO,
};
