// SQLite helper
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function init(dbFile) {
  const db = await open({ filename: dbFile, driver: sqlite3.Database });
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      filename TEXT NOT NULL,
      thumbnail_filename TEXT,
      uploader_id INTEGER,
      likes INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(uploader_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      author TEXT,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
  `);
  return db;
}

module.exports = { init };