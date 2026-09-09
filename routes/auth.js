const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { supabase, supabaseAdmin } = require('../config/supabase');

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

function generateStudentUsername(users) {
  const prefix = 'p';
  let counter = 1000000;
  while (true) {
    const username = `${prefix}${counter}`;
    if (!users.some((user) => user.username === username)) return username;
    counter += 1;
  }
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

async function syncStudentToSupabase(studentData) {
  const client = supabaseAdmin || supabase;
  if (!client) return null;

  try {
    const payload = {
      auth_user_id: studentData.auth_user_id || null,
      username: studentData.username,
      email: studentData.email,
      full_name: studentData.full_name,
      first_name: studentData.first_name || '',
      last_name: studentData.last_name || '',
      phone: studentData.phone || '',
      county: studentData.county || '',
      town: studentData.town || '',
      physical_address: studentData.physical_address || '',
      church_name: studentData.church_name || '',
      ministry_role: studentData.ministry_role || '',
      years_in_ministry: studentData.years_in_ministry || 0,
      emergency_contact_name: studentData.emergency_contact_name || '',
      emergency_contact_phone: studentData.emergency_contact_phone || '',
      relationship: studentData.relationship || '',
      student_id: studentData.student_id || '',
      approval_status: studentData.approval_status || 'approved',
      status: studentData.status || 'active',
      role: 'student',
      created_at: studentData.created_at || new Date().toISOString()
    };

    const { data, error } = await client.from('students').upsert(payload, { onConflict: 'email' });
    if (error) {
      console.warn('Supabase student sync failed:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Supabase student sync error:', error.message);
    return null;
  }
}

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  
  let error = null;
  if (req.query.error === 'admin_required') {
    error = 'Administrator access required. Please sign in with an admin account.';
  }
  
  res.render('login', {
    error: error,
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
  const {
    full_name,
    first_name,
    middle_name,
    last_name,
    email,
    phone,
    county,
    town,
    physical_address,
    church_name,
    ministry_role,
    years_in_ministry,
    emergency_contact_name,
    emergency_contact_phone,
    relationship,
    password,
    confirm_password
  } = req.body;

  const cleanFirstName = (first_name || full_name || '').trim();
  const cleanMiddleName = (middle_name || '').trim();
  const cleanLastName = (last_name || '').trim();
  const cleanFullName = (full_name || [cleanFirstName, cleanMiddleName, cleanLastName].filter(Boolean).join(' ')).trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPhone = (phone || '').trim();
  const cleanCounty = (county || '').trim();
  const cleanTown = (town || '').trim();
  const cleanPhysicalAddress = (physical_address || '').trim();
  const cleanChurchName = (church_name || '').trim();
  const cleanMinistryRole = (ministry_role || '').trim();
  const cleanYearsInMinistry = Number(years_in_ministry || 0);
  const cleanEmergencyContactName = (emergency_contact_name || '').trim();
  const cleanEmergencyContactPhone = (emergency_contact_phone || '').trim();
  const cleanRelationship = (relationship || '').trim();
  const cleanPass = (password || '').trim();
  const cleanConfirmPass = (confirm_password || '').trim();

  if (!cleanFullName || !cleanEmail || !cleanPhone || !cleanPass || !cleanConfirmPass) {
    return res.render('register', {
      error: 'Full name, email, phone number, and password are required.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  if (cleanPass !== cleanConfirmPass) {
    return res.render('register', {
      error: 'Passwords do not match.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  if (cleanPass.length < 6) {
    return res.render('register', {
      error: 'Password must be at least 6 characters.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  const users = getUsers();
  const duplicateEmail = users.some(u => u.email && u.email.toLowerCase() === cleanEmail);
  const duplicatePhone = users.some(u => u.phone && normalizePhone(u.phone) === normalizePhone(cleanPhone));

  if (duplicateEmail) {
    return res.render('register', {
      error: 'An account with this email already exists.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  if (duplicatePhone) {
    return res.render('register', {
      error: 'A student with this phone number already exists.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  if (!supabaseAdmin) {
    return res.render('register', {
      error: 'Student self-registration is not available yet because Supabase admin credentials are not configured.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  let authUser = null;
  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPass,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
        role: 'student'
      }
    });

    if (authError) {
      console.error('Supabase admin createUser failed:', authError.message);
      return res.render('register', {
        error: authError.message || 'Unable to create student account.',
        title: 'Apply for Pastoral Training | Pastors LMS',
        formData: {
          full_name: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          county: cleanCounty,
          town: cleanTown,
          physical_address: cleanPhysicalAddress,
          church_name: cleanChurchName,
          ministry_role: cleanMinistryRole,
          years_in_ministry: cleanYearsInMinistry,
          emergency_contact_name: cleanEmergencyContactName,
          emergency_contact_phone: cleanEmergencyContactPhone,
          relationship: cleanRelationship
        }
      });
    }

    authUser = authData?.user || null;
  } catch (err) {
    console.error('Supabase admin createUser exception:', err.message);
    return res.render('register', {
      error: 'Unable to create your account right now. Please try again later.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
    });
  }

  const username = generateStudentUsername(users);
  const studentId = `STU-${Date.now().toString().slice(-6)}`;
  const profile = {
    auth_user_id: authUser.id,
    username,
    email: cleanEmail,
    full_name: cleanFullName,
    first_name: cleanFirstName,
    middle_name: cleanMiddleName,
    last_name: cleanLastName,
    phone: cleanPhone,
    county: cleanCounty,
    town: cleanTown,
    physical_address: cleanPhysicalAddress,
    church_name: cleanChurchName,
    ministry_role: cleanMinistryRole,
    years_in_ministry: cleanYearsInMinistry,
    emergency_contact_name: cleanEmergencyContactName,
    emergency_contact_phone: cleanEmergencyContactPhone,
    relationship: cleanRelationship,
    student_id: studentId,
    role: 'student',
    status: 'active',
    approval_status: 'approved',
    created_at: new Date().toISOString()
  };

  try {
    console.log('Attempting student profile insert with:', { auth_user_id: profile.auth_user_id, username: profile.username, email: profile.email });
    
    // Always use admin client for profile insert to bypass RLS
    if (!supabaseAdmin) {
      console.error('Supabase admin client not available for profile insert');
      return res.render('register', {
        error: 'Student account was created but profile storage failed. Admin client not configured.',
        title: 'Apply for Pastoral Training | Pastors LMS',
        formData: {
          full_name: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          county: cleanCounty,
          town: cleanTown,
          physical_address: cleanPhysicalAddress,
          church_name: cleanChurchName,
          ministry_role: cleanMinistryRole,
          years_in_ministry: cleanYearsInMinistry,
          emergency_contact_name: cleanEmergencyContactName,
          emergency_contact_phone: cleanEmergencyContactPhone,
          relationship: cleanRelationship
        }
      });
    }
    
    const { error: studentInsertError, data: studentInsertData } = await supabaseAdmin.from('students').upsert([profile], { onConflict: 'username' }).select();

    if (studentInsertError) {
      console.error('Student profile insert failed:', studentInsertError.message);
      console.error('Full error details:', JSON.stringify(studentInsertError, null, 2));
      return res.render('register', {
        error: `Student account was created but profile storage failed: ${studentInsertError.message}. Details: ${JSON.stringify(studentInsertError)}`,
        title: 'Apply for Pastoral Training | Pastors LMS',
        formData: {
          full_name: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          county: cleanCounty,
          town: cleanTown,
          physical_address: cleanPhysicalAddress,
          church_name: cleanChurchName,
          ministry_role: cleanMinistryRole,
          years_in_ministry: cleanYearsInMinistry,
          emergency_contact_name: cleanEmergencyContactName,
          emergency_contact_phone: cleanEmergencyContactPhone,
          relationship: cleanRelationship
        }
      });
    }

    res.render('register-success', {
      title: 'Account Created | Pastors LMS',
      username: username,
      full_name: cleanFullName,
      approval_status: 'approved'
    });
  } catch (err) {
    console.error('Error saving student profile:', err);
    return res.render('register', {
      error: 'Failed to submit application. Please try again.',
      title: 'Apply for Pastoral Training | Pastors LMS',
      formData: {
        full_name: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        county: cleanCounty,
        town: cleanTown,
        physical_address: cleanPhysicalAddress,
        church_name: cleanChurchName,
        ministry_role: cleanMinistryRole,
        years_in_ministry: cleanYearsInMinistry,
        emergency_contact_name: cleanEmergencyContactName,
        emergency_contact_phone: cleanEmergencyContactPhone,
        relationship: cleanRelationship
      }
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

  console.log('Login attempt for username:', cleanUsername);

  // 1. Try Supabase Auth if configured
  if (supabase) {
    try {
      // Check if input is email or username
      const isEmail = cleanUsername.includes('@');
      let emailToUse = cleanUsername;
      
      // If it's a username, try to find the email
      if (!isEmail) {
        // First check local users.json for existing users
        const users = getUsers();
        const localUser = users.find(u => u.username === cleanUsername);
        if (localUser && localUser.email) {
          emailToUse = localUser.email;
          console.log('Found email for username from local users:', emailToUse);
        } else {
          // If not in local users, try to find in Supabase students table
          const { data: studentData, error: studentError } = await (supabaseAdmin || supabase)
            .from('students')
            .select('email')
            .eq('username', cleanUsername)
            .maybeSingle();
          
          if (!studentError && studentData && studentData.email) {
            emailToUse = studentData.email;
            console.log('Found email for username from Supabase:', emailToUse);
          } else {
            console.log('Username not found in local users or Supabase, trying as email');
          }
        }
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: cleanPass
      });

      if (error) {
        throw error;
      }

      if (data && data.user) {
        const { data: profileRow, error: profileError } = await (supabaseAdmin || supabase)
          .from('students')
          .select('*')
          .eq('auth_user_id', data.user.id)
          .maybeSingle();

        const role = profileRow?.role || data.user.user_metadata?.role || 'student';
        const fullName = profileRow?.full_name || data.user.user_metadata?.full_name || cleanUsername;

        req.session.user = {
          id: data.user.id,
          username: profileRow?.username || data.user.user_metadata?.username || cleanUsername,
          email: data.user.email,
          full_name: fullName,
          role,
          initials: (fullName || 'Pastor').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        };

        console.log('Supabase login successful for:', cleanUsername);
        if (profileError && profileError.code !== 'PGRST116') {
          console.warn('Student profile lookup warning:', profileError.message);
        }
        return req.session.save(() => res.redirect('/'));
      }
    } catch (err) {
      console.warn('Supabase auth failed or not available, checking local fallback:', err.message);
      // Fall through to local users.json check
    }
  }

  // 2. Local Fallback Auth
  const users = getUsers();
  const matchedUser = users.find(u => {
    const usernameMatches = u.username === cleanUsername || u.email === cleanUsername;
    if (!usernameMatches) return false;
    if (!u.password) return false;
    if (u.password === cleanPass) return true;
    try {
      return bcrypt.compareSync(cleanPass, u.password);
    } catch (err) {
      return false;
    }
  });

  console.log('Matched user:', matchedUser ? matchedUser.username : 'none');

  if (matchedUser) {
    const initials = (matchedUser.full_name || matchedUser.email || 'Pastor')
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

    console.log('Local login successful for:', cleanUsername, 'with role:', matchedUser.role);

    return req.session.save(() => {
      res.redirect('/');
    });
  }

  // Failed login
  console.log('Login failed for:', cleanUsername);
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
