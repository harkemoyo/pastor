const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-supabase-project-url') {
  console.warn('\n⚠️  Supabase not configured. Using mock data mode.');
  console.warn('   Set SUPABASE_URL and SUPABASE_ANON_KEY in .env to connect.\n');
}

const supabase = (supabaseUrl && supabaseUrl !== 'your-supabase-project-url')
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function getUserSupabaseClient(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-supabase-project-url' || !accessToken) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

module.exports = { supabase, getUserSupabaseClient };
