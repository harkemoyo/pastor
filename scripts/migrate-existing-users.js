const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase');

// Load existing users
function getUsers() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading users.json:', err);
    return [];
  }
}

async function migrateUsersToSupabase() {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not configured. Please set SUPABASE_SERVICE_ROLE_KEY in .env');
    return;
  }

  const users = getUsers();
  console.log(`Found ${users.length} users to migrate`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    if (user.role === 'admin') {
      console.log(`Skipping admin user: ${user.username}`);
      continue;
    }

    try {
      // Check if user already exists in Supabase
      const { data: existingUser, error: checkError } = await supabaseAdmin
        .from('students')
        .select('username, email')
        .eq('email', user.email)
        .maybeSingle();

      if (existingUser) {
        console.log(`User ${user.username} (${user.email}) already exists in Supabase - skipping`);
        continue;
      }

      // Create auth user first
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: 'password123', // You'll need to handle password migration separately
        email_confirm: true,
        user_metadata: {
          full_name: user.full_name,
          role: user.role
        }
      });

      if (authError) {
        console.error(`Failed to create auth user for ${user.username}:`, authError.message);
        errorCount++;
        continue;
      }

      // Insert student profile
      const studentProfile = {
        auth_user_id: authData.user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        first_name: user.first_name || '',
        middle_name: user.middle_name || '',
        last_name: user.last_name || '',
        phone: user.phone || '',
        county: user.county || '',
        town: user.town || '',
        physical_address: user.physical_address || '',
        church_name: user.church_name || '',
        ministry_role: user.ministry_role || '',
        years_in_ministry: user.years_in_ministry || 0,
        emergency_contact_name: user.emergency_contact_name || '',
        emergency_contact_phone: user.emergency_contact_phone || '',
        relationship: user.relationship || '',
        student_id: user.student_id || '',
        role: user.role || 'student',
        status: user.status || 'active',
        approval_status: user.approval_status || 'approved',
        created_at: user.created_at || new Date().toISOString()
      };

      const { error: insertError } = await supabaseAdmin
        .from('students')
        .insert([studentProfile]);

      if (insertError) {
        console.error(`Failed to insert profile for ${user.username}:`, insertError.message);
        errorCount++;
      } else {
        console.log(`✓ Migrated ${user.username} (${user.full_name})`);
        successCount++;
      }

    } catch (error) {
      console.error(`Error migrating ${user.username}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\nMigration complete: ${successCount} successful, ${errorCount} failed`);
}

migrateUsersToSupabase().catch(console.error);