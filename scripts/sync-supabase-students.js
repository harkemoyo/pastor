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
    const existingIndex = currentUsers.findIndex(u =>
      (s.email && u.email && u.email.toLowerCase() === s.email.toLowerCase()) ||
      (s.username && u.username && u.username.toLowerCase() === s.username.toLowerCase())
    );
    const existing = existingIndex >= 0 ? currentUsers[existingIndex] : null;
    const mapped = {
      ...(existing || {}),
      username: s.username,
      email: s.email,
      password: existing?.password || '$2b$10$IFeR81mpSAzXDcSVYRoso.WqE/pxE.dsHCeLDjpWiEmcA5Kdz/tam',
      full_name: s.full_name || [s.first_name, s.last_name].filter(Boolean).join(' '),
      first_name: s.first_name || existing?.first_name || '',
      last_name: s.last_name || existing?.last_name || '',
      phone: s.phone || existing?.phone || '',
      church_name: s.church_name || existing?.church_name || '',
      town: s.town || existing?.town || '',
      county: s.county || existing?.county || '',
      physical_address: s.physical_address || existing?.physical_address || '',
      ministry_role: s.ministry_role || existing?.ministry_role || '',
      years_in_ministry: s.years_in_ministry ?? existing?.years_in_ministry ?? 0,
      student_id: s.student_id || existing?.student_id || s.username,
      role: (existing?.role && ['admin', 'super_admin', 'teacher'].includes(existing.role)) ? existing.role : (s.role || 'student'),
      status: s.status || existing?.status || 'active',
      approval_status: s.approval_status || existing?.approval_status || 'approved',
      created_at: s.created_at || existing?.created_at || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      currentUsers[existingIndex] = mapped;
      updated++;
    } else {
      currentUsers.push(mapped);
      added++;
    }
  }

  // Push any real local users.json records missing in Supabase up to Supabase students table
  let pushedToSupabase = 0;
  const demoEmails = new Set(['demo@pastorslms.com', 'pastor.james@church.org', 'john.doe@church.org', 'sarah.otieno@example.com', 'admin@pastorslms.com', 'teacher@pastorslms.com']);
  for (const u of currentUsers) {
    if (!u.email || demoEmails.has(u.email.toLowerCase()) || ['admin', 'super_admin', 'teacher'].includes(u.role)) continue;
    const inSupabase = students.some(s =>
      (s.email && s.email.toLowerCase() === u.email.toLowerCase()) ||
      (s.username && u.username && s.username.toLowerCase() === u.username.toLowerCase())
    );
    if (!inSupabase) {
      const payload = {
        username: u.username,
        email: u.email,
        full_name: u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' '),
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        phone: u.phone || '',
        county: u.county || '',
        town: u.town || '',
        physical_address: u.physical_address || '',
        church_name: u.church_name || '',
        ministry_role: u.ministry_role || '',
        years_in_ministry: Number(u.years_in_ministry || 0),
        student_id: u.student_id || u.username,
        role: 'student',
        status: u.status || 'active',
        approval_status: u.approval_status || 'approved',
        created_at: u.created_at || new Date().toISOString()
      };
      const { error: pushErr } = await supabase.from('students').upsert(payload, { onConflict: 'email' });
      if (!pushErr) pushedToSupabase++;
    }
  }

  fs.writeFileSync(usersFile, JSON.stringify(currentUsers, null, 2), 'utf8');
  console.log(`\nTwo-way sync complete -> Local data/users.json: ${added} added, ${updated} updated | Pushed to Supabase: ${pushedToSupabase}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

