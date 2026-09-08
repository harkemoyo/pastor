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
    username: req.query.username || ''
  });
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('register', {
    error: null,
    title: 'Apply for Pastoral Training | Pastors LMS'
  });
});

// POST /register
router.post('/register', async (req, res) => {
  const { full_name, email, password, confirm_password } = req.body;
  const cleanName = (full_name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();
  const cleanConfirmPass = (confirm_password || '').trim();

  // Validation
  if (!cleanName || !cleanEmail || !cleanPass || !cleanConfirmPass) {
    return res.render('register', {
      error: 'All fields are required.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: { full_name: cleanName, email: cleanEmail }
    });
  }

  if (cleanPass !== cleanConfirmPass) {
    return res.render('register', {
      error: 'Passwords do not match.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: { full_name: cleanName, email: cleanEmail }
    });
  }

  if (cleanPass.length < 6) {
    return res.render('register', {
      error: 'Password must be at least 6 characters.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: { full_name: cleanName, email: cleanEmail }
    });
  }

  // Check if email already exists
  const users = getUsers();
  const existingUser = users.find(u => u.email === cleanEmail);
  
  if (existingUser) {
    return res.render('register', {
      error: 'An account with this email already exists.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: { full_name: cleanName, email: cleanEmail }
    });
  }

  // Generate username for new applicant
  const prefix = 'p'; // All new registrations start as students
  const existingUsernames = users.map(u => u.username);
  let counter = 1;
  let username;
  
  do {
    username = `${prefix}${1000000 + counter}`;
    counter++;
  } while (existingUsernames.includes(username));

  // Create new user with pending status
  const newUser = {
    username,
    email: cleanEmail,
    password: cleanPass,
    full_name: cleanName,
    role: 'student',
    approval_status: 'pending',
    created_at: new Date().toISOString()
  };

  users.push(newUser);

  // Save to file
  try {
    fs.writeFileSync(path.join(__dirname, '../data/users.json'), JSON.stringify(users, null, 2));
    
    // Render success page
    res.render('register-success', {
      title: 'Application Submitted | Pastors LMS',
      username: username,
      full_name: cleanName
    });
  } catch (err) {
    console.error('Error saving user:', err);
    return res.render('register', {
      error: 'Failed to submit application. Please try again.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: { full_name: cleanName, email: cleanEmail }
    });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = (username || '').trim();
  const cleanPass = (password || '').trim();

  if (!cleanUsername || !cleanPass) {
    return res.render('login', {
      error: 'Please enter both your username and password.',
      title: 'Sign In | Pastors LMS',
      username: cleanUsername
    });
  }

  // 1. Try Supabase Auth if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanUsername, // For now using username as email for Supabase
        password: cleanPass
      });

      if (error) {
        throw error;
      }

      if (data && data.user) {
        req.session.user = {
          id: data.user.id,
          username: data.user.user_metadata?.username || cleanUsername,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name || cleanUsername,
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
  const matchedUser = users.find(u => u.username === cleanUsername && u.password === cleanPass);

  if (matchedUser) {
    // Check approval status
    if (matchedUser.approval_status !== 'approved') {
      return res.render('login', {
        error: `Your application is currently ${matchedUser.approval_status}. Please contact your administrator for approval.`,
        title: 'Sign In | Pastors LMS',
        username: cleanUsername
      });
    }

    const initials = matchedUser.full_name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    req.session.user = {
      id: matchedUser.username,
      username: matchedUser.username,
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
    error: 'Invalid username or password. Please contact your administrator if you need account access.',
    title: 'Sign In | Pastors LMS',
    username: cleanUsername
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
