require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const adminRoutes = require('./routes/admin');
const onboardingRoutes = require('./routes/onboarding');
const libraryRoutes = require('./routes/library');
const teacherRoutes = require('./routes/teacher');
const academicsRoutes = require('./routes/academics');
const engagementRoutes = require('./routes/engagement');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Asset version string to prevent stale CSS/JS from old caches
const ASSET_VERSION = '20261127a';
app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  next();
});

// Always revalidate service worker so browsers immediately receive SW updates
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public/sw.js'));
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));

const SESSION_SECRET = process.env.SESSION_SECRET || 'pastors-lms-secure-key-nairobi-2026';
const AUTH_COOKIE_NAME = 'pastors_auth';
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Sign & verify a compact stateless auth token so logins survive across
// Vercel serverless instances, cold starts, and read-only filesystems.
function signAuthToken(user, maxAgeMs = DEFAULT_SESSION_TTL_MS) {
  const payload = Buffer.from(JSON.stringify({
    user,
    exp: Date.now() + maxAgeMs
  }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0) return null;
  const payload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || !parsed.user || (parsed.exp && Date.now() > parsed.exp)) {
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), cookieStr]);
  }
}

// Persistent session store so active logins survive restarts & file edits in dev
class FileSessionStore extends session.Store {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.fallbackPath = path.join(os.tmpdir(), 'pastors-lms-sessions.json');
    this.sessions = {};
    this.load();
  }

  load() {
    for (const target of [this.filePath, this.fallbackPath]) {
      try {
        if (fs.existsSync(target)) {
          const raw = fs.readFileSync(target, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.sessions = { ...this.sessions, ...parsed };
          }
        }
      } catch {
        // Ignore corrupt/unreadable session cache
      }
    }
  }

  save() {
    const serialized = JSON.stringify(this.sessions);
    try {
      fs.writeFileSync(this.filePath, serialized, 'utf8');
    } catch {
      try {
        fs.writeFileSync(this.fallbackPath, serialized, 'utf8');
      } catch {
        // In strictly read-only environments, signed auth cookie maintains session state
      }
    }
  }

  get(sid, cb) {
    try {
      const sess = this.sessions[sid];
      if (!sess) return cb(null, null);
      if (sess.cookie && sess.cookie.expires) {
        if (new Date(sess.cookie.expires) <= new Date()) {
          delete this.sessions[sid];
          this.save();
          return cb(null, null);
        }
      }
      return cb(null, sess);
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.sessions[sid] = sess;
      this.save();
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      delete this.sessions[sid];
      this.save();
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  touch(sid, sess, cb) {
    return this.set(sid, sess, cb);
  }
}

const sessionFilePath = path.join(__dirname, 'data/.sessions.json');

// Session configuration
// Trust reverse proxies (Vercel / Cloudflare) so HTTPS detection works across hops
app.set('trust proxy', true);
app.use(session({
  store: new FileSessionStore(sessionFilePath),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: DEFAULT_SESSION_TTL_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto'
  }
}));

// Stateless signed auth cookie sync middleware (prevents random logouts on Vercel serverless)
app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const incomingToken = cookies[AUTH_COOKIE_NAME];
  const cookieUser = verifyAuthToken(incomingToken);

  // Restore session user if this request hit a different serverless instance or cold start
  if (req.session && !req.session.user && cookieUser) {
    req.session.user = cookieUser;
  }

  let sessionDestroyed = false;
  if (req.session && typeof req.session.destroy === 'function') {
    const origDestroy = req.session.destroy.bind(req.session);
    req.session.destroy = function (cb) {
      sessionDestroyed = true;
      return origDestroy(cb);
    };
  }

  const origWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    try {
      const isHttps = req.secure || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      const secureFlag = isHttps ? '; Secure' : '';

      if (sessionDestroyed) {
        appendSetCookie(res, `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`);
      } else if (req.session && req.session.user) {
        const currentUserJson = JSON.stringify(req.session.user);
        const cookieUserJson = cookieUser ? JSON.stringify(cookieUser) : null;
        if (currentUserJson !== cookieUserJson) {
          const maxAgeMs = (req.session.cookie && req.session.cookie.maxAge) || DEFAULT_SESSION_TTL_MS;
          const maxAgeSec = Math.floor(maxAgeMs / 1000);
          const token = signAuthToken(req.session.user, maxAgeMs);
          appendSetCookie(res, `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureFlag}`);
        }
      }
    } catch {
      // Never block response headers
    }
    return origWriteHead.apply(this, args);
  };

  next();
});

// User local attachment middleware
app.use(attachUser);

// Public landing page (guests only; signed-in users fall through to the dashboard)
app.get('/', (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.render('landing');
});

// Routes
app.use('/', authRoutes);
app.use('/', coursesRoutes);
app.use('/', libraryRoutes);
app.use('/', academicsRoutes);
app.use('/', engagementRoutes);
app.use('/teacher', teacherRoutes);
app.use('/admin', adminRoutes);
app.use('/onboarding', onboardingRoutes);

// 404 handler - dedicated friendly 404 page (never confuses users by rendering the login screen)
app.use((req, res) => {
  console.warn(`[404 Not Found] ${req.method} ${req.originalUrl || req.url}`);
  res.status(404).render('404', {
    title: 'Page Not Found | Pastors LMS',
    requestedUrl: req.originalUrl || req.url
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error. Please refresh or try again.');
});

// Only start the server if not running in Vercel environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  ✝ PASTORS LMS — Theological Training Portal`);
    console.log(`  🚀 Server running at: http://localhost:${PORT}`);
    console.log(`  🔑 Demo student: p1001234 (pass: demo1234)`);
    console.log(`  🛡️ Demo admin:   a1000001 (pass: admin1234)`);
    console.log(`  👥 Admin panel:   http://localhost:${PORT}/admin/users`);
    console.log(`======================================================\n`);
  });
}

// Export app for Vercel
module.exports = app;
