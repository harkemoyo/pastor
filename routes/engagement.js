const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireTeacher, requireAdmin } = require('../middleware/auth');
const {
  formatWhatsAppDigits,
  getTeachers,
  findTeacherByUsername,
  getTeacherAssignments
} = require('../utils/instructors');
const {
  readLocalJson,
  writeLocalJson,
  getEnrolledCoursesForUser,
  getActiveTerm,
  computeTermWeekInfo,
  getEastAfricaNow
} = require('../utils/lms-store');

function logAdminActivity(actorUsername, action, targetId, targetType = 'engagement') {
  try {
    const logs = readLocalJson('activity-log.json', []);
    const arr = Array.isArray(logs) ? logs : [];
    arr.unshift({
      id: Date.now() + Math.random(),
      admin_username: actorUsername || 'system',
      admin_name: actorUsername || 'Staff',
      action,
      target_type: targetType,
      target_id: targetId || null,
      created_at: new Date().toISOString()
    });
    writeLocalJson('activity-log.json', arr.slice(0, 500));
  } catch {
    // Non-blocking activity audit
  }
}
const {
  VALID_ATTENDANCE_STATUSES,
  VALID_PRACTICUM_TYPES,
  getLiveSessions,
  saveLiveSession,
  deleteLiveSession,
  buildSessionIcs,
  getAttendanceRecords,
  recordSessionAttendance,
  updateAttendanceRecord,
  computeStudentAttendanceSummary,
  buildAttendanceCsv,
  getReminderPreferences,
  saveReminderPreferences,
  getReminderLogs,
  logReminderSent,
  getPracticumSubmissions,
  createPracticumSubmission,
  reviewPracticumSubmission
} = require('../utils/engagement-store');

const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');
const ENROLMENTS_FILE = path.join(__dirname, '../data/enrolments.json');

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getCoursesList() {
  const data = readJsonSafe(COURSES_FILE, { courses: [] });
  return Array.isArray(data.courses) ? data.courses.filter(c => c.status !== 'archived' && !c.archived) : [];
}

function getStudentsList() {
  const users = readJsonSafe(USERS_FILE, []);
  return Array.isArray(users)
    ? users.filter(u => (!u.role || u.role === 'student') && u.status !== 'archived' && u.status !== 'suspended' && u.status !== 'rejected')
    : [];
}

function getRosterForCourse(courseId, allStudents) {
  const enrolments = readJsonSafe(ENROLMENTS_FILE, []);
  const courseEnrolments = Array.isArray(enrolments)
    ? enrolments.filter(e =>
        e &&
        Number(e.course_id) === Number(courseId) &&
        e.status !== 'removed' &&
        e.status !== 'dropped' &&
        e.status !== 'withdrawn'
      )
    : [];

  let students = [];
  if (courseEnrolments.length > 0) {
    students = courseEnrolments
      .map(enr => allStudents.find(s =>
        (s.student_id && enr.student_id && String(s.student_id).toLowerCase() === String(enr.student_id).toLowerCase()) ||
        (s.username && String(s.username).toLowerCase() === String(enr.student_username || enr.student_id || '').toLowerCase())
      ))
      .filter(Boolean);
  } else {
    students = allStudents;
  }

  return students.map(s => {
    const fullName = (s.full_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || 'Pastor').trim();
    const uname = String(s.username || s.student_id || '').toLowerCase();
    return {
      username: uname,
      student_id: s.student_id || uname,
      full_name: fullName,
      email: s.email || '',
      phone: s.phone || '',
      church_name: s.church_name || ''
    };
  });
}

function renderStudentTimetableView(req, res, activeSection) {
  const user = req.session.user;
  const username = user.username || user.email;
  const allCourses = getCoursesList();
  const isStaff = ['teacher', 'admin', 'super_admin'].includes(user.role);
  const { courses: visibleCourses } = isStaff
    ? { courses: allCourses }
    : getEnrolledCoursesForUser(allCourses, user);

  const visibleCourseIds = visibleCourses.map(c => Number(c.id));
  const sessions = visibleCourseIds.length > 0 ? getLiveSessions({ course_ids: visibleCourseIds }) : [];
  const todayEat = getEastAfricaNow().isoDate;

  const upcomingSessions = sessions.filter(s => String(s.session_date || '') >= todayEat);
  const pastSessions = sessions.filter(s => String(s.session_date || '') < todayEat).reverse();

  const myAttendanceRecords = getAttendanceRecords({ student_username: username });
  const attendanceSummary = computeStudentAttendanceSummary(myAttendanceRecords);
  const reminderPrefs = getReminderPreferences(username);
  const activeTerm = getActiveTerm();
  const termWeekInfo = computeTermWeekInfo(activeTerm);

  res.render('timetable', {
    title: 'Live Session Timetable & Attendance | Pastors LMS',
    user,
    activeSection,
    todayEat,
    activeTerm,
    termWeekInfo,
    visibleCourses,
    upcomingSessions,
    pastSessions,
    myAttendanceRecords,
    attendanceSummary,
    reminderPrefs,
    success: req.query.success || null,
    error: req.query.error || null
  });
}

// ============================================================================
// Student Live Timetable, Attendance & Reminder Preferences
// ============================================================================

router.get('/timetable', requireAuth, (req, res) => {
  renderStudentTimetableView(req, res, 'timetable');
});

router.get('/attendance', requireAuth, (req, res) => {
  renderStudentTimetableView(req, res, 'attendance');
});

router.get('/timetable/:id/ics', requireAuth, (req, res) => {
  const sessions = getLiveSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).send('Live session not found.');
  }
  const slug = String(session.course_code || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-${session.session_date || 'live'}.ics"`);
  res.send(buildSessionIcs(session));
});

router.post('/academics/reminder-prefs', requireAuth, (req, res) => {
  const username = req.session.user.username || req.session.user.email;
  saveReminderPreferences(username, req.body || {});
  const target = req.body.return_to === 'academics' ? '/academics' : '/timetable';
  res.redirect(`${target}?success=${encodeURIComponent('Reminder preferences saved.')}#reminderPrefsSection`);
});

// ============================================================================
// Student Ministry Practicum
// ============================================================================

router.get('/practicum', requireAuth, (req, res) => {
  const user = req.session.user;
  const username = user.username || user.email;
  const allCourses = getCoursesList();
  const isStaff = ['teacher', 'admin', 'super_admin'].includes(user.role);
  const { courses: visibleCourses } = isStaff
    ? { courses: allCourses }
    : getEnrolledCoursesForUser(allCourses, user);

  const practicums = getPracticumSubmissions({ student_username: username });
  const approvedHours = practicums
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + (Number(p.hours_approved) || 0), 0);
  const pendingCount = practicums.filter(p => p.status === 'pending').length;

  res.render('practicum', {
    title: 'Ministry Practicum Portfolio | Pastors LMS',
    user,
    visibleCourses,
    practicums,
    approvedHours,
    pendingCount,
    todayEat: getEastAfricaNow().isoDate,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/practicum/submit', requireAuth, (req, res) => {
  const user = req.session.user;
  const username = user.username || user.email;
  const allCourses = getCoursesList();
  const course = allCourses.find(c => Number(c.id) === Number(req.body.course_id));
  if (!course) {
    return res.redirect('/practicum?error=' + encodeURIComponent('Please select a valid course for your practicum.'));
  }

  const result = createPracticumSubmission({
    student_username: username,
    student_id: user.student_id || username,
    student_name: user.full_name || username,
    course_id: course.id,
    course_code: course.code,
    course_title: course.title,
    practicum_type: req.body.practicum_type,
    title: req.body.title,
    ministry_date: req.body.ministry_date,
    location_church: req.body.location_church,
    hours_served: req.body.hours_served,
    evidence_url: req.body.evidence_url,
    reflection: req.body.reflection,
    elder_name: req.body.elder_name,
    elder_phone: req.body.elder_phone,
    elder_confirmed: req.body.elder_confirmed
  });

  if (result.error) {
    return res.redirect('/practicum?error=' + encodeURIComponent(result.error));
  }
  res.redirect('/practicum?success=' + encodeURIComponent('Ministry practicum submitted with elder verification details.'));
});

// ============================================================================
// Teacher & Admin Attendance (UML: Input Attendance, Check Details, View Reports)
// ============================================================================

function getStaffCourses(user) {
  const allCourses = getCoursesList();
  if (['admin', 'super_admin'].includes(user.role)) {
    return allCourses;
  }
  return getTeacherAssignments(allCourses, user.username).map(a => a.course);
}

router.get('/teacher/attendance', requireTeacher, (req, res) => {
  const user = req.session.user;
  const staffCourses = getStaffCourses(user);
  const requestedCourseId = Number(req.query.course_id);
  const selectedCourse = staffCourses.find(c => Number(c.id) === requestedCourseId) || staffCourses[0] || null;

  let courseSessions = [];
  let selectedSession = null;
  let roster = [];
  const existingByStudent = {};
  const studentSummaries = {};

  if (selectedCourse) {
    courseSessions = getLiveSessions({ course_id: selectedCourse.id });
    const reqSessionId = String(req.query.session_id || '').trim();
    selectedSession = courseSessions.find(s => s.id === reqSessionId) || courseSessions[0] || null;

    const allStudents = getStudentsList();
    roster = getRosterForCourse(selectedCourse.id, allStudents);

    const courseAttendance = getAttendanceRecords({ course_id: selectedCourse.id });
    if (selectedSession) {
      for (const r of courseAttendance) {
        if (String(r.session_id) === String(selectedSession.id)) {
          existingByStudent[String(r.student_username || '').toLowerCase()] = r;
        }
      }
    }

    for (const s of roster) {
      const sRows = courseAttendance.filter(r =>
        String(r.student_username || '').toLowerCase() === s.username ||
        String(r.student_id || '').toLowerCase() === String(s.student_id || '').toLowerCase()
      );
      studentSummaries[s.username] = computeStudentAttendanceSummary(sRows);
    }
  }

  res.render('teacher-attendance', {
    title: 'Class Attendance Roll | Pastors LMS',
    user,
    staffCourses,
    selectedCourse,
    courseSessions,
    selectedSession,
    roster,
    existingByStudent,
    studentSummaries,
    todayEat: getEastAfricaNow().isoDate,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/teacher/attendance/record', requireTeacher, (req, res) => {
  const user = req.session.user;
  const staffCourses = getStaffCourses(user);
  const courseId = Number(req.body.course_id);
  const course = staffCourses.find(c => Number(c.id) === courseId);
  if (!course) {
    return res.redirect('/teacher/attendance?error=' + encodeURIComponent('You can only mark attendance for courses assigned to you.'));
  }

  const allStudents = getStudentsList();
  const roster = getRosterForCourse(course.id, allStudents);
  const sessionId = String(req.body.session_id || '').trim();
  const sessions = getLiveSessions({ course_id: course.id });
  const matchedSession = sessions.find(s => s.id === sessionId);

  const sessionDate = String(req.body.session_date || (matchedSession && matchedSession.session_date) || getEastAfricaNow().isoDate).trim();
  const sessionTitle = String(req.body.session_title || (matchedSession && matchedSession.title) || 'Live Cohort Session').trim();

  const entries = [];
  for (const s of roster) {
    const statusKey = `status_${s.username}`;
    const altStatusKey = `status_${s.student_id}`;
    const noteKey = `note_${s.username}`;
    const altNoteKey = `note_${s.student_id}`;
    const statusVal = req.body[statusKey] || req.body[altStatusKey];
    if (!statusVal) continue;
    entries.push({
      student_username: s.username,
      student_id: s.student_id,
      student_name: s.full_name,
      status: statusVal,
      note: req.body[noteKey] || req.body[altNoteKey] || ''
    });
  }

  if (entries.length === 0) {
    return res.redirect(`/teacher/attendance?course_id=${course.id}&error=${encodeURIComponent('No student attendance statuses were submitted.')}`);
  }

  const activeTerm = getActiveTerm();
  const result = recordSessionAttendance({
    course_id: course.id,
    course_code: course.code,
    course_title: course.title,
    session_id: matchedSession ? matchedSession.id : (sessionId || `date-${sessionDate}`),
    session_title: sessionTitle,
    session_date: sessionDate,
    term_code: (matchedSession && matchedSession.term_code) || (activeTerm && activeTerm.code) || 'AY2027-T1',
    marked_by: user.full_name || user.username,
    entries
  });

  if (result.error) {
    return res.redirect(`/teacher/attendance?course_id=${course.id}&error=${encodeURIComponent(result.error)}`);
  }

  logAdminActivity(
    user.username,
    'RECORD_ATTENDANCE',
    `${course.code}: ${sessionTitle} (${result.savedCount} pastors)`
  );

  const backSess = matchedSession ? `&session_id=${encodeURIComponent(matchedSession.id)}` : '';
  res.redirect(`/teacher/attendance?course_id=${course.id}${backSess}&success=${encodeURIComponent(`Attendance saved for ${result.savedCount} pastor(s).`)}`);
});

// ============================================================================
// Teacher & Admin Reminders Center (WhatsApp & Email)
// ============================================================================

function buildReminderTemplateMessage(templateKey, { studentName, course, nextSession, deadlineLabel, attendancePct }) {
  const firstName = String(studentName || 'Pastor').trim();
  const cLabel = course ? `${course.code} (${course.title})` : 'your course';
  if (templateKey === 'live_session') {
    const sessText = nextSession
      ? `${nextSession.title} on ${nextSession.session_date} at ${nextSession.start_time} EAT (${nextSession.venue_or_link || nextSession.mode})`
      : 'our upcoming live seminar (check Timetable on Pastors LMS)';
    return `Grace and peace ${firstName}! Reminder for ${cLabel}: our live session "${sessText}" is coming up. Please check your Timetable on Pastors LMS.`;
  }
  if (templateKey === 'low_attendance') {
    const pctText = attendancePct !== null && attendancePct !== undefined ? `${attendancePct}%` : 'low';
    return `Dear ${firstName}, checking in from Pastors LMS for ${cLabel}. Your current live session attendance is ${pctText}. Let us know how we can support your ministry schedule this week.`;
  }
  if (templateKey === 'grade_posted') {
    return `Grace and peace ${firstName}! Recent marks and lecturer feedback have been posted in ${cLabel}. Please sign in to Pastors LMS to review your Grades.`;
  }
  // default: 'deadline'
  return `Grace and peace ${firstName}! Friendly reminder for ${cLabel}: weekly coursework closes on ${deadlineLabel || 'Wednesday at 11:55 PM EAT'}. Sign in to Pastors LMS to complete your unit.`;
}

router.get('/teacher/reminders', requireTeacher, (req, res) => {
  const user = req.session.user;
  const staffCourses = getStaffCourses(user);
  const reqCourseId = Number(req.query.course_id);
  const selectedCourse = staffCourses.find(c => Number(c.id) === reqCourseId) || staffCourses[0] || null;
  const templateKey = ['deadline', 'live_session', 'low_attendance', 'grade_posted'].includes(req.query.template)
    ? req.query.template
    : 'deadline';

  const activeTerm = getActiveTerm();
  const termWeekInfo = computeTermWeekInfo(activeTerm);
  const todayEat = getEastAfricaNow().isoDate;

  let recipients = [];
  let nextSession = null;
  let groupBroadcastText = '';

  if (selectedCourse) {
    const sessions = getLiveSessions({ course_id: selectedCourse.id });
    nextSession = sessions.find(s => String(s.session_date || '') >= todayEat) || sessions[0] || null;
    const allStudents = getStudentsList();
    const roster = getRosterForCourse(selectedCourse.id, allStudents);
    const courseAttendance = getAttendanceRecords({ course_id: selectedCourse.id });

    recipients = roster.map(s => {
      const prefs = getReminderPreferences(s.username);
      const sRows = courseAttendance.filter(r =>
        String(r.student_username || '').toLowerCase() === s.username ||
        String(r.student_id || '').toLowerCase() === String(s.student_id || '').toLowerCase()
      );
      const attSummary = computeStudentAttendanceSummary(sRows);
      const msg = buildReminderTemplateMessage(templateKey, {
        studentName: s.full_name,
        course: selectedCourse,
        nextSession,
        deadlineLabel: termWeekInfo ? termWeekInfo.nextDeadlineLabel : 'Wednesday 11:55 PM EAT',
        attendancePct: attSummary.attendancePercent
      });
      const phoneSource = prefs.phone || s.phone;
      const waDigits = formatWhatsAppDigits(phoneSource);
      const emailSubject = encodeURIComponent(`${selectedCourse.code} Reminder — Pastors LMS`);
      const emailBody = encodeURIComponent(`${msg}\n\nSent by ${user.full_name || user.username}`);

      return {
        ...s,
        prefs,
        phone_display: phoneSource || '—',
        attendanceSummary: attSummary,
        message_preview: msg,
        wa_url: waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}` : '',
        mailto_url: s.email ? `mailto:${s.email}?subject=${emailSubject}&body=${emailBody}` : ''
      };
    });

    groupBroadcastText = buildReminderTemplateMessage(templateKey, {
      studentName: 'Pastors',
      course: selectedCourse,
      nextSession,
      deadlineLabel: termWeekInfo ? termWeekInfo.nextDeadlineLabel : 'Wednesday 11:55 PM EAT',
      attendancePct: null
    });
  }

  const reminderLogs = getReminderLogs(25);

  res.render('teacher-reminders', {
    title: 'WhatsApp & Email Reminders | Pastors LMS',
    user,
    staffCourses,
    selectedCourse,
    templateKey,
    nextSession,
    termWeekInfo,
    recipients,
    groupBroadcastText,
    reminderLogs,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/teacher/reminders/log', requireTeacher, (req, res) => {
  const user = req.session.user;
  const courseId = Number(req.body.course_id) || null;
  const course = getCoursesList().find(c => Number(c.id) === courseId);

  logReminderSent({
    sent_by: user.username || user.full_name,
    sent_by_name: user.full_name || user.username,
    course_id: courseId,
    course_code: course ? course.code : (req.body.course_code || ''),
    template_key: req.body.template_key || 'deadline',
    channel: req.body.channel || 'whatsapp',
    recipient_username: req.body.recipient_username || '',
    recipient_name: req.body.recipient_name || 'Cohort',
    message_preview: req.body.message_preview || ''
  });

  const qCourse = courseId ? `&course_id=${courseId}` : '';
  res.redirect(`/teacher/reminders?logged=1${qCourse}&success=${encodeURIComponent('Reminder logged in outreach history.')}`);
});

// ============================================================================
// Teacher & Admin Ministry Practicum Review
// ============================================================================

router.get('/teacher/practicums', requireTeacher, (req, res) => {
  const user = req.session.user;
  const allCourses = getCoursesList();
  const statusFilter = String(req.query.status || '').trim();
  const courseFilter = Number(req.query.course_id) || null;

  let submissions = getPracticumSubmissions({
    status: ['pending', 'approved', 'needs_revision'].includes(statusFilter) ? statusFilter : undefined,
    course_id: courseFilter || undefined
  });

  submissions = submissions.map(p => {
    const elderDigits = formatWhatsAppDigits(p.elder_phone);
    const verifyText = encodeURIComponent(
      `Greetings Elder ${p.elder_name}, I am ${user.full_name || 'a lecturer'} at Pastors LMS verifying ${p.student_name}'s Ministry Practicum ("${p.title}" on ${p.ministry_date} at ${p.location_church}, ${p.hours_served} hrs). Kindly confirm if this ministry service took place. Thank you!`
    );
    return {
      ...p,
      elder_wa_url: elderDigits ? `https://wa.me/${elderDigits}?text=${verifyText}` : ''
    };
  });

  res.render('teacher-practicums', {
    title: 'Ministry Practicum Review | Pastors LMS',
    user,
    allCourses,
    statusFilter,
    courseFilter,
    submissions,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/teacher/practicums/:id/review', requireTeacher, (req, res) => {
  const user = req.session.user;
  const result = reviewPracticumSubmission(req.params.id, {
    status: req.body.status,
    hours_approved: req.body.hours_approved,
    reviewer_feedback: req.body.reviewer_feedback,
    reviewer_name: user.full_name || user.username
  });

  if (result.error) {
    return res.redirect('/teacher/practicums?error=' + encodeURIComponent(result.error));
  }

  logAdminActivity(
    user.username,
    'REVIEW_PRACTICUM',
    `${result.practicum.student_name}: ${result.practicum.status} (${result.practicum.hours_approved} hrs)`
  );

  res.redirect('/teacher/practicums?success=' + encodeURIComponent(`Practicum marked as ${result.practicum.status}.`));
});

// ============================================================================
// Admin Live Timetable Manager & Attendance Reports (UML Complete)
// ============================================================================

router.get('/admin/timetable', requireAdmin, (req, res) => {
  const courses = getCoursesList();
  const sessions = getLiveSessions();
  const teachers = getTeachers();
  const activeTerm = getActiveTerm();

  res.render('admin/timetable', {
    title: 'Live Session Timetable Manager | Pastors LMS Admin',
    user: req.session.user,
    courses,
    sessions,
    teachers,
    activeTerm,
    todayEat: getEastAfricaNow().isoDate,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/admin/timetable/save', requireAdmin, (req, res) => {
  const courses = getCoursesList();
  const course = courses.find(c => Number(c.id) === Number(req.body.course_id));
  if (!course) {
    return res.redirect('/admin/timetable?error=' + encodeURIComponent('Please select a valid course.'));
  }

  const lecturerUsername = String(req.body.lecturer_username || course.instructor_username || '').trim();
  const lecturerObj = lecturerUsername ? findTeacherByUsername(lecturerUsername) : null;

  const result = saveLiveSession({
    id: req.body.id || '',
    course_id: course.id,
    course_code: course.code,
    course_title: course.title,
    term_code: req.body.term_code,
    title: req.body.title,
    session_date: req.body.session_date,
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    mode: req.body.mode,
    venue_or_link: req.body.venue_or_link,
    lecturer_username: lecturerUsername,
    lecturer_name: lecturerObj ? lecturerObj.full_name : (req.body.lecturer_name || 'Cohort Lecturer'),
    notes: req.body.notes
  });

  if (result.error) {
    return res.redirect('/admin/timetable?error=' + encodeURIComponent(result.error));
  }

  logAdminActivity(req.session.user.username, 'SAVE_LIVE_SESSION', `${course.code}: ${result.session.title} (${result.session.session_date})`);
  res.redirect('/admin/timetable?success=' + encodeURIComponent(`Scheduled "${result.session.title}" on ${result.session.session_date}.`));
});

router.post('/admin/timetable/:id/delete', requireAdmin, (req, res) => {
  const removed = deleteLiveSession(req.params.id);
  if (!removed) {
    return res.redirect('/admin/timetable?error=' + encodeURIComponent('Session not found.'));
  }
  logAdminActivity(req.session.user.username, 'DELETE_LIVE_SESSION', req.params.id);
  res.redirect('/admin/timetable?success=' + encodeURIComponent('Live session removed from timetable.'));
});

router.get('/admin/attendance', requireAdmin, (req, res) => {
  const courses = getCoursesList();
  const courseFilter = Number(req.query.course_id) || null;
  const studentQuery = String(req.query.student || '').trim().toLowerCase();

  let records = getAttendanceRecords({
    course_id: courseFilter || undefined
  });

  if (studentQuery) {
    records = records.filter(r =>
      String(r.student_name || '').toLowerCase().includes(studentQuery) ||
      String(r.student_username || '').toLowerCase().includes(studentQuery) ||
      String(r.student_id || '').toLowerCase().includes(studentQuery)
    );
  }

  const byStudent = new Map();
  for (const r of records) {
    const key = String(r.student_username || r.student_id || '').toLowerCase();
    if (!byStudent.has(key)) {
      byStudent.set(key, {
        student_username: key,
        student_id: r.student_id || key,
        student_name: r.student_name || key,
        rows: []
      });
    }
    byStudent.get(key).rows.push(r);
  }

  const studentSummaries = Array.from(byStudent.values())
    .map(entry => ({
      ...entry,
      ...computeStudentAttendanceSummary(entry.rows)
    }))
    .sort((a, b) => (a.attendancePercent ?? 100) - (b.attendancePercent ?? 100));

  const lowAttendanceStudents = studentSummaries.filter(s => s.needsFollowUp);

  res.render('admin/attendance', {
    title: 'Attendance Reports & Audit | Pastors LMS Admin',
    user: req.session.user,
    courses,
    courseFilter,
    studentQuery,
    records,
    studentSummaries,
    lowAttendanceStudents,
    validStatuses: VALID_ATTENDANCE_STATUSES,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/admin/attendance/update', requireAdmin, (req, res) => {
  const user = req.session.user;
  const result = updateAttendanceRecord(req.body.record_id, {
    status: req.body.status,
    note: req.body.note,
    updated_by: user.full_name || user.username
  });

  if (result.error) {
    return res.redirect('/admin/attendance?error=' + encodeURIComponent(result.error));
  }

  logAdminActivity(user.username, 'UPDATE_ATTENDANCE', `${result.record.student_name} (${result.record.course_code}) -> ${result.record.status}`);
  res.redirect('/admin/attendance?success=' + encodeURIComponent(`Updated attendance for ${result.record.student_name} to "${result.record.status}".`));
});

router.get('/admin/attendance/report.csv', requireAdmin, (req, res) => {
  const courseFilter = Number(req.query.course_id) || null;
  const records = getAttendanceRecords({ course_id: courseFilter || undefined });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pastors-lms-attendance-report.csv"');
  res.send(buildAttendanceCsv(records));
});

module.exports = router;
