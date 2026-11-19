const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireTeacher, requireAdmin } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { getTeacherAssignments } = require('../utils/instructors');
const {
  readLocalJson,
  computeLetterGrade,
  letterToGradePoints,
  computeCourseGradeSummary,
  getSubmissions,
  saveSubmission,
  gradeSubmission,
  getDiscussions,
  addDiscussionPost,
  gradeDiscussionPost,
  getPeerReviews,
  addPeerReview,
  getAnnouncements,
  addAnnouncement,
  getEnrolledCoursesForUser
} = require('../utils/lms-store');

const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');
const PROGRESS_FILE = path.join(__dirname, '../data/student-progress.json');

function getCourses() {
  try {
    const raw = JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8'));
    return raw.courses || [];
  } catch {
    return [];
  }
}

async function resolveStudentRecord(identifier) {
  const target = String(identifier || '').trim().toLowerCase();
  if (!target) return null;

  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from('students')
        .select('*')
        .or(`username.ilike.${target},student_id.ilike.${target},email.ilike.${target}`)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    } catch {
      // fall through
    }
  }

  const users = readLocalJson('users.json', []);
  return users.find(u =>
    (u.username && u.username.toLowerCase() === target) ||
    (u.student_id && u.student_id.toLowerCase() === target) ||
    (u.email && u.email.toLowerCase() === target)
  ) || null;
}

function getUserCompletionPercent(username, course) {
  const allProg = readLocalJson('student-progress.json', {});
  const userKey = String(username || '').toLowerCase();
  const userProg = allProg[userKey] || {};
  const completed = Array.isArray(userProg[String(course.id)]) ? userProg[String(course.id)] : [];
  const totalTopics = (course.modules || []).reduce((sum, m) => sum + (Number(m.total_topics) || 0), 0);
  if (totalTopics <= 0) return 0;
  return Math.min(100, Math.round((completed.length / totalTopics) * 100));
}

// ==========================================================================
// 1. STUDENT SUBMISSIONS & GRADEBOOK API
// ==========================================================================

// GET /api/courses/:id/submissions - Current user's submissions & grades for a course
router.get('/api/courses/:id/submissions', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const username = req.session.user.username || req.session.user.email;
  const subs = await getSubmissions({ course_id: courseId, student_username: username });
  const discussions = (await getDiscussions(courseId)).filter(
    d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
  );
  const peerReviews = await getPeerReviews(courseId);
  const summary = computeCourseGradeSummary(subs, discussions);

  res.json({
    success: true,
    submissions: subs,
    peerReviews,
    summary
  });
});

// POST /api/courses/:id/submissions - Submit written assignment, journal, graded quiz, or exam
router.post('/api/courses/:id/submissions', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const {
    module_id,
    topic_id,
    topic_title,
    submission_type,
    content_text,
    quiz_answers,
    score,
    max_score,
    max_attempts
  } = req.body;

  const username = req.session.user.username || req.session.user.email;
  const studentName = req.session.user.full_name || username;
  const type = ['assignment', 'journal', 'quiz', 'exam'].includes(submission_type)
    ? submission_type
    : 'assignment';

  if (!topic_id) {
    return res.status(400).json({ success: false, error: 'Missing topic identifier.' });
  }

  const existing = await getSubmissions({
    course_id: courseId,
    student_username: username,
    topic_id: String(topic_id)
  });

  if (type === 'assignment' || type === 'journal') {
    const cleanText = (content_text || '').trim();
    if (cleanText.length < 10) {
      return res.status(400).json({ success: false, error: 'Please write at least 10 characters before submitting.' });
    }
    const prev = existing[0] || null;
    const saved = await saveSubmission({
      id: prev ? prev.id : undefined,
      student_username: username,
      student_name: studentName,
      course_id: courseId,
      module_id: Number(module_id) || 1,
      topic_id: String(topic_id),
      topic_title: topic_title || 'Written Assignment',
      submission_type: type,
      content_text: cleanText,
      max_score: Number(max_score) || 100,
      attempt_number: prev ? (Number(prev.attempt_number) || 1) + 1 : 1
    });
    return res.json({ success: true, submission: saved });
  }

  // Quiz or Graded Exam
  const attemptLimit = Number(max_attempts) > 0 ? Number(max_attempts) : 5;
  if (existing.length >= attemptLimit) {
    return res.status(400).json({
      success: false,
      error: `You have reached the maximum of ${attemptLimit} attempts for this assessment.`
    });
  }

  const numericScore = Number(score);
  const numericMax = Number(max_score) > 0 ? Number(max_score) : 100;
  const saved = await saveSubmission({
    student_username: username,
    student_name: studentName,
    course_id: courseId,
    module_id: Number(module_id) || 1,
    topic_id: String(topic_id),
    topic_title: topic_title || (type === 'exam' ? 'Graded Exam' : 'Unit Quiz'),
    submission_type: type,
    quiz_answers: quiz_answers || {},
    score: Number.isFinite(numericScore) ? numericScore : 0,
    max_score: numericMax,
    graded_by: 'Auto-Graded',
    feedback: Number.isFinite(numericScore) && (numericScore / numericMax) >= 0.6
      ? 'Passed! Well done on your biblical study.'
      : 'Keep studying the unit readings and try again if attempts remain.',
    attempt_number: existing.length + 1
  });

  res.json({
    success: true,
    submission: saved,
    attemptsUsed: existing.length + 1,
    attemptsRemaining: Math.max(0, attemptLimit - (existing.length + 1))
  });
});

// ==========================================================================
// 2. WEEKLY COHORT DISCUSSION FORUMS & PEER FEEDBACK
// ==========================================================================

// GET /api/courses/:id/modules/:moduleId/discussions
router.get('/api/courses/:id/modules/:moduleId/discussions', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const posts = await getDiscussions(courseId, moduleId);

  // Also include fellow pastors' written assignments in this module for optional peer feedback
  const username = String(req.session.user.username || '').toLowerCase();
  const moduleSubs = (await getSubmissions({ course_id: courseId, module_id: moduleId }))
    .filter(s => (s.submission_type === 'assignment' || s.submission_type === 'journal') && s.content_text);
  const peerReviews = await getPeerReviews(courseId);

  const peerSubmissions = moduleSubs
    .filter(s => String(s.student_username || '').toLowerCase() !== username)
    .slice(0, 6)
    .map(s => ({
      id: s.id,
      student_name: s.student_name,
      topic_title: s.topic_title,
      content_text: s.content_text,
      created_at: s.created_at,
      reviews: peerReviews.filter(r => r.submission_id === s.id)
    }));

  res.json({
    success: true,
    posts,
    peerSubmissions
  });
});

// POST /api/courses/:id/modules/:moduleId/discussions
router.post('/api/courses/:id/modules/:moduleId/discussions', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const body = (req.body.body || '').trim();
  const parentId = req.body.parent_id || null;

  if (body.length < 5) {
    return res.status(400).json({ success: false, error: 'Please write a short reflection or reply before posting.' });
  }

  const post = await addDiscussionPost({
    course_id: courseId,
    module_id: moduleId,
    parent_id: parentId,
    author_username: req.session.user.username || req.session.user.email,
    author_name: req.session.user.full_name || 'Pastor',
    author_role: req.session.user.role || 'student',
    body
  });

  res.json({ success: true, post });
});

// POST /api/courses/:id/submissions/:subId/peer-review
router.post('/api/courses/:id/submissions/:subId/peer-review', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const subId = req.params.subId;
  const feedback = (req.body.feedback || '').trim();
  const rating = parseInt(req.body.rating, 10) || 5;

  if (feedback.length < 8) {
    return res.status(400).json({ success: false, error: 'Please write an encouraging peer review note (at least 8 characters).' });
  }

  const subs = await getSubmissions({ course_id: courseId });
  const targetSub = subs.find(s => s.id === subId);
  if (!targetSub) {
    return res.status(404).json({ success: false, error: 'Submission not found.' });
  }
  if (String(targetSub.student_username).toLowerCase() === String(req.session.user.username).toLowerCase()) {
    return res.status(400).json({ success: false, error: 'You cannot peer-review your own submission.' });
  }

  const review = await addPeerReview({
    submission_id: subId,
    course_id: courseId,
    reviewer_username: req.session.user.username || req.session.user.email,
    reviewer_name: req.session.user.full_name || 'Fellow Pastor',
    rating,
    feedback
  });

  res.json({ success: true, review });
});

// ==========================================================================
// 3. TEACHER GRADING QUEUE & COURSE ANNOUNCEMENTS
// ==========================================================================

// GET /teacher/grading - Lecturer Grading Queue (scoped to teacher's assigned courses/modules)
router.get('/teacher/grading', requireTeacher, async (req, res) => {
  const user = req.session.user;
  const allCourses = getCourses();
  const isStaffAdmin = ['admin', 'super_admin'].includes(user.role);

  let allowedCourseIds = new Set();
  let allowedModulePairs = new Set(); // "courseId:moduleId"

  if (isStaffAdmin) {
    allCourses.forEach(c => {
      allowedCourseIds.add(Number(c.id));
      (c.modules || []).forEach(m => allowedModulePairs.add(`${c.id}:${m.id}`));
    });
  } else {
    const assignments = getTeacherAssignments(allCourses, user.username);
    assignments.forEach(a => {
      allowedCourseIds.add(Number(a.course.id));
      a.assignedModules.forEach(m => allowedModulePairs.add(`${a.course.id}:${m.id}`));
    });
  }

  const allSubs = await getSubmissions();
  const scopedSubs = allSubs
    .filter(s => allowedModulePairs.has(`${s.course_id}:${s.module_id}`) || (isStaffAdmin && allowedCourseIds.has(Number(s.course_id))))
    .map(s => {
      const course = allCourses.find(c => Number(c.id) === Number(s.course_id));
      const mod = course && (course.modules || []).find(m => Number(m.id) === Number(s.module_id));
      return {
        ...s,
        course_code: course ? course.code : `Course #${s.course_id}`,
        course_title: course ? course.title : '',
        module_title: mod ? mod.title : `Module ${s.module_id}`
      };
    });

  // Top-level student discussion posts for grading participation
  const discussionItems = [];
  for (const cId of allowedCourseIds) {
    const course = allCourses.find(c => Number(c.id) === Number(cId));
    const posts = (await getDiscussions(cId)).filter(p => !p.parent_id && p.author_role === 'student');
    posts.forEach(p => {
      if (isStaffAdmin || allowedModulePairs.has(`${p.course_id}:${p.module_id}`)) {
        const mod = course && (course.modules || []).find(m => Number(m.id) === Number(p.module_id));
        discussionItems.push({
          ...p,
          course_code: course ? course.code : `Course #${cId}`,
          module_title: mod ? mod.title : `Module ${p.module_id}`
        });
      }
    });
  }

  const filterStatus = req.query.status || 'all';
  const filteredSubs = filterStatus === 'pending'
    ? scopedSubs.filter(s => s.status !== 'graded')
    : (filterStatus === 'graded' ? scopedSubs.filter(s => s.status === 'graded') : scopedSubs);

  res.render('teacher-grading', {
    title: 'Grading Queue | Pastors LMS',
    user,
    isStaffAdmin,
    submissions: filteredSubs,
    pendingCount: scopedSubs.filter(s => s.status !== 'graded').length,
    gradedCount: scopedSubs.filter(s => s.status === 'graded').length,
    discussions: discussionItems,
    filterStatus,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /teacher/submissions/:subId/grade
router.post('/teacher/submissions/:subId/grade', requireTeacher, async (req, res) => {
  const { score, feedback } = req.body;
  const updated = await gradeSubmission(req.params.subId, {
    score,
    feedback,
    gradedBy: req.session.user.full_name || req.session.user.username
  });
  if (!updated) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Could not grade that submission. Check the score (0-100).'));
  }
  res.redirect('/teacher/grading?success=' + encodeURIComponent(`Graded ${updated.student_name} (${updated.score}/${updated.max_score} — ${updated.grade_letter}).`));
});

// POST /teacher/discussions/:postId/grade
router.post('/teacher/discussions/:postId/grade', requireTeacher, async (req, res) => {
  const { score, feedback } = req.body;
  const updated = await gradeDiscussionPost(req.params.postId, {
    score,
    feedback,
    gradedBy: req.session.user.full_name || req.session.user.username
  });
  if (!updated) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Could not grade discussion post.'));
  }
  res.redirect('/teacher/grading?success=' + encodeURIComponent(`Discussion graded for ${updated.author_name} (${updated.grade_score}/100).`));
});

// POST /teacher/courses/:id/announcements
router.post('/teacher/courses/:id/announcements', requireTeacher, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  if (!title || !body) {
    return res.redirect('/teacher/classes?error=' + encodeURIComponent('Announcement title and message are required.'));
  }
  await addAnnouncement({
    course_id: courseId,
    author_username: req.session.user.username,
    author_name: req.session.user.full_name || 'Instructor',
    title,
    body
  });
  res.redirect('/teacher/classes?success=' + encodeURIComponent('Course announcement published to students.'));
});

// ==========================================================================
// 4. OFFICIAL ACADEMIC TRANSCRIPT & COURSE COMPLETION CERTIFICATE
// ==========================================================================

async function renderTranscriptForUser(targetUser, res, isAdminView = false) {
  const allCourses = getCourses();
  const { courses } = getEnrolledCoursesForUser(allCourses, targetUser);
  const username = targetUser.username || targetUser.email;

  const courseRecords = [];
  let totalCredits = 0;
  let totalQualityPoints = 0;
  let gradedCredits = 0;

  for (const course of courses) {
    const subs = await getSubmissions({ course_id: course.id, student_username: username });
    const disc = (await getDiscussions(course.id)).filter(
      d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
    );
    const gradeSummary = computeCourseGradeSummary(subs, disc);
    const completionPct = getUserCompletionPercent(username, course);
    const credits = Number(course.credits) || 3.0;
    totalCredits += credits;

    if (gradeSummary.gradePoints !== null) {
      gradedCredits += credits;
      totalQualityPoints += gradeSummary.gradePoints * credits;
    }

    courseRecords.push({
      id: course.id,
      code: course.code,
      title: course.title,
      term: course.term || 'AY2027-T1',
      credits,
      completionPct,
      averagePercent: gradeSummary.averagePercent,
      letterGrade: gradeSummary.letterGrade,
      gradePoints: gradeSummary.gradePoints,
      status: completionPct >= 100 ? 'Completed' : (completionPct > 0 || gradeSummary.gradedCount > 0 ? 'In Progress' : 'Enrolled')
    });
  }

  const cumulativeGpa = gradedCredits > 0 ? (totalQualityPoints / gradedCredits).toFixed(2) : '—';
  const issuedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  res.render('transcript', {
    title: `Official Academic Transcript – ${targetUser.full_name || username} | Pastors LMS`,
    student: targetUser,
    courseRecords,
    totalCredits: totalCredits.toFixed(1),
    gradedCredits: gradedCredits.toFixed(1),
    cumulativeGpa,
    issuedDate,
    isAdminView
  });
}

// GET /transcript - Logged-in student's official transcript
router.get('/transcript', requireAuth, async (req, res) => {
  const record = (await resolveStudentRecord(req.session.user.username || req.session.user.email)) || req.session.user;
  await renderTranscriptForUser(record, res, false);
});

// GET /admin/students/:studentId/transcript - Admin printable transcript for any student
router.get('/admin/students/:studentId/transcript', requireAdmin, async (req, res) => {
  const student = await resolveStudentRecord(req.params.studentId);
  if (!student) {
    return res.redirect('/admin/students?error=' + encodeURIComponent('Student record not found for transcript.'));
  }
  await renderTranscriptForUser(student, res, true);
});

// GET /courses/:id/certificate - Official Course Completion Certificate
router.get('/courses/:id/certificate', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const course = getCourses().find(c => Number(c.id) === courseId);
  if (!course) {
    return res.redirect('/courses');
  }

  const student = (await resolveStudentRecord(req.session.user.username || req.session.user.email)) || req.session.user;
  const username = student.username || student.email;
  const completionPct = getUserCompletionPercent(username, course);
  const subs = await getSubmissions({ course_id: course.id, student_username: username });
  const disc = (await getDiscussions(course.id)).filter(
    d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
  );
  const gradeSummary = computeCourseGradeSummary(subs, disc);
  const isStaff = ['admin', 'super_admin', 'teacher'].includes(req.session.user.role);
  const isUnlocked = completionPct >= 100 || isStaff;

  const certSerial = `IDA-CERT-${course.code.replace(/\s+/g, '')}-${String(student.student_id || username).toUpperCase()}`;
  const issuedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  res.render('certificate', {
    title: `Certificate of Completion – ${course.code} | Pastors LMS`,
    course,
    student,
    completionPct,
    gradeSummary,
    isUnlocked,
    isStaff,
    certSerial,
    issuedDate
  });
});

// ==========================================================================
// 5. OFFLINE PWA FALLBACK PAGE
// ==========================================================================
router.get('/offline', (req, res) => {
  res.render('offline', {
    title: 'Offline Reading | Pastors LMS'
  });
});

module.exports = router;
