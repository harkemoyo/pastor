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
  isCourseEnrolled,
  getEastAfricaNow,
  checkDeadlineLock,
  getAcademicConfig,
  getActiveTerm,
  computeTermWeekInfo,
  getOrientationStatus,
  getExtensionRequests,
  computeAcademicStanding,
  letterToGradePoints,
  computeLetterGrade,
  getAnnouncements,
  getSubmissions,
  getDiscussions,
  computeCourseGradeSummary
} = require('../utils/lms-store');
const {
  getLiveSessions,
  getAttendanceRecords,
  computeStudentAttendanceSummary,
  getPracticumSubmissions
} = require('../utils/engagement-store');

const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');
const ENROLMENTS_FILE = path.join(__dirname, '../data/enrolments.json');
const MESSAGES_FILE = path.join(__dirname, '../data/course-messages.json');
const FALLBACK_MESSAGES_FILE = path.join(os.tmpdir(), 'pastors-lms-course-messages.json');
const PROGRESS_FILE = path.join(__dirname, '../data/student-progress.json');
const FALLBACK_PROGRESS_FILE = path.join(os.tmpdir(), 'pastors-lms-progress.json');
const PROGRESS_COOKIE_NAME = 'pastors_prog';

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw && raw.trim()) return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return fallback;
}

function getCourseMessages(courseId) {
  let all = readJsonSafe(MESSAGES_FILE, null);
  if (!Array.isArray(all)) all = readJsonSafe(FALLBACK_MESSAGES_FILE, []);
  return all
    .filter(m => Number(m.course_id) === Number(courseId))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function saveCourseMessage(msg) {
  let all = readJsonSafe(MESSAGES_FILE, null);
  if (!Array.isArray(all)) all = readJsonSafe(FALLBACK_MESSAGES_FILE, []);
  all.unshift(msg);
  const payload = JSON.stringify(all.slice(0, 200), null, 2);
  try {
    fs.writeFileSync(MESSAGES_FILE, payload, 'utf8');
    return true;
  } catch {
    try {
      fs.writeFileSync(FALLBACK_MESSAGES_FILE, payload, 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr);
  const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildCourseClasslist(rawCourse, course) {
  const instructorsMap = new Map();
  if (course.courseInstructor) {
    instructorsMap.set(course.courseInstructor.username, {
      ...course.courseInstructor,
      scopeLabel: 'Course Instructor'
    });
  }
  (course.modulesWithTopics || []).forEach(m => {
    if (m.instructor && !instructorsMap.has(m.instructor.username)) {
      instructorsMap.set(m.instructor.username, {
        ...m.instructor,
        scopeLabel: `Module Lecturer (${m.title})`
      });
    }
  });

  const users = readJsonSafe(USERS_FILE, []);
  const enrolments = readJsonSafe(ENROLMENTS_FILE, []);
  const activeEnrolForCourse = enrolments.filter(
    e => Number(e.course_id) === Number(rawCourse.id) && (!e.status || e.status === 'active')
  );
  const enrolledUsernames = new Set(activeEnrolForCourse.map(e => String(e.student_username || '').toLowerCase()));

  const students = (Array.isArray(users) ? users : [])
    .filter(u => u && u.role === 'student' && u.status !== 'rejected' && u.status !== 'disabled')
    .filter(u => enrolledUsernames.size === 0 || enrolledUsernames.has(String(u.username || '').toLowerCase()))
    .map(u => {
      const fullName = u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username;
      const initials = u.initials || fullName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'P';
      return {
        full_name: fullName,
        initials,
        username: u.username,
        student_id: u.student_id || u.username,
        church_name: u.church_name || 'Local Church Ministry',
        cohort: u.cohort || 'East Africa Pastoral Cohort',
        ministry_role: u.ministry_role || 'Pastor',
        country_code: u.country_code || 'KE',
        email: u.email || ''
      };
    });

  return {
    instructors: Array.from(instructorsMap.values()),
    students
  };
}

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

function parseActivityDate(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/^Due:\s*/i, '').trim();
  if (!cleaned || /term schedule/i.test(cleaned)) return null;
  // ISO YYYY-MM-DD (treat as local noon to avoid timezone day-shift)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatShortDate(dateObj) {
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRangeDate(dateObj) {
  return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/**
 * Build real UoPeople-style "Work To Do" items (Overdue + Upcoming) from
 * uncompleted assignments, quizzes, exams, and weekly cohort discussions.
 */
function buildWorkToDo(enrichedCourses, { submissions = [], discussions = [] } = {}) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  const submittedKeySet = new Set(
    submissions.map(s => `${Number(s.course_id)}:${String(s.topic_id)}`)
  );
  const discussionModSet = new Set(
    discussions.map(d => `${Number(d.course_id)}:${Number(d.module_id)}`)
  );

  const overdue = [];
  const upcoming = [];

  (enrichedCourses || []).forEach(course => {
    const courseStart = parseActivityDate(course.start_date) || new Date(startOfToday.getTime());
    const modules = Array.isArray(course.modulesWithTopics) ? course.modulesWithTopics : [];

    modules.forEach((mod, modIdx) => {
      const unitNum = Math.max(1, (Number(mod.sort_order) || (modIdx + 1)) - 1);
      const isIntro = (Number(mod.sort_order) || (modIdx + 1)) === 1;
      const unlockDate = parseActivityDate(mod.unlock_date);
      const startsLabel = unlockDate && unlockDate > startOfToday
        ? `Starts ${formatShortDate(unlockDate)}`
        : '';

      const fallbackModDue =
        parseActivityDate(mod.due_date) ||
        new Date(courseStart.getFullYear(), courseStart.getMonth(), courseStart.getDate() + (unitNum * 7), 12, 0, 0);

      let hasExplicitDiscussion = false;

      (mod.topics || []).forEach(topic => {
        const tType = topic.type;
        if (!['assignment', 'journal', 'quiz', 'exam', 'discussion'].includes(tType)) return;
        if (tType === 'discussion') hasExplicitDiscussion = true;

        const key = `${Number(course.id)}:${String(topic.id)}`;
        if (topic.completed || submittedKeySet.has(key)) return;
        if (tType === 'discussion' && discussionModSet.has(`${Number(course.id)}:${Number(mod.id)}`)) return;

        const dueDate = parseActivityDate(topic.dueDate) || fallbackModDue;
        const isOverdue = dueDate < startOfToday;
        const actionType = tType === 'discussion' ? 'open-discussion' : 'open-topic';
        const href = tType === 'discussion'
          ? `/courses/${course.id}?tab=discussions&module=${mod.id}`
          : `/courses/${course.id}?openModule=${mod.id}&openTopic=${encodeURIComponent(topic.id)}`;

        const item = {
          uid: `${course.id}-${mod.id}-${topic.id}`,
          title: topic.title,
          type: tType === 'journal' ? 'assignment' : tType,
          course_id: course.id,
          course_code: course.code,
          course_title: course.title,
          module_id: mod.id,
          topic_id: String(topic.id),
          dueDateMs: dueDate.getTime(),
          dueLabel: `Due ${formatShortDate(dueDate)}`,
          startsLabel,
          actionType,
          href
        };

        if (isOverdue) overdue.push(item);
        else upcoming.push(item);
      });

      // UoPeople weekly Discussion Forum item for every learning unit (skip Course Intro)
      if (!isIntro && !hasExplicitDiscussion && !discussionModSet.has(`${Number(course.id)}:${Number(mod.id)}`)) {
        const dueDate = fallbackModDue;
        const isOverdue = dueDate < startOfToday;
        const item = {
          uid: `${course.id}-${mod.id}-discussion`,
          title: `Discussion Forum Unit ${unitNum}`,
          type: 'discussion',
          course_id: course.id,
          course_code: course.code,
          course_title: course.title,
          module_id: mod.id,
          topic_id: 'discussion',
          dueDateMs: dueDate.getTime(),
          dueLabel: `Due ${formatShortDate(dueDate)}`,
          startsLabel,
          actionType: 'open-discussion',
          href: `/courses/${course.id}?tab=discussions&module=${mod.id}`
        };
        if (isOverdue) overdue.push(item);
        else upcoming.push(item);
      }
    });
  });

  overdue.sort((a, b) => a.dueDateMs - b.dueDateMs);
  upcoming.sort((a, b) => a.dueDateMs - b.dueDateMs);

  const visibleOverdue = overdue.slice(0, 6);
  const visibleUpcoming = upcoming.slice(0, 8);

  let upcomingRangeLabel = 'Upcoming Work';
  if (visibleUpcoming.length > 0) {
    const first = new Date(visibleUpcoming[0].dueDateMs);
    const last = new Date(visibleUpcoming[visibleUpcoming.length - 1].dueDateMs);
    upcomingRangeLabel = first.toDateString() === last.toDateString()
      ? formatRangeDate(first)
      : `${formatRangeDate(first)} - ${formatRangeDate(last)}`;
  }

  return {
    overdue: visibleOverdue,
    upcoming: visibleUpcoming,
    upcomingRangeLabel,
    totalCount: visibleOverdue.length + visibleUpcoming.length
  };
}

// GET / - Dashboard
router.get('/', requireAuth, async (req, res) => {
  const data = getLMSData();
  const userProg = getStudentProgress(req);
  const { courses: visibleCourses } = getEnrolledCoursesForUser(data.courses || [], req.session.user);
  const enrichedCourses = visibleCourses.map(c => enrichCourseStats(c, userProg));

  const username = req.session.user.username || req.session.user.email;
  const userSubs = await getSubmissions({ student_username: username });
  const allUserDiscussions = [];
  for (const c of enrichedCourses) {
    const posts = (await getDiscussions(c.id)).filter(
      d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
    );
    allUserDiscussions.push(...posts);
  }
  const workToDo = buildWorkToDo(enrichedCourses, {
    submissions: userSubs,
    discussions: allUserDiscussions
  });

  // Summary statistics for dashboard cards
  const totalEnrolled = enrichedCourses.length;
  const currentCourses = enrichedCourses.filter(c => c.status === 'current' || c.status === 'active');
  const pastCourses = enrichedCourses.filter(c => c.status === 'past');
  const totalCompletedTopics = enrichedCourses.reduce((sum, c) => sum + c.completedTopics, 0);
  const totalTopicsAll = enrichedCourses.reduce((sum, c) => sum + c.totalTopics, 0);
  const overallPercent = totalTopicsAll > 0 ? Math.round((totalCompletedTopics / totalTopicsAll) * 100) : 0;

  const academicConfig = getAcademicConfig();
  const activeTerm = getActiveTerm();
  const termWeekInfo = computeTermWeekInfo(activeTerm);
  const orientationStatus = getOrientationStatus(username);

  let totalQP = 0;
  let gradedCreds = 0;
  let gradedCoursesCount = 0;
  for (const c of visibleCourses) {
    const subs = userSubs.filter(s => Number(s.course_id) === Number(c.id));
    const disc = allUserDiscussions.filter(d => Number(d.course_id) === Number(c.id));
    const gs = computeCourseGradeSummary(subs, disc, c.grade_weights || null);
    if (gs.averagePercent !== null) {
      const gp = letterToGradePoints(computeLetterGrade(gs.averagePercent));
      const creds = Number(c.credits) || 3;
      if (gp !== null) {
        totalQP += gp * creds;
        gradedCreds += creds;
        gradedCoursesCount += 1;
      }
    }
  }
  const cumGpa = gradedCreds > 0 ? (totalQP / gradedCreds).toFixed(2) : null;
  const academicStanding = computeAcademicStanding(cumGpa, gradedCoursesCount);

  const visibleCourseIds = visibleCourses.map(c => Number(c.id));
  const todayEat = getEastAfricaNow().isoDate;
  const upcomingSessions = visibleCourseIds.length > 0
    ? getLiveSessions({ course_ids: visibleCourseIds }).filter(s => String(s.session_date || '') >= todayEat).slice(0, 3)
    : [];
  const attendanceSummary = computeStudentAttendanceSummary(getAttendanceRecords({ student_username: username }));
  const practicumApprovedHours = getPracticumSubmissions({ student_username: username })
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + (Number(p.hours_approved) || 0), 0);

  res.render('dashboard', {
    title: 'Pastor Dashboard | Pastors LMS',
    courses: enrichedCourses,
    currentCourses,
    pastCourses,
    tasks: data.tasks || [],
    workToDo,
    activeTerm,
    termWeekInfo,
    orientationStatus,
    academicStanding,
    upcomingSessions,
    attendanceSummary,
    practicumApprovedHours,
    requireOrientation: Boolean(academicConfig.settings && academicConfig.settings.require_orientation),
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
  const username = req.session.user.username || req.session.user.email;
  const academicConfig = getAcademicConfig();
  const activeTerm = getActiveTerm();

  res.render('courses', {
    title: 'My Courses | Pastors LMS',
    courses,
    activeTerm,
    termWeekInfo: computeTermWeekInfo(activeTerm),
    orientationStatus: getOrientationStatus(username),
    requireOrientation: Boolean(academicConfig.settings && academicConfig.settings.require_orientation),
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
      workToDo: { overdue: [], upcoming: [], upcomingRangeLabel: 'Upcoming Work', totalCount: 0 },
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
  const username = req.session.user.username || req.session.user.email;
  const userRole = req.session.user.role || 'student';

  const academicConfig = getAcademicConfig();
  const orientationStatus = getOrientationStatus(username);
  if (!isStaff && academicConfig.settings && academicConfig.settings.require_orientation && !orientationStatus.completed) {
    return res.redirect('/orientation?required=1');
  }

  const activeTerm = getActiveTerm();
  const termWeekInfo = computeTermWeekInfo(activeTerm);
  const myExtensionRequests = getExtensionRequests({ course_id: courseId, student_username: username });

  let nonExamTotal = 0;
  let nonExamDone = 0;
  if (Array.isArray(course.modulesWithTopics)) {
    course.modulesWithTopics.forEach(mod => {
      (mod.topics || []).forEach(t => {
        if (t.type !== 'exam') {
          nonExamTotal += 1;
          if (t.completed) nonExamDone += 1;
        }
      });
    });
  }
  const nonExamPercent = nonExamTotal > 0 ? Math.min(100, Math.round((nonExamDone / nonExamTotal) * 100)) : 100;

  if (Array.isArray(course.modulesWithTopics)) {
    course.modulesWithTopics = course.modulesWithTopics.map(mod => {
      const rawMod = (rawCourse.modules || []).find(m => Number(m.id) === Number(mod.id)) || mod;
      return {
        ...mod,
        isLocked: isStaff ? false : Boolean(mod.isLocked),
        instructor: resolveModuleInstructor(rawCourse, rawMod),
        topics: (mod.topics || []).map(t => {
          const reqPct = t.type === 'exam' ? (Number(t.minProgressToUnlock) || 0) : 0;
          return {
            ...t,
            deadlineInfo: checkDeadlineLock({
              courseId,
              moduleId: mod.id,
              topicId: t.id,
              dueDateIso: t.dueDateIso,
              username,
              userRole
            }),
            examEligibility: t.type === 'exam' ? {
              eligible: isStaff || reqPct <= 0 || nonExamPercent >= reqPct,
              requiredPercent: reqPct,
              currentPercent: nonExamPercent
            } : null
          };
        })
      };
    });
  }
  course.studentFullName = req.session?.user?.full_name || 'Student';
  course.studentUsername = req.session?.user?.username || '';
  course.userRole = req.session?.user?.role || 'student';

  const [liveAnnouncements, mySubs, courseDiscussions, allUserSubs] = await Promise.all([
    getAnnouncements(courseId),
    getSubmissions({ course_id: courseId, student_username: username }),
    getDiscussions(courseId),
    getSubmissions({ student_username: username })
  ]);
  const myDiscussions = courseDiscussions.filter(
    d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
  );
  const gradeSummary = computeCourseGradeSummary(mySubs, myDiscussions, rawCourse.grade_weights || null);
  const workToDo = buildWorkToDo([course], {
    submissions: mySubs,
    discussions: myDiscussions
  });

  // Enrolled course switcher list (9-dot waffle popover)
  const switcherCourses = allowedCourses.map(c => ({
    id: c.id,
    code: c.code,
    title: c.title,
    term: c.term || 'AY2027-T1',
    status: c.status || 'current'
  }));

  // Notifications bell alerts across all enrolled courses (Quizzes, Assignments, Grades)
  const enrichedAllowed = allowedCourses.map(c => enrichCourseStats(c, userProg));
  const globalWorkToDo = buildWorkToDo(enrichedAllowed, {
    submissions: allUserSubs,
    discussions: myDiscussions
  });
  const notificationAlerts = [];
  [...(globalWorkToDo.upcoming || []), ...(globalWorkToDo.overdue || [])].slice(0, 6).forEach(item => {
    notificationAlerts.push({
      id: `notif-${item.uid}`,
      type: item.type,
      headline: item.type === 'quiz' || item.type === 'exam'
        ? `Quiz due soon. "${item.title}" (${item.dueLabel}).`
        : item.type === 'discussion'
          ? `Discussion activity: "${item.title}" (${item.dueLabel}).`
          : `"${item.title}" is ${item.dueLabel.toLowerCase()}.`,
      subline: `${item.course_code} ${item.course_title}`,
      timeLabel: item.dueLabel,
      href: item.href,
      course_id: item.course_id,
      module_id: item.module_id,
      topic_id: item.topic_id,
      actionType: item.actionType
    });
  });
  notificationAlerts.push({
    id: `notif-grade-${course.id}`,
    type: 'grade',
    headline: gradeSummary && gradeSummary.averagePercent !== null
      ? `"Final Calculated Grade" updated. Your grade is: ${gradeSummary.averagePercent}% (${gradeSummary.letterGrade}).`
      : `"Course Progress" updated: ${course.percent}% (${course.completedTopics}/${course.totalTopics} topics completed).`,
    subline: `${course.code} ${course.title}`,
    timeLabel: 'Gradebook',
    href: `/courses/${course.id}?tab=grades`,
    course_id: course.id,
    actionType: 'open-grades'
  });

  // Envelope / Instant Messages popover items
  const savedMessages = getCourseMessages(courseId);
  const inboxMessages = [
    ...savedMessages.map(m => ({
      id: m.id,
      sender: m.sender_name,
      senderRole: m.sender_role === 'student' ? 'Cohort Pastor' : 'Instructor',
      preview: m.body,
      timeLabel: formatRelativeTime(m.created_at)
    })),
    ...(liveAnnouncements || []).map(a => ({
      id: `ann-${a.id}`,
      sender: a.author_name || 'Course Instructor',
      senderRole: 'Instructor',
      preview: `${a.title}: ${a.body}`,
      timeLabel: formatRelativeTime(a.created_at)
    }))
  ];
  if (course.announcement) {
    inboxMessages.push({
      id: `base-ann-${course.id}`,
      sender: course.courseInstructor ? course.courseInstructor.full_name : 'IDA Academic Faculty',
      senderRole: 'Instructor',
      preview: `${course.announcement.title} — ${course.announcement.content}`,
      timeLabel: course.announcement.date || 'This Term'
    });
  }

  // Speech bubble popover: latest discussion posts
  const discussionAlerts = (courseDiscussions || []).slice(0, 6).map(p => {
    const mod = (course.modulesWithTopics || []).find(m => Number(m.id) === Number(p.module_id));
    return {
      id: p.id,
      author: p.author_name || 'Cohort Pastor',
      module_id: p.module_id,
      module_title: mod ? mod.title : `Unit ${p.module_id}`,
      snippet: String(p.body || '').slice(0, 110),
      timeLabel: formatRelativeTime(p.created_at)
    };
  });

  // Classlist tab (instructors + enrolled cohort pastors)
  const classlist = buildCourseClasslist(rawCourse, course);

  res.render('course-detail', {
    title: `${course.code} - ${course.title} | Pastors LMS`,
    course,
    switcherCourses,
    classlist,
    inboxMessages,
    discussionAlerts,
    notificationAlerts,
    liveAnnouncements,
    gradeSummary,
    mySubmissions: mySubs,
    workToDo,
    activeTerm,
    termWeekInfo,
    orientationStatus,
    myExtensionRequests,
    courseTasks: [],
    allTasks: data.tasks || []
  });
});

// POST /courses/:id/messages - Send an Instant Message inside the course Messages popover
router.post('/courses/:id/messages', requireAuth, (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const allCourses = getLMSData().courses || [];
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }
  const body = String((req.body && req.body.body) || '').trim();
  if (body.length < 2) {
    return res.status(400).json({ success: false, error: 'Please enter a message before sending.' });
  }
  const msg = {
    id: `msg-${Date.now()}`,
    course_id: courseId,
    sender_username: req.session.user.username || req.session.user.email,
    sender_name: req.session.user.full_name || 'Pastor',
    sender_role: req.session.user.role || 'student',
    body: body.slice(0, 1000),
    created_at: new Date().toISOString()
  };
  saveCourseMessage(msg);
  res.json({
    success: true,
    message: {
      id: msg.id,
      sender: msg.sender_name,
      senderRole: msg.sender_role === 'student' ? 'Cohort Pastor' : 'Instructor',
      preview: msg.body,
      timeLabel: 'Just now'
    }
  });
});

// Helper: verify whether a student satisfies completion requirements for a topic
function isAssessmentRequirementMet(topic, userSubs = []) {
  if (!topic) return { ok: true };
  const tType = topic.type;
  const matching = userSubs.filter(s => String(s.topic_id) === String(topic.id));

  if (tType === 'assignment' || tType === 'journal') {
    if (matching.length === 0) {
      return {
        ok: false,
        error: 'Please submit your written assignment (with the Academic Honesty Pledge) before marking this lesson complete.'
      };
    }
    return { ok: true };
  }

  if (tType === 'quiz' || tType === 'exam') {
    // Allow legacy text-only placeholder quizzes (0 interactive questions) to complete cleanly
    if (Number(topic.questionCount) === 0) {
      return { ok: true };
    }
    const passPct = Number(topic.passScore) > 0 ? Number(topic.passScore) : 60;
    const hasPassed = matching.some(s => {
      if (s.score === null || s.score === undefined) return false;
      const max = Number(s.max_score) > 0 ? Number(s.max_score) : 100;
      return ((Number(s.score) / max) * 100) >= passPct;
    });
    if (!hasPassed) {
      return {
        ok: false,
        error: `Please pass this ${tType} (${passPct}% minimum) before marking it complete.`
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

// POST /courses/:id/modules/:moduleId/toggle - Per-student topic & module completion
router.post('/courses/:id/modules/:moduleId/toggle', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const { direction, topicId, action } = req.body;

  const data = getLMSData();
  const allCourses = data.courses || [];
  const rawCourse = allCourses.find(c => c.id === courseId);
  if (!rawCourse) {
    return res.status(404).json({ success: false, error: 'Course not found' });
  }
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }

  const isStaff = ['admin', 'super_admin', 'teacher'].includes(req.session.user.role);
  const modulesWithTopics = getCourseModulesWithTopics(rawCourse, { includeAnswerKeys: false });
  const targetMod = modulesWithTopics.find(m => m.id === moduleId);
  if (!targetMod) {
    return res.status(404).json({ success: false, error: 'Module not found' });
  }

  const todayIso = getEastAfricaNow().isoDate;
  if (!isStaff && targetMod.unlock_date && targetMod.unlock_date > todayIso) {
    return res.status(403).json({
      success: false,
      error: `This unit is locked until ${targetMod.unlock_date}.`
    });
  }

  const topicsList = Array.isArray(targetMod.topics) ? targetMod.topics : [];
  const allTopicIds = topicsList.map(t => String(t.id));
  const userProg = getStudentProgress(req);
  const modKey = String(moduleId);
  let completedSet = new Set(Array.isArray(userProg[modKey]) ? userProg[modKey].map(String) : []);

  const username = req.session.user.username || req.session.user.email;
  const userSubs = isStaff ? [] : await getSubmissions({ course_id: courseId, student_username: username });

  if (action === 'complete_module') {
    if (isStaff) {
      completedSet = new Set(allTopicIds);
    } else {
      topicsList.forEach(t => {
        if (isAssessmentRequirementMet(t, userSubs).ok) {
          completedSet.add(String(t.id));
        }
      });
    }
  } else if (action === 'reset_module') {
    completedSet.clear();
  } else if (topicId) {
    const tid = String(topicId);
    if (direction === 'dec') {
      completedSet.delete(tid);
    } else if (allTopicIds.includes(tid)) {
      const targetTopic = topicsList.find(t => String(t.id) === tid);
      if (!isStaff) {
        const reqCheck = isAssessmentRequirementMet(targetTopic, userSubs);
        if (!reqCheck.ok) {
          return res.status(400).json({ success: false, error: reqCheck.error });
        }
      }
      completedSet.add(tid);
    }
  } else if (direction === 'dec') {
    const currentArr = Array.from(completedSet);
    if (currentArr.length > 0) {
      completedSet.delete(currentArr[currentArr.length - 1]);
    }
  } else {
    const nextTopicObj = topicsList.find(t => !completedSet.has(String(t.id)) && (isStaff || isAssessmentRequirementMet(t, userSubs).ok));
    if (nextTopicObj) {
      completedSet.add(String(nextTopicObj.id));
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
