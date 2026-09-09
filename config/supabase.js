const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-supabase-project-url') {
  console.warn('\n⚠️  Supabase not configured. Using mock data mode.');
  console.warn('   Set SUPABASE_URL and SUPABASE_ANON_KEY in .env to connect.\n');
}

if (!supabaseServiceRoleKey) {
  console.warn('   Set SUPABASE_SERVICE_ROLE_KEY in .env for server-side student registration.\n');
}

const supabase = (supabaseUrl && supabaseUrl !== 'your-supabase-project-url')
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const supabaseAdmin = (supabaseUrl && supabaseUrl !== 'your-supabase-project-url' && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

module.exports = { supabase, supabaseAdmin };
