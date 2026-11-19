const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { getCourseModulesWithTopics } = require('../data/course-content');
const { findTeacherByUsername, resolveModuleInstructor } = require('../utils/instructors');
const {
  getEnrolledCoursesForUser,
  getAnnouncements,
  getSubmissions,
  getDiscussions,
  computeCourseGradeSummary
} = require('../utils/lms-store');

const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const PROGRESS_FILE = path.join(__dirname, '../data/student-progress.json');
const FALLBACK_PROGRESS_FILE = path.join(os.tmpdir(), 'pastors-lms-progress.json');
const PROGRESS_COOKIE_NAME = 'pastors_prog';

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

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

function getUserKey(req) {
  const u = req.session && req.session.user;
  if (!u) return 'guest';
  return String(u.username || u.email || u.id || 'guest').toLowerCase();
}

function readAllProgressFromDisk() {
  let combined = {};
  for (const file of [PROGRESS_FILE, FALLBACK_PROGRESS_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          combined = { ...combined, ...parsed };
        }
      }
    } catch {
      // Ignore unreadable file
    }
  }
  return combined;
}

function getStudentProgress(req) {
  const userKey = getUserKey(req);
  const allDisk = readAllProgressFromDisk();
  const diskUserProg = (allDisk[userKey] && typeof allDisk[userKey] === 'object') ? allDisk[userKey] : {};

  // Merge with per-user cookie so progress survives across Vercel serverless instances
  let cookieUserProg = {};
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawCookie = cookies[PROGRESS_COOKIE_NAME];
    if (rawCookie) {
      const decoded = JSON.parse(Buffer.from(rawCookie, 'base64url').toString('utf8'));
      if (decoded && decoded.u === userKey && decoded.m && typeof decoded.m === 'object') {
        cookieUserProg = decoded.m;
      }
    }
  } catch {
    // Ignore malformed cookie
  }

  const merged = { ...diskUserProg };
  for (const [modId, topicIds] of Object.entries(cookieUserProg)) {
    if (Array.isArray(topicIds)) {
      const existing = Array.isArray(merged[modId]) ? merged[modId] : [];
      merged[modId] = Array.from(new Set([...existing, ...topicIds]));
    }
  }
  return merged;
}

function saveStudentProgress(req, res, userProg) {
  const userKey = getUserKey(req);
  const allDisk = readAllProgressFromDisk();
  allDisk[userKey] = userProg;
  const serialized = JSON.stringify(allDisk, null, 2);

  try {
    fs.writeFileSync(PROGRESS_FILE, serialized, 'utf8');
  } catch {
    try {
      fs.writeFileSync(FALLBACK_PROGRESS_FILE, serialized, 'utf8');
    } catch {
      // Cookie backup below keeps progress intact on read-only filesystems
    }
  }

  try {
    const compact = Buffer.from(JSON.stringify({ u: userKey, m: userProg }), 'utf8').toString('base64url');
    const isHttps = req.secure || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    const secureFlag = isHttps ? '; Secure' : '';
    const cookieStr = `${PROGRESS_COOKIE_NAME}=${encodeURIComponent(compact)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax${secureFlag}`;
    const prev = res.getHeader('Set-Cookie');
    if (!prev) {
      res.setHeader('Set-Cookie', [cookieStr]);
    } else if (Array.isArray(prev)) {
      res.setHeader('Set-Cookie', [...prev, cookieStr]);
    } else {
      res.setHeader('Set-Cookie', [String(prev), cookieStr]);
    }
  } catch {
    // Non-fatal
  }
}

// Calculate per-student course & module progress stats (starts at 0% for every new student)
function enrichCourseStats(course, userProg = {}) {
  const modulesWithTopics = getCourseModulesWithTopics(course);
  let totalTopics = 0;
  let completedTopics = 0;

  const enrichedModules = modulesWithTopics.map(mod => {
    const modTopics = Array.isArray(mod.topics) ? mod.topics : [];
    const modTotal = modTopics.length || mod.total_topics || 0;
    const savedList = Array.isArray(userProg[String(mod.id)]) ? userProg[String(mod.id)].map(String) : [];

    const validCompletedIds = modTopics
      .filter(t => savedList.includes(String(t.id)))
      .map(t => String(t.id));

    const modCompleted = Math.min(modTotal, validCompletedIds.length);
    const modPercent = modTotal > 0 ? Math.round((modCompleted / modTotal) * 100) : 0;

    totalTopics += modTotal;
    completedTopics += modCompleted;

    return {
      ...mod,
      total_topics: modTotal,
      completed_topics: modCompleted,
      completed_topic_ids: validCompletedIds,
      percent: modPercent,
      topics: modTopics.map(t => ({
        ...t,
        completed: validCompletedIds.includes(String(t.id))
      }))
    };
  });

  const percent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
  const dynamicStatus = (totalTopics > 0 && completedTopics >= totalTopics) ? 'past' : 'current';

  return {
    ...course,
    status: dynamicStatus,
    modules: enrichedModules.map(({ topics, ...rest }) => rest),
    modulesWithTopics: enrichedModules,
    totalTopics,
    completedTopics,
    percent
  };
}

// GET / - Dashboard
router.get('/', requireAuth, async (req, res) => {
  const data = getLMSData();
  const userProg = getStudentProgress(req);
  const { courses: visibleCourses } = getEnrolledCoursesForUser(data.courses || [], req.session.user);
  const enrichedCourses = visibleCourses.map(c => enrichCourseStats(c, userProg));

  // Build real upcoming deadlines from module due_date fields + static tasks
  const moduleDeadlines = [];
  enrichedCourses.forEach(c => {
    (c.modules || []).forEach(m => {
      if (m.due_date) {
        moduleDeadlines.push({
          title: `${c.code}: ${m.title}`,
          due_date: m.due_date,
          course_id: c.id,
          type: 'module'
        });
      }
    });
  });
  const tasks = [...moduleDeadlines, ...(data.tasks || [])];

  // Summary statistics for dashboard cards
  const totalEnrolled = enrichedCourses.length;
  const currentCourses = enrichedCourses.filter(c => c.status === 'current' || c.status === 'active');
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

// GET /courses - My Courses list
router.get('/courses', requireAuth, (req, res) => {
  const userProg = getStudentProgress(req);
  const { courses: visibleCourses } = getEnrolledCoursesForUser(getLMSData().courses || [], req.session.user);
  const courses = visibleCourses.map(c => enrichCourseStats(c, userProg));
  const currentCount = courses.filter(c => c.status === 'current' || c.status === 'active').length;
  const pastCount = courses.filter(c => c.status === 'past').length;

  res.render('courses', {
    title: 'My Courses | Pastors LMS',
    courses,
    stats: { currentCount, pastCount }
  });
});

// GET /courses/:id - Course Detail
router.get('/courses/:id', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const data = getLMSData();
  const userProg = getStudentProgress(req);
  const rawCourse = data.courses.find(c => c.id === courseId);

  if (!rawCourse) {
    return res.status(404).render('dashboard', {
      title: 'Course Not Found | Pastors LMS',
      error: 'The requested pastoral training course was not found.',
      courses: data.courses.map(c => enrichCourseStats(c, userProg)),
      tasks: data.tasks || [],
      stats: { totalEnrolled: data.courses.length, overallPercent: 0 }
    });
  }

  // Enforce enrolment for students when explicit enrolment records exist
  const { courses: allowedCourses, isFilteredByEnrolment } = getEnrolledCoursesForUser(data.courses || [], req.session.user);
  if (isFilteredByEnrolment && !allowedCourses.some(c => Number(c.id) === courseId)) {
    return res.redirect('/courses');
  }

  const course = enrichCourseStats(rawCourse, userProg);
  course.courseInstructor = findTeacherByUsername(rawCourse.instructor_username);
  const isStaff = ['admin', 'super_admin', 'teacher'].includes(req.session.user.role);
  if (Array.isArray(course.modulesWithTopics)) {
    course.modulesWithTopics = course.modulesWithTopics.map(mod => {
      const rawMod = (rawCourse.modules || []).find(m => Number(m.id) === Number(mod.id)) || mod;
      return {
        ...mod,
        isLocked: isStaff ? false : Boolean(mod.isLocked),
        instructor: resolveModuleInstructor(rawCourse, rawMod)
      };
    });
  }
  course.studentFullName = req.session?.user?.full_name || 'Student';
  course.studentUsername = req.session?.user?.username || '';
  course.userRole = req.session?.user?.role || 'student';

  const username = req.session.user.username || req.session.user.email;
  const [liveAnnouncements, mySubs, courseDiscussions] = await Promise.all([
    getAnnouncements(courseId),
    getSubmissions({ course_id: courseId, student_username: username }),
    getDiscussions(courseId)
  ]);
  const myDiscussions = courseDiscussions.filter(
    d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
  );
  const gradeSummary = computeCourseGradeSummary(mySubs, myDiscussions);

  const moduleTasks = (rawCourse.modules || [])
    .filter(m => m.due_date)
    .map(m => ({ title: `${rawCourse.code}: ${m.title}`, due_date: m.due_date, course_id: courseId }));
  const courseTasks = [...moduleTasks, ...(data.tasks || []).filter(t => t.course_id === courseId)];

  res.render('course-detail', {
    title: `${course.code} - ${course.title} | Pastors LMS`,
    course,
    liveAnnouncements,
    gradeSummary,
    mySubmissions: mySubs,
    courseTasks,
    allTasks: data.tasks || []
  });
});

// POST /courses/:id/modules/:moduleId/toggle - Per-student topic & module completion
router.post('/courses/:id/modules/:moduleId/toggle', requireAuth, (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const { direction, topicId, action } = req.body;

  const data = getLMSData();
  const rawCourse = data.courses.find(c => c.id === courseId);
  if (!rawCourse) {
    return res.status(404).json({ success: false, error: 'Course not found' });
  }

  const modulesWithTopics = getCourseModulesWithTopics(rawCourse);
  const targetMod = modulesWithTopics.find(m => m.id === moduleId);
  if (!targetMod) {
    return res.status(404).json({ success: false, error: 'Module not found' });
  }

  const allTopicIds = (targetMod.topics || []).map(t => String(t.id));
  const userProg = getStudentProgress(req);
  const modKey = String(moduleId);
  let completedSet = new Set(Array.isArray(userProg[modKey]) ? userProg[modKey].map(String) : []);

  if (action === 'complete_module') {
    completedSet = new Set(allTopicIds);
  } else if (action === 'reset_module') {
    completedSet.clear();
  } else if (topicId) {
    const tid = String(topicId);
    if (direction === 'dec') {
      completedSet.delete(tid);
    } else if (allTopicIds.includes(tid)) {
      completedSet.add(tid);
    }
  } else if (direction === 'dec') {
    const currentArr = Array.from(completedSet);
    if (currentArr.length > 0) {
      completedSet.delete(currentArr[currentArr.length - 1]);
    }
  } else {
    const nextTopic = allTopicIds.find(id => !completedSet.has(id));
    if (nextTopic) {
      completedSet.add(nextTopic);
    }
  }

  userProg[modKey] = allTopicIds.filter(id => completedSet.has(id));
  saveStudentProgress(req, res, userProg);

  const updatedCourse = enrichCourseStats(rawCourse, userProg);
  const updatedModule = updatedCourse.modulesWithTopics.find(m => m.id === moduleId);

  res.json({
    success: true,
    moduleId,
    completedTopicIds: updatedModule.completed_topic_ids,
    completedTopics: updatedModule.completed_topics,
    totalTopics: updatedModule.total_topics,
    modulePercent: updatedModule.percent,
    coursePercent: updatedCourse.percent,
    courseCompletedTopics: updatedCourse.completedTopics,
    courseTotalTopics: updatedCourse.totalTopics
  });
});

module.exports = router;
