// server.js - Express server with ffmpeg thumbnail generation
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { nanoid } = require('nanoid');
const { init } = require('./db');
const ffmpeg = require('fluent-ffmpeg');
const { spawnSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const DB_FILE = process.env.DB_FILE || 'mini_yt.sqlite';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '500', 10);
const THUMB_TIME_SECONDS = parseFloat(process.env.THUMB_TIME_SECONDS || '1');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Check ffmpeg availability and log
function checkFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version']);
    if (r.status === 0) {
      console.log('ffmpeg found');
    } else {
      console.warn('ffmpeg not found in PATH. Server-side thumbnail generation will fail without ffmpeg.');
    }
  } catch (e) {
    console.warn('ffmpeg check failed:', e.message);
  }
}
checkFfmpeg();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, Date.now() + '-' + nanoid(8) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

async function main() {
  const db = await init(DB_FILE);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Serve client static files
  app.use('/', express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, UPLOAD_DIR)));

  // helper: auth middleware
  function authMiddleware(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: 'Authorization required' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid auth header' });
    try {
      const payload = jwt.verify(parts[1], JWT_SECRET);
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // register
  app.post('/api/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const hash = await bcrypt.hash(password, 10);
    try {
      const now = Date.now();
      const result = await db.run('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', username, hash, now);
      res.json({ ok: true, id: result.lastID });
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'username already taken' });
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // login
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    try {
      const user = await db.get('SELECT * FROM users WHERE username = ?', username);
      if (!user) return res.status(401).json({ error: 'invalid credentials' });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'invalid credentials' });
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // GET videos (public)
  app.get('/api/videos', async (req, res) => {
    try {
      const rows = await db.all(`
        SELECT v.id, v.title, v.description, v.filename, v.thumbnail_filename, v.likes, v.created_at,
               u.username AS uploader
        FROM videos v
        LEFT JOIN users u ON u.id = v.uploader_id
        ORDER BY v.created_at DESC
      `);
      const videos = rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        url: `/uploads/${r.filename}`,
        thumbnailUrl: r.thumbnail_filename ? `/uploads/${r.thumbnail_filename}` : null,
        likes: r.likes,
        createdAt: r.created_at,
        uploader: r.uploader || null
      }));
      res.json({ videos });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // GET single video's comments
  app.get('/api/videos/:id/comments', async (req, res) => {
    const vid = Number(req.params.id);
    const comments = await db.all('SELECT id, author, text, created_at FROM comments WHERE video_id = ? ORDER BY created_at DESC', vid);
    res.json({ comments: comments.map(c => ({ id: c.id, author: c.author, text: c.text, createdAt: c.created_at })) });
  });

  // POST comment (allow anonymous)
  app.post('/api/videos/:id/comments', async (req, res) => {
    const vid = Number(req.params.id);
    const { author, text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    try {
      const now = Date.now();
      await db.run('INSERT INTO comments (video_id, author, text, created_at) VALUES (?, ?, ?, ?)', vid, author || '匿名', text.trim(), now);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // POST like (public)
  app.post('/api/videos/:id/like', async (req, res) => {
    const vid = Number(req.params.id);
    try {
      await db.run('UPDATE videos SET likes = likes + 1 WHERE id = ?', vid);
      const v = await db.get('SELECT likes FROM videos WHERE id = ?', vid);
      res.json({ likes: v ? v.likes : 0 });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // server-side thumbnail generation helper
  function generateThumbnailWithFfmpeg(videoPath, outPath, timeSec = THUMB_TIME_SECONDS) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .on('end', function() {
          resolve(outPath);
        })
        .on('error', function(err) {
          reject(err);
        })
        // take a single frame
        .screenshots({
          timestamps: [timeSec],
          filename: path.basename(outPath),
          folder: path.dirname(outPath),
          size: '640x?'
        });
    });
  }

  // POST upload video (requires auth)
  // fields: file (video file), title, description, thumbnail (optional: dataURL)
  app.post('/api/videos', authMiddleware, upload.single('file'), async (req, res) => {
    const uploader_id = req.user.id;
    const { title, description, thumbnail } = req.body || {};
    if (!req.file || !title) {
      if (req.file && req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'file and title are required' });
    }

    let thumbnailFilename = null;

    // If client provided thumbnail data URL, save it
    if (thumbnail && thumbnail.startsWith('data:')) {
      try {
        const matches = thumbnail.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1].split('/')[1] || 'jpg';
          const data = Buffer.from(matches[2], 'base64');
          thumbnailFilename = Date.now() + '-' + nanoid(6) + '.' + ext;
          fs.writeFileSync(path.join(UPLOAD_DIR, thumbnailFilename), data);
        }
      } catch (err) {
        console.warn('thumbnail save failed', err);
      }
    }

    // If no thumbnail provided, try to generate using ffmpeg (if available)
    if (!thumbnailFilename) {
      try {
        const outName = Date.now() + '-' + nanoid(6) + '.jpg';
        const outPath = path.join(UPLOAD_DIR, outName);
        await generateThumbnailWithFfmpeg(path.join(UPLOAD_DIR, req.file.filename), outPath, THUMB_TIME_SECONDS);
        thumbnailFilename = outName;
      } catch (err) {
        console.warn('server-side thumbnail generation failed:', err && err.message);
        // Not fatal — continue without thumbnail
      }
    }

    try {
      const now = Date.now();
      const result = await db.run(
        'INSERT INTO videos (title, description, filename, thumbnail_filename, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        title, description || '', req.file.filename, thumbnailFilename, uploader_id, now
      );
      res.json({ ok: true, id: result.lastID });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // delete video by uploader
  app.delete('/api/videos/:id', authMiddleware, async (req, res) => {
    const vid = Number(req.params.id);
    try {
      const v = await db.get('SELECT * FROM videos WHERE id = ?', vid);
      if (!v) return res.status(404).json({ error: 'not found' });
      if (v.uploader_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      try { if (v.filename) fs.unlinkSync(path.join(UPLOAD_DIR, v.filename)); } catch(e){}
      try { if (v.thumbnail_filename) fs.unlinkSync(path.join(UPLOAD_DIR, v.thumbnail_filename)); } catch(e){}
      await db.run('DELETE FROM videos WHERE id = ?', vid);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // fallback
  app.use((req, res) => res.status(404).send('Not Found'));

  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});