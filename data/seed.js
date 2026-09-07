require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');

async function seed() {
  console.log('🌱 Starting Pastors LMS Database Seeding...');

  if (!supabase) {
    console.log('\n⚠️  Supabase client not connected.');
    console.log('   Please set valid SUPABASE_URL and SUPABASE_ANON_KEY in .env to seed to cloud database.');
    console.log('   The application is currently running smoothly in Local Mock Mode using data/courses.json and data/users.json.\n');
    process.exit(0);
  }

  try {
    const coursesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'courses.json'), 'utf8'));
    const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));

    console.log(`📚 Found ${coursesData.courses.length} courses and ${coursesData.tasks.length} tasks.`);
    console.log(`👥 Found ${usersData.length} users.`);

    // 1. Seed courses
    for (const c of coursesData.courses) {
      const { data: courseRow, error: cErr } = await supabase
        .from('courses')
        .upsert({
          id: c.id,
          title: c.title,
          code: c.code,
          term: c.term,
          description: c.description,
          cover_image: c.cover_image,
          start_date: c.start_date,
          end_date: c.end_date,
          status: c.status
        })
        .select()
        .single();

      if (cErr) {
        console.warn(`Error seeding course ${c.code}:`, cErr.message);
        continue;
      }

      // 2. Seed modules
      if (c.modules) {
        for (const m of c.modules) {
          await supabase.from('modules').upsert({
            id: m.id,
            course_id: c.id,
            title: m.title,
            sort_order: m.sort_order,
            total_topics: m.total_topics,
            completed_topics: m.completed_topics
          });
        }
      }
    }

    // 3. Seed tasks
    for (const t of coursesData.tasks) {
      await supabase.from('tasks').upsert({
        id: t.id,
        course_id: t.course_id,
        title: t.title,
        due_date: t.due_date,
        type: t.type
      });
    }

    console.log('✅ Seeding completed successfully!');
  } catch (err) {
    console.error('❌ Seeding error:', err);
  }
}

seed();
