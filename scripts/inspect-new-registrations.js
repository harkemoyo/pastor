const { supabaseAdmin } = require('../config/supabase');

async function inspectNewRegistrations() {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not configured. Please set SUPABASE_SERVICE_ROLE_KEY in .env');
    return;
  }

  console.log('=== READ-ONLY INSPECTION OF NEW SUPABASE REGISTRATIONS ===\n');

  try {
    // Get all auth users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching auth users:', authError.message);
      return;
    }

    console.log(`Found ${authUsers.users.length} total auth users in Supabase\n`);

    // Get all profiles
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*');

    if (profileError) {
      console.error('Error fetching profiles:', profileError.message);
      return;
    }

    console.log(`Found ${profiles.length} profiles in public.profiles\n`);

    // Create a map of profiles by user ID for quick lookup
    const profileMap = new Map();
    profiles.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    // Identify new registrations (filter out likely legacy/admin users)
    // New registrations would typically be recent and have specific patterns
    const newRegistrations = [];
    const authUsersWithoutProfiles = [];
    const duplicateProfiles = new Map();

    // Check for duplicate profiles
    const emailProfileCount = new Map();
    profiles.forEach(profile => {
      const email = profile.email;
      if (emailProfileCount.has(email)) {
        emailProfileCount.set(email, emailProfileCount.get(email) + 1);
      } else {
        emailProfileCount.set(email, 1);
      }
    });

    emailProfileCount.forEach((count, email) => {
      if (count > 1) {
        duplicateProfiles.set(email, count);
      }
    });

    // Analyze each auth user
    authUsers.users.forEach(authUser => {
      const profile = profileMap.get(authUser.id);
      const userEmail = authUser.email;
      const createdAt = authUser.created_at;
      const fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || 'Not set';

      // Skip obvious admin/system accounts
      if (userEmail.includes('admin') || userEmail.includes('system')) {
        return;
      }

      const registrationInfo = {
        userId: authUser.id,
        email: userEmail,
        fullName: fullName,
        authCreatedAt: createdAt,
        hasProfile: !!profile,
        profile: profile ? {
          status: profile.status,
          appRole: profile.app_role,
          onboardingStep: profile.onboarding_step,
          onboardingCompletedAt: profile.onboarding_completed_at,
          profileCreatedAt: profile.created_at
        } : null
      };

      if (!profile) {
        authUsersWithoutProfiles.push(registrationInfo);
      } else {
        newRegistrations.push(registrationInfo);
      }
    });

    // Report findings
    console.log('=== NEW SUPABASE REGISTRATIONS ANALYSIS ===\n');

    console.log('📊 SUMMARY:');
    console.log(`- Total auth users: ${authUsers.users.length}`);
    console.log(`- Total profiles: ${profiles.length}`);
    console.log(`- Auth users with profiles: ${newRegistrations.length}`);
    console.log(`- Auth users without profiles: ${authUsersWithoutProfiles.length}`);
    console.log(`- Duplicate email profiles: ${duplicateProfiles.size}`);

    if (duplicateProfiles.size > 0) {
      console.log('\n⚠️  DUPLICATE PROFILES FOUND:');
      duplicateProfiles.forEach((count, email) => {
        console.log(`- ${email}: ${count} profiles`);
      });
    }

    console.log('\n=== INDIVIDUAL REGISTRATION DETAILS ===\n');

    if (newRegistrations.length === 0) {
      console.log('No new registrations found with profiles.');
    } else {
      newRegistrations.forEach((reg, index) => {
        console.log(`User ${index + 1}:`);
        console.log(`  User ID: ${reg.userId}`);
        console.log(`  Email: ${reg.email}`);
        console.log(`  Full Name: ${reg.fullName}`);
        console.log(`  Auth Created At: ${reg.authCreatedAt}`);
        console.log(`  Has Profile: ${reg.hasProfile}`);
        
        if (reg.profile) {
          console.log(`  Profile Status: ${reg.profile.status}`);
          console.log(`  App Role: ${reg.profile.appRole}`);
          console.log(`  Onboarding Step: ${reg.profile.onboardingStep}`);
          console.log(`  Onboarding Completed At: ${reg.profile.onboardingCompletedAt || 'Not completed'}`);
          console.log(`  Profile Created At: ${reg.profile.profileCreatedAt}`);
        }
        console.log('');
      });
    }

    if (authUsersWithoutProfiles.length > 0) {
      console.log('\n⚠️  AUTH USERS WITHOUT PROFILES:');
      authUsersWithoutProfiles.forEach((reg, index) => {
        console.log(`User ${index + 1}:`);
        console.log(`  User ID: ${reg.userId}`);
        console.log(`  Email: ${reg.email}`);
        console.log(`  Full Name: ${reg.fullName}`);
        console.log(`  Auth Created At: ${reg.authCreatedAt}`);
        console.log(`  Has Profile: ${reg.hasProfile}`);
        console.log('');
      });
    }

    // Verification checks
    console.log('\n=== VERIFICATION CHECKS ===\n');
    
    // Check 1: Does every new Supabase Auth user have a corresponding profiles row?
    const allAuthUsersHaveProfiles = authUsersWithoutProfiles.length === 0;
    console.log(`1. Every auth user has a profile: ${allAuthUsersHaveProfiles ? '✅ YES' : '❌ NO'}`);
    if (!allAuthUsersHaveProfiles) {
      console.log(`   Missing profiles: ${authUsersWithoutProfiles.length}`);
    }

    // Check 2: Are those profiles currently pending?
    const pendingProfiles = newRegistrations.filter(reg => reg.profile?.status === 'pending');
    const allProfilesPending = newRegistrations.length > 0 && pendingProfiles.length === newRegistrations.length;
    console.log(`2. All profiles are pending: ${allProfilesPending ? '✅ YES' : '❌ NO'}`);
    if (newRegistrations.length > 0 && !allProfilesPending) {
      console.log(`   Pending: ${pendingProfiles.length}/${newRegistrations.length}`);
    }

    // Check 3: Are they at onboarding_step = 1?
    const onboardingStep1 = newRegistrations.filter(reg => reg.profile?.onboardingStep === 1);
    const allOnboardingStep1 = newRegistrations.length > 0 && onboardingStep1.length === newRegistrations.length;
    console.log(`3. All profiles at onboarding_step = 1: ${allOnboardingStep1 ? '✅ YES' : '❌ NO'}`);
    if (newRegistrations.length > 0 && !allOnboardingStep1) {
      console.log(`   At step 1: ${onboardingStep1.length}/${newRegistrations.length}`);
    }

    // Check 4: Is their full name correctly populated?
    const namesPopulated = newRegistrations.filter(reg => reg.fullName && reg.fullName !== 'Not set');
    const allNamesPopulated = newRegistrations.length > 0 && namesPopulated.length === newRegistrations.length;
    console.log(`4. All full names populated: ${allNamesPopulated ? '✅ YES' : '❌ NO'}`);
    if (newRegistrations.length > 0 && !allNamesPopulated) {
      console.log(`   Names populated: ${namesPopulated.length}/${newRegistrations.length}`);
    }

    // Check 5: Are there any new registrations with a missing profile?
    console.log(`5. New registrations with missing profile: ${authUsersWithoutProfiles.length > 0 ? '❌ YES' : '✅ NO'}`);
    if (authUsersWithoutProfiles.length > 0) {
      console.log(`   Count: ${authUsersWithoutProfiles.length}`);
    }

    // Check 6: Are there any duplicate profiles for one Auth user?
    console.log(`6. Duplicate profiles for same email: ${duplicateProfiles.size > 0 ? '❌ YES' : '✅ NO'}`);
    if (duplicateProfiles.size > 0) {
      console.log(`   Count: ${duplicateProfiles.size}`);
    }

    console.log('\n=== END OF READ-ONLY INSPECTION ===\n');

  } catch (error) {
    console.error('Error during inspection:', error.message);
  }
}

inspectNewRegistrations();