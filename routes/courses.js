const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const COURSES_FILE = path.join(__dirname, '../data/courses.json');

// Helper to get courses and tasks data
function getLMSData() {
  try {
    const raw = fs.readFileSync(COURSES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading courses.json:', err);
    return { courses: [], tasks: [] };
  }
}

// Helper to save updated LMS data (for interactive topic toggling)
function saveLMSData(data) {
  try {
    fs.writeFileSync(COURSES_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving courses.json:', err);
    return false;
  }
}

// Calculate course progress stats
function enrichCourseStats(course) {
  let totalTopics = 0;
  let completedTopics = 0;

  if (course.modules && Array.isArray(course.modules)) {
    course.modules.forEach(mod => {
      totalTopics += (mod.total_topics || 0);
      completedTopics += (mod.completed_topics || 0);
    });
  }

  const percent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
  return {
    ...course,
    totalTopics,
    completedTopics,
    percent
  };
}

// GET / - Dashboard
router.get('/', requireAuth, async (req, res) => {
  const data = getLMSData();
  const enrichedCourses = data.courses.map(enrichCourseStats);
  const tasks = data.tasks || [];

  // Summary statistics for dashboard cards
  const totalEnrolled = enrichedCourses.length;
  const currentCourses = enrichedCourses.filter(c => c.status === 'current');
  const pastCourses = enrichedCourses.filter(c => c.status === 'past');
  const totalCompletedTopics = enrichedCourses.reduce((sum, c) => sum + c.completedTopics, 0);
  const totalTopicsAll = enrichedCourses.reduce((sum, c) => sum + c.totalTopics, 0);
  const overallPercent = totalTopicsAll > 0 ? Math.round((totalCompletedTopics / totalTopicsAll) * 100) : 0;

  res.render('dashboard', {
    title: 'Pastor Dashboard | Pastors LMS',
    courses: enrichedCourses,
    currentCourses,
    pastCourses,
    tasks,
    stats: {
      totalEnrolled,
      currentCount: currentCourses.length,
      pastCount: pastCourses.length,
      completedTopics: totalCompletedTopics,
      totalTopics: totalTopicsAll,
      overallPercent
    }
  });
});

// GET /courses/:id - Course Detail
router.get('/courses/:id', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const data = getLMSData();
  const rawCourse = data.courses.find(c => c.id === courseId);

  if (!rawCourse) {
    return res.status(404).render('dashboard', {
      title: 'Course Not Found | Pastors LMS',
      error: 'The requested pastoral training course was not found.',
      courses: data.courses.map(enrichCourseStats),
      tasks: data.tasks || [],
      stats: { totalEnrolled: data.courses.length, overallPercent: 0 }
    });
  }

  const course = enrichCourseStats(rawCourse);
  const courseTasks = (data.tasks || []).filter(t => t.course_id === courseId);

  res.render('course-detail', {
    title: `${course.title} | Pastors LMS`,
    course,
    courseTasks,
    allTasks: data.tasks || []
  });
});

// POST /courses/:id/modules/:moduleId/toggle - Interactive topic increment / completion
router.post('/courses/:id/modules/:moduleId/toggle', requireAuth, (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const { direction } = req.body; // 'inc' or 'dec'

  const data = getLMSData();
  const course = data.courses.find(c => c.id === courseId);
  if (!course) {
    return res.status(404).json({ success: false, error: 'Course not found' });
  }

  const moduleItem = (course.modules || []).find(m => m.id === moduleId);
  if (!moduleItem) {
    return res.status(404).json({ success: false, error: 'Module not found' });
  }

  if (direction === 'dec') {
    moduleItem.completed_topics = Math.max(0, (moduleItem.completed_topics || 0) - 1);
  } else {
    moduleItem.completed_topics = Math.min(moduleItem.total_topics, (moduleItem.completed_topics || 0) + 1);
  }

  saveLMSData(data);

  const updatedCourse = enrichCourseStats(course);
  res.json({
    success: true,
    completedTopics: moduleItem.completed_topics,
    totalTopics: moduleItem.total_topics,
    modulePercent: Math.round((moduleItem.completed_topics / moduleItem.total_topics) * 100),
    coursePercent: updatedCourse.percent,
    courseCompletedTopics: updatedCourse.completedTopics,
    courseTotalTopics: updatedCourse.totalTopics
  });
});

module.exports = router;
