/* The admin's express server: password login + session cookies, the content/media/publish/
upload api, and serving the admin app plus the preview's styles/renderer/media. */
import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MulterError } from 'multer';
import { clearSession, getPasswordHash, hasValidSession, issueSession, requireEnv, requireSession, verifyPassword } from './auth.js';
import { ConflictError, getStore } from './store.js';
import { uploadMiddleware } from './media.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// required at boot - the secret that signs session cookies
const SESSION_SECRET = requireEnv('SESSION_SECRET');

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser(SESSION_SECRET));

// check the password, and if it's right hand back a session cookie
app.post('/api/login', async (req, res) => {
  const ok = await verifyPassword(req.body?.password, getPasswordHash());
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  issueSession(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// the admin checks this on load to decide between the login screen and the editor
app.get('/api/session', (req, res) => {
  res.json({ authenticated: hasValidSession(req) });
});

// everything below /api needs a valid session (login/logout/session above are public)
app.use('/api', requireSession);

// the current site + all pages, for the editor to load
app.get('/api/content', async (req, res, next) => {
  try {
    const store = await getStore();
    res.json(await store.readContent());
  } catch (err) {
    next(err);
  }
});

// list of media the library picker shows
app.get('/api/media', async (req, res, next) => {
  try {
    const store = await getStore();
    res.json(await store.listMedia());
  } catch (err) {
    next(err);
  }
});

// delete one image from the library; path must be a /media/ web path (no traversal)
app.post('/api/media/delete', async (req, res, next) => {
  try {
    const { path } = req.body ?? {};
    if (typeof path !== 'string' || !path.startsWith('/media/') || path.includes('..')) {
      return res.status(400).json({ error: 'Invalid media path.' });
    }
    const store = await getStore();
    res.json(await store.deleteMedia(path));
  } catch (err) {
    next(err);
  }
});

// write the whole draft back; baseSha guards against publishing over someone else's change (409)
app.post('/api/publish', async (req, res, next) => {
  try {
    const { baseSha, site, pages, message } = req.body ?? {};

    if (typeof baseSha !== 'string' || !baseSha) {
      return res.status(400).json({ error: 'Missing baseSha - reload the editor and try again.' });
    }
    if (!site || typeof site !== 'object' || !Array.isArray(pages)) {
      return res.status(400).json({ error: 'Malformed publish request.' });
    }

    const store = await getStore();
    const result = await store.publish({
      baseSha,
      site,
      pages,
      message: typeof message === 'string' && message.trim() ? message.trim() : 'Update site content',
    });
    res.json(result);
  } catch (err) {
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
    next(err);
  }
});

// accept one image, re-encode it, and return the path to reference it by
app.post('/api/upload', (req, res, next) => {
  uploadMiddleware.single('image')(req, res, async (err) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Image is too large (max 12MB).' });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image provided.' });

    try {
      const store = await getStore();
      res.json(await store.upload(req.file));
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

// serve the admin app, plus the real site styles/renderer/media the preview imports
app.use(express.static(join(root, 'admin')));
app.get('/styles.css', (req, res) => res.sendFile(join(root, 'src/styles.css')));
app.use('/src', express.static(join(root, 'src')));
app.use('/media', express.static(join(root, 'public/media')));

// any non-api route falls back to the admin shell (single-page app)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(join(root, 'admin', 'index.html'));
});

// last-resort error handler (the 4-arg signature is what marks it as one to express)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`\n  Admin running at http://localhost:${port}\n`);
});
