const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSchema() {
  console.log('=== INSPECTING SUPABASE SCHEMA ===\n');

  try {
    // Check for specific tables we care about by trying to query them
    const tablesToCheck = ['profiles', 'students', 'churches', 'users', 'courses', 'enrollments'];
    
    console.log('=== CHECKING TABLE EXISTENCE ===');
    for (const tableName of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`${tableName}: Does not exist or no access (${error.code})`);
        } else {
          console.log(`${tableName}: EXISTS`);
          if (data && data.length > 0) {
            console.log('Sample data:');
            console.log(JSON.stringify(data[0], null, 2));
            console.log('Columns:', Object.keys(data[0]).join(', '));
          } else {
            console.log('Table is empty - checking if table exists with limit 0');
            const { data: emptyData, error: emptyError } = await supabase
              .from(tableName)
              .select('*')
              .limit(0);
            if (!emptyError) {
              console.log('Table exists but is empty');
              // Try to infer structure by attempting to select specific common columns
              const commonColumns = ['id', 'email', 'full_name', 'name', 'role', 'status', 'created_at', 'updated_at'];
              for (const col of commonColumns) {
                try {
                  const { data: colData, error: colError } = await supabase
                    .from(tableName)
                    .select(col)
                    .limit(0);
                  if (!colError) {
                    console.log(`Has column: ${col}`);
                  }
                } catch (e) {
                  // Column doesn't exist
                }
              }
            } else {
              console.log('Table does not exist:', emptyError.message);
            }
          }
        }
      } catch (err) {
        console.log(`${tableName}: Error checking - ${err.message}`);
      }
      console.log();
    }

    // Check auth.users structure (via RPC if available)
    console.log('=== AUTH.USERS STRUCTURE ===');
    console.log('Note: auth.users structure is managed by Supabase');
    console.log('Standard columns: id, email, encrypted_password, email_confirmed_at, etc.');

  } catch (error) {
    console.error('Error inspecting schema:', error);
  }
}

inspectSchema();