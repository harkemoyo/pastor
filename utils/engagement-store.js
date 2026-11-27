const crypto = require('crypto');
const {
  readLocalJson,
  writeLocalJson,
  getActiveTerm,
  getEastAfricaNow
} = require('./lms-store');

const VALID_ATTENDANCE_STATUSES = ['present', 'late', 'excused', 'absent'];
const VALID_PRACTICUM_TYPES = ['sermon_media', 'church_visit', 'elder_endorsement'];

function escapeCsvCell(value) {
  const str = String(value === null || value === undefined ? '' : value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function timeToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function getSeededSessions() {
  const activeTerm = getActiveTerm();
  const termCode = activeTerm && activeTerm.code ? activeTerm.code : 'AY2027-T1';
  const coursesData = readLocalJson('courses.json', { courses: [] });
  const courses = Array.isArray(coursesData.courses) ? coursesData.courses : [];
  const c1 = courses.find(c => Number(c.id) === 1) || courses[0] || { id: 1, code: 'THEO 101', title: 'Foundations of Sound Doctrine', instructor_username: 'pastor.samuel' };
  const c2 = courses.find(c => Number(c.id) === 2) || courses[1] || { id: 2, code: 'CHUR 201', title: 'Church History & Heritage', instructor_username: 'pastor.grace' };
  const c3 = courses.find(c => Number(c.id) === 3) || courses[2] || { id: 3, code: 'PRCH 301', title: 'Expository Preaching', instructor_username: 'pastor.david' };

  return [
    {
      id: 'sess-seed-1',
      course_id: Number(c1.id),
      course_code: c1.code || 'THEO 101',
      course_title: c1.title || 'Foundations of Sound Doctrine',
      term_code: termCode,
      title: 'Live Doctrinal Q&A & Scripture Seminar',
      session_date: '2026-12-03',
      start_time: '19:00',
      end_time: '20:30',
      mode: 'Zoom / Online',
      venue_or_link: 'https://zoom.us/j/pastors-lms-theo101',
      lecturer_username: c1.instructor_username || 'pastor.samuel',
      lecturer_name: 'Rev. Samuel Kariuki',
      notes: 'Evening cohort fellowship and Scripture Q&A in East Africa Time.',
      created_at: '2026-11-26T08:00:00.000Z'
    },
    {
      id: 'sess-seed-2',
      course_id: Number(c2.id),
      course_code: c2.code || 'CHUR 201',
      course_title: c2.title || 'Church History & Heritage',
      term_code: termCode,
      title: 'African Church Pioneers Roundtable',
      session_date: '2026-12-05',
      start_time: '10:00',
      end_time: '11:30',
      mode: 'Hybrid (Nairobi & Zoom)',
      venue_or_link: 'Nairobi Bible Chapel & Zoom',
      lecturer_username: c2.instructor_username || 'pastor.grace',
      lecturer_name: 'Dr. Grace Wanjiku',
      notes: 'Bring reflection notes from Unit 3.',
      created_at: '2026-11-26T08:00:00.000Z'
    },
    {
      id: 'sess-seed-3',
      course_id: Number(c3.id),
      course_code: c3.code || 'PRCH 301',
      course_title: c3.title || 'Expository Preaching',
      term_code: termCode,
      title: 'Sermon Outline Workshop & Practicum Prep',
      session_date: '2026-12-10',
      start_time: '19:00',
      end_time: '20:30',
      mode: 'Zoom / Online',
      venue_or_link: 'https://zoom.us/j/pastors-lms-prch301',
      lecturer_username: c3.instructor_username || 'pastor.david',
      lecturer_name: 'Pastor David Mutua',
      notes: 'Prepare a 5-minute sermon outline preview.',
      created_at: '2026-11-26T08:00:00.000Z'
    }
  ];
}

function getAllTimetableRaw() {
  const existing = readLocalJson('timetable.json', null);
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }
  const seeded = getSeededSessions();
  writeLocalJson('timetable.json', seeded);
  return seeded;
}

// ============================================================================
// 1. Live Session Timetable
// ============================================================================

function getLiveSessions(filter = {}) {
  let rows = [...getAllTimetableRaw()];
  if (filter.course_id) {
    rows = rows.filter(s => Number(s.course_id) === Number(filter.course_id));
  }
  if (Array.isArray(filter.course_ids)) {
    const idSet = new Set(filter.course_ids.map(id => Number(id)));
    rows = rows.filter(s => idSet.has(Number(s.course_id)));
  }
  if (filter.term_code) {
    const tc = String(filter.term_code).trim().toUpperCase();
    rows = rows.filter(s => String(s.term_code || '').trim().toUpperCase() === tc);
  }
  if (filter.lecturer_username) {
    const lu = String(filter.lecturer_username).trim().toLowerCase();
    rows = rows.filter(s => String(s.lecturer_username || '').trim().toLowerCase() === lu);
  }

  return rows.sort((a, b) => {
    const keyA = `${a.session_date || ''} ${a.start_time || ''}`;
    const keyB = `${b.session_date || ''} ${b.start_time || ''}`;
    return keyA.localeCompare(keyB);
  });
}

function detectTimetableConflict(candidate, existingSessions) {
  const startA = timeToMinutes(candidate.start_time);
  const endA = timeToMinutes(candidate.end_time);
  if (startA === null || endA === null || endA <= startA) {
    return { conflict: false };
  }

  const candDate = String(candidate.session_date || '').trim();
  const candLecturer = String(candidate.lecturer_username || '').trim().toLowerCase();
  const candVenue = String(candidate.venue_or_link || '').trim().toLowerCase();
  const candCourseId = Number(candidate.course_id);

  for (const existing of existingSessions || []) {
    if (!existing || (candidate.id && existing.id === candidate.id)) continue;
    if (String(existing.session_date || '').trim() !== candDate) continue;

    const startB = timeToMinutes(existing.start_time);
    const endB = timeToMinutes(existing.end_time);
    if (startB === null || endB === null) continue;
    if (!(startA < endB && startB < endA)) continue;

    const exLecturer = String(existing.lecturer_username || '').trim().toLowerCase();
    const exVenue = String(existing.venue_or_link || '').trim().toLowerCase();

    if (candLecturer && exLecturer && candLecturer === exLecturer) {
      return {
        conflict: true,
        reason: `Lecturer clash with "${existing.title}" (${existing.course_code}, ${existing.start_time}–${existing.end_time} EAT).`
      };
    }
    if (candVenue && exVenue && candVenue !== 'tba' && exVenue !== 'tba' && candVenue === exVenue) {
      return {
        conflict: true,
        reason: `Venue/Zoom link clash with "${existing.title}" (${existing.course_code}, ${existing.start_time}–${existing.end_time} EAT).`
      };
    }
    if (candCourseId && Number(existing.course_id) === candCourseId) {
      return {
        conflict: true,
        reason: `Course schedule clash: ${existing.course_code} already has "${existing.title}" from ${existing.start_time} to ${existing.end_time} EAT.`
      };
    }
  }
  return { conflict: false };
}

function saveLiveSession(payload) {
  const courseId = Number(payload.course_id);
  const title = String(payload.title || '').trim();
  const sessionDate = String(payload.session_date || '').trim();
  const startTime = String(payload.start_time || '').trim();
  const endTime = String(payload.end_time || '').trim();

  if (!courseId || title.length < 3) {
    return { error: 'Select a course and provide a session title of at least 3 characters.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { error: 'Enter a valid session date (YYYY-MM-DD).' };
  }
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return { error: 'Enter valid EAT start and end times where end time is after start time.' };
  }

  const all = getAllTimetableRaw();
  const sessionId = String(payload.id || '').trim() || `sess-${crypto.randomUUID()}`;
  const activeTerm = getActiveTerm();

  const candidate = {
    id: sessionId,
    course_id: courseId,
    course_code: String(payload.course_code || '').trim(),
    course_title: String(payload.course_title || '').trim(),
    term_code: String(payload.term_code || (activeTerm && activeTerm.code) || 'AY2027-T1').trim().toUpperCase(),
    title,
    session_date: sessionDate,
    start_time: `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`,
    end_time: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    mode: String(payload.mode || 'Zoom / Online').trim(),
    venue_or_link: String(payload.venue_or_link || 'TBA').trim(),
    lecturer_username: String(payload.lecturer_username || '').trim(),
    lecturer_name: String(payload.lecturer_name || '').trim() || 'Cohort Lecturer',
    notes: String(payload.notes || '').trim().slice(0, 400),
    created_at: new Date().toISOString()
  };

  const clash = detectTimetableConflict(candidate, all);
  if (clash.conflict) {
    return { error: `Schedule conflict detected: ${clash.reason}` };
  }

  const idx = all.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...candidate, updated_at: new Date().toISOString() };
  } else {
    all.push(candidate);
  }
  writeLocalJson('timetable.json', all);
  return { success: true, session: idx >= 0 ? all[idx] : candidate };
}

function deleteLiveSession(sessionId) {
  const all = getAllTimetableRaw();
  const next = all.filter(s => s.id !== sessionId);
  if (next.length === all.length) return false;
  writeLocalJson('timetable.json', next);
  return true;
}

function toIcsUtcStamp(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const tm = timeToMinutes(timeStr);
  if (!m || tm === null) return '';
  const eatIso = `${m[1]}-${m[2]}-${m[3]}T${String(Math.floor(tm / 60)).padStart(2, '0')}:${String(tm % 60).padStart(2, '0')}:00+03:00`;
  const d = new Date(eatIso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(val) {
  return String(val || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildSessionIcs(session) {
  const dtStart = toIcsUtcStamp(session.session_date, session.start_time);
  const dtEnd = toIcsUtcStamp(session.session_date, session.end_time);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const summary = `${session.course_code ? session.course_code + ' - ' : ''}${session.title || 'Live Pastoral Session'}`;
  const desc = [
    session.course_title ? `Course: ${session.course_title}` : '',
    session.lecturer_name ? `Lecturer: ${session.lecturer_name}` : '',
    session.mode ? `Mode: ${session.mode}` : '',
    session.notes || ''
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pastors LMS//Live Session Timetable//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(session.id)}@pastors-lms`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(session.venue_or_link || session.mode || 'Online')}`,
    `DESCRIPTION:${escapeIcsText(desc)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n');
}

// ============================================================================
// 2. Online Attendance Tracking (UML Use Cases)
// ============================================================================

function getAttendanceRecords(filter = {}) {
  let rows = readLocalJson('attendance.json', []);
  if (!Array.isArray(rows)) rows = [];
  if (filter.course_id) {
    rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
  }
  if (filter.session_id) {
    rows = rows.filter(r => String(r.session_id || '') === String(filter.session_id));
  }
  if (filter.student_username) {
    const target = String(filter.student_username).trim().toLowerCase();
    rows = rows.filter(r =>
      String(r.student_username || '').trim().toLowerCase() === target ||
      String(r.student_id || '').trim().toLowerCase() === target
    );
  }
  if (filter.term_code) {
    const tc = String(filter.term_code).trim().toUpperCase();
    rows = rows.filter(r => String(r.term_code || '').trim().toUpperCase() === tc);
  }

  return rows.sort((a, b) => {
    const keyA = `${a.session_date || ''} ${a.recorded_at || ''}`;
    const keyB = `${b.session_date || ''} ${b.recorded_at || ''}`;
    return keyB.localeCompare(keyA);
  });
}

function recordSessionAttendance({
  course_id,
  course_code,
  course_title,
  session_id,
  session_title,
  session_date,
  term_code,
  marked_by,
  entries
}) {
  const courseIdNum = Number(course_id);
  const sessDate = String(session_date || '').trim() || getEastAfricaNow().isoDate;
  const sessKey = String(session_id || '').trim() || `date-${sessDate}`;
  const activeTerm = getActiveTerm();
  const resolvedTerm = String(term_code || (activeTerm && activeTerm.code) || 'AY2027-T1').trim().toUpperCase();

  if (!courseIdNum || !Array.isArray(entries) || entries.length === 0) {
    return { error: 'Course and student attendance entries are required.' };
  }

  let all = readLocalJson('attendance.json', []);
  if (!Array.isArray(all)) all = [];

  const savedRecords = [];
  const nowIso = new Date().toISOString();

  for (const entry of entries) {
    const uname = String(entry.student_username || entry.student_id || '').trim().toLowerCase();
    if (!uname) continue;
    const rawStatus = String(entry.status || 'present').trim().toLowerCase();
    const status = VALID_ATTENDANCE_STATUSES.includes(rawStatus) ? rawStatus : 'present';
    const note = String(entry.note || '').trim().slice(0, 240);

    const idx = all.findIndex(r =>
      r &&
      String(r.student_username || '').toLowerCase() === uname &&
      Number(r.course_id) === courseIdNum &&
      (String(r.session_id || '') === sessKey || (!session_id && r.session_date === sessDate))
    );

    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        student_id: String(entry.student_id || all[idx].student_id || uname).trim(),
        student_name: String(entry.student_name || all[idx].student_name || uname).trim(),
        session_title: String(session_title || all[idx].session_title || 'Live Class Session').trim(),
        session_date: sessDate,
        status,
        note,
        updated_by: String(marked_by || 'Instructor').trim(),
        updated_at: nowIso
      };
      savedRecords.push(all[idx]);
    } else {
      const rec = {
        id: `att-${crypto.randomUUID()}`,
        course_id: courseIdNum,
        course_code: String(course_code || '').trim(),
        course_title: String(course_title || '').trim(),
        session_id: sessKey,
        session_title: String(session_title || 'Live Class Session').trim(),
        session_date: sessDate,
        term_code: resolvedTerm,
        student_username: uname,
        student_id: String(entry.student_id || uname).trim(),
        student_name: String(entry.student_name || uname).trim(),
        status,
        note,
        recorded_by: String(marked_by || 'Instructor').trim(),
        recorded_at: nowIso,
        updated_by: null,
        updated_at: null
      };
      all.unshift(rec);
      savedRecords.push(rec);
    }
  }

  writeLocalJson('attendance.json', all);
  return { success: true, savedCount: savedRecords.length, records: savedRecords };
}

function updateAttendanceRecord(recordId, { status, note, updated_by }) {
  const cleanStatus = String(status || '').trim().toLowerCase();
  if (!VALID_ATTENDANCE_STATUSES.includes(cleanStatus)) {
    return { error: 'Attendance status must be present, late, excused, or absent.' };
  }

  let all = readLocalJson('attendance.json', []);
  if (!Array.isArray(all)) all = [];
  const idx = all.findIndex(r => r && r.id === recordId);
  if (idx < 0) {
    return { error: 'Attendance record not found.' };
  }

  all[idx] = {
    ...all[idx],
    status: cleanStatus,
    note: note !== undefined ? String(note || '').trim().slice(0, 240) : (all[idx].note || ''),
    updated_by: String(updated_by || 'Admin').trim(),
    updated_at: new Date().toISOString()
  };
  writeLocalJson('attendance.json', all);
  return { success: true, record: all[idx] };
}

function computeStudentAttendanceSummary(records) {
  const rows = Array.isArray(records) ? records : [];
  const totalSessions = rows.length;
  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let absentCount = 0;

  for (const r of rows) {
    const st = String(r && r.status || '').toLowerCase();
    if (st === 'present') presentCount += 1;
    else if (st === 'late') lateCount += 1;
    else if (st === 'excused') excusedCount += 1;
    else if (st === 'absent') absentCount += 1;
  }

  const attendancePercent = totalSessions > 0
    ? Math.round(((presentCount * 1 + excusedCount * 1 + lateCount * 0.75) / totalSessions) * 100)
    : null;

  return {
    totalSessions,
    presentCount,
    lateCount,
    excusedCount,
    absentCount,
    attendancePercent,
    needsFollowUp: totalSessions > 0 && attendancePercent < 75
  };
}

function buildAttendanceCsv(records) {
  const rows = Array.isArray(records) ? records : [];
  const header = [
    'Record ID',
    'Date',
    'Course Code',
    'Session',
    'Student ID',
    'Student Name',
    'Status',
    'Note',
    'Recorded By',
    'Updated At'
  ].map(escapeCsvCell).join(',');

  const lines = rows.map(r => [
    r.id,
    r.session_date,
    r.course_code,
    r.session_title,
    r.student_id || r.student_username,
    r.student_name,
    r.status,
    r.note || '',
    r.recorded_by || '',
    r.updated_at || r.recorded_at || ''
  ].map(escapeCsvCell).join(','));

  return [header, ...lines].join('\r\n') + '\r\n';
}

// ============================================================================
// 3. WhatsApp & Email Reminders
// ============================================================================

function getRemindersData() {
  const raw = readLocalJson('reminders.json', null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      preferences: raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {},
      logs: Array.isArray(raw.logs) ? raw.logs : []
    };
  }
  return { preferences: {}, logs: [] };
}

function getReminderPreferences(username) {
  const uname = String(username || '').trim().toLowerCase();
  const data = getRemindersData();
  const saved = (uname && data.preferences[uname]) || {};
  return {
    phone: saved.phone || '',
    channel: ['whatsapp', 'email', 'both'].includes(saved.channel) ? saved.channel : 'whatsapp',
    deadline_reminders: saved.deadline_reminders !== undefined ? Boolean(saved.deadline_reminders) : true,
    session_reminders: saved.session_reminders !== undefined ? Boolean(saved.session_reminders) : true,
    grade_alerts: saved.grade_alerts !== undefined ? Boolean(saved.grade_alerts) : true,
    updated_at: saved.updated_at || null
  };
}

function saveReminderPreferences(username, payload) {
  const uname = String(username || '').trim().toLowerCase();
  const data = getRemindersData();
  const channel = ['whatsapp', 'email', 'both'].includes(payload.channel) ? payload.channel : 'whatsapp';
  const entry = {
    phone: String(payload.phone || '').trim().slice(0, 40),
    channel,
    deadline_reminders: payload.deadline_reminders === 'on' || payload.deadline_reminders === true || payload.deadline_reminders === '1',
    session_reminders: payload.session_reminders === 'on' || payload.session_reminders === true || payload.session_reminders === '1',
    grade_alerts: payload.grade_alerts === 'on' || payload.grade_alerts === true || payload.grade_alerts === '1',
    updated_at: new Date().toISOString()
  };
  data.preferences[uname] = entry;
  writeLocalJson('reminders.json', data);
  return entry;
}

function getReminderLogs(limit = 50) {
  const data = getRemindersData();
  return data.logs.slice(0, limit);
}

function logReminderSent(payload) {
  const data = getRemindersData();
  const entry = {
    id: `rem-${crypto.randomUUID()}`,
    sent_by: String(payload.sent_by || '').trim(),
    sent_by_name: String(payload.sent_by_name || 'Instructor').trim(),
    course_id: payload.course_id ? Number(payload.course_id) : null,
    course_code: String(payload.course_code || '').trim(),
    template_key: String(payload.template_key || 'custom').trim(),
    channel: String(payload.channel || 'whatsapp').trim(),
    recipient_username: String(payload.recipient_username || '').trim().toLowerCase(),
    recipient_name: String(payload.recipient_name || 'Cohort').trim(),
    message_preview: String(payload.message_preview || '').trim().slice(0, 300),
    sent_at: new Date().toISOString()
  };
  data.logs.unshift(entry);
  if (data.logs.length > 300) {
    data.logs = data.logs.slice(0, 300);
  }
  writeLocalJson('reminders.json', data);
  return entry;
}

// ============================================================================
// 4. Ministry Practicum Submissions
// ============================================================================

function getPracticumSubmissions(filter = {}) {
  let rows = readLocalJson('practicums.json', []);
  if (!Array.isArray(rows)) rows = [];
  if (filter.student_username) {
    const target = String(filter.student_username).trim().toLowerCase();
    rows = rows.filter(r =>
      String(r.student_username || '').trim().toLowerCase() === target ||
      String(r.student_id || '').trim().toLowerCase() === target
    );
  }
  if (filter.course_id) {
    rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
  }
  if (filter.status) {
    rows = rows.filter(r => String(r.status || '') === String(filter.status));
  }
  return rows.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
}

function createPracticumSubmission(payload) {
  const courseId = Number(payload.course_id);
  const practicumType = String(payload.practicum_type || '').trim();
  const title = String(payload.title || '').trim();
  const ministryDate = String(payload.ministry_date || '').trim();
  const locationChurch = String(payload.location_church || '').trim();
  const hoursServed = Number(payload.hours_served);
  const reflection = String(payload.reflection || '').trim();
  const elderName = String(payload.elder_name || '').trim();
  const elderPhoneRaw = String(payload.elder_phone || '').trim();
  const elderDigits = elderPhoneRaw.replace(/\D/g, '');
  const elderConfirmed = payload.elder_confirmed === true || payload.elder_confirmed === 'on' || payload.elder_confirmed === 'true' || payload.elder_confirmed === '1';
  const evidenceUrl = String(payload.evidence_url || '').trim();

  if (!courseId) {
    return { error: 'Please select a course for your Ministry Practicum.' };
  }
  if (!VALID_PRACTICUM_TYPES.includes(practicumType)) {
    return { error: 'Please choose a valid practicum type (Sermon Media, Church Visit Report, or Elder Endorsement).' };
  }
  if (title.length < 4) {
    return { error: 'Please enter a practicum title (at least 4 characters).' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ministryDate)) {
    return { error: 'Please select the date of the ministry activity.' };
  }
  if (locationChurch.length < 2) {
    return { error: 'Please enter the church or ministry location.' };
  }
  if (Number.isNaN(hoursServed) || hoursServed <= 0 || hoursServed > 100) {
    return { error: 'Enter hours served between 0.5 and 100.' };
  }
  if (reflection.length < 30) {
    return { error: 'Please write a pastoral reflection of at least 30 characters.' };
  }
  if (elderName.length < 2 || elderDigits.length < 7) {
    return { error: 'Provide your supervising Church Elder name and a valid phone number (at least 7 digits).' };
  }
  if (!elderConfirmed) {
    return { error: 'Confirm that your supervising Church Elder or Board witnessed and endorsed this ministry work.' };
  }
  if (evidenceUrl && !/^https?:\/\//i.test(evidenceUrl)) {
    return { error: 'Evidence link must start with https:// or http://' };
  }

  const all = getPracticumSubmissions();
  const studentUsername = String(payload.student_username || '').trim().toLowerCase();
  const record = {
    id: `prac-${crypto.randomUUID()}`,
    student_username: studentUsername,
    student_id: String(payload.student_id || studentUsername).trim(),
    student_name: String(payload.student_name || studentUsername).trim(),
    course_id: courseId,
    course_code: String(payload.course_code || '').trim(),
    course_title: String(payload.course_title || '').trim(),
    practicum_type: practicumType,
    title,
    ministry_date: ministryDate,
    location_church: locationChurch,
    hours_served: hoursServed,
    hours_approved: 0,
    evidence_url: evidenceUrl,
    reflection,
    elder_name: elderName,
    elder_phone: elderPhoneRaw,
    elder_confirmed: true,
    status: 'pending',
    reviewer_feedback: '',
    reviewer_name: null,
    reviewed_at: null,
    submitted_at: new Date().toISOString()
  };

  all.unshift(record);
  writeLocalJson('practicums.json', all);
  return { success: true, practicum: record };
}

function reviewPracticumSubmission(practicumId, { status, hours_approved, reviewer_feedback, reviewer_name }) {
  const cleanStatus = status === 'approved' ? 'approved' : (status === 'needs_revision' ? 'needs_revision' : null);
  if (!cleanStatus) {
    return { error: 'Decision must be Approved or Needs Revision.' };
  }

  const all = getPracticumSubmissions();
  const idx = all.findIndex(r => r && r.id === practicumId);
  if (idx < 0) {
    return { error: 'Practicum submission not found.' };
  }

  let approvedHrs = cleanStatus === 'approved'
    ? Number(hours_approved !== undefined && hours_approved !== '' ? hours_approved : all[idx].hours_served)
    : 0;
  if (Number.isNaN(approvedHrs) || approvedHrs < 0) approvedHrs = 0;

  all[idx] = {
    ...all[idx],
    status: cleanStatus,
    hours_approved: approvedHrs,
    reviewer_feedback: String(reviewer_feedback || '').trim().slice(0, 600),
    reviewer_name: String(reviewer_name || 'Lecturer').trim(),
    reviewed_at: new Date().toISOString()
  };
  writeLocalJson('practicums.json', all);
  return { success: true, practicum: all[idx] };
}

module.exports = {
  VALID_ATTENDANCE_STATUSES,
  VALID_PRACTICUM_TYPES,
  getLiveSessions,
  detectTimetableConflict,
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
};
