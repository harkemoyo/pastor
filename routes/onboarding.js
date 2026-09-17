const express = require('express');
const router = express.Router();
const { supabase, getUserSupabaseClient } = require('../config/supabase');

// Authentication middleware for onboarding
function requireOnboardingAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Resolver for Supabase client: uses user-scoped client if access token exists to enforce RLS
function getClient(req) {
  if (req.session && req.session.accessToken) {
    const userClient = getUserSupabaseClient(req.session.accessToken);
    if (userClient) return userClient;
  }
  return supabase;
}

// GET /onboarding - Main Multi-Step Wizard View
router.get('/', requireOnboardingAuth, async (req, res) => {
  const client = getClient(req);
  const userId = req.session.user.id;

  let profile = null;
  let church = null;

  if (client) {
    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        profile = data;
        if (profile.church_id) {
          const { data: churchData } = await client
            .from('churches')
            .select('*')
            .eq('id', profile.church_id)
            .maybeSingle();
          if (churchData) {
            church = churchData;
          }
        }
      } else if (error) {
        console.warn('Profile fetch notice:', error.message);
      }
    } catch (err) {
      console.error('Error fetching profile for onboarding:', err);
    }
  }

  // Fallback profile if record not yet loaded from DB
  if (!profile) {
    profile = {
      id: userId,
      full_name: req.session.user.full_name || 'Pastor Candidate',
      ministry_role: 'other',
      years_in_ministry: 0,
      phone: '',
      onboarding_step: 1,
      status: 'pending',
      app_role: 'student'
    };
  }

  // Calculate view step: default to current saved step (1-5), allow visiting previous steps
  const maxAllowedStep = Math.min(Math.max(profile.onboarding_step || 1, 1), 5);
  let step = maxAllowedStep;
  const requestedStep = parseInt(req.query.step, 10);

  if (requestedStep && requestedStep >= 1 && requestedStep <= 5) {
    if (requestedStep <= maxAllowedStep) {
      step = requestedStep;
    }
  }

  res.render('onboarding', {
    title: `Onboarding Step ${step} | Pastors LMS`,
    step,
    profile,
    church,
    user: req.session.user,
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// POST /onboarding/step/1 - Account Verification
router.post('/step/1', requireOnboardingAuth, (req, res) => {
  // Step 1 displays already-created account info from Supabase Auth
  // Proceed directly to Step 2
  res.redirect('/onboarding?step=2');
});

// POST /onboarding/step/2 - Ministry Details
router.post('/step/2', requireOnboardingAuth, async (req, res) => {
  const { ministry_role, years_in_ministry, phone } = req.body;
  const client = getClient(req);
  const userId = req.session.user.id;

  const validRoles = ['pastor', 'minister', 'church_leader', 'other'];
  const cleanRole = (ministry_role || '').trim();
  const cleanPhone = (phone || '').trim();
  const yearsNum = parseInt(years_in_ministry, 10);

  // Validation
  if (!validRoles.includes(cleanRole)) {
    return res.redirect('/onboarding?step=2&error=' + encodeURIComponent('Please select a valid ministry role.'));
  }

  if (isNaN(yearsNum) || yearsNum < 0) {
    return res.redirect('/onboarding?step=2&error=' + encodeURIComponent('Years in ministry must be a non-negative number.'));
  }

  if (!cleanPhone) {
    return res.redirect('/onboarding?step=2&error=' + encodeURIComponent('Phone number is required for cohort communication.'));
  }

  if (client) {
    try {
      // Get current profile step to ensure non-decreasing progression
      const { data: curProf } = await client.from('profiles').select('onboarding_step').eq('id', userId).maybeSingle();
      const currentStep = (curProf && curProf.onboarding_step) || 1;
      const nextStep = Math.max(currentStep, 2);

      // Do NOT send protected fields (app_role, status, id)
      const { error } = await client
        .from('profiles')
        .update({
          ministry_role: cleanRole,
          years_in_ministry: yearsNum,
          phone: cleanPhone,
          onboarding_step: nextStep
        })
        .eq('id', userId);

      if (error) {
        console.error('Error updating ministry details:', error.message);
        return res.redirect('/onboarding?step=2&error=' + encodeURIComponent('Failed to save ministry details. Please try again.'));
      }
    } catch (err) {
      console.error('Unexpected error in step 2:', err);
      return res.redirect('/onboarding?step=2&error=' + encodeURIComponent('An unexpected error occurred. Please try again.'));
    }
  }

  res.redirect('/onboarding?step=3');
});

// GET /onboarding/churches/search - Search churches table
router.get('/churches/search', requireOnboardingAuth, async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query || query.length < 2) {
    return res.json({ churches: [] });
  }

  const client = getClient(req);
  if (!client) {
    return res.json({ churches: [] });
  }

  try {
    const { data, error } = await client
      .from('churches')
      .select('id, name, denomination, country, admin_level_1, admin_level_2, town, address')
      .ilike('name', `%${query}%`)
      .limit(10);

    if (error) {
      console.error('Church search query error:', error.message);
      return res.json({ churches: [] });
    }

    return res.json({ churches: data || [] });
  } catch (err) {
    console.error('Church search error:', err);
    return res.json({ churches: [] });
  }
});

// POST /onboarding/step/3 - Church Affiliation
router.post('/step/3', requireOnboardingAuth, async (req, res) => {
  const { church_action, church_id, church_name, denomination, country, town, address } = req.body;
  const client = getClient(req);
  const userId = req.session.user.id;

  if (!client) {
    return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Service temporarily unavailable.'));
  }

  try {
    const { data: curProf } = await client.from('profiles').select('onboarding_step').eq('id', userId).maybeSingle();
    const currentStep = (curProf && curProf.onboarding_step) || 1;
    let targetChurchId = null;

    if (church_action === 'select') {
      // Option A: Link existing church
      const cleanChurchId = (church_id || '').trim();
      if (!cleanChurchId) {
        return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Please select an existing church from the list.'));
      }

      // Verify church exists
      const { data: existingChurch, error: chCheckErr } = await client
        .from('churches')
        .select('id')
        .eq('id', cleanChurchId)
        .maybeSingle();

      if (chCheckErr || !existingChurch) {
        return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Selected church was not found in the registry.'));
      }

      targetChurchId = existingChurch.id;
    } else {
      // Option B: Register new church
      const cleanName = (church_name || '').trim();
      const cleanDenom = (denomination || '').trim();
      const cleanCountry = (country || 'Kenya').trim();
      const cleanTown = (town || '').trim();
      const cleanAddress = (address || '').trim();

      if (!cleanName || !cleanCountry || !cleanTown) {
        return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Church name, country, and town are required.'));
      }

      // Insert new church with created_by = auth.uid() to comply with RLS
      const { data: newChurch, error: createErr } = await client
        .from('churches')
        .insert({
          name: cleanName,
          denomination: cleanDenom || null,
          country: cleanCountry,
          town: cleanTown,
          address: cleanAddress || null,
          created_by: userId
        })
        .select('id')
        .single();

      if (createErr || !newChurch) {
        console.error('Error creating church:', createErr ? createErr.message : 'No data returned');
        return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Failed to register new church. Please try again.'));
      }

      targetChurchId = newChurch.id;
    }

    // Link church to applicant's profile
    const nextStep = Math.max(currentStep, 3);
    const { error: linkErr } = await client
      .from('profiles')
      .update({
        church_id: targetChurchId,
        onboarding_step: nextStep
      })
      .eq('id', userId);

    if (linkErr) {
      console.error('Error linking church to profile:', linkErr.message);
      return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Failed to link church to your profile.'));
    }

    res.redirect('/onboarding?step=4');
  } catch (err) {
    console.error('Unexpected error in step 3:', err);
    res.redirect('/onboarding?step=3&error=' + encodeURIComponent('An unexpected error occurred. Please try again.'));
  }
});

// POST /onboarding/step/4 - Church Location
router.post('/step/4', requireOnboardingAuth, async (req, res) => {
  const { country, admin_level_1, admin_level_2, town, address, latitude, longitude } = req.body;
  const client = getClient(req);
  const userId = req.session.user.id;

  const cleanCountry = (country || 'Kenya').trim();
  const cleanAdmin1 = (admin_level_1 || '').trim();
  const cleanAdmin2 = (admin_level_2 || '').trim();
  const cleanTown = (town || '').trim();
  const cleanAddress = (address || '').trim();

  if (!cleanCountry || !cleanTown) {
    return res.redirect('/onboarding?step=4&error=' + encodeURIComponent('Church country and town are required.'));
  }

  // Parse & validate coordinates if provided
  let latNum = null;
  let lngNum = null;

  if (latitude && latitude.toString().trim() !== '') {
    latNum = parseFloat(latitude);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.redirect('/onboarding?step=4&error=' + encodeURIComponent('Latitude must be between -90 and 90 degrees.'));
    }
  }

  if (longitude && longitude.toString().trim() !== '') {
    lngNum = parseFloat(longitude);
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.redirect('/onboarding?step=4&error=' + encodeURIComponent('Longitude must be between -180 and 180 degrees.'));
    }
  }

  if (!client) {
    return res.redirect('/onboarding?step=4&error=' + encodeURIComponent('Service temporarily unavailable.'));
  }

  try {
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('church_id, onboarding_step')
      .eq('id', userId)
      .maybeSingle();

    if (profErr || !profile || !profile.church_id) {
      return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Please link a church before specifying location.'));
    }

    // Update church physical location
    const { error: chUpdateErr } = await client
      .from('churches')
      .update({
        country: cleanCountry,
        admin_level_1: cleanAdmin1 || null,
        admin_level_2: cleanAdmin2 || null,
        town: cleanTown,
        address: cleanAddress || null,
        latitude: latNum,
        longitude: lngNum
      })
      .eq('id', profile.church_id);

    if (chUpdateErr) {
      console.error('Error updating church location:', chUpdateErr.message);
      return res.redirect('/onboarding?step=4&error=' + encodeURIComponent('Failed to update church location.'));
    }

    // Advance onboarding step to 4
    const nextStep = Math.max(profile.onboarding_step || 1, 4);
    await client
      .from('profiles')
      .update({ onboarding_step: nextStep })
      .eq('id', userId);

    res.redirect('/onboarding?step=5');
  } catch (err) {
    console.error('Unexpected error in step 4:', err);
    res.redirect('/onboarding?step=4&error=' + encodeURIComponent('An unexpected error occurred. Please try again.'));
  }
});

// POST /onboarding/step/5 - Final Review & Submit
router.post('/step/5', requireOnboardingAuth, async (req, res) => {
  const client = getClient(req);
  const userId = req.session.user.id;

  if (!client) {
    return res.redirect('/onboarding?step=5&error=' + encodeURIComponent('Service temporarily unavailable.'));
  }

  try {
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profErr || !profile) {
      return res.redirect('/onboarding?step=1&error=' + encodeURIComponent('Profile not found. Please restart onboarding.'));
    }

    // Validate completeness before final submission
    if (!profile.ministry_role || !profile.phone) {
      return res.redirect('/onboarding?step=2&error=' + encodeURIComponent('Please complete ministry details before submitting.'));
    }

    if (!profile.church_id) {
      return res.redirect('/onboarding?step=3&error=' + encodeURIComponent('Please affiliate with a church before submitting.'));
    }

    // Mark onboarding complete:
    // 1. onboarding_step = 5
    // 2. onboarding_completed_at = NOW()
    // 3. status REMAINS 'pending' (DO NOT SET TO 'active')
    // 4. Zero writes to data/users.json
    const { error: submitErr } = await client
      .from('profiles')
      .update({
        onboarding_step: 5,
        onboarding_completed_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (submitErr) {
      console.error('Error submitting application:', submitErr.message);
      return res.redirect('/onboarding?step=5&error=' + encodeURIComponent('Failed to submit application. Please try again.'));
    }

    // Fetch church details for confirmation view
    let churchName = '';
    if (profile.church_id) {
      const { data: cData } = await client.from('churches').select('name').eq('id', profile.church_id).maybeSingle();
      if (cData) churchName = cData.name;
    }

    res.render('onboarding-complete', {
      title: 'Application Submitted | Pastors LMS',
      full_name: profile.full_name || req.session.user.full_name,
      email: req.session.user.email,
      church_name: churchName
    });
  } catch (err) {
    console.error('Unexpected error in step 5 submission:', err);
    res.redirect('/onboarding?step=5&error=' + encodeURIComponent('An unexpected error occurred. Please try again.'));
  }
});

// GET /onboarding/complete - Standalone submission confirmation view
router.get('/complete', requireOnboardingAuth, async (req, res) => {
  const client = getClient(req);
  const userId = req.session.user.id;
  let churchName = '';

  if (client) {
    try {
      const { data: profile } = await client.from('profiles').select('church_id, full_name').eq('id', userId).maybeSingle();
      if (profile && profile.church_id) {
        const { data: church } = await client.from('churches').select('name').eq('id', profile.church_id).maybeSingle();
        if (church) churchName = church.name;
      }
    } catch (err) {
      console.warn('Complete view fetch notice:', err.message);
    }
  }

  res.render('onboarding-complete', {
    title: 'Application Submitted | Pastors LMS',
    full_name: req.session.user.full_name,
    email: req.session.user.email,
    church_name: churchName
  });
});

module.exports = router;
