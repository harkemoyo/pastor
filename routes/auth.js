const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');

// Load fallback users from JSON
function getUsers() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading users.json:', err);
    return [];
  }
}

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('login', {
    error: null,
    title: 'Sign In | Pastors LMS',
    email: req.query.email || ''
  });
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  if (!cleanEmail || !cleanPass) {
    return res.render('login', {
      error: 'Please enter both your email and password.',
      title: 'Sign In | Pastors LMS',
      email: cleanEmail
    });
  }

  // 1. Try Supabase Auth if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass
      });

      if (error) {
        throw error;
      }

      if (data && data.user) {
        req.session.user = {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name || cleanEmail.split('@')[0],
          role: data.user.user_metadata?.role || 'student',
          initials: (data.user.user_metadata?.full_name || 'Pastor').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        };
        return req.session.save(() => res.redirect('/'));
      }
    } catch (err) {
      console.warn('Supabase auth failed or not available, checking local fallback:', err.message);
      // Fall through to local users.json check
    }
  }

  // 2. Local Fallback Auth
  const users = getUsers();
  const matchedUser = users.find(u => u.email.toLowerCase() === cleanEmail && u.password === cleanPass);

  if (matchedUser) {
    const initials = matchedUser.full_name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    req.session.user = {
      id: matchedUser.email,
      email: matchedUser.email,
      full_name: matchedUser.full_name,
      role: matchedUser.role || 'student',
      initials: initials || 'P'
    };

    return req.session.save(() => {
      res.redirect('/');
    });
  }

  // Failed login
  return res.render('login', {
    error: 'Invalid email or password. For demo access, use pastor.james@church.org / demo1234 or the 1-click button below.',
    title: 'Sign In | Pastors LMS',
    email: cleanEmail
  });
});

// GET /logout
router.get('/logout', async (req, res) => {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase signOut notice:', err.message);
    }
  }

  if (req.session) {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
});

module.exports = router;
