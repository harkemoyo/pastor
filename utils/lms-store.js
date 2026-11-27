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
  journal: 'Ministry Learning Journals',
  quiz: 'Unit Quizzes',
  discussion: 'Cohort Discussions',
  exam: 'Graded / Final Exams'
};

function resolveCourseWeights(customWeights) {
  if (!customWeights || typeof customWeights !== 'object') {
    return { weights: CATEGORY_WEIGHTS, splitJournal: false };
  }
  const keys = ['assignment', 'journal', 'quiz', 'discussion', 'exam'];
  const parsed = {};
  let sum = 0;
  keys.forEach(k => {
    const val = Number(customWeights[k]);
    parsed[k] = Number.isFinite(val) && val >= 0 ? val : 0;
    sum += parsed[k];
  });
  if (Math.round(sum) !== 100 || sum <= 0) {
    return { weights: CATEGORY_WEIGHTS, splitJournal: false };
  }
  if (parsed.journal > 0) {
    return {
      weights: parsed,
      splitJournal: true
    };
  }
  return {
    weights: {
      assignment: parsed.assignment,
      quiz: parsed.quiz,
      discussion: parsed.discussion,
      exam: parsed.exam
    },
    splitJournal: false
  };
}

function computeCourseGradeSummary(submissions = [], discussions = [], customWeights = null) {
  const { weights: activeWeights, splitJournal } = resolveCourseWeights(customWeights);
  const rawGradedSubs = [];
  let practiceCount = 0;

  submissions.forEach(s => {
    if (s && s.is_practice) {
      practiceCount += 1;
      return;
    }
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
        graded_at: s.graded_at || s.updated_at || s.created_at,
        integrity_flagged: Boolean(s.integrity_flagged),
        integrity_flag_reason: s.integrity_flag_reason || ''
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
        graded_at: d.created_at,
        integrity_flagged: false,
        integrity_flag_reason: ''
      });
    }
  });

  if (gradedItems.length === 0) {
    return {
      gradedCount: 0,
      practiceCount,
      averagePercent: null,
      letterGrade: 'IP',
      gradePoints: null,
      gradingModel: 'weighted',
      passingThreshold: 60,
      categoryBreakdown: Object.keys(activeWeights).map(k => ({
        key: k,
        label: (k === 'assignment' && splitJournal) ? 'Written Assignments' : (CATEGORY_LABELS[k] || k),
        weight: activeWeights[k],
        itemCount: 0,
        averagePercent: null
      })),
      items: gradedItems
    };
  }

  const buckets = {};
  Object.keys(activeWeights).forEach(k => {
    buckets[k] = [];
  });

  gradedItems.forEach(item => {
    let bucketKey = item.type;
    if (item.type === 'journal' && !splitJournal) {
      bucketKey = 'assignment';
    } else if (!Object.prototype.hasOwnProperty.call(buckets, bucketKey)) {
      bucketKey = 'assignment';
    }
    if (!Array.isArray(buckets[bucketKey])) buckets[bucketKey] = [];
    buckets[bucketKey].push(item.percent);
  });

  let activeWeightSum = 0;
  let weightedTotal = 0;
  const categoryBreakdown = Object.keys(activeWeights).map(key => {
    const vals = buckets[key] || [];
    const weight = activeWeights[key];
    const label = (key === 'assignment' && splitJournal) ? 'Written Assignments' : (CATEGORY_LABELS[key] || key);
    if (vals.length === 0) {
      return {
        key,
        label,
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
      label,
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
    practiceCount,
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
    is_practice: Boolean(payload.is_practice),
    integrity_flagged: Boolean(payload.integrity_flagged),
    integrity_flag_reason: String(payload.integrity_flag_reason || '').trim(),
    integrity_flagged_by: payload.integrity_flagged_by || null,
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

async function flagSubmissionIntegrity(subId, { flagged = true, reason = '', flaggedBy = 'Instructor' }) {
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

  const isFlagged = Boolean(flagged);
  const updated = {
    ...existing,
    integrity_flagged: isFlagged,
    integrity_flag_reason: isFlagged ? String(reason || 'Academic integrity review required').trim().slice(0, 300) : '',
    integrity_flagged_by: isFlagged ? String(flaggedBy || 'Instructor') : null,
    updated_at: now
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('submissions').update({
        integrity_flagged: updated.integrity_flagged,
        integrity_flag_reason: updated.integrity_flag_reason,
        integrity_flagged_by: updated.integrity_flagged_by,
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
  const clampScore = (val, fallback) => {
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : fallback;
  };
  const hasRubric = payload.rubric_scripture !== undefined || payload.rubric_application !== undefined || payload.rubric_clarity !== undefined;
  const fallbackRating = clampScore(payload.rating, 5);
  const rScripture = hasRubric ? clampScore(payload.rubric_scripture, fallbackRating) : null;
  const rApplication = hasRubric ? clampScore(payload.rubric_application, fallbackRating) : null;
  const rClarity = hasRubric ? clampScore(payload.rubric_clarity, fallbackRating) : null;
  const rubricPercent = hasRubric
    ? Math.round(((rScripture + rApplication + rClarity) / 15) * 100)
    : Math.round((fallbackRating / 5) * 100);
  const overallRating = hasRubric
    ? Math.round((rScripture + rApplication + rClarity) / 3)
    : fallbackRating;

  const record = {
    id: `pr-${crypto.randomUUID()}`,
    submission_id: payload.submission_id,
    course_id: Number(payload.course_id),
    reviewer_username: payload.reviewer_username,
    reviewer_name: payload.reviewer_name || 'Fellow Pastor',
    rating: overallRating,
    rubric_scripture: rScripture,
    rubric_application: rApplication,
    rubric_clarity: rClarity,
    rubric_percent: rubricPercent,
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
    max_attempts: Number(payload.max_attempts) > 0 ? Number(payload.max_attempts) : (payload.topic_type === 'exam' ? 1 : 3),
    time_limit_minutes: payload.time_limit_minutes ? Number(payload.time_limit_minutes) : null,
    is_practice: Boolean(payload.is_practice),
    min_progress_to_unlock: (payload.min_progress_to_unlock !== undefined && payload.min_progress_to_unlock !== '' && Number.isFinite(Number(payload.min_progress_to_unlock)))
      ? Math.min(100, Math.max(0, Number(payload.min_progress_to_unlock)))
      : (payload.topic_type === 'exam' ? 70 : 0),
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
  const uLower = (user.username || '').toLowerCase();
  const sLower = (user.student_id || '').toLowerCase();
  const belongsToUser = (e) => {
    const eId = String(e.student_id || e.student_username || '').toLowerCase();
    return (uLower && eId === uLower) || (sLower && eId === sLower);
  };

  const withdrawals = readLocalJson('withdrawals.json', []).filter(w =>
    (uLower && String(w.student_username || '').toLowerCase() === uLower) ||
    (sLower && String(w.student_id || '').toLowerCase() === sLower)
  );
  const withdrawnAtByCourse = new Map();
  withdrawals.forEach(w => {
    const cid = Number(w.course_id);
    const ts = new Date(w.withdrawn_at || 0).getTime();
    if (!withdrawnAtByCourse.has(cid) || ts > withdrawnAtByCourse.get(cid)) {
      withdrawnAtByCourse.set(cid, ts);
    }
  });

  const userEnrolmentRows = enrolments.filter(e => e && belongsToUser(e));
  const activeMine = userEnrolmentRows.filter(e =>
    e.status !== 'removed' && e.status !== 'dropped' && e.status !== 'withdrawn'
  );

  if (userEnrolmentRows.length > 0) {
    const enrolledIds = new Set(activeMine.map(e => Number(e.course_id)));
    return {
      courses: allCourses.filter(c => enrolledIds.has(Number(c.id))),
      isFilteredByEnrolment: true
    };
  }

  // Fallback for open-enrolment cohort (still excluding explicitly withdrawn courses)
  return {
    courses: allCourses.filter(c => c.status !== 'archived' && !c.archived && !withdrawnAtByCourse.has(Number(c.id))),
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
// Academic Terms Calendar, Weekly Rhythm & Orientation (Phase 2)
// ==========================================================================
function addDaysIso(isoDate, days) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate).trim())) return '';
  const [y, m, d] = String(isoDate).trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(days || 0), 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function formatUtcShortDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))) return String(isoDate || '');
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function buildDefaultAcademicConfig() {
  return {
    settings: {
      require_orientation: false,
      weekly_due_time_eat: '23:55'
    },
    terms: [
      {
        id: 'term-ay2027-t1',
        code: 'AY2027-T1',
        name: 'Term 1 — 2026/2027 Academic Year',
        start_date: '2026-11-12',
        end_date: '2027-01-13',
        weeks: 9,
        registration_open: '2026-10-15',
        registration_close: '2026-11-11',
        add_drop_end: '2026-11-18',
        is_active: true
      },
      {
        id: 'term-ay2027-t2',
        code: 'AY2027-T2',
        name: 'Term 2 — 2026/2027 Academic Year',
        start_date: '2027-01-21',
        end_date: '2027-03-24',
        weeks: 9,
        registration_open: '2026-12-20',
        registration_close: '2027-01-20',
        add_drop_end: '2027-01-27',
        is_active: false
      }
    ]
  };
}

function getAcademicConfig() {
  const defaults = buildDefaultAcademicConfig();
  const saved = readLocalJson('terms.json', null);
  if (!saved || typeof saved !== 'object') return defaults;
  const terms = Array.isArray(saved.terms) && saved.terms.length > 0 ? saved.terms : defaults.terms;
  const settings = { ...defaults.settings, ...(saved.settings || {}) };
  return { settings, terms };
}

function getActiveTerm() {
  const { terms } = getAcademicConfig();
  return terms.find(t => t && t.is_active) || terms[0] || null;
}

function saveTerm(payload) {
  const config = getAcademicConfig();
  const code = String(payload.code || '').trim().toUpperCase().slice(0, 32);
  const name = String(payload.name || '').trim().slice(0, 120);
  const startDate = String(payload.start_date || '').trim();
  const endDate = String(payload.end_date || '').trim();
  const weeks = Math.min(16, Math.max(1, parseInt(payload.weeks, 10) || 9));
  if (!code || !name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return null;
  }

  const termId = String(payload.id || `term-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).trim();
  const makeActive = payload.is_active === true || payload.is_active === 'true' || payload.is_active === 'on';

  const record = {
    id: termId,
    code,
    name,
    start_date: startDate,
    end_date: endDate,
    weeks,
    registration_open: /^\d{4}-\d{2}-\d{2}$/.test(String(payload.registration_open || '')) ? String(payload.registration_open).trim() : null,
    registration_close: /^\d{4}-\d{2}-\d{2}$/.test(String(payload.registration_close || '')) ? String(payload.registration_close).trim() : null,
    add_drop_end: /^\d{4}-\d{2}-\d{2}$/.test(String(payload.add_drop_end || '')) ? String(payload.add_drop_end).trim() : null,
    is_active: makeActive
  };

  let nextTerms = [...config.terms];
  if (makeActive) {
    nextTerms = nextTerms.map(t => ({ ...t, is_active: false }));
  }

  const idx = nextTerms.findIndex(t => t.id === termId || String(t.code).toUpperCase() === code);
  if (idx >= 0) nextTerms[idx] = { ...nextTerms[idx], ...record };
  else nextTerms.push(record);

  if (!nextTerms.some(t => t.is_active) && nextTerms.length > 0) {
    nextTerms[0].is_active = true;
  }
  nextTerms.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  writeLocalJson('terms.json', { settings: config.settings, terms: nextTerms });
  return nextTerms.find(t => t.id === termId || String(t.code).toUpperCase() === code);
}

function setActiveTerm(termId) {
  const config = getAcademicConfig();
  const found = config.terms.find(t => t.id === termId);
  if (!found) return null;
  const nextTerms = config.terms.map(t => ({ ...t, is_active: t.id === termId }));
  writeLocalJson('terms.json', { settings: config.settings, terms: nextTerms });
  return nextTerms.find(t => t.id === termId);
}

function deleteTerm(termId) {
  const config = getAcademicConfig();
  if (config.terms.length <= 1) return false;
  const target = config.terms.find(t => t.id === termId);
  if (!target || target.is_active) return false;
  const nextTerms = config.terms.filter(t => t.id !== termId);
  writeLocalJson('terms.json', { settings: config.settings, terms: nextTerms });
  return true;
}

function updateAcademicSettings(partial = {}) {
  const config = getAcademicConfig();
  const nextSettings = {
    ...config.settings,
    require_orientation: partial.require_orientation !== undefined
      ? Boolean(partial.require_orientation)
      : config.settings.require_orientation,
    weekly_due_time_eat: partial.weekly_due_time_eat || config.settings.weekly_due_time_eat
  };
  writeLocalJson('terms.json', { settings: nextSettings, terms: config.terms });
  return nextSettings;
}

function computeTermWeekInfo(term) {
  if (!term || !term.start_date || !term.end_date) {
    return {
      phase: 'active',
      currentWeek: 1,
      totalWeeks: 9,
      statusLabel: 'Active Term',
      nextDeadlineLabel: 'Wednesdays at 11:55 PM EAT',
      weekStartIso: null,
      weekEndIso: null,
      inRegistrationWindow: false,
      inAddDropWindow: false
    };
  }
  const todayIso = getEastAfricaNow().isoDate;
  const totalWeeks = Number(term.weeks) > 0 ? Number(term.weeks) : 9;
  const [sy, sm, sd] = term.start_date.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.floor((todayUtc - startUtc) / 86400000);

  const inRegistrationWindow = Boolean(
    term.registration_open && term.registration_close &&
    todayIso >= term.registration_open && todayIso <= term.registration_close
  );
  const inAddDropWindow = Boolean(
    term.add_drop_end && todayIso >= term.start_date && todayIso <= term.add_drop_end
  );

  if (todayIso < term.start_date) {
    return {
      phase: 'upcoming',
      currentWeek: 0,
      totalWeeks,
      statusLabel: `Starts ${formatUtcShortDate(term.start_date)}`,
      nextDeadlineLabel: `Orientation & Registration Open • Term starts ${formatUtcShortDate(term.start_date)}`,
      weekStartIso: term.start_date,
      weekEndIso: addDaysIso(term.start_date, 6),
      inRegistrationWindow,
      inAddDropWindow
    };
  }

  if (todayIso > term.end_date) {
    return {
      phase: 'completed',
      currentWeek: totalWeeks,
      totalWeeks,
      statusLabel: 'Term Completed',
      nextDeadlineLabel: `Ended ${formatUtcShortDate(term.end_date)}`,
      weekStartIso: addDaysIso(term.end_date, -6),
      weekEndIso: term.end_date,
      inRegistrationWindow,
      inAddDropWindow
    };
  }

  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.floor(diffDays / 7) + 1));
  const weekStartIso = addDaysIso(term.start_date, (currentWeek - 1) * 7);
  const weekEndIso = addDaysIso(weekStartIso, 6);

  return {
    phase: 'active',
    currentWeek,
    totalWeeks,
    statusLabel: `Week ${currentWeek} of ${totalWeeks}`,
    nextDeadlineLabel: `Wed, ${formatUtcShortDate(weekEndIso)} at 11:55 PM EAT`,
    weekStartIso,
    weekEndIso,
    inRegistrationWindow,
    inAddDropWindow
  };
}

// ==========================================================================
// Student Extension Requests (Requested by Pastor -> Reviewed by Instructor)
// ==========================================================================
function getExtensionRequests(filter = {}) {
  let rows = readLocalJson('extension-requests.json', []);
  if (!Array.isArray(rows)) rows = [];
  if (filter.student_username) {
    const target = String(filter.student_username).toLowerCase();
    rows = rows.filter(r => String(r.student_username || '').toLowerCase() === target);
  }
  if (filter.course_id) {
    rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
  }
  if (filter.status) {
    rows = rows.filter(r => String(r.status) === String(filter.status));
  }
  return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function createExtensionRequest(payload) {
  const studentUsername = String(payload.student_username || '').trim().toLowerCase();
  const courseId = Number(payload.course_id);
  const moduleId = Number(payload.module_id);
  const requestedUntil = String(payload.requested_until || '').trim();
  const reason = String(payload.reason || '').trim().slice(0, 400);
  if (!studentUsername || !courseId || !moduleId || !/^\d{4}-\d{2}-\d{2}$/.test(requestedUntil) || reason.length < 6) {
    return null;
  }

  const record = {
    id: `extreq-${crypto.randomUUID()}`,
    student_username: studentUsername,
    student_name: String(payload.student_name || studentUsername).trim(),
    course_id: courseId,
    module_id: moduleId,
    topic_id: String(payload.topic_id || '*').trim() || '*',
    requested_until: requestedUntil,
    reason,
    status: 'pending',
    reviewer_name: null,
    reviewer_note: '',
    reviewed_at: null,
    created_at: new Date().toISOString()
  };

  const all = getExtensionRequests();
  all.unshift(record);
  writeLocalJson('extension-requests.json', all);
  return record;
}

function resolveExtensionRequest(reqId, { status, approved_until, reviewer_name, reviewer_note }) {
  const cleanStatus = status === 'approved' ? 'approved' : (status === 'denied' ? 'denied' : null);
  if (!cleanStatus) return null;

  const all = getExtensionRequests();
  const idx = all.findIndex(r => r.id === reqId);
  if (idx < 0) return null;

  const target = all[idx];
  const finalDate = (approved_until && /^\d{4}-\d{2}-\d{2}$/.test(String(approved_until).trim()))
    ? String(approved_until).trim()
    : target.requested_until;

  const updated = {
    ...target,
    status: cleanStatus,
    requested_until: finalDate,
    reviewer_name: String(reviewer_name || 'Instructor').trim(),
    reviewer_note: String(reviewer_note || '').trim().slice(0, 240),
    reviewed_at: new Date().toISOString()
  };
  all[idx] = updated;
  writeLocalJson('extension-requests.json', all);

  if (cleanStatus === 'approved') {
    saveDeadlineExtension({
      student_username: updated.student_username,
      student_name: updated.student_name,
      course_id: updated.course_id,
      module_id: updated.module_id,
      topic_id: updated.topic_id || '*',
      extended_until: finalDate,
      reason: updated.reason,
      granted_by: updated.reviewer_name
    });
  }
  return updated;
}

// ==========================================================================
// Orientation Course (IDA 0001) Completion Tracking
// ==========================================================================
function getOrientationStatus(username) {
  if (!username) {
    return { completed: false, completed_at: null, score: 0, total: 3, covenant_accepted: false };
  }
  const map = readLocalJson('orientation.json', {});
  const rec = map && typeof map === 'object' ? map[String(username).toLowerCase()] : null;
  if (!rec || !rec.completed) {
    return { completed: false, completed_at: null, score: 0, total: 3, covenant_accepted: false };
  }
  return rec;
}

function saveOrientationCompletion(username, { full_name, score, total, covenant_accepted }) {
  if (!username) return null;
  const key = String(username).toLowerCase();
  const map = readLocalJson('orientation.json', {});
  const next = (map && typeof map === 'object' && !Array.isArray(map)) ? { ...map } : {};
  const record = {
    username: key,
    full_name: String(full_name || username).trim(),
    completed: true,
    score: Number(score) || 0,
    total: Number(total) || 3,
    covenant_accepted: Boolean(covenant_accepted),
    completed_at: new Date().toISOString()
  };
  next[key] = record;
  writeLocalJson('orientation.json', next);
  return record;
}

// ==========================================================================
// Anonymous End-of-Course Evaluations (Strict Zero-Identifier Anonymity)
// ==========================================================================
function hashEvalVoter(courseId, username) {
  return crypto
    .createHash('sha256')
    .update(`eval:${Number(courseId)}:${String(username || '').trim().toLowerCase()}`)
    .digest('hex');
}

function readEvaluationsStore() {
  const data = readLocalJson('course-evaluations.json', null);
  if (!data || typeof data !== 'object') {
    return { responses: [], submitted_hashes: [] };
  }
  return {
    responses: Array.isArray(data.responses) ? data.responses : [],
    submitted_hashes: Array.isArray(data.submitted_hashes) ? data.submitted_hashes : []
  };
}

function hasSubmittedEvaluation(courseId, username) {
  if (!username) return false;
  const store = readEvaluationsStore();
  return store.submitted_hashes.includes(hashEvalVoter(courseId, username));
}

function saveCourseEvaluation({
  course_id,
  term,
  username,
  rating_content,
  rating_instructor,
  rating_clarity,
  rating_ministry_impact,
  comments
}) {
  const courseId = Number(course_id);
  if (!courseId || !username) return { error: 'Missing course or user.' };
  const voterHash = hashEvalVoter(courseId, username);
  const store = readEvaluationsStore();
  if (store.submitted_hashes.includes(voterHash)) {
    return { error: 'You have already submitted your anonymous evaluation for this course.' };
  }

  const clampLikert = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 5;
  };
  const rc = clampLikert(rating_content);
  const ri = clampLikert(rating_instructor);
  const rl = clampLikert(rating_clarity);
  const rm = clampLikert(rating_ministry_impact);
  const overall = Number(((rc + ri + rl + rm) / 4).toFixed(2));

  // Store ONLY non-identifying response metrics
  const responseRecord = {
    id: `eval-${crypto.randomUUID()}`,
    course_id: courseId,
    term: String(term || 'AY2027-T1').trim(),
    rating_content: rc,
    rating_instructor: ri,
    rating_clarity: rl,
    rating_ministry_impact: rm,
    overall_rating: overall,
    comments: String(comments || '').trim().slice(0, 800),
    submitted_at: new Date().toISOString()
  };

  store.responses.unshift(responseRecord);
  store.submitted_hashes.push(voterHash);
  writeLocalJson('course-evaluations.json', store);
  return { success: true, response: responseRecord };
}

function getCourseEvaluationSummary(courseId) {
  const store = readEvaluationsStore();
  const rows = store.responses.filter(r => Number(r.course_id) === Number(courseId));
  if (rows.length === 0) {
    return {
      totalResponses: 0,
      avgContent: null,
      avgInstructor: null,
      avgClarity: null,
      avgMinistryImpact: null,
      avgOverall: null,
      comments: []
    };
  }
  const avgField = (key) => Number((rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length).toFixed(2));
  return {
    totalResponses: rows.length,
    avgContent: avgField('rating_content'),
    avgInstructor: avgField('rating_instructor'),
    avgClarity: avgField('rating_clarity'),
    avgMinistryImpact: avgField('rating_ministry_impact'),
    avgOverall: avgField('overall_rating'),
    comments: rows
      .filter(r => r.comments)
      .slice(0, 20)
      .map(r => ({ text: r.comments, submitted_at: r.submitted_at, overall_rating: r.overall_rating }))
  };
}

// ==========================================================================
// Phase 4: Programs, Standing, Pastoral Mentors, Term Registration & Withdrawals
// ==========================================================================
function buildDefaultPrograms() {
  return [
    {
      id: 'CERT-PM',
      name: 'Certificate in Pastoral Ministry',
      level: 'Foundation Certificate',
      required_codes: ['THEO 101', 'CHUR 201'],
      required_credits: 6,
      description: 'Core biblical doctrine and healthy local church foundations for pastors across East Africa.'
    },
    {
      id: 'DIP-BS',
      name: 'Diploma in Biblical Studies',
      level: 'Diploma Track',
      required_codes: ['THEO 101', 'CHUR 201', 'CARE 202', 'PRCH 301'],
      required_credits: 12,
      description: 'Comprehensive pastoral shepherding, biblical exposition, and congregation care training.'
    },
    {
      id: 'ADIP-PL',
      name: 'Advanced Diploma in Pastoral Leadership',
      level: 'Senior Leadership',
      required_codes: ['THEO 101', 'CHUR 201', 'CARE 202', 'PRCH 301'],
      required_credits: 18,
      description: 'Advanced seminary preparation for senior pastors, elders, and theological trainers.'
    }
  ];
}

function getPrograms() {
  const saved = readLocalJson('programs.json', null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return buildDefaultPrograms();
}

function getProgramById(programId) {
  const list = getPrograms();
  const target = String(programId || '').trim().toUpperCase();
  return list.find(p => String(p.id).toUpperCase() === target) || list[0];
}

function computeAcademicStanding(cumulativeGpa, gradedCourseCount = 0) {
  const gpaNum = Number(cumulativeGpa);
  if (!gradedCourseCount || cumulativeGpa === null || cumulativeGpa === undefined || !Number.isFinite(gpaNum)) {
    return {
      code: 'new',
      label: 'Good Standing (New Student)',
      maxCoursesPerTerm: 2,
      badgeClass: 'standing-good',
      mentorFollowUp: false
    };
  }
  if (gpaNum >= 3.5) {
    return {
      code: 'honors',
      label: "Dean's List — Honors Standing",
      maxCoursesPerTerm: 4,
      badgeClass: 'standing-honors',
      mentorFollowUp: false
    };
  }
  if (gpaNum >= 2.0) {
    return {
      code: 'good',
      label: 'Good Academic Standing',
      maxCoursesPerTerm: 3,
      badgeClass: 'standing-good',
      mentorFollowUp: false
    };
  }
  if (gpaNum >= 1.5) {
    return {
      code: 'warning',
      label: 'Academic Warning (Mentor Check-In)',
      maxCoursesPerTerm: 2,
      badgeClass: 'standing-warning',
      mentorFollowUp: true
    };
  }
  return {
    code: 'probation',
    label: 'Academic Probation (Mentor Required)',
    maxCoursesPerTerm: 1,
    badgeClass: 'standing-probation',
    mentorFollowUp: true
  };
}

function getStudentAcademicProfile(username) {
  const defaults = { program_id: 'CERT-PM', mentor_username: null, updated_at: null };
  if (!username) return defaults;
  const all = readLocalJson('student-records.json', {});
  const key = String(username).trim().toLowerCase();
  const row = all && typeof all === 'object' ? all[key] : null;
  if (!row || typeof row !== 'object') return defaults;
  return {
    ...defaults,
    ...row
  };
}

function saveStudentAcademicProfile(username, { program_id, mentor_username }) {
  if (!username) return null;
  const key = String(username).trim().toLowerCase();
  const all = readLocalJson('student-records.json', {});
  const next = (all && typeof all === 'object' && !Array.isArray(all)) ? { ...all } : {};
  const prog = getProgramById(program_id);
  const record = {
    program_id: prog ? prog.id : 'CERT-PM',
    mentor_username: mentor_username ? String(mentor_username).trim().toLowerCase() : null,
    updated_at: new Date().toISOString()
  };
  next[key] = record;
  writeLocalJson('student-records.json', next);
  return record;
}

function checkCoursePrerequisite(course, passedCourseCodes = []) {
  if (!course || !course.prerequisite_code) {
    return { met: true, requiredCode: null };
  }
  const reqCode = String(course.prerequisite_code).trim().toUpperCase();
  if (!reqCode) return { met: true, requiredCode: null };
  const passedSet = new Set(Array.from(passedCourseCodes || []).map(c => String(c || '').trim().toUpperCase()));
  return {
    met: passedSet.has(reqCode),
    requiredCode: reqCode
  };
}

function getRegistrationRequests(filter = {}) {
  let rows = readLocalJson('registration-requests.json', []);
  if (!Array.isArray(rows)) rows = [];
  if (filter.student_username) {
    const target = String(filter.student_username).toLowerCase();
    rows = rows.filter(r => String(r.student_username || '').toLowerCase() === target);
  }
  if (filter.term_code) {
    const tCode = String(filter.term_code).toUpperCase();
    rows = rows.filter(r => String(r.term_code || '').toUpperCase() === tCode);
  }
  if (filter.course_id) {
    rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
  }
  if (filter.status) {
    rows = rows.filter(r => String(r.status) === String(filter.status));
  }
  return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function createRegistrationRequest(payload) {
  const studentUsername = String(payload.student_username || '').trim().toLowerCase();
  const courseId = Number(payload.course_id);
  const termCode = String(payload.term_code || 'AY2027-T1').trim().toUpperCase();
  if (!studentUsername || !courseId) return { error: 'Invalid registration details.' };

  const all = getRegistrationRequests();
  const duplicate = all.find(r =>
    String(r.student_username || '').toLowerCase() === studentUsername &&
    Number(r.course_id) === courseId &&
    String(r.term_code || '').toUpperCase() === termCode &&
    (r.status === 'pending' || r.status === 'approved')
  );
  if (duplicate) {
    return { error: `You already have an ${duplicate.status} registration for this course in ${termCode}.` };
  }

  const record = {
    id: `regreq-${crypto.randomUUID()}`,
    student_username: studentUsername,
    student_id: String(payload.student_id || studentUsername).trim(),
    student_name: String(payload.student_name || studentUsername).trim(),
    course_id: courseId,
    course_code: String(payload.course_code || '').trim(),
    course_title: String(payload.course_title || '').trim(),
    term_code: termCode,
    status: 'pending',
    reviewer_name: null,
    reviewer_note: '',
    reviewed_at: null,
    created_at: new Date().toISOString()
  };

  all.unshift(record);
  writeLocalJson('registration-requests.json', all);
  return { success: true, request: record };
}

function resolveRegistrationRequest(reqId, { status, reviewer_name, reviewer_note }) {
  const cleanStatus = status === 'approved' ? 'approved' : (status === 'denied' ? 'denied' : null);
  if (!cleanStatus) return null;

  const all = getRegistrationRequests();
  const idx = all.findIndex(r => r.id === reqId);
  if (idx < 0) return null;

  const updated = {
    ...all[idx],
    status: cleanStatus,
    reviewer_name: String(reviewer_name || 'Registrar').trim(),
    reviewer_note: String(reviewer_note || '').trim().slice(0, 240),
    reviewed_at: new Date().toISOString()
  };
  all[idx] = updated;
  writeLocalJson('registration-requests.json', all);

  if (cleanStatus === 'approved') {
    const enrolments = readLocalJson('enrolments.json', []);
    const sId = updated.student_id || updated.student_username;
    const existsActive = enrolments.some(e =>
      e &&
      (String(e.student_id || '').toLowerCase() === String(sId).toLowerCase() ||
       String(e.student_username || '').toLowerCase() === updated.student_username) &&
      Number(e.course_id) === Number(updated.course_id) &&
      e.status !== 'removed' && e.status !== 'dropped' && e.status !== 'withdrawn'
    );
    if (!existsActive) {
      enrolments.push({
        id: Date.now(),
        student_id: sId,
        student_username: updated.student_username,
        course_id: String(updated.course_id),
        term_code: updated.term_code,
        status: 'active',
        enrolled_at: new Date().toISOString()
      });
      writeLocalJson('enrolments.json', enrolments);
    }
  }
  return updated;
}

function getCourseWithdrawals(filter = {}) {
  let rows = readLocalJson('withdrawals.json', []);
  if (!Array.isArray(rows)) rows = [];
  if (filter.student_username) {
    const target = String(filter.student_username).toLowerCase();
    rows = rows.filter(r =>
      String(r.student_username || '').toLowerCase() === target ||
      String(r.student_id || '').toLowerCase() === target
    );
  }
  if (filter.course_id) {
    rows = rows.filter(r => Number(r.course_id) === Number(filter.course_id));
  }
  if (filter.term_code) {
    const tCode = String(filter.term_code).toUpperCase();
    rows = rows.filter(r => String(r.term_code || '').toUpperCase() === tCode);
  }
  return rows.sort((a, b) => String(b.withdrawn_at || '').localeCompare(String(a.withdrawn_at || '')));
}

function recordCourseWithdrawal(payload) {
  const studentUsername = String(payload.student_username || '').trim().toLowerCase();
  const courseId = Number(payload.course_id);
  const termCode = String(payload.term_code || 'AY2027-T1').trim().toUpperCase();
  const reason = String(payload.reason || '').trim().slice(0, 400);
  if (!studentUsername || !courseId || reason.length < 6) {
    return { error: 'Please provide a brief pastoral reason (at least 6 characters).' };
  }

  const all = getCourseWithdrawals();
  const duplicate = all.find(w =>
    String(w.student_username || '').toLowerCase() === studentUsername &&
    Number(w.course_id) === courseId &&
    String(w.term_code || '').toUpperCase() === termCode
  );
  if (duplicate) {
    return { error: 'You have already withdrawn from this course in the current term.' };
  }

  const record = {
    id: `wd-${crypto.randomUUID()}`,
    student_username: studentUsername,
    student_id: String(payload.student_id || studentUsername).trim(),
    student_name: String(payload.student_name || studentUsername).trim(),
    course_id: courseId,
    course_code: String(payload.course_code || '').trim(),
    course_title: String(payload.course_title || '').trim(),
    term_code: termCode,
    grade: 'W',
    status: 'Withdrawn',
    week_number: Number(payload.week_number) || 1,
    reason,
    withdrawn_at: new Date().toISOString()
  };

  all.unshift(record);
  writeLocalJson('withdrawals.json', all);

  // Mark any matching active enrolment row as withdrawn
  const enrolments = readLocalJson('enrolments.json', []);
  let changed = false;
  const sIdLower = String(record.student_id).toLowerCase();
  enrolments.forEach(e => {
    if (!e) return;
    const eId = String(e.student_id || e.student_username || '').toLowerCase();
    if ((eId === studentUsername || eId === sIdLower) && Number(e.course_id) === courseId && e.status !== 'removed') {
      e.status = 'withdrawn';
      e.withdrawn_at = record.withdrawn_at;
      changed = true;
    }
  });
  if (changed) writeLocalJson('enrolments.json', enrolments);

  return { success: true, withdrawal: record };
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
  flagSubmissionIntegrity,
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
  addDaysIso,
  getAcademicConfig,
  getActiveTerm,
  saveTerm,
  setActiveTerm,
  deleteTerm,
  updateAcademicSettings,
  computeTermWeekInfo,
  getExtensionRequests,
  createExtensionRequest,
  resolveExtensionRequest,
  getOrientationStatus,
  saveOrientationCompletion,
  hasSubmittedEvaluation,
  saveCourseEvaluation,
  getCourseEvaluationSummary,
  getPrograms,
  getProgramById,
  computeAcademicStanding,
  getStudentAcademicProfile,
  saveStudentAcademicProfile,
  checkCoursePrerequisite,
  getRegistrationRequests,
  createRegistrationRequest,
  resolveRegistrationRequest,
  getCourseWithdrawals,
  recordCourseWithdrawal,
  uploadProfilePictureToStorage
};
