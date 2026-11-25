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
