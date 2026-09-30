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

async function generateStudentUsername(users, supabaseClient) {
  const prefix = 'p';
  let counter = 1000000;
  while (true) {
    const username = `${prefix}${counter}`;
    
    // Check local users
    const localExists = users.some((user) => user.username === username);
    if (localExists) {
      counter += 1;
      continue;
    }
    
    // Check Supabase if client is available
    if (supabaseClient) {
      try {
        const { data: existingUser, error } = await supabaseClient
          .from('students')
          .select('username')
          .eq('username', username)
          .maybeSingle();
        
        if (!error && existingUser) {
          counter += 1;
          continue;
        }
      } catch (err) {
        console.warn('Error checking Supabase for username:', err.message);
      }
    }
    
    return username;
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

// Normalize phone numbers for easy matching (e.g. +254712345678, 0712345678, 254712345678)
function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) {
    digits = '0' + digits.slice(3);
  }
  return digits;
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

  // Pass active registered pastors (without sensitive passwords) so returning pastors can quickly select their name
  const allUsers = getUsers();
  const registeredPastors = allUsers
    .filter(u => u.status === 'active' || u.approval_status === 'approved' || !u.approval_status)
    .map(u => ({
      username: u.username,
      full_name: u.full_name || 'Pastor',
      email: u.email || '',
      phone: u.phone || '',
      church_name: u.church_name || '',
      role: u.role || 'student'
    }));
  
  res.render('login', {
    error: error,
    title: 'Sign In | Pastors LMS',
    username: req.query.username || '',
    registeredPastors: registeredPastors
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

// GET /register-success
router.get('/register-success', (req, res) => {
  res.render('register-success', {
    title: 'Application Submitted | Pastors LMS',
    full_name: req.session?.user?.full_name || '',
    email: req.session?.user?.email || ''
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

  const username = await generateStudentUsername(users, supabaseAdmin);
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
    
    const { error: studentInsertError, data: studentInsertData } = await supabaseAdmin.from('students').insert([profile]).select();

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
  const { username, password, remember_me } = req.body;
  const cleanUsername = (username || '').trim();
  const cleanPass = (password || '').trim();

  // Helper to re-fetch registered pastors for template
  const getRegisteredPastors = () => {
    return getUsers()
      .filter(u => u.status === 'active' || u.approval_status === 'approved' || !u.approval_status)
      .map(u => ({
        username: u.username,
        full_name: u.full_name || 'Pastor',
        email: u.email || '',
        phone: u.phone || '',
        church_name: u.church_name || '',
        role: u.role || 'student'
      }));
  };

  if (!cleanUsername || !cleanPass) {
    return res.render('login', {
      error: 'Please enter your phone number, email, or username and your password.',
      title: 'Sign In | Pastors LMS',
      username: cleanUsername,
      registeredPastors: getRegisteredPastors()
    });
  }

  console.log('Login attempt for:', cleanUsername);
  const inputLower = cleanUsername.toLowerCase();
  const inputPhone = normalizePhone(cleanUsername);

  // If user checked 'remember_me', keep session for 30 days
  if (remember_me && req.session) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  // 1. Try Supabase Auth if configured
  if (supabase) {
    try {
      const isEmail = cleanUsername.includes('@');
      let emailToUse = cleanUsername;
      
      // If it's a username or phone number, find the email
      if (!isEmail) {
        const users = getUsers();
        const localUser = users.find(u => {
          const matchU = u.username && u.username.toLowerCase() === inputLower;
          const matchP = inputPhone && u.phone && normalizePhone(u.phone) === inputPhone;
          return matchU || matchP;
        });

        if (localUser && localUser.email) {
          emailToUse = localUser.email;
          console.log('Found email for identifier from local users:', emailToUse);
        } else {
          // Check Supabase students table by username or phone
          const { data: studentData, error: studentError } = await (supabaseAdmin || supabase)
            .from('students')
            .select('email')
            .or(`username.eq.${cleanUsername},phone.eq.${cleanUsername}`)
            .maybeSingle();
          
          if (!studentError && studentData && studentData.email) {
            emailToUse = studentData.email;
            console.log('Found email for identifier from Supabase:', emailToUse);
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

  // 2. Local Fallback Auth (supports Username, Email, OR Phone Number!)
  const users = getUsers();
  const matchedUser = users.find(u => {
    const usernameMatches = (u.username && u.username.toLowerCase() === inputLower) ||
                            (u.email && u.email.toLowerCase() === inputLower);
    const phoneMatches = inputPhone && u.phone && normalizePhone(u.phone) === inputPhone;
    
    if (!usernameMatches && !phoneMatches) return false;
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

  // Failed login with clear, non-confusing guidance
  console.log('Login failed for:', cleanUsername);
  return res.render('login', {
    error: 'Incorrect details. Please check your phone number, email, or password. If you need help, tap WhatsApp or Call below.',
    title: 'Sign In | Pastors LMS',
    username: cleanUsername,
    registeredPastors: getRegisteredPastors()
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
