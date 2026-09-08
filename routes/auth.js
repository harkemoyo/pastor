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

// GET /auth/google
router.get('/auth/google', async (req, res) => {
  if (!supabase) {
    return res.render('login', {
      error: 'Google OAuth is not available. Supabase is not configured.',
      title: 'Sign In | Pastors LMS',
      email: ''
    });
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${req.protocol}://${req.get('host')}/auth/google/callback`,
        skipBrowserRedirect: false
      }
    });

    if (error) throw error;

    // Redirect to the OAuth provider
    res.redirect(data.url);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.render('login', {
      error: 'Failed to initiate Google sign-in. Please try again.',
      title: 'Sign In | Pastors LMS',
      email: ''
    });
  }
});

// GET /auth/google/callback
router.get('/auth/google/callback', async (req, res) => {
  if (!supabase) {
    return res.redirect('/login');
  }

  try {
    console.log('Google OAuth callback received');
    console.log('Query params:', Object.keys(req.query));
    
    // Get the current session from Supabase
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    console.log('Session data:', sessionData ? 'exists' : 'null');
    console.log('Session error:', sessionError);
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      throw sessionError;
    }

    if (sessionData.session && sessionData.session.user) {
      const user = sessionData.session.user;
      console.log('User found:', user.email);
      
      req.session.user = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
        role: user.user_metadata?.role || 'student',
        initials: (user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
      };
      
      console.log('Session user set:', req.session.user);
      
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('/login');
        }
        console.log('Session saved successfully, redirecting to dashboard');
        res.redirect('/');
      });
    } else {
      // If no session, try to get user from URL params
      console.log('No session in getSession, trying URL params');
      if (req.query.access_token || req.query.refresh_token) {
        const { data: userData, error: userError } = await supabase.auth.getUser(req.query.access_token);
        if (!userError && userData.user) {
          const user = userData.user;
          console.log('User from token:', user.email);
          
          req.session.user = {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
            role: user.user_metadata?.role || 'student',
            initials: (user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
          };
          
          req.session.save((err) => {
            if (err) {
              console.error('Session save error:', err);
              return res.redirect('/login');
            }
            console.log('Session saved successfully, redirecting to dashboard');
            res.redirect('/');
          });
        } else {
          console.log('Failed to get user from token:', userError);
          res.redirect('/login');
        }
      } else {
        console.log('No valid session found, redirecting to login');
        res.redirect('/login');
      }
    }
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect('/login');
  }
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('login', {
    error: null,
    title: 'Create Account | Pastors LMS',
    email: '',
    isRegister: true
  });
});

// POST /register
router.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();
  const cleanName = (full_name || '').trim();

  if (!cleanEmail || !cleanPass || !cleanName) {
    return res.render('login', {
      error: 'Please fill in all fields.',
      title: 'Create Account | Pastors LMS',
      email: cleanEmail,
      isRegister: true
    });
  }

  if (cleanPass.length < 6) {
    return res.render('login', {
      error: 'Password must be at least 6 characters.',
      title: 'Create Account | Pastors LMS',
      email: cleanEmail,
      isRegister: true
    });
  }

  // 1. Try Supabase Auth registration
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPass,
        options: {
          data: {
            full_name: cleanName,
            role: 'student'
          }
        }
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        req.session.user = {
          id: data.user.id,
          email: data.user.email,
          full_name: cleanName,
          role: 'student',
          initials: cleanName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        };
        return req.session.save(() => res.redirect('/'));
      }
    } catch (err) {
      console.warn('Supabase registration failed:', err.message);
      return res.render('login', {
        error: err.message || 'Registration failed. Please try again.',
        title: 'Create Account | Pastors LMS',
        email: cleanEmail,
        isRegister: true
      });
    }
  }

  // 2. Local Fallback Registration
  const users = getUsers();
  const existingUser = users.find(u => u.email.toLowerCase() === cleanEmail);

  if (existingUser) {
    return res.render('login', {
      error: 'An account with this email already exists.',
      title: 'Create Account | Pastors LMS',
      email: cleanEmail,
      isRegister: true
    });
  }

  const newUser = {
    email: cleanEmail,
    password: cleanPass,
    full_name: cleanName,
    role: 'student'
  };

  users.push(newUser);

  try {
    fs.writeFileSync(path.join(__dirname, '../data/users.json'), JSON.stringify(users, null, 2));
    
    const initials = cleanName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    
    req.session.user = {
      id: cleanEmail,
      email: cleanEmail,
      full_name: cleanName,
      role: 'student',
      initials: initials || 'P'
    };

    return req.session.save(() => res.redirect('/'));
  } catch (err) {
    console.error('Error saving user:', err);
    return res.render('login', {
      error: 'Failed to create account. Please try again.',
      title: 'Create Account | Pastors LMS',
      email: cleanEmail,
      isRegister: true
    });
  }
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
