require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const adminRoutes = require('./routes/admin');
const onboardingRoutes = require('./routes/onboarding');
const libraryRoutes = require('./routes/library');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));

// Persistent session store so active logins survive restarts & file edits in dev
class FileSessionStore extends session.Store {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.sessions = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.sessions = JSON.parse(raw) || {};
      }
    } catch {
      this.sessions = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.sessions), 'utf8');
    } catch {
      // In read-only filesystems (e.g. Vercel lambda), keep in-memory only
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
// Vercel terminates TLS at a proxy, so trust it for secure cookies to work
app.set('trust proxy', 1);
app.use(session({
  store: new FileSessionStore(sessionFilePath),
  secret: process.env.SESSION_SECRET || 'pastors-lms-secure-key-nairobi-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' // HTTPS-only cookies in production (Vercel)
  }
}));

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
