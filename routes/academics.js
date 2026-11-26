const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireTeacher, requireAdmin } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { getTeacherAssignments } = require('../utils/instructors');
const {
  getCourseModulesWithTopics,
  getQuizDefinition
} = require('../data/course-content');
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
  getEnrolledCoursesForUser,
  isCourseEnrolled,
  getEastAfricaNow,
  getDeadlineExtensions,
  saveDeadlineExtension,
  deleteDeadlineExtension,
  checkDeadlineLock,
  getAcademicConfig,
  getActiveTerm,
  computeTermWeekInfo,
  getOrientationStatus,
  saveOrientationCompletion,
  getExtensionRequests,
  createExtensionRequest,
  resolveExtensionRequest
} = require('../utils/lms-store');
const {
  DEFAULT_TOKEN_FEE,
  normalizeScope,
  getTranscriptRecord,
  saveTranscriptRecord,
  verifyTranscriptByCode
} = require('../utils/transcript-store');
const { generateQrSvg } = require('../utils/qr-svg');

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

function getUserCourseCompletion(username, course) {
  const allProg = readLocalJson('student-progress.json', {});
  const userKey = String(username || '').toLowerCase();
  const userProg = (allProg[userKey] && typeof allProg[userKey] === 'object') ? allProg[userKey] : {};
  const modulesWithTopics = getCourseModulesWithTopics(course, { includeAnswerKeys: false });

  let totalTopics = 0;
  let completedTopics = 0;

  modulesWithTopics.forEach(mod => {
    const modTopics = Array.isArray(mod.topics) ? mod.topics : [];
    const modTotal = modTopics.length || Number(mod.total_topics) || 0;
    const savedList = Array.isArray(userProg[String(mod.id)]) ? userProg[String(mod.id)].map(String) : [];
    const validCompleted = modTopics.filter(t => savedList.includes(String(t.id)));
    totalTopics += modTotal;
    completedTopics += Math.min(modTotal, validCompleted.length);
  });

  const percent = totalTopics > 0 ? Math.min(100, Math.round((completedTopics / totalTopics) * 100)) : 0;
  return { completedTopics, totalTopics, percent };
}

function getUserCompletionPercent(username, course) {
  return getUserCourseCompletion(username, course).percent;
}

function isStaffUser(user) {
  return Boolean(user && ['admin', 'super_admin', 'teacher'].includes(user.role));
}

function checkModuleUnlockGuard(course, moduleId, user) {
  const mods = getCourseModulesWithTopics(course, { includeAnswerKeys: false });
  const mod = mods.find(m => Number(m.id) === Number(moduleId));
  if (!mod) return { ok: false, status: 404, error: 'Module not found.' };
  const todayIso = getEastAfricaNow().isoDate;
  if (!isStaffUser(user) && mod.unlock_date && mod.unlock_date > todayIso) {
    return {
      ok: false,
      status: 403,
      error: `This unit is locked until ${mod.unlock_date}. Complete your current unit first.`
    };
  }
  return { ok: true, mod };
}

// ==========================================================================
// 1. STUDENT SUBMISSIONS & GRADEBOOK API
// ==========================================================================

// GET /api/courses/:id/submissions - Current user's submissions & grades for a course
router.get('/api/courses/:id/submissions', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const allCourses = getCourses();
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }
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
  const allCourses = getCourses();
  const course = allCourses.find(c => Number(c.id) === courseId);
  if (!course) {
    return res.status(404).json({ success: false, error: 'Course not found.' });
  }
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }

  const {
    module_id,
    topic_id,
    topic_title,
    submission_type,
    content_text,
    quiz_answers,
    integrity_pledge
  } = req.body;

  const username = req.session.user.username || req.session.user.email;
  const studentName = req.session.user.full_name || username;
  const userRole = req.session.user.role || 'student';
  const type = ['assignment', 'journal', 'quiz', 'exam'].includes(submission_type)
    ? submission_type
    : 'assignment';

  if (!topic_id) {
    return res.status(400).json({ success: false, error: 'Missing topic identifier.' });
  }

  const modNum = Number(module_id) || (course.modules && course.modules[0] && course.modules[0].id) || 1;
  const lockCheck = checkModuleUnlockGuard(course, modNum, req.session.user);
  if (!lockCheck.ok) {
    return res.status(lockCheck.status).json({ success: false, error: lockCheck.error });
  }

  const topicDef = (lockCheck.mod.topics || []).find(t => String(t.id) === String(topic_id));
  const deadlineInfo = checkDeadlineLock({
    courseId,
    moduleId: modNum,
    topicId: String(topic_id),
    dueDateIso: topicDef ? topicDef.dueDateIso : null,
    username,
    userRole
  });
  if (deadlineInfo.locked) {
    return res.status(403).json({
      success: false,
      error: `Submission deadline (${deadlineInfo.effectiveDueDate} 11:59 PM EAT) has passed. Contact your instructor to request a deadline extension.`
    });
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
    const pledgeAccepted = integrity_pledge === true || integrity_pledge === 'true' || integrity_pledge === 'on';
    if (!pledgeAccepted) {
      return res.status(400).json({
        success: false,
        error: 'Please confirm the Academic Honesty Pledge before submitting your work.'
      });
    }

    const prev = existing[0] || null;
    const serverMaxScore = (topicDef && Number(topicDef.maxScore) > 0) ? Number(topicDef.maxScore) : 100;
    const saved = await saveSubmission({
      id: prev ? prev.id : undefined,
      student_username: username,
      student_name: studentName,
      course_id: courseId,
      module_id: modNum,
      topic_id: String(topic_id),
      topic_title: (topicDef && topicDef.title) || topic_title || 'Written Assignment',
      submission_type: type,
      content_text: cleanText,
      max_score: serverMaxScore,
      integrity_pledged: true,
      attempt_number: prev ? (Number(prev.attempt_number) || 1) + 1 : 1
    });
    return res.json({ success: true, submission: saved });
  }

  // Quiz or Graded Exam: strictly graded on the server using authoritative answer keys
  const quizDef = getQuizDefinition(course, modNum, String(topic_id));
  if (!quizDef || !Array.isArray(quizDef.questions) || quizDef.questions.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'This quiz does not have interactive questions configured yet.'
    });
  }

  const attemptLimit = quizDef.maxAttempts;
  if (existing.length >= attemptLimit) {
    return res.status(400).json({
      success: false,
      error: `You have reached the maximum of ${attemptLimit} attempts for this assessment.`
    });
  }

  const submittedAnswers = (quiz_answers && typeof quiz_answers === 'object') ? quiz_answers : {};
  let correctCount = 0;
  const totalQuestions = quizDef.questions.length;
  const results = {};
  const attemptsUsed = existing.length + 1;
  const attemptsRemaining = Math.max(0, attemptLimit - attemptsUsed);

  quizDef.questions.forEach(q => {
    const qKey = `q${q.qNum}`;
    const rawSelected = submittedAnswers[qKey] !== undefined ? submittedAnswers[qKey] : submittedAnswers[String(q.qNum)];
    const selected = rawSelected ? String(rawSelected).trim().toLowerCase() : null;
    const isCorrect = Boolean(selected && selected === q.correct);
    if (isCorrect) correctCount += 1;

    results[qKey] = {
      correct: isCorrect,
      selected,
      correctOption: (!quizDef.isExam || attemptsRemaining === 0) ? q.correct : undefined
    };
  });

  const percent = Math.round((correctCount / totalQuestions) * 100);
  const numericMax = quizDef.maxScore;
  const numericScore = Math.round((percent / 100) * numericMax);
  const passed = percent >= quizDef.passScore;

  const saved = await saveSubmission({
    student_username: username,
    student_name: studentName,
    course_id: courseId,
    module_id: modNum,
    topic_id: String(topic_id),
    topic_title: quizDef.topic.title || topic_title || (quizDef.isExam ? 'Graded Exam' : 'Unit Quiz'),
    submission_type: quizDef.isExam ? 'exam' : 'quiz',
    quiz_answers: submittedAnswers,
    score: numericScore,
    max_score: numericMax,
    graded_by: 'Auto-Graded (Server)',
    feedback: passed
      ? 'Passed! Well done on your biblical study.'
      : 'Keep studying the unit readings and try again if attempts remain.',
    attempt_number: attemptsUsed
  });

  res.json({
    success: true,
    submission: saved,
    score: numericScore,
    maxScore: numericMax,
    correctCount,
    totalQuestions,
    percent,
    passed,
    passScore: quizDef.passScore,
    results,
    attemptsUsed,
    attemptsRemaining
  });
});

// ==========================================================================
// 2. WEEKLY COHORT DISCUSSION FORUMS & PEER FEEDBACK
// ==========================================================================

// GET /api/courses/:id/modules/:moduleId/discussions
router.get('/api/courses/:id/modules/:moduleId/discussions', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const allCourses = getCourses();
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }
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
  const allCourses = getCourses();
  const course = allCourses.find(c => Number(c.id) === courseId);
  if (!course) {
    return res.status(404).json({ success: false, error: 'Course not found.' });
  }
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }
  const lockCheck = checkModuleUnlockGuard(course, moduleId, req.session.user);
  if (!lockCheck.ok) {
    return res.status(lockCheck.status).json({ success: false, error: lockCheck.error });
  }

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
  const allCourses = getCourses();
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }
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

  const allowedCoursesList = allCourses.filter(c => allowedCourseIds.has(Number(c.id)));
  const studentsList = readLocalJson('users.json', [])
    .filter(u => u && u.role === 'student' && u.status !== 'rejected' && u.status !== 'disabled')
    .sort((a, b) => String(a.full_name || a.username).localeCompare(String(b.full_name || b.username)));
  const extensionsList = getDeadlineExtensions()
    .filter(ext => allowedCourseIds.has(Number(ext.course_id)))
    .map(ext => {
      const c = allCourses.find(item => Number(item.id) === Number(ext.course_id));
      const m = c && (c.modules || []).find(item => Number(item.id) === Number(ext.module_id));
      return {
        ...ext,
        course_code: c ? c.code : `Course #${ext.course_id}`,
        module_title: m ? m.title : `Module ${ext.module_id}`
      };
    });

  const extensionRequestsList = getExtensionRequests()
    .filter(reqItem => allowedCourseIds.has(Number(reqItem.course_id)))
    .map(reqItem => {
      const c = allCourses.find(item => Number(item.id) === Number(reqItem.course_id));
      const m = c && (c.modules || []).find(item => Number(item.id) === Number(reqItem.module_id));
      return {
        ...reqItem,
        course_code: c ? c.code : `Course #${reqItem.course_id}`,
        module_title: m ? m.title : `Module ${reqItem.module_id}`
      };
    });

  res.render('teacher-grading', {
    title: 'Grading Queue | Pastors LMS',
    user,
    isStaffAdmin,
    submissions: filteredSubs,
    pendingCount: scopedSubs.filter(s => s.status !== 'graded').length,
    gradedCount: scopedSubs.filter(s => s.status === 'graded').length,
    discussions: discussionItems,
    allowedCourses: allowedCoursesList,
    students: studentsList,
    extensions: extensionsList,
    extensionRequests: extensionRequestsList,
    filterStatus,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /teacher/extension-requests/:id/resolve - Approve or deny student extension request
router.post('/teacher/extension-requests/:id/resolve', requireTeacher, (req, res) => {
  const decision = req.body.decision === 'approve' ? 'approved' : (req.body.decision === 'deny' ? 'denied' : null);
  if (!decision) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Invalid extension request decision.'));
  }

  const allReqs = getExtensionRequests();
  const target = allReqs.find(r => r.id === req.params.id);
  if (!target) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Extension request not found.'));
  }

  const user = req.session.user;
  const isStaffAdmin = ['admin', 'super_admin'].includes(user.role);
  if (!isStaffAdmin) {
    const assignments = getTeacherAssignments(getCourses(), user.username);
    const hasAccess = assignments.some(a =>
      Number(a.course.id) === Number(target.course_id) &&
      a.assignedModules.some(m => Number(m.id) === Number(target.module_id))
    );
    if (!hasAccess) {
      return res.redirect('/teacher/grading?error=' + encodeURIComponent('You may only review requests for your assigned modules.'));
    }
  }

  const resolved = resolveExtensionRequest(req.params.id, {
    status: decision,
    approved_until: req.body.approved_until,
    reviewer_name: user.full_name || user.username,
    reviewer_note: req.body.reviewer_note
  });

  if (!resolved) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Could not update extension request.'));
  }

  const msg = decision === 'approved'
    ? `Approved extension for ${resolved.student_name} until ${resolved.requested_until}.`
    : `Declined extension request from ${resolved.student_name}.`;
  res.redirect('/teacher/grading?success=' + encodeURIComponent(msg));
});

// POST /teacher/extensions - Grant per-student module/topic deadline extension
router.post('/teacher/extensions', requireTeacher, (req, res) => {
  const user = req.session.user;
  const allCourses = getCourses();
  const isStaffAdmin = ['admin', 'super_admin'].includes(user.role);
  const courseId = parseInt(req.body.course_id, 10);
  const moduleId = parseInt(req.body.module_id, 10);
  const studentUsername = String(req.body.student_username || '').trim().toLowerCase();
  const extendedUntil = String(req.body.extended_until || '').trim();
  const reason = String(req.body.reason || '').trim();
  const topicId = String(req.body.topic_id || '*').trim() || '*';

  if (!courseId || !moduleId || !studentUsername || !/^\d{4}-\d{2}-\d{2}$/.test(extendedUntil)) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Select a student, course, unit, and valid extension date.'));
  }

  if (!isStaffAdmin) {
    const assignments = getTeacherAssignments(allCourses, user.username);
    const hasModAccess = assignments.some(a =>
      Number(a.course.id) === courseId && a.assignedModules.some(m => Number(m.id) === moduleId)
    );
    if (!hasModAccess) {
      return res.redirect('/teacher/grading?error=' + encodeURIComponent('You may only grant extensions for your assigned units.'));
    }
  }

  const users = readLocalJson('users.json', []);
  const targetUser = users.find(u => String(u.username || '').toLowerCase() === studentUsername);
  const saved = saveDeadlineExtension({
    student_username: studentUsername,
    student_name: (targetUser && (targetUser.full_name || targetUser.username)) || studentUsername,
    course_id: courseId,
    module_id: moduleId,
    topic_id: topicId,
    extended_until: extendedUntil,
    reason,
    granted_by: user.full_name || user.username
  });

  if (!saved) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Could not save deadline extension.'));
  }
  res.redirect('/teacher/grading?success=' + encodeURIComponent(`Extension granted to ${saved.student_name} until ${saved.extended_until}.`));
});

// POST /teacher/extensions/:id/delete - Revoke a deadline extension
router.post('/teacher/extensions/:id/delete', requireTeacher, (req, res) => {
  const deleted = deleteDeadlineExtension(req.params.id);
  if (!deleted) {
    return res.redirect('/teacher/grading?error=' + encodeURIComponent('Deadline extension not found.'));
  }
  res.redirect('/teacher/grading?success=' + encodeURIComponent('Deadline extension removed.'));
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
// 4. OFFICIAL ACADEMIC TRANSCRIPT (PER-COURSE + CUMULATIVE), ADMIN EDITOR,
//    TOKEN FEE VERIFICATION, QR CODE & ZERO-BREACH PUBLIC VERIFICATION
// ==========================================================================

function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

async function computeTranscriptData(targetUser, selectedCourseId = 'all', savedRecord = null) {
  const allCourses = getCourses();
  const { courses: enrolledCourses } = getEnrolledCoursesForUser(allCourses, targetUser);
  const username = targetUser.username || targetUser.email;
  const scope = normalizeScope(selectedCourseId);
  const targetCourseNum = scope.startsWith('course:') ? parseInt(scope.split(':')[1], 10) : null;

  const filteredCourses = targetCourseNum
    ? enrolledCourses.filter(c => Number(c.id) === targetCourseNum)
    : enrolledCourses;
  const activeCourses = filteredCourses.length > 0 ? filteredCourses : enrolledCourses;

  const overrides = (savedRecord && savedRecord.course_overrides && typeof savedRecord.course_overrides === 'object')
    ? savedRecord.course_overrides
    : {};

  const courseRecords = [];
  let totalCredits = 0;
  let totalQualityPoints = 0;
  let gradedCredits = 0;

  for (const course of activeCourses) {
    const subs = await getSubmissions({ course_id: course.id, student_username: username });
    const disc = (await getDiscussions(course.id)).filter(
      d => String(d.author_username || '').toLowerCase() === String(username).toLowerCase()
    );
    const gradeSummary = computeCourseGradeSummary(subs, disc);
    const baseCompletion = getUserCompletionPercent(username, course);
    const ov = overrides[String(course.id)] || {};

    const credits = Number.isFinite(Number(ov.credits)) && Number(ov.credits) > 0
      ? Number(ov.credits)
      : (Number(course.credits) || 3.0);

    const completionPct = (ov.completionPct !== undefined && ov.completionPct !== '' && Number.isFinite(Number(ov.completionPct)))
      ? Math.min(100, Math.max(0, Math.round(Number(ov.completionPct))))
      : baseCompletion;

    const averagePercent = (ov.averagePercent !== undefined && ov.averagePercent !== '' && Number.isFinite(Number(ov.averagePercent)))
      ? Math.min(100, Math.max(0, Math.round(Number(ov.averagePercent))))
      : gradeSummary.averagePercent;

    let letterGrade = (ov.letterGrade && String(ov.letterGrade).trim())
      ? String(ov.letterGrade).trim().toUpperCase()
      : (averagePercent !== null ? computeLetterGrade(averagePercent) : gradeSummary.letterGrade);

    let gradePoints = letterToGradePoints(letterGrade);
    if (gradePoints === null && averagePercent !== null) {
      gradePoints = letterToGradePoints(computeLetterGrade(averagePercent));
    }

    const status = (ov.status && String(ov.status).trim())
      ? String(ov.status).trim()
      : (completionPct >= 100 ? 'Completed' : (completionPct > 0 || gradeSummary.gradedCount > 0 ? 'In Progress' : 'Enrolled'));

    const term = (ov.term && String(ov.term).trim()) ? String(ov.term).trim() : (course.term || 'AY2027-T1');

    totalCredits += credits;
    if (gradePoints !== null) {
      gradedCredits += credits;
      totalQualityPoints += gradePoints * credits;
    }

    courseRecords.push({
      id: course.id,
      code: course.code,
      title: course.title,
      term,
      credits,
      completionPct,
      averagePercent,
      letterGrade,
      gradePoints,
      status
    });
  }

  const cumulativeGpa = gradedCredits > 0 ? (totalQualityPoints / gradedCredits).toFixed(2) : '—';
  const selectedCourseObj = targetCourseNum
    ? enrolledCourses.find(c => Number(c.id) === targetCourseNum) || null
    : null;
  const courseLabel = selectedCourseObj
    ? `${selectedCourseObj.code} — ${selectedCourseObj.title}`
    : 'Cumulative Academic Record (All Courses)';

  return {
    scope,
    selectedCourseId: targetCourseNum ? String(targetCourseNum) : 'all',
    selectedCourseObj,
    courseLabel,
    enrolledCourses,
    courseRecords,
    totalCredits: totalCredits.toFixed(1),
    gradedCredits: gradedCredits.toFixed(1),
    cumulativeGpa
  };
}

async function renderTranscriptForUser(targetUser, req, res, isAdminView = false) {
  const username = targetUser.username || targetUser.email;
  const requestedCourseId = req.query.courseId || 'all';
  const scope = normalizeScope(requestedCourseId);
  const savedRecord = await getTranscriptRecord(username, scope);

  const computed = await computeTranscriptData(targetUser, requestedCourseId, savedRecord);

  const paymentStatus = (savedRecord && savedRecord.payment_status) || 'unpaid';
  const transcriptStatus = (savedRecord && savedRecord.transcript_status) || 'draft';
  const isOfficiallyIssued = transcriptStatus === 'issued' && paymentStatus === 'paid';
  const feeAmount = (savedRecord && savedRecord.fee_amount) || DEFAULT_TOKEN_FEE;

  let verifyUrl = null;
  let qrSvg = null;
  if (savedRecord && savedRecord.verification_code && (isOfficiallyIssued || isAdminView)) {
    verifyUrl = `${getBaseUrl(req)}/verify/${encodeURIComponent(savedRecord.verification_code)}`;
    qrSvg = generateQrSvg(verifyUrl, { sizePx: 148 });
  }

  const issuedDateSource = (savedRecord && savedRecord.issued_at) ? new Date(savedRecord.issued_at) : new Date();
  const issuedDate = issuedDateSource.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  res.render('transcript', {
    title: `${isOfficiallyIssued || isAdminView ? 'Official' : 'Unofficial'} Academic Transcript – ${targetUser.full_name || username} | Pastors LMS`,
    student: targetUser,
    enrolledCourses: computed.enrolledCourses,
    selectedCourseId: computed.selectedCourseId,
    selectedCourseObj: computed.selectedCourseObj,
    courseLabel: computed.courseLabel,
    courseRecords: computed.courseRecords,
    totalCredits: computed.totalCredits,
    gradedCredits: computed.gradedCredits,
    cumulativeGpa: computed.cumulativeGpa,
    issuedDate,
    isAdminView,
    transcriptRecord: savedRecord || {
      course_scope: scope,
      fee_amount: feeAmount,
      payment_status: paymentStatus,
      payment_method: '',
      payment_reference: '',
      registrar_notes: '',
      transcript_status: transcriptStatus,
      verification_code: ''
    },
    isOfficiallyIssued,
    verifyUrl,
    qrSvg,
    success: req.query.success || null,
    error: req.query.error || null
  });
}

// GET /transcript - Logged-in student's transcript (supports ?courseId=1 for after-course transcript)
router.get('/transcript', requireAuth, async (req, res) => {
  const record = (await resolveStudentRecord(req.session.user.username || req.session.user.email)) || req.session.user;
  await renderTranscriptForUser(record, req, res, false);
});

// POST /transcript/submit-payment - Student submits M-Pesa / token payment reference for Registrar verification
router.post('/transcript/submit-payment', requireAuth, async (req, res) => {
  const student = (await resolveStudentRecord(req.session.user.username || req.session.user.email)) || req.session.user;
  const username = student.username || student.email;
  const selectedCourseId = req.body.course_id || 'all';
  const scope = normalizeScope(selectedCourseId);
  const paymentMethod = String(req.body.payment_method || 'M-Pesa').trim().slice(0, 60);
  const paymentRef = String(req.body.payment_reference || '').trim().toUpperCase().slice(0, 80);

  const querySuffix = selectedCourseId !== 'all' ? `&courseId=${encodeURIComponent(selectedCourseId)}` : '';
  if (paymentRef.length < 4) {
    return res.redirect('/transcript?error=' + encodeURIComponent('Please enter your M-Pesa or payment receipt reference code (at least 4 characters).') + querySuffix);
  }

  const existing = await getTranscriptRecord(username, scope);
  const computed = await computeTranscriptData(student, selectedCourseId, existing);

  await saveTranscriptRecord({
    student_username: username,
    student_id: student.student_id || username,
    student_name: student.full_name || [student.first_name, student.last_name].filter(Boolean).join(' ') || username,
    student_cohort: student.cohort || 'East Africa Pastoral Cohort',
    course_scope: scope,
    course_label: computed.courseLabel,
    payment_status: existing && existing.payment_status === 'paid' ? 'paid' : 'pending',
    payment_method: paymentMethod,
    payment_reference: paymentRef,
    payment_submitted_at: new Date().toISOString()
  });

  res.redirect('/transcript?success=' + encodeURIComponent(`Token payment reference (${paymentRef}) submitted! The Academic Registrar will verify and issue your QR-sealed Official Transcript shortly.`) + querySuffix);
});

// GET /admin/students/:studentId/transcript - Admin editable official transcript (cumulative or per-course)
router.get('/admin/students/:studentId/transcript', requireAdmin, async (req, res) => {
  const student = await resolveStudentRecord(req.params.studentId);
  if (!student) {
    return res.redirect('/admin/students?error=' + encodeURIComponent('Student record not found for transcript.'));
  }
  await renderTranscriptForUser(student, req, res, true);
});

// POST /admin/students/:studentId/transcript/save - Admin edits grades/credits/remarks, confirms token fee, and issues QR transcript
router.post('/admin/students/:studentId/transcript/save', requireAdmin, async (req, res) => {
  const student = await resolveStudentRecord(req.params.studentId);
  if (!student) {
    return res.redirect('/admin/students?error=' + encodeURIComponent('Student record not found.'));
  }

  const username = student.username || student.email;
  const selectedCourseId = req.body.course_id || 'all';
  const scope = normalizeScope(selectedCourseId);
  const actionMode = String(req.body.action_mode || 'save');
  const existing = await getTranscriptRecord(username, scope);

  // Collect per-course editable overrides submitted by Admin
  const courseOverrides = { ...(existing && existing.course_overrides ? existing.course_overrides : {}) };
  const courseIdsRaw = req.body.override_course_id;
  const courseIds = Array.isArray(courseIdsRaw) ? courseIdsRaw : (courseIdsRaw ? [courseIdsRaw] : []);
  const asArr = (val) => (Array.isArray(val) ? val : (val !== undefined ? [val] : []));

  const terms = asArr(req.body.override_term);
  const creditsArr = asArr(req.body.override_credits);
  const completions = asArr(req.body.override_completion);
  const scores = asArr(req.body.override_score);
  const grades = asArr(req.body.override_grade);
  const statuses = asArr(req.body.override_status);

  courseIds.forEach((cid, i) => {
    if (!cid) return;
    courseOverrides[String(cid)] = {
      term: String(terms[i] || '').trim(),
      credits: creditsArr[i] !== '' && Number.isFinite(Number(creditsArr[i])) ? Number(creditsArr[i]) : undefined,
      completionPct: completions[i] !== '' && Number.isFinite(Number(completions[i])) ? Number(completions[i]) : undefined,
      averagePercent: scores[i] !== '' && Number.isFinite(Number(scores[i])) ? Number(scores[i]) : undefined,
      letterGrade: String(grades[i] || '').trim().toUpperCase(),
      status: String(statuses[i] || '').trim()
    };
  });

  let paymentStatus = ['unpaid', 'pending', 'paid'].includes(req.body.payment_status)
    ? req.body.payment_status
    : ((existing && existing.payment_status) || 'unpaid');
  let transcriptStatus = ['draft', 'issued', 'revoked'].includes(req.body.transcript_status)
    ? req.body.transcript_status
    : ((existing && existing.transcript_status) || 'draft');

  if (actionMode === 'issue') {
    paymentStatus = 'paid';
    transcriptStatus = 'issued';
  } else if (actionMode === 'revoke') {
    transcriptStatus = 'revoked';
  }

  const feeAmount = String(req.body.fee_amount || (existing && existing.fee_amount) || DEFAULT_TOKEN_FEE).trim().slice(0, 40);
  const paymentMethod = String(req.body.payment_method || '').trim().slice(0, 60);
  const paymentReference = String(req.body.payment_reference || '').trim().toUpperCase().slice(0, 80);
  const registrarNotes = String(req.body.registrar_notes || '').trim().slice(0, 600);

  // Recompute summary snapshot with the new overrides so QR verification reflects exact updated grades/GPA
  const previewRecord = { ...(existing || {}), course_overrides: courseOverrides };
  const computed = await computeTranscriptData(student, selectedCourseId, previewRecord);

  const adminName = req.session.user.full_name || req.session.user.username || 'Registrar';
  const nowIso = new Date().toISOString();

  const saved = await saveTranscriptRecord({
    student_username: username,
    student_id: student.student_id || username,
    student_name: student.full_name || [student.first_name, student.last_name].filter(Boolean).join(' ') || username,
    student_cohort: student.cohort || 'East Africa Pastoral Cohort',
    course_scope: scope,
    course_label: computed.courseLabel,
    course_overrides: courseOverrides,
    registrar_notes: registrarNotes,
    fee_amount: feeAmount,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    payment_reference: paymentReference,
    payment_verified_at: paymentStatus === 'paid' ? ((existing && existing.payment_verified_at) || nowIso) : null,
    payment_verified_by: paymentStatus === 'paid' ? adminName : null,
    transcript_status: transcriptStatus,
    regenerate_code: actionMode === 'regenerate_qr',
    issued_at: transcriptStatus === 'issued' ? ((existing && existing.issued_at) || nowIso) : (existing && existing.issued_at) || null,
    issued_by: transcriptStatus === 'issued' ? adminName : (existing && existing.issued_by) || null,
    summary_snapshot: {
      totalCredits: computed.totalCredits,
      gradedCredits: computed.gradedCredits,
      cumulativeGpa: computed.cumulativeGpa,
      courses: computed.courseRecords.map(r => ({
        code: r.code,
        title: r.title,
        term: r.term,
        letterGrade: r.letterGrade,
        status: r.status
      }))
    }
  });

  const targetSlug = encodeURIComponent(req.params.studentId);
  const courseParam = selectedCourseId !== 'all' ? `&courseId=${encodeURIComponent(selectedCourseId)}` : '';
  const msg = actionMode === 'issue'
    ? `Official Transcript issued & QR code activated (${saved.verification_code}).`
    : actionMode === 'revoke'
      ? 'Transcript verification QR code has been revoked.'
      : actionMode === 'regenerate_qr'
        ? `New QR verification code generated (${saved.verification_code}).`
        : 'Transcript changes saved.';

  res.redirect(`/admin/students/${targetSlug}/transcript?success=${encodeURIComponent(msg)}${courseParam}`);
});

// GET /verify/:code - PUBLIC Zero-Breach Transcript QR Verification Endpoint
router.get('/verify/:code', async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const result = await verifyTranscriptByCode(req.params.code);
  const statusCode = result.valid ? 200 : 404;

  res.status(statusCode).render('verify-transcript', {
    title: result.valid
      ? 'Verified Academic Record | Intentional Discipleship Africa'
      : 'Transcript Verification Notice | Intentional Discipleship Africa',
    verification: result,
    queriedCode: String(req.params.code || '').slice(0, 32)
  });
});

// GET /courses/:id/certificate - Official Course Completion Certificate
router.get('/courses/:id/certificate', requireAuth, async (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const allCourses = getCourses();
  const course = allCourses.find(c => Number(c.id) === courseId);
  if (!course) {
    return res.redirect('/courses');
  }
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
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

  const courseMods = getCourseModulesWithTopics(course, { includeAnswerKeys: false });
  const hasGradedActivities = courseMods.some(mod =>
    (mod.topics || []).some(t => ['assignment', 'journal', 'quiz', 'exam'].includes(t.type))
  );
  const passingThreshold = 60;
  const hasCompletedLessons = completionPct >= 100;
  const hasPassingGrade = !hasGradedActivities || (gradeSummary.averagePercent !== null && gradeSummary.averagePercent >= passingThreshold);

  const isStaff = isStaffUser(req.session.user);
  const isUnlocked = isStaff || (hasCompletedLessons && hasPassingGrade);

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
    hasCompletedLessons,
    hasPassingGrade,
    hasGradedActivities,
    passingThreshold,
    isUnlocked,
    isStaff,
    certSerial,
    issuedDate
  });
});

// ==========================================================================
// 5. MANDATORY ORIENTATION COURSE (IDA 0001) & STUDENT EXTENSION REQUESTS
// ==========================================================================
const ORIENTATION_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'When do weekly learning units open and close in Pastors LMS (East Africa Time)?',
    options: {
      a: 'Units stay open without any weekly deadline.',
      b: 'Units open each Thursday and close the following Wednesday at 11:55 PM EAT.',
      c: 'Only on Sunday mornings during church service.'
    },
    correct: 'b'
  },
  {
    id: 'q2',
    prompt: 'What is our Seminary standard regarding written pastoral assignments and quizzes?',
    options: {
      a: 'Students can ask another pastor to write their essays and take quizzes for them.',
      b: 'Self-reported checkboxes unlock certificates even with failing quiz scores.',
      c: 'All work must be your own original pastoral reflection, affirmed with the Academic Honesty Pledge.'
    },
    correct: 'c'
  },
  {
    id: 'q3',
    prompt: 'What should a pastor do if ministry bereavement or rural network loss prevents meeting a deadline?',
    options: {
      a: 'Message your assigned instructor or submit a Deadline Extension Request inside Course Tools.',
      b: 'Stop attending the cohort silently without telling anyone.',
      c: 'Wait until after the final exam ends.'
    },
    correct: 'a'
  }
];

router.get('/orientation', requireAuth, (req, res) => {
  const username = req.session.user.username || req.session.user.email;
  const activeTerm = getActiveTerm();
  const academicConfig = getAcademicConfig();
  const safeQuestions = ORIENTATION_QUESTIONS.map(({ id, prompt, options }) => ({ id, prompt, options }));

  res.render('orientation', {
    title: 'IDA 0001: Explore Pastors LMS Orientation | Pastors LMS',
    user: req.session.user,
    orientationStatus: getOrientationStatus(username),
    requireOrientation: Boolean(academicConfig.settings && academicConfig.settings.require_orientation),
    activeTerm,
    termWeekInfo: computeTermWeekInfo(activeTerm),
    questions: safeQuestions,
    requiredNotice: req.query.required === '1',
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/orientation/complete', requireAuth, (req, res) => {
  const username = req.session.user.username || req.session.user.email;
  const covenantAccepted = req.body.covenant_accepted === 'on' || req.body.covenant_accepted === 'true' || req.body.covenant_accepted === true;
  if (!covenantAccepted) {
    return res.redirect('/orientation?error=' + encodeURIComponent('Please tick the Doctrinal & Academic Integrity Covenant checkbox to complete orientation.'));
  }

  let score = 0;
  ORIENTATION_QUESTIONS.forEach(q => {
    const ans = String(req.body[q.id] || '').trim().toLowerCase();
    if (ans === q.correct) score += 1;
  });

  if (score < 2) {
    return res.redirect('/orientation?error=' + encodeURIComponent(`You answered ${score} of ${ORIENTATION_QUESTIONS.length} correctly. Please review the Weekly Rhythm notes above and answer at least 2 correctly.`));
  }

  saveOrientationCompletion(username, {
    full_name: req.session.user.full_name || username,
    score,
    total: ORIENTATION_QUESTIONS.length,
    covenant_accepted: true
  });

  res.redirect('/orientation?success=' + encodeURIComponent(`Orientation completed (${score}/${ORIENTATION_QUESTIONS.length})! Welcome to Intentional Discipleship Africa — your courses are now unlocked.`));
});

router.get('/api/courses/:id/extension-requests', requireAuth, (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const allCourses = getCourses();
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }
  const username = req.session.user.username || req.session.user.email;
  const requests = getExtensionRequests({ course_id: courseId, student_username: username });
  res.json({ success: true, requests });
});

router.post('/api/courses/:id/extension-requests', requireAuth, (req, res) => {
  const courseId = parseInt(req.params.id, 10);
  const allCourses = getCourses();
  const course = allCourses.find(c => Number(c.id) === courseId);
  if (!course) {
    return res.status(404).json({ success: false, error: 'Course not found.' });
  }
  if (!isCourseEnrolled(allCourses, courseId, req.session.user)) {
    return res.status(403).json({ success: false, error: 'You are not enrolled in this course.' });
  }

  const moduleId = parseInt(req.body.module_id, 10);
  const requestedUntil = String(req.body.requested_until || '').trim();
  const reason = String(req.body.reason || '').trim();
  const modExists = (course.modules || []).some(m => Number(m.id) === moduleId);

  if (!modExists) {
    return res.status(400).json({ success: false, error: 'Please select a valid unit for your extension request.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedUntil)) {
    return res.status(400).json({ success: false, error: 'Please choose a valid requested deadline date.' });
  }
  if (reason.length < 6) {
    return res.status(400).json({ success: false, error: 'Please explain briefly (at least 6 characters) why you need an extension.' });
  }

  const username = req.session.user.username || req.session.user.email;
  const saved = createExtensionRequest({
    student_username: username,
    student_name: req.session.user.full_name || username,
    course_id: courseId,
    module_id: moduleId,
    requested_until: requestedUntil,
    reason
  });

  if (!saved) {
    return res.status(400).json({ success: false, error: 'Could not save extension request.' });
  }
  res.json({ success: true, request: saved });
});

// ==========================================================================
// 6. OFFLINE PWA FALLBACK PAGE
// ==========================================================================
router.get('/offline', (req, res) => {
  res.render('offline', {
    title: 'Offline Reading | Pastors LMS'
  });
});

module.exports = router;
