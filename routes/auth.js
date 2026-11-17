const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { supabase, supabaseAdmin } = require('../config/supabase');

let sharp = null;
try {
  sharp = require('sharp');
} catch {
  // sharp optional in constrained environments
}

/**
 * Decode a base64 image data URL, optimize to WebP in public/uploads/profiles,
 * and fall back to returning the compact data URL if disk write fails.
 */
async function saveProfilePicture(dataUrl, username) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
  if (!match) return null;

  try {
    const buffer = Buffer.from(match[1], 'base64');
    const dir = path.join(__dirname, '../public/uploads/profiles');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${username}.webp`;
    const filePath = path.join(dir, filename);

    if (sharp) {
      await sharp(buffer).resize(320, 320, { fit: 'cover' }).webp({ quality: 85 }).toFile(filePath);
    } else {
      fs.writeFileSync(filePath, buffer);
    }
    return `/uploads/profiles/${filename}`;
  } catch (err) {
    console.warn('Could not save profile picture to disk, storing data URL fallback:', err.message);
    return dataUrl;
  }
}

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

// GET /forgot-password
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    title: 'Forgot Password | Pastors LMS',
    error: null,
    success: null,
    identifier: req.query.username || ''
  });
});

// POST /forgot-password
router.post('/forgot-password', async (req, res) => {
  const { identifier } = req.body;
  const cleanId = (identifier || '').trim();

  if (!cleanId) {
    return res.render('forgot-password', {
      title: 'Forgot Password | Pastors LMS',
      error: 'Please enter your phone number, email address, or username.',
      success: null,
      identifier: ''
    });
  }

  const isEmail = cleanId.includes('@');
  let targetEmail = isEmail ? cleanId.toLowerCase() : null;
  let pastorName = 'Pastor';
  const inputLower = cleanId.toLowerCase();
  const inputPhone = normalizePhone(cleanId);

  // 1. Look up in local users
  const users = getUsers();
  const matched = users.find(u => {
    const matchU = u.username && u.username.toLowerCase() === inputLower;
    const matchId = u.student_id && u.student_id.toLowerCase() === inputLower;
    const matchE = u.email && u.email.toLowerCase() === inputLower;
    const matchP = inputPhone && u.phone && normalizePhone(u.phone) === inputPhone;
    return matchU || matchId || matchE || matchP;
  });

  if (matched) {
    targetEmail = matched.email;
    pastorName = matched.full_name || 'Pastor';
  } else if (!targetEmail && (supabaseAdmin || supabase)) {
    // Look up in Supabase
    try {
      const lookupClient = supabaseAdmin || supabase;
      for (const col of ['username', 'student_id']) {
        const { data } = await lookupClient.from('students').select('email, full_name').ilike(col, cleanId).maybeSingle();
        if (data && data.email) {
          targetEmail = data.email;
          pastorName = data.full_name || 'Pastor';
          break;
        }
      }
      if (!targetEmail && inputPhone) {
        const { data } = await lookupClient.from('students').select('email, full_name').eq('phone', cleanId).maybeSingle();
        if (data && data.email) {
          targetEmail = data.email;
          pastorName = data.full_name || 'Pastor';
        }
      }
    } catch (err) {
      console.warn('Supabase lookup in forgot-password error:', err.message);
    }
  }

  let emailSent = false;
  if (targetEmail && supabase) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail);
      if (!error) {
        emailSent = true;
      } else {
        console.warn('Supabase resetPasswordForEmail warning:', error.message);
      }
    } catch (e) {
      console.warn('Supabase password reset exception:', e.message);
    }
  }

  const waText = encodeURIComponent(
    `Hello Pastor Hark & IDA Admin, I need help resetting my Pastors LMS password. My name/ID is ${pastorName} (${cleanId}).`
  );
  const waUrl = `https://wa.me/254707821269?text=${waText}`;

  return res.render('forgot-password', {
    title: 'Forgot Password | Pastors LMS',
    error: null,
    success: {
      message: emailSent
        ? `A password reset link has been dispatched to ${targetEmail}. Please check your inbox.`
        : `Your reset request has been recorded for ${cleanId}. If you need immediate access, you can also reach our administrative desk directly on WhatsApp.`,
      emailSent,
      targetEmail,
      waUrl,
      pastorName
    },
    identifier: cleanId
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
    age,
    cohort,
    email,
    phone,
    county,
    town,
    physical_address,
    church_name,
    church_size,
    ministry_role,
    years_in_ministry,
    emergency_contact_name,
    emergency_contact_phone,
    relationship,
    profile_picture_data,
    password,
    confirm_password
  } = req.body;

  const cleanFirstName = (first_name || '').trim();
  const cleanMiddleName = (middle_name || '').trim();
  const cleanLastName = (last_name || '').trim();
  const cleanFullName = ([cleanFirstName, cleanMiddleName, cleanLastName].filter(Boolean).join(' ') || (full_name || '')).trim();
  const cleanAge = age ? Number(age) : null;
  const cleanCohort = (cohort || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPhone = (phone || '').trim();
  const cleanCounty = (county || '').trim();
  const cleanTown = (town || '').trim();
  const cleanPhysicalAddress = (physical_address || '').trim();
  const cleanChurchName = (church_name || '').trim();
  const cleanChurchSize = (church_size || '').trim();
  const cleanMinistryRole = (ministry_role || '').trim();
  const cleanYearsInMinistry = Number(years_in_ministry || 0);
  const cleanEmergencyContactName = (emergency_contact_name || '').trim();
  const cleanEmergencyContactPhone = (emergency_contact_phone || '').trim();
  const cleanRelationship = (relationship || '').trim();
  const cleanPass = (password || '').trim();
  const cleanConfirmPass = (confirm_password || '').trim();

  const formData = {
    first_name: cleanFirstName,
    last_name: cleanLastName,
    age: cleanAge || '',
    cohort: cleanCohort,
    email: cleanEmail,
    phone: cleanPhone,
    county: cleanCounty,
    town: cleanTown,
    physical_address: cleanPhysicalAddress,
    church_name: cleanChurchName,
    church_size: cleanChurchSize,
    ministry_role: cleanMinistryRole,
    years_in_ministry: cleanYearsInMinistry,
    emergency_contact_name: cleanEmergencyContactName,
    emergency_contact_phone: cleanEmergencyContactPhone,
    relationship: cleanRelationship,
    profile_picture_data: profile_picture_data || ''
  };

  const renderRegisterError = (errorMsg) => res.render('register', {
    error: errorMsg,
    title: 'Apply for Pastoral Training | Pastors LMS',
    formData
  });

  if (!cleanFirstName || !cleanLastName || !cleanEmail || !cleanPhone || !cleanPass || !cleanConfirmPass) {
    return renderRegisterError('First name, last name, email, phone number, and password are required.');
  }

  if (cleanPass !== cleanConfirmPass) {
    return renderRegisterError('Passwords do not match.');
  }
  if (cleanPass.length < 6) {
    return renderRegisterError('Password must be at least 6 characters.');
  }

  const users = getUsers();
  const duplicateEmail = users.some(u => u.email && u.email.toLowerCase() === cleanEmail);
  const duplicatePhone = users.some(u => u.phone && normalizePhone(u.phone) === normalizePhone(cleanPhone));

  if (duplicateEmail) {
    return renderRegisterError('An account with this email already exists.');
  }

  if (duplicatePhone) {
    return renderRegisterError('A student with this phone number already exists.');
  }

  if (!supabaseAdmin) {
    return renderRegisterError('Student self-registration is not available yet because Supabase admin credentials are not configured.');
  }

  const username = await generateStudentUsername(users, supabaseAdmin);
  const studentId = `IDA-${Date.now().toString().slice(-6)}`;
  const profilePictureUrl = await saveProfilePicture(profile_picture_data, username);

  let authUser = null;
  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPass,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
        username,
        student_id: studentId,
        phone: cleanPhone,
        cohort: cleanCohort,
        church_size: cleanChurchSize,
        age: cleanAge,
        profile_picture: profilePictureUrl,
        role: 'student'
      }
    });

    if (authError) {
      console.error('Supabase admin createUser failed:', authError.message);
      return renderRegisterError(authError.message || 'Unable to create student account.');
    }

    authUser = authData?.user || null;
  } catch (err) {
    console.error('Supabase admin createUser exception:', err.message);
    return renderRegisterError('Unable to create your account right now. Please try again later.');
  }

  const baseProfile = {
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

  const extendedProfile = {
    ...baseProfile,
    cohort: cleanCohort || null,
    church_size: cleanChurchSize || null,
    age: cleanAge,
    profile_picture: profilePictureUrl
  };

  try {
    console.log('Attempting student profile insert with:', { auth_user_id: baseProfile.auth_user_id, username: baseProfile.username, email: baseProfile.email });

    let { error: studentInsertError } = await supabaseAdmin.from('students').insert([extendedProfile]).select();

    // If new columns (cohort, church_size, age, profile_picture) have not yet been migrated in Supabase,
    // retry with the base schema so registration never breaks.
    if (studentInsertError && /column|schema cache/i.test(studentInsertError.message || '')) {
      console.warn('Extended columns missing in Supabase students table (run supabase/add-signup-fields.sql). Falling back to base columns.');
      const retry = await supabaseAdmin.from('students').insert([baseProfile]).select();
      studentInsertError = retry.error;
    }

    if (studentInsertError) {
      console.error('Student profile insert failed:', studentInsertError.message);
      console.error('Full error details:', JSON.stringify(studentInsertError, null, 2));
      return renderRegisterError(`Student account was created but profile storage failed: ${studentInsertError.message}. Details: ${JSON.stringify(studentInsertError)}`);
    }

    res.render('register-success', {
      title: 'Account Created | Pastors LMS',
      username: username,
      student_id: studentId,
      full_name: cleanFullName,
      email: cleanEmail,
      phone: cleanPhone,
      profile_picture: profilePictureUrl,
      approval_status: 'approved'
    });
  } catch (err) {
    console.error('Error saving student profile:', err);
    return renderRegisterError('Failed to submit application. Please try again.');
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
          const matchId = u.student_id && u.student_id.toLowerCase() === inputLower;
          const matchP = inputPhone && u.phone && normalizePhone(u.phone) === inputPhone;
          return matchU || matchId || matchP;
        });

        if (localUser && localUser.email) {
          emailToUse = localUser.email;
          console.log('Found email for identifier from local users:', emailToUse);
        } else {
          // Check Supabase students table by username, student_id, or phone
          const lookupClient = supabaseAdmin || supabase;
          let studentData = null;
          let studentError = null;
          
          // 1. Try username case-insensitively
          const userRes = await lookupClient
            .from('students')
            .select('email')
            .ilike('username', cleanUsername)
            .limit(1)
            .maybeSingle();
          
          if (!userRes.error && userRes.data && userRes.data.email) {
            studentData = userRes.data;
          }

          // 2. Try student_id case-insensitively if not found
          if (!studentData) {
            const idRes = await lookupClient
              .from('students')
              .select('email')
              .ilike('student_id', cleanUsername)
              .limit(1)
              .maybeSingle();
            if (!idRes.error && idRes.data && idRes.data.email) {
              studentData = idRes.data;
            }
          }

          // 3. Try phone number (both raw and normalized) if not found
          if (!studentData) {
            for (const phoneVal of [cleanUsername, inputPhone].filter(Boolean)) {
              const phoneRes = await lookupClient
                .from('students')
                .select('email')
                .eq('phone', phoneVal)
                .limit(1)
                .maybeSingle();
              if (!phoneRes.error && phoneRes.data && phoneRes.data.email) {
                studentData = phoneRes.data;
                break;
              }
            }
          }
          
          // 4. Try matching full_name case-insensitively if not found
          if (!studentData) {
            const nameRes = await lookupClient
              .from('students')
              .select('email')
              .ilike('full_name', cleanUsername)
              .limit(1)
              .maybeSingle();
            if (!nameRes.error && nameRes.data && nameRes.data.email) {
              studentData = nameRes.data;
            }
          }

          // 5. Try Supabase Auth metadata lookup if admin client is available
          if (!studentData && supabaseAdmin) {
            try {
              const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
              if (authList && authList.users) {
                const found = authList.users.find(u => {
                  const m = u.user_metadata || {};
                  const matchU = m.username && m.username.toLowerCase() === inputLower;
                  const matchId = m.student_id && m.student_id.toLowerCase() === inputLower;
                  const matchP = inputPhone && m.phone && normalizePhone(m.phone) === inputPhone;
                  return matchU || matchId || matchP;
                });
                if (found && found.email) {
                  studentData = { email: found.email };
                  console.log('Found email from Supabase Auth admin metadata:', found.email);
                }
              }
            } catch (errList) {
              console.warn('Supabase auth.admin.listUsers error:', errList.message);
            }
          }
          
          if (studentData && studentData.email) {
            emailToUse = studentData.email;
            console.log('Found email for identifier from Supabase:', emailToUse);
          }
        }
      }
      
      if (emailToUse && emailToUse.includes('@')) {
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

          // Never trust user_metadata for authorization (users can edit it). Use the students table or app_metadata.
          const role = profileRow?.role || data.user.app_metadata?.role || 'student';
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
      } else {
        console.log('Identifier did not resolve to an email address; attempting local fallback auth for:', cleanUsername);
      }
    } catch (err) {
      console.warn('Supabase auth failed or not available, checking local fallback:', err.message);
      // Fall through to local users.json check
    }
  }

  // 2. Local Fallback Auth (supports Username, Student ID, Email, OR Phone Number!)
  const users = getUsers();
  const matchedUser = users.find(u => {
    const usernameMatches = (u.username && u.username.toLowerCase() === inputLower) ||
                            (u.student_id && u.student_id.toLowerCase() === inputLower) ||
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

  if (!matchedUser) {
    // Explain the failure without logging the password itself
    const knownUser = users.find(u =>
      (u.username && u.username.toLowerCase() === inputLower) ||
      (u.student_id && u.student_id.toLowerCase() === inputLower) ||
      (u.email && u.email.toLowerCase() === inputLower) ||
      (inputPhone && u.phone && normalizePhone(u.phone) === inputPhone)
    );
    if (!knownUser) {
      console.log('Login diagnosis: no local account matches that username, email, or phone.');
    } else if (!knownUser.password) {
      console.log('Login diagnosis: account found but it has no local password set.');
    } else {
      console.log(`Login diagnosis: account "${knownUser.username}" found but password did not match (typed length: ${cleanPass.length}).`);
    }
  }

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
