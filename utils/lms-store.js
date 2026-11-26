const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase');

const DATA_DIR = path.join(__dirname, '../data');

function dataFilePath(filename) {
  return path.join(DATA_DIR, filename);
}

function tmpFilePath(filename) {
  return path.join(os.tmpdir(), `pastors-lms-${filename}`);
}

function readLocalJson(filename, fallback) {
  for (const p of [dataFilePath(filename), tmpFilePath(filename)]) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        if (raw && raw.trim()) return JSON.parse(raw);
      }
    } catch {
      // try next path
    }
  }
  return fallback;
}

function writeLocalJson(filename, value) {
  const payload = JSON.stringify(value, null, 2);
  try {
    fs.writeFileSync(dataFilePath(filename), payload, 'utf8');
    return true;
  } catch {
    try {
      fs.writeFileSync(tmpFilePath(filename), payload, 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}

// ==========================================================================
// UoPeople-style Grading & GPA Calculations (4.0 Scale)
// ==========================================================================
function computeLetterGrade(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return 'N/A';
  if (p >= 93) return 'A';
  if (p >= 90) return 'A-';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B-';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C-';
  if (p >= 60) return 'D';
  return 'F';
}

function letterToGradePoints(letter) {
  const map = {
    'A': 4.0,
    'A-': 3.67,
    'B+': 3.33,
    'B': 3.0,
    'B-': 2.67,
    'C+': 2.33,
    'C': 2.0,
    'C-': 1.67,
    'D': 1.0,
    'F': 0.0
  };
  return Object.prototype.hasOwnProperty.call(map, letter) ? map[letter] : null;
}

const CATEGORY_WEIGHTS = {
  assignment: 35,
  quiz: 20,
  discussion: 20,
  exam: 25
};

const CATEGORY_LABELS = {
  assignment: 'Written Assignments & Journals',
  quiz: 'Unit Quizzes',
  discussion: 'Cohort Discussions',
  exam: 'Graded / Final Exams'
};

function computeCourseGradeSummary(submissions = [], discussions = []) {
  const rawGradedSubs = [];

  submissions.forEach(s => {
    if (s.score !== null && s.score !== undefined && Number.isFinite(Number(s.score))) {
      const max = Number(s.max_score) > 0 ? Number(s.max_score) : 100;
      const pct = Math.min(100, Math.max(0, (Number(s.score) / max) * 100));
      rawGradedSubs.push({
        id: s.id,
        topic_id: String(s.topic_id || s.id),
        title: s.topic_title || s.topic_id || 'Assignment',
        type: s.submission_type || 'assignment',
        score: Number(s.score),
        max_score: max,
        percent: Math.round(pct),
        letter: computeLetterGrade(pct),
        feedback: s.feedback || '',
        graded_by: s.graded_by || '',
        graded_at: s.graded_at || s.updated_at || s.created_at
      });
    }
  });

  // For multiple quiz/exam attempts on the same topic, keep the highest score per topic_id
  const bestByTopic = new Map();
  rawGradedSubs.forEach(item => {
    const key = `${item.type}:${item.topic_id}`;
    const existing = bestByTopic.get(key);
    if (!existing || item.percent > existing.percent) {
      bestByTopic.set(key, item);
    }
  });
  const gradedItems = Array.from(bestByTopic.values());

  discussions.forEach(d => {
    if (d.grade_score !== null && d.grade_score !== undefined && Number.isFinite(Number(d.grade_score))) {
      const pct = Math.min(100, Math.max(0, Number(d.grade_score)));
      gradedItems.push({
        id: d.id,
        topic_id: `disc-${d.module_id}`,
        title: `Unit ${d.module_id} Discussion Forum`,
        type: 'discussion',
        score: pct,
        max_score: 100,
        percent: Math.round(pct),
        letter: computeLetterGrade(pct),
        feedback: d.grade_feedback || '',
        graded_by: d.graded_by || '',
        graded_at: d.created_at
      });
    }
  });

  if (gradedItems.length === 0) {
    return {
      gradedCount: 0,
      averagePercent: null,
      letterGrade: 'IP',
      gradePoints: null,
      gradingModel: 'weighted',
      passingThreshold: 60,
      categoryBreakdown: Object.keys(CATEGORY_WEIGHTS).map(k => ({
        key: k,
        label: CATEGORY_LABELS[k],
        weight: CATEGORY_WEIGHTS[k],
        itemCount: 0,
        averagePercent: null
      })),
      items: gradedItems
    };
  }

  const buckets = {
    assignment: [],
    quiz: [],
    discussion: [],
    exam: []
  };

  gradedItems.forEach(item => {
    const bucketKey = item.type === 'journal'
      ? 'assignment'
      : (Object.prototype.hasOwnProperty.call(buckets, item.type) ? item.type : 'assignment');
    buckets[bucketKey].push(item.percent);
  });

  let activeWeightSum = 0;
  let weightedTotal = 0;
  const categoryBreakdown = Object.keys(CATEGORY_WEIGHTS).map(key => {
    const vals = buckets[key];
    const weight = CATEGORY_WEIGHTS[key];
    if (vals.length === 0) {
      return {
        key,
        label: CATEGORY_LABELS[key],
        weight,
        itemCount: 0,
        averagePercent: null
      };
    }
    const catAvg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
    activeWeightSum += weight;
    weightedTotal += catAvg * weight;
    return {
      key,
      label: CATEGORY_LABELS[key],
      weight,
      itemCount: vals.length,
      averagePercent: Math.round(catAvg)
    };
  });

  const avg = activeWeightSum > 0
    ? Math.round(weightedTotal / activeWeightSum)
    : Math.round(gradedItems.reduce((sum, i) => sum + i.percent, 0) / gradedItems.length);
  const letter = computeLetterGrade(avg);
  return {
    gradedCount: gradedItems.length,
    averagePercent: avg,
    letterGrade: letter,
    gradePoints: letterToGradePoints(letter),
    gradingModel: 'weighted',
    passingThreshold: 60,
    categoryBreakdown,
    items: gradedItems
  };
}

// ==========================================================================
// Submissions (Assignments, Learning Journals, Quizzes, Exams)
// ==========================================================================
async function getSubmissions(filter = {}) {
  let rows = null;
  if (supabaseAdmin) {
    try {
      let q = supabaseAdmin.from('submissions').select('*').order('created_at', { ascending: false });
      if (filter.course_id) q = q.eq('course_id', Number(filter.course_id));
      if (filter.student_username) q = q.eq('student_username', filter.student_username);
      if (filter.module_id) q = q.eq('module_id', Number(filter.module_id));
      const { data, error } = await q;
      if (!error && Array.isArray(data)) rows = data;
    } catch {
      // fall through to local
    }
  }

  if (!rows) {
    rows = readLocalJson('submissions.json', []);
    if (filter.course_id) rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
    if (filter.student_username) {
      const target = String(filter.student_username).toLowerCase();
      rows = rows.filter(r => String(r.student_username || '').toLowerCase() === target);
    }
    if (filter.module_id) rows = rows.filter(r => Number(r.module_id) === Number(filter.module_id));
    if (filter.topic_id) rows = rows.filter(r => String(r.topic_id) === String(filter.topic_id));
  } else if (filter.topic_id) {
    rows = rows.filter(r => String(r.topic_id) === String(filter.topic_id));
  }

  return rows;
}

async function saveSubmission(payload) {
  const now = new Date().toISOString();
  const id = payload.id || `sub-${crypto.randomUUID()}`;
  const scoreVal = payload.score !== undefined && payload.score !== null ? Number(payload.score) : null;
  const maxScore = Number(payload.max_score) > 0 ? Number(payload.max_score) : 100;
  const pct = scoreVal !== null ? (scoreVal / maxScore) * 100 : null;

  const record = {
    id,
    student_username: payload.student_username,
    student_name: payload.student_name || payload.student_username,
    course_id: Number(payload.course_id),
    module_id: Number(payload.module_id),
    topic_id: String(payload.topic_id),
    topic_title: payload.topic_title || '',
    submission_type: payload.submission_type || 'assignment',
    content_text: payload.content_text || '',
    quiz_answers: payload.quiz_answers || null,
    score: scoreVal,
    max_score: maxScore,
    grade_letter: pct !== null ? computeLetterGrade(pct) : null,
    feedback: payload.feedback || '',
    graded_by: payload.graded_by || null,
    graded_at: scoreVal !== null ? now : null,
    attempt_number: Number(payload.attempt_number) || 1,
    integrity_pledged: Boolean(payload.integrity_pledged),
    status: scoreVal !== null ? 'graded' : 'submitted',
    created_at: payload.created_at || now,
    updated_at: now
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('submissions').upsert([record], { onConflict: 'id' });
    } catch {
      // keep local copy regardless
    }
  }

  const all = readLocalJson('submissions.json', []);
  const idx = all.findIndex(r => r.id === record.id);
  if (idx >= 0) all[idx] = record;
  else all.unshift(record);
  writeLocalJson('submissions.json', all);
  return record;
}

async function gradeSubmission(subId, { score, feedback, gradedBy }) {
  const numScore = Math.min(100, Math.max(0, Number(score)));
  if (!Number.isFinite(numScore)) return null;
  const now = new Date().toISOString();

  const all = readLocalJson('submissions.json', []);
  let existing = all.find(r => r.id === subId);

  if (!existing && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.from('submissions').select('*').eq('id', subId).maybeSingle();
      if (data) existing = data;
    } catch {
      // ignore
    }
  }

  if (!existing) return null;

  const maxScore = Number(existing.max_score) > 0 ? Number(existing.max_score) : 100;
  const pct = (numScore / maxScore) * 100;
  const updated = {
    ...existing,
    score: numScore,
    grade_letter: computeLetterGrade(pct),
    feedback: (feedback || '').trim(),
    graded_by: gradedBy || 'Instructor',
    graded_at: now,
    status: 'graded',
    updated_at: now
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('submissions').update({
        score: updated.score,
        grade_letter: updated.grade_letter,
        feedback: updated.feedback,
        graded_by: updated.graded_by,
        graded_at: updated.graded_at,
        status: updated.status,
        updated_at: updated.updated_at
      }).eq('id', subId);
    } catch {
      // ignore
    }
  }

  const idx = all.findIndex(r => r.id === subId);
  if (idx >= 0) all[idx] = updated;
  else all.unshift(updated);
  writeLocalJson('submissions.json', all);
  return updated;
}

// ==========================================================================
// Discussion Forums (Weekly Cohort Threads)
// ==========================================================================
async function getDiscussions(courseId, moduleId = null) {
  let rows = null;
  if (supabaseAdmin) {
    try {
      let q = supabaseAdmin
        .from('discussion_posts')
        .select('*')
        .eq('course_id', Number(courseId))
        .order('created_at', { ascending: true });
      if (moduleId !== null && moduleId !== undefined) {
        q = q.eq('module_id', Number(moduleId));
      }
      const { data, error } = await q;
      if (!error && Array.isArray(data)) rows = data;
    } catch {
      // fallback
    }
  }

  if (!rows) {
    rows = readLocalJson('discussions.json', []).filter(p => Number(p.course_id) === Number(courseId));
    if (moduleId !== null && moduleId !== undefined) {
      rows = rows.filter(p => Number(p.module_id) === Number(moduleId));
    }
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return rows;
}

async function addDiscussionPost(payload) {
  const record = {
    id: `post-${crypto.randomUUID()}`,
    course_id: Number(payload.course_id),
    module_id: Number(payload.module_id),
    parent_id: payload.parent_id || null,
    author_username: payload.author_username,
    author_name: payload.author_name || payload.author_username,
    author_role: payload.author_role || 'student',
    body: (payload.body || '').trim(),
    grade_score: null,
    grade_feedback: '',
    graded_by: null,
    created_at: new Date().toISOString()
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('discussion_posts').insert([record]);
    } catch {
      // fallback
    }
  }

  const all = readLocalJson('discussions.json', []);
  all.push(record);
  writeLocalJson('discussions.json', all);
  return record;
}

async function gradeDiscussionPost(postId, { score, feedback, gradedBy }) {
  const numScore = Math.min(100, Math.max(0, Number(score)));
  if (!Number.isFinite(numScore)) return null;

  const all = readLocalJson('discussions.json', []);
  let post = all.find(p => p.id === postId);
  if (!post && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.from('discussion_posts').select('*').eq('id', postId).maybeSingle();
      if (data) post = data;
    } catch {
      // ignore
    }
  }
  if (!post) return null;

  const updated = {
    ...post,
    grade_score: numScore,
    grade_feedback: (feedback || '').trim(),
    graded_by: gradedBy || 'Instructor'
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('discussion_posts').update({
        grade_score: updated.grade_score,
        grade_feedback: updated.grade_feedback,
        graded_by: updated.graded_by
      }).eq('id', postId);
    } catch {
      // ignore
    }
  }

  const idx = all.findIndex(p => p.id === postId);
  if (idx >= 0) all[idx] = updated;
  else all.push(updated);
  writeLocalJson('discussions.json', all);
  return updated;
}

// ==========================================================================
// Peer Reviews
// ==========================================================================
async function getPeerReviews(courseId) {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('peer_reviews')
        .select('*')
        .eq('course_id', Number(courseId))
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) return data;
    } catch {
      // fallback
    }
  }
  return readLocalJson('peer-reviews.json', []).filter(r => Number(r.course_id) === Number(courseId));
}

async function addPeerReview(payload) {
  const record = {
    id: `pr-${crypto.randomUUID()}`,
    submission_id: payload.submission_id,
    course_id: Number(payload.course_id),
    reviewer_username: payload.reviewer_username,
    reviewer_name: payload.reviewer_name || 'Fellow Pastor',
    rating: Math.min(5, Math.max(1, parseInt(payload.rating, 10) || 5)),
    feedback: (payload.feedback || '').trim(),
    created_at: new Date().toISOString()
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('peer_reviews').upsert([record], { onConflict: 'submission_id,reviewer_username' });
    } catch {
      // fallback
    }
  }

  const all = readLocalJson('peer-reviews.json', []);
  const idx = all.findIndex(r => r.submission_id === record.submission_id && r.reviewer_username === record.reviewer_username);
  if (idx >= 0) all[idx] = record;
  else all.unshift(record);
  writeLocalJson('peer-reviews.json', all);
  return record;
}

// ==========================================================================
// Course Announcements
// ==========================================================================
async function getAnnouncements(courseId) {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('course_announcements')
        .select('*')
        .eq('course_id', Number(courseId))
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) return data;
    } catch {
      // fallback
    }
  }
  return readLocalJson('announcements.json', [])
    .filter(a => Number(a.course_id) === Number(courseId))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function addAnnouncement(payload) {
  const record = {
    id: `ann-${crypto.randomUUID()}`,
    course_id: Number(payload.course_id),
    author_username: payload.author_username,
    author_name: payload.author_name || 'Instructor',
    title: (payload.title || '').trim(),
    body: (payload.body || '').trim(),
    created_at: new Date().toISOString()
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('course_announcements').insert([record]);
    } catch {
      // fallback
    }
  }

  const all = readLocalJson('announcements.json', []);
  all.unshift(record);
  writeLocalJson('announcements.json', all);
  return record;
}

// ==========================================================================
// Custom Browser-Authored Lessons & Quizzes/Exams
// ==========================================================================
function getCustomLessonsSync(courseId = null, moduleId = null) {
  let all = readLocalJson('custom-lessons.json', []);
  if (courseId !== null && courseId !== undefined) {
    all = all.filter(l => Number(l.course_id) === Number(courseId));
  }
  if (moduleId !== null && moduleId !== undefined) {
    all = all.filter(l => Number(l.module_id) === Number(moduleId));
  }
  return all.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

async function saveCustomLesson(payload) {
  const now = new Date().toISOString();
  const topicKey = payload.topic_key || `custom-c${payload.course_id}-m${payload.module_id}-${Date.now()}`;
  const record = {
    topic_key: topicKey,
    course_id: Number(payload.course_id),
    module_id: Number(payload.module_id),
    sort_order: Number(payload.sort_order) || 1,
    title: (payload.title || '').trim(),
    banner_title: (payload.banner_title || payload.title || '').trim(),
    topic_type: ['reading', 'assignment', 'journal', 'quiz', 'discussion', 'exam'].includes(payload.topic_type)
      ? payload.topic_type
      : 'reading',
    content_html: payload.content_html || '',
    scripture_ref: (payload.scripture_ref || '').trim(),
    quiz_questions: Array.isArray(payload.quiz_questions) ? payload.quiz_questions : [],
    max_score: Number(payload.max_score) > 0 ? Number(payload.max_score) : 100,
    pass_score: Number(payload.pass_score) > 0 ? Number(payload.pass_score) : 60,
    max_attempts: Number(payload.max_attempts) > 0 ? Number(payload.max_attempts) : 3,
    time_limit_minutes: payload.time_limit_minutes ? Number(payload.time_limit_minutes) : null,
    due_date: payload.due_date || null,
    created_by: payload.created_by || 'admin',
    updated_at: now
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('module_lessons').upsert([record], { onConflict: 'topic_key' });
    } catch {
      // fallback
    }
  }

  const all = readLocalJson('custom-lessons.json', []);
  const idx = all.findIndex(l => l.topic_key === record.topic_key);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  writeLocalJson('custom-lessons.json', all);
  return record;
}

async function deleteCustomLesson(topicKey) {
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('module_lessons').delete().eq('topic_key', topicKey);
    } catch {
      // ignore
    }
  }
  const all = readLocalJson('custom-lessons.json', []);
  const filtered = all.filter(l => l.topic_key !== topicKey);
  writeLocalJson('custom-lessons.json', filtered);
  return filtered.length < all.length;
}

// ==========================================================================
// Enrolment Filtering (Real Per-Student Enrolment Enforcement)
// ==========================================================================
function getEnrolledCoursesForUser(allCourses, user) {
  if (!user || ['admin', 'super_admin', 'teacher'].includes(user.role)) {
    return { courses: allCourses, isFilteredByEnrolment: false };
  }
  const enrolments = readLocalJson('enrolments.json', []);
  const activeEnrolments = enrolments.filter(e => e && e.status !== 'removed' && e.status !== 'dropped');

  // If the admin has assigned explicit enrolments for this student, show strictly their enrolled courses.
  const uLower = (user.username || '').toLowerCase();
  const sLower = (user.student_id || '').toLowerCase();
  const mine = activeEnrolments.filter(e => {
    const eId = String(e.student_id || e.student_username || '').toLowerCase();
    return (uLower && eId === uLower) || (sLower && eId === sLower);
  });

  if (mine.length > 0) {
    const enrolledIds = new Set(mine.map(e => Number(e.course_id)));
    return {
      courses: allCourses.filter(c => enrolledIds.has(Number(c.id))),
      isFilteredByEnrolment: true
    };
  }

  // Fallback for open-enrolment cohort (when no specific rows exist yet for this student)
  return {
    courses: allCourses.filter(c => c.status !== 'archived' && !c.archived),
    isFilteredByEnrolment: false
  };
}

// ==========================================================================
// East Africa Time, Access Guards & Per-Student Deadline Extensions
// ==========================================================================
function getEastAfricaNow() {
  let isoDate;
  try {
    isoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    isoDate = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return {
    isoDate,
    timestampMs: Date.now()
  };
}

function isCourseEnrolled(allCourses, courseId, user) {
  if (!user) return false;
  if (['admin', 'super_admin', 'teacher'].includes(user.role)) return true;
  const targetCourse = (allCourses || []).find(c => Number(c.id) === Number(courseId));
  if (!targetCourse) return false;
  const { courses, isFilteredByEnrolment } = getEnrolledCoursesForUser(allCourses || [], user);
  if (!isFilteredByEnrolment) return targetCourse.status !== 'archived' && !targetCourse.archived;
  return courses.some(c => Number(c.id) === Number(courseId));
}

function getDeadlineExtensions(filter = {}) {
  let rows = readLocalJson('extensions.json', []);
  if (!Array.isArray(rows)) rows = [];
  if (filter.student_username) {
    const target = String(filter.student_username).toLowerCase();
    rows = rows.filter(r => String(r.student_username || '').toLowerCase() === target);
  }
  if (filter.course_id) {
    rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
  }
  if (filter.module_id) {
    rows = rows.filter(r => Number(r.module_id) === Number(filter.module_id));
  }
  return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function saveDeadlineExtension(payload) {
  const studentUsername = String(payload.student_username || '').trim().toLowerCase();
  const courseId = Number(payload.course_id);
  const moduleId = Number(payload.module_id);
  const topicId = String(payload.topic_id || '*').trim() || '*';
  const extendedUntil = String(payload.extended_until || '').trim();
  if (!studentUsername || !courseId || !moduleId || !/^\d{4}-\d{2}-\d{2}$/.test(extendedUntil)) {
    return null;
  }

  const all = getDeadlineExtensions();
  const idx = all.findIndex(r =>
    String(r.student_username || '').toLowerCase() === studentUsername &&
    Number(r.course_id) === courseId &&
    Number(r.module_id) === moduleId &&
    String(r.topic_id || '*') === topicId
  );

  const record = {
    id: (idx >= 0 && all[idx].id) ? all[idx].id : `ext-${crypto.randomUUID()}`,
    student_username: studentUsername,
    student_name: String(payload.student_name || studentUsername).trim(),
    course_id: courseId,
    module_id: moduleId,
    topic_id: topicId,
    extended_until: extendedUntil,
    reason: String(payload.reason || '').trim().slice(0, 240),
    granted_by: String(payload.granted_by || 'Instructor').trim(),
    created_at: new Date().toISOString()
  };

  if (idx >= 0) all[idx] = record;
  else all.unshift(record);
  writeLocalJson('extensions.json', all);
  return record;
}

function deleteDeadlineExtension(extId) {
  const all = getDeadlineExtensions();
  const filtered = all.filter(r => r.id !== extId);
  if (filtered.length === all.length) return false;
  writeLocalJson('extensions.json', filtered);
  return true;
}

function checkDeadlineLock({ courseId, moduleId, topicId, dueDateIso, username, userRole }) {
  if (['admin', 'super_admin', 'teacher'].includes(userRole)) {
    return {
      locked: false,
      effectiveDueDate: dueDateIso || null,
      originalDueDate: dueDateIso || null,
      hasExtension: false,
      extensionReason: ''
    };
  }
  if (!dueDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDateIso).trim())) {
    return {
      locked: false,
      effectiveDueDate: null,
      originalDueDate: null,
      hasExtension: false,
      extensionReason: ''
    };
  }

  const baseDue = String(dueDateIso).trim();
  let effectiveDue = baseDue;
  let hasExtension = false;
  let extensionReason = '';

  if (username) {
    const matching = getDeadlineExtensions({
      student_username: username,
      course_id: courseId,
      module_id: moduleId
    }).filter(ext => ext.topic_id === '*' || ext.topic_id === String(topicId));

    matching.forEach(ext => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(ext.extended_until) && ext.extended_until > effectiveDue) {
        effectiveDue = ext.extended_until;
        hasExtension = true;
        extensionReason = ext.reason || '';
      }
    });
  }

  const deadlineMs = new Date(`${effectiveDue}T23:59:59+03:00`).getTime();
  const locked = Number.isFinite(deadlineMs) ? Date.now() > deadlineMs : false;

  return {
    locked,
    effectiveDueDate: effectiveDue,
    originalDueDate: baseDue,
    hasExtension,
    extensionReason
  };
}

// ==========================================================================
// Supabase Storage Upload for Profile Pictures (Vercel Cloud Support)
// ==========================================================================
async function uploadProfilePictureToStorage(buffer, username, contentType = 'image/webp') {
  if (!supabaseAdmin || !buffer || !username) return null;
  try {
    const ext = contentType.includes('webp') ? 'webp' : 'jpg';
    const objectPath = `${username}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from('profile-pictures')
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) return null;
    const { data } = supabaseAdmin.storage.from('profile-pictures').getPublicUrl(objectPath);
    return data && data.publicUrl ? data.publicUrl : null;
  } catch {
    return null;
  }
}

module.exports = {
  readLocalJson,
  writeLocalJson,
  CATEGORY_WEIGHTS,
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
  getCustomLessonsSync,
  saveCustomLesson,
  deleteCustomLesson,
  getEnrolledCoursesForUser,
  getEastAfricaNow,
  isCourseEnrolled,
  getDeadlineExtensions,
  saveDeadlineExtension,
  deleteDeadlineExtension,
  checkDeadlineLock,
  uploadProfilePictureToStorage
};
