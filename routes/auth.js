const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcrypt');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { resolveUserCountryCode } = require('../middleware/auth');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const FALLBACK_USERS_FILE = path.join(os.tmpdir(), 'pastors-lms-users.json');

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

// Load fallback users from JSON (merging any runtime password updates from tmpdir)
function getUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const baseUsers = JSON.parse(raw);
    try {
      if (fs.existsSync(FALLBACK_USERS_FILE)) {
        const tmpUsers = JSON.parse(fs.readFileSync(FALLBACK_USERS_FILE, 'utf8'));
        if (Array.isArray(tmpUsers)) {
          return baseUsers.map(u => {
            const over = tmpUsers.find(t => (t.username && t.username === u.username) || (t.email && t.email === u.email));
            return over ? { ...u, ...over } : u;
          });
        }
      }
    } catch {
      // Ignore tmp read error
    }
    return baseUsers;
  } catch (err) {
    console.error('Error reading users.json:', err);
    return [];
  }
}

function saveUsersList(users) {
  const serialized = JSON.stringify(users, null, 2);
  try {
    fs.writeFileSync(USERS_FILE, serialized, 'utf8');
    return true;
  } catch {
    try {
      fs.writeFileSync(FALLBACK_USERS_FILE, serialized, 'utf8');
      return true;
    } catch {
      return false;
    }
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
      role: u.role || 'student',
      country_code: resolveUserCountryCode(u) || 'KE'
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

// POST /forgot-password (Identity-Verified Password Reset)
router.post('/forgot-password', async (req, res) => {
  const { identifier, phone, new_password, confirm_password } = req.body;
  const cleanId = (identifier || '').trim().replace(/^@+/, '');
  const cleanPhone = (phone || '').trim();
  const cleanNewPass = (new_password || '').trim();
  const cleanConfirmPass = (confirm_password || '').trim();

  const renderForgotError = (msg) => res.render('forgot-password', {
    title: 'Forgot Password | Pastors LMS',
    error: msg,
    success: null,
    identifier: cleanId,
    phone: cleanPhone
  });

  if (!cleanId || !cleanPhone) {
    return renderForgotError('Please enter both your email/username AND your registered phone number to verify your identity.');
  }

  if (!cleanNewPass || !cleanConfirmPass) {
    return renderForgotError('Please enter and confirm your new password.');
  }

  if (cleanNewPass.length < 6) {
    return renderForgotError('Your new password must be at least 6 characters.');
  }

  if (cleanNewPass !== cleanConfirmPass) {
    return renderForgotError('New password and confirmation password do not match.');
  }

  const inputLower = cleanId.toLowerCase();
  const verifyPhone = normalizePhone(cleanPhone);
  if (!verifyPhone || verifyPhone.length < 9) {
    return renderForgotError('Please enter a valid registered phone number for verification.');
  }

  let targetEmail = cleanId.includes('@') ? inputLower : null;
  let pastorName = 'Pastor';
  let loginHandle = cleanId;
  let resetSucceeded = false;

  // 1. Check local users.json — MUST match BOTH (email/username/student_id) AND registered phone!
  const users = getUsers();
  const matchedIndex = users.findIndex(u => {
    const matchIdOrEmail =
      (u.username && u.username.toLowerCase() === inputLower) ||
      (u.student_id && u.student_id.toLowerCase() === inputLower) ||
      (u.email && u.email.toLowerCase() === inputLower);
    const matchPhone = u.phone && normalizePhone(u.phone) === verifyPhone;
    return matchIdOrEmail && matchPhone;
  });

  if (matchedIndex >= 0) {
    const matched = users[matchedIndex];
    if (['admin', 'super_admin'].includes(matched.role)) {
      return renderForgotError('For security, administrator passwords cannot be reset through the public form.');
    }
    targetEmail = matched.email || targetEmail;
    pastorName = matched.full_name || 'Pastor';
    loginHandle = matched.username || matched.email || cleanId;
    users[matchedIndex].password = bcrypt.hashSync(cleanNewPass, 10);
    saveUsersList(users);
    resetSucceeded = true;
  }

  // 2. Also check & update in Supabase Auth if configured (requiring BOTH identifier + phone match)
  if (supabaseAdmin || supabase) {
    try {
      const lookupClient = supabaseAdmin || supabase;
      let studentRow = null;

      for (const col of ['username', 'student_id', 'email']) {
        const { data } = await lookupClient.from('students').select('*').ilike(col, cleanId).limit(1).maybeSingle();
        if (data) {
          studentRow = data;
          break;
        }
      }

      if (studentRow) {
        if (['admin', 'super_admin'].includes(studentRow.role)) {
          return renderForgotError('For security, administrator passwords cannot be reset through the public form.');
        }
        const rowPhone = normalizePhone(studentRow.phone || '');
        if (!rowPhone || rowPhone !== verifyPhone) {
          studentRow = null; // Phone number did not match!
        } else {
          targetEmail = studentRow.email || targetEmail;
          pastorName = studentRow.full_name || pastorName;
          loginHandle = studentRow.username || studentRow.email || loginHandle;
        }
      }

      if (supabaseAdmin && targetEmail && (studentRow || matchedIndex >= 0)) {
        let authUserId = studentRow?.auth_user_id || null;
        if (!authUserId) {
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
          const existingAuth = (listData?.users || []).find(
            u => u.email && u.email.toLowerCase() === targetEmail.toLowerCase()
          );
          if (existingAuth) {
            authUserId = existingAuth.id;
          }
        }

        if (authUserId) {
          const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
            password: cleanNewPass,
            email_confirm: true
          });
          if (!updateErr) {
            resetSucceeded = true;
          } else {
            console.warn('Supabase updateUserById warning:', updateErr.message);
          }
        } else {
          const { data: createdAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: targetEmail,
            password: cleanNewPass,
            email_confirm: true,
            user_metadata: {
              full_name: pastorName,
              username: loginHandle
            }
          });
          if (!createErr && createdAuth?.user) {
            resetSucceeded = true;
            if (studentRow && studentRow.id) {
              await supabaseAdmin.from('students').update({ auth_user_id: createdAuth.user.id }).eq('id', studentRow.id);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Supabase password reset error:', err.message);
    }
  }

  if (!resetSucceeded) {
    return renderForgotError('Verification failed: the email/username and registered phone number did not match our records.');
  }

  return res.render('forgot-password', {
    title: 'Forgot Password | Pastors LMS',
    error: null,
    success: {
      message: `Your password for ${pastorName} (${loginHandle}) has been updated. You can now sign in immediately with your new password.`,
      targetEmail,
      pastorName
    },
    identifier: loginHandle
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
    country,
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
  const cleanCountry = (country || '').trim();
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
  const registeredCountryCode = resolveUserCountryCode({
    country: cleanCountry,
    phone: cleanPhone,
    county: cleanCounty,
    town: cleanTown,
    cohort: cleanCohort,
    physical_address: cleanPhysicalAddress
  }) || 'KE';
  res.locals.registeredCountryCode = registeredCountryCode;

  const formData = {
    first_name: cleanFirstName,
    last_name: cleanLastName,
    age: cleanAge || '',
    cohort: cleanCohort,
    email: cleanEmail,
    phone: cleanPhone,
    country: cleanCountry,
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
        country: cleanCountry || undefined,
        country_code: registeredCountryCode,
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

    // Also mirror the new student into local data/users.json so local & Supabase always match
    const localUsers = getUsers();
    const localRecord = {
      ...extendedProfile,
      country: cleanCountry || 'Kenya',
      country_code: registeredCountryCode,
      password: bcrypt.hashSync(cleanPass, 10)
    };
    const existingIdx = localUsers.findIndex(u =>
      (u.email && u.email.toLowerCase() === cleanEmail) ||
      (u.username && u.username.toLowerCase() === username.toLowerCase())
    );
    if (existingIdx >= 0) {
      localUsers[existingIdx] = { ...localUsers[existingIdx], ...localRecord };
    } else {
      localUsers.push(localRecord);
    }
    saveUsersList(localUsers);

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
  // Strip any leading '@' in case a user types their handle as '@p1000000'
  const cleanUsername = (username || '').trim().replace(/^@+/, '');
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
        role: u.role || 'student',
        country_code: resolveUserCountryCode(u) || 'KE'
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

  console.log('=== LOGIN DEBUG ===');
  console.log('[LOGIN] Raw input:', JSON.stringify(username), '-> Clean:', JSON.stringify(cleanUsername), '| Supabase configured:', !!supabase, '| SupabaseAdmin configured:', !!supabaseAdmin);
  const inputLower = cleanUsername.toLowerCase();
  const inputPhone = normalizePhone(cleanUsername);

  // If user checked 'remember_me', keep session for 30 days
  if (remember_me && req.session) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  // 1. Try Supabase Auth if configured
  if (supabase) {
    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanUsername);
      let emailToUse = cleanUsername;
      console.log('[LOGIN] Step 1 Supabase Auth | isEmail:', isEmail);
      
      // If it's a username or phone number, check Supabase FIRST (source of truth), then local users.json
      if (!isEmail) {
        const lookupClient = supabaseAdmin || supabase;
        let studentData = null;

        // 1. Try username case-insensitively in Supabase
        const userRes = await lookupClient
          .from('students')
          .select('email')
          .ilike('username', cleanUsername)
          .limit(1)
          .maybeSingle();

        console.log('[LOGIN] Supabase username lookup:', { found: !!userRes.data?.email, error: userRes.error?.message || null });
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
          console.log('[LOGIN] Supabase student_id lookup:', { found: !!idRes.data?.email, error: idRes.error?.message || null });
          if (!idRes.error && idRes.data && idRes.data.email) {
            studentData = idRes.data;
          }
        }

        // 3. Try phone number (raw, 07..., +2547..., 2547...) if not found
        if (!studentData && inputPhone) {
          const phoneVariants = new Set([cleanUsername, inputPhone]);
          if (inputPhone.startsWith('0') && inputPhone.length === 10) {
            phoneVariants.add('+254' + inputPhone.slice(1));
            phoneVariants.add('254' + inputPhone.slice(1));
          }
          for (const phoneVal of phoneVariants) {
            if (!phoneVal) continue;
            const phoneRes = await lookupClient
              .from('students')
              .select('email')
              .eq('phone', phoneVal)
              .limit(1)
              .maybeSingle();
            if (!phoneRes.error && phoneRes.data && phoneRes.data.email) {
              studentData = phoneRes.data;
              console.log('[LOGIN] Supabase phone lookup matched:', phoneVal, '->', studentData.email);
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
            console.log('[LOGIN] Supabase full_name lookup matched:', studentData.email);
          }
        }

        // 5. Try Supabase Auth metadata lookup if admin client is available
        if (!studentData && supabaseAdmin) {
          try {
            const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
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
                console.log('[LOGIN] Found email from Supabase Auth admin metadata:', found.email);
              }
            }
          } catch (errList) {
            console.warn('[LOGIN] Supabase auth.admin.listUsers error:', errList.message);
          }
        }

        if (studentData && studentData.email) {
          emailToUse = studentData.email;
          console.log('[LOGIN] Resolved identifier to Supabase email:', emailToUse);
        } else {
          // 6. Fallback to local users.json only if not found in Supabase
          const users = getUsers();
          const localUser = users.find(u => {
            const matchU = u.username && u.username.toLowerCase() === inputLower;
            const matchId = u.student_id && u.student_id.toLowerCase() === inputLower;
            const matchP = inputPhone && u.phone && normalizePhone(u.phone) === inputPhone;
            return matchU || matchId || matchP;
          });
          if (localUser && localUser.email) {
            emailToUse = localUser.email;
            console.log('[LOGIN] Resolved identifier from local users.json fallback:', emailToUse);
          } else {
            console.log('[LOGIN] Could not resolve identifier to any email in Supabase or local users.json');
          }
        }
      }
      
      if (emailToUse && emailToUse.includes('@')) {
        console.log('[LOGIN] Calling supabase.auth.signInWithPassword for email:', emailToUse);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password: cleanPass
        });

        if (error) {
          console.warn('[LOGIN] Supabase signInWithPassword error:', error.message, '| status:', error.status);
          throw error;
        }

        if (data && data.user) {
          const lookupClient = supabaseAdmin || supabase;
          let { data: profileRow, error: profileError } = await lookupClient
            .from('students')
            .select('*')
            .eq('auth_user_id', data.user.id)
            .maybeSingle();

          if (!profileRow && data.user.email) {
            const byEmail = await lookupClient
              .from('students')
              .select('*')
              .ilike('email', data.user.email)
              .limit(1)
              .maybeSingle();
            if (!byEmail.error && byEmail.data) {
              profileRow = byEmail.data;
            }
          }

          const localMatched = getUsers().find(u =>
            (data.user.email && u.email && u.email.toLowerCase() === data.user.email.toLowerCase()) ||
            (u.username && u.username.toLowerCase() === inputLower) ||
            (u.student_id && u.student_id.toLowerCase() === inputLower) ||
            (inputPhone && u.phone && normalizePhone(u.phone) === inputPhone)
          );

          const fullName = profileRow?.full_name || localMatched?.full_name || data.user.user_metadata?.full_name || cleanUsername;
          const resolvedUsername = profileRow?.username || localMatched?.username || data.user.user_metadata?.username || cleanUsername;

          const candidateRoles = [
            profileRow?.role,
            data.user.app_metadata?.role,
            localMatched?.role,
            data.user.user_metadata?.role,
            (data.user.email && data.user.email.toLowerCase() === 'info@intendiscafrica.org') ? 'super_admin' : null,
            /\b(ida\s+office\s+admin|system\s+admin)\b/i.test(`${fullName} ${profileRow?.ministry_role || ''}`) ? 'super_admin' : null,
            /^a\d{6,}$/i.test(resolvedUsername) ? 'admin' : null,
            /^t\d{6,}$/i.test(resolvedUsername) ? 'teacher' : null
          ].filter(Boolean);
          const rolePriority = ['super_admin', 'admin', 'teacher', 'student'];
          const role = rolePriority.find(r => candidateRoles.includes(r)) || 'student';
          const countryCode =
            resolveUserCountryCode(profileRow) ||
            resolveUserCountryCode(localMatched) ||
            resolveUserCountryCode(data.user.user_metadata) ||
            'KE';

          // Mirror authenticated Supabase user & password hash into local data/users.json
          try {
            const currentUsers = getUsers();
            const syncedEntry = {
              ...(localMatched || {}),
              ...(profileRow || {}),
              username: resolvedUsername,
              email: data.user.email,
              full_name: fullName,
              role,
              country_code: countryCode,
              status: profileRow?.status || localMatched?.status || 'active',
              approval_status: profileRow?.approval_status || localMatched?.approval_status || 'approved',
              password: bcrypt.hashSync(cleanPass, 10)
            };
            const idx = currentUsers.findIndex(u =>
              (u.username && u.username.toLowerCase() === resolvedUsername.toLowerCase()) ||
              (u.email && u.email.toLowerCase() === (data.user.email || '').toLowerCase())
            );
            if (idx >= 0) {
              currentUsers[idx] = syncedEntry;
            } else {
              currentUsers.push(syncedEntry);
            }
            saveUsersList(currentUsers);
          } catch (syncErr) {
            console.warn('Local users.json sync on login warning:', syncErr.message);
          }

          req.session.user = {
            id: data.user.id,
            username: resolvedUsername,
            email: data.user.email,
            full_name: fullName,
            role,
            country_code: countryCode,
            initials: (fullName || 'Pastor').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
          };

          console.log('Supabase login successful for:', cleanUsername, 'with role:', role);
          if (profileError && profileError.code !== 'PGRST116') {
            console.warn('Student profile lookup warning:', profileError.message);
          }
          const targetRedirect = ['admin', 'super_admin'].includes(role)
            ? '/admin/dashboard'
            : (role === 'teacher' ? '/teacher/library' : '/');
          return req.session.save(() => res.redirect(targetRedirect));
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

  console.log('[LOGIN] Local fallback matched user:', matchedUser ? `${matchedUser.username} (role: ${matchedUser.role})` : 'none');

  if (!matchedUser) {
    // Explain the failure without logging the password itself
    const knownUser = users.find(u =>
      (u.username && u.username.toLowerCase() === inputLower) ||
      (u.student_id && u.student_id.toLowerCase() === inputLower) ||
      (u.email && u.email.toLowerCase() === inputLower) ||
      (inputPhone && u.phone && normalizePhone(u.phone) === inputPhone)
    );
    if (!knownUser) {
      console.log('[LOGIN DIAGNOSIS] No local account matches:', cleanUsername);
    } else if (!knownUser.password) {
      console.log('[LOGIN DIAGNOSIS] Account found but has no local password set:', knownUser.username);
    } else {
      console.log(`[LOGIN DIAGNOSIS] Account "${knownUser.username}" (${knownUser.email}) found in users.json, but password did not match local hash (typed length: ${cleanPass.length}). NOTE: If password was set in Supabase, ensure .env has SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.`);
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
      country_code: resolveUserCountryCode(matchedUser) || 'KE',
      initials: initials || 'P'
    };

    console.log('Local login successful for:', cleanUsername, 'with role:', matchedUser.role);

    const localRole = matchedUser.role || 'student';
    const targetRedirect = ['admin', 'super_admin'].includes(localRole)
      ? '/admin/dashboard'
      : (localRole === 'teacher' ? '/teacher/library' : '/');

    return req.session.save(() => {
      res.redirect(targetRedirect);
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
