const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

// Database path - uses app.getPath('userData') in production
let dbPath;

function getDbPath() {
  if (dbPath) return dbPath;

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Store in project directory during development
    dbPath = path.join(__dirname, '../../data/codex.db');
  } else {
    // Store in user data directory in production
    dbPath = path.join(app.getPath('userData'), 'codex.db');
  }

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dbPath;
}

let db = null;

/**
 * Initialize the database connection and create tables
 */
function initDatabase() {
  if (db) return db;

  const dbFile = getDbPath();
  console.log(`[Database] Initializing at: ${dbFile}`);

  db = new Database(dbFile);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  createTables();

  console.log('[Database] Initialized successfully');
  return db;
}

/**
 * Create all necessary tables
 */
function createTables() {
  // Manga table - stores manga in library
  db.exec(`
    CREATE TABLE IF NOT EXISTS manga (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT,
      artist TEXT,
      description TEXT,
      status TEXT DEFAULT 'UNKNOWN',
      thumbnail_url TEXT,
      local_cover_path TEXT,
      favorite INTEGER DEFAULT 0,
      last_read INTEGER,
      in_library INTEGER DEFAULT 1,
      unread_count INTEGER DEFAULT 0,
      last_updates_seen INTEGER DEFAULT 0,
      mal_id INTEGER,
      date_added INTEGER DEFAULT (strftime('%s', 'now')),
      date_updated INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Chapter table - stores chapters for each manga
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      name TEXT NOT NULL,
      chapter_number REAL DEFAULT 0,
      scanlator TEXT,
      is_read INTEGER DEFAULT 0,
      is_bookmarked INTEGER DEFAULT 0,
      last_page_read INTEGER DEFAULT 0,
      scroll_position REAL DEFAULT 0,
      date_fetch INTEGER DEFAULT (strftime('%s', 'now')),
      is_downloaded INTEGER DEFAULT 0,
      local_path TEXT,
      FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
      UNIQUE(manga_id, source_url)
    )
  `);

  // Category table - for organizing manga
  db.exec(`
    CREATE TABLE IF NOT EXISTS category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // Manga-Category junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS manga_category (
      manga_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (manga_id, category_id),
      FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE CASCADE
    )
  `);

  // Download queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      manga_title TEXT NOT NULL,
      chapter_name TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      progress REAL DEFAULT 0,
      error_message TEXT,
      date_added INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (chapter_id) REFERENCES chapter(id) ON DELETE CASCADE
    )
  `);

  // Reading history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id INTEGER NOT NULL,
      chapter_id INTEGER NOT NULL,
      date_read INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapter(id) ON DELETE CASCADE
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chapter_manga_id ON chapter(manga_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_is_read ON chapter(is_read);
    CREATE INDEX IF NOT EXISTS idx_manga_favorite ON manga(favorite);
    CREATE INDEX IF NOT EXISTS idx_manga_last_read ON manga(last_read);
    CREATE INDEX IF NOT EXISTS idx_reading_history_date ON reading_history(date_read);
  `);

  // Insert default categories
  const defaultCategories = ['Reading', 'Completed', 'Plan to Read', 'Dropped'];
  const insertCategory = db.prepare('INSERT OR IGNORE INTO category (name, sort_order) VALUES (?, ?)');
  defaultCategories.forEach((name, index) => {
    insertCategory.run(name, index);
  });

  // Migrations - add columns if they don't exist
  runMigrations();

  console.log('[Database] Tables created');
}

/**
 * Run database migrations
 */
function runMigrations() {
  const columns = db.prepare(`PRAGMA table_info(manga)`).all();
  const columnNames = columns.map(c => c.name);

  // Add in_library column if it doesn't exist
  if (!columnNames.includes('in_library')) {
    db.exec(`ALTER TABLE manga ADD COLUMN in_library INTEGER DEFAULT 1`);
    console.log('[Database] Added in_library column');
  }

  // Add unread_count column if it doesn't exist
  if (!columnNames.includes('unread_count')) {
    db.exec(`ALTER TABLE manga ADD COLUMN unread_count INTEGER DEFAULT 0`);
    console.log('[Database] Added unread_count column');
  }

  // Add last_updates_seen column if it doesn't exist
  if (!columnNames.includes('last_updates_seen')) {
    db.exec(`ALTER TABLE manga ADD COLUMN last_updates_seen INTEGER DEFAULT 0`);
    console.log('[Database] Added last_updates_seen column');
  }

  // Add mal_id column if it doesn't exist
  if (!columnNames.includes('mal_id')) {
    db.exec(`ALTER TABLE manga ADD COLUMN mal_id INTEGER`);
    console.log('[Database] Added mal_id column');
  }

  // Add date_added column to chapter if it doesn't exist
  const chapterColumns = db.prepare(`PRAGMA table_info(chapter)`).all();
  const chapterColumnNames = chapterColumns.map(c => c.name);

  if (!chapterColumnNames.includes('date_added')) {
    db.exec(`ALTER TABLE chapter ADD COLUMN date_added INTEGER DEFAULT (strftime('%s', 'now'))`);
    console.log('[Database] Added date_added column to chapter');
  }
}

/**
 * Get database instance
 */
function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Connection closed');
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
};
