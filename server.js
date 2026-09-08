require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'pastors-lms-secure-key-nairobi-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// User local attachment middleware
app.use(attachUser);

// Routes
app.use('/', authRoutes);
app.use('/', coursesRoutes);
app.use('/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('login', {
    error: 'The requested page was not found (404).',
    title: 'Page Not Found | Pastors LMS',
    email: ''
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error. Please refresh or try again.');
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  ✝ PASTORS LMS — Theological Training Portal`);
  console.log(`  🚀 Server running at: http://localhost:${PORT}`);
  console.log(`  🔑 Demo student: p1001234 (pass: demo1234)`);
  console.log(`  🛡️ Demo admin:   a1000001 (pass: admin1234)`);
  console.log(`  👥 Admin panel:   http://localhost:${PORT}/admin/users`);
  console.log(`======================================================\n`);
});
