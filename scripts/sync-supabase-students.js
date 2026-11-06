require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE key in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('Connecting to Supabase:', supabaseUrl);
  const { data: students, error } = await supabase
    .from('students')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching students from Supabase:', error.message);
    if (error.code === '42501' || error.message.includes('permission')) {
      console.error('\nNOTE: If RLS is enabled, please add SUPABASE_SERVICE_ROLE_KEY to .env to bypass RLS for administrative sync.');
    }
    process.exit(1);
  }

  if (!students || !students.length) {
    console.log('No students found in Supabase students table.');
    return;
  }

  console.log(`\nSuccessfully fetched ${students.length} students from Supabase:\n`);
  console.table(students.map(s => ({
    username: s.username,
    name: s.full_name || [s.first_name, s.last_name].filter(Boolean).join(' '),
    email: s.email,
    phone: s.phone || 'N/A',
    church: s.church_name || 'N/A',
    town: s.town || 'N/A',
    county: s.county || 'N/A',
    status: s.status
  })));

  // Sync to data/users.json so local fallback has all of them
  const usersFile = path.join(__dirname, '../data/users.json');
  let currentUsers = [];
  try {
    currentUsers = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  } catch (e) {
    currentUsers = [];
  }

  let added = 0;
  let updated = 0;
  for (const s of students) {
    const existingIndex = currentUsers.findIndex(u => u.email === s.email || u.username === s.username);
    const mapped = {
      username: s.username,
      email: s.email,
      password: currentUsers[existingIndex]?.password || '$2b$10$IFeR81mpSAzXDcSVYRoso.WqE/pxE.dsHCeLDjpWiEmcA5Kdz/tam', // keep existing hash or default
      full_name: s.full_name || [s.first_name, s.last_name].filter(Boolean).join(' '),
      first_name: s.first_name || '',
      last_name: s.last_name || '',
      phone: s.phone || '',
      church_name: s.church_name || '',
      town: s.town || '',
      county: s.county || '',
      physical_address: s.physical_address || '',
      ministry_role: s.ministry_role || '',
      years_in_ministry: s.years_in_ministry || 0,
      student_id: s.student_id || s.username,
      role: 'student',
      status: s.status || 'active',
      approval_status: s.approval_status || 'approved',
      created_at: s.created_at || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      currentUsers[existingIndex] = { ...currentUsers[existingIndex], ...mapped };
      updated++;
    } else {
      currentUsers.push(mapped);
      added++;
    }
  }

  fs.writeFileSync(usersFile, JSON.stringify(currentUsers, null, 2), 'utf8');
  console.log(`\nSynced to local data/users.json: ${added} added, ${updated} updated.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

