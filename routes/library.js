const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { requireAuth, requireTeacher } = require('../middleware/auth');

const LIBRARY_FILE = path.join(__dirname, '../data/library.json');
const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const MATERIAL_TYPES = ['video', 'document', 'audio', 'link'];

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function getMaterials() {
  return readJson(LIBRARY_FILE, []);
}

function saveMaterials(items) {
  try {
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(items, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving library.json:', err.message);
    return false;
  }
}

function getCourses() {
  return (readJson(COURSES_FILE, { courses: [] }).courses || []).map(c => ({
    id: c.id,
    code: c.code,
    title: c.title
  }));
}

// Only allow http(s) links so a teacher cannot add javascript: URLs
function cleanUrl(value) {
  try {
    const url = new URL((value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch (err) {
    return null;
  }
}

// GET /library - everyone signed in can browse materials
router.get('/library', requireAuth, (req, res) => {
  const type = MATERIAL_TYPES.includes(req.query.type) ? req.query.type : 'all';
  const search = (req.query.search || '').trim().toLowerCase();
  const courses = getCourses();

  const all = getMaterials();
  const items = all
    .filter(item => type === 'all' || item.type === type)
    .filter(item => !search || `${item.title} ${item.description}`.toLowerCase().includes(search))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .map(item => ({
      ...item,
      course: courses.find(c => Number(c.id) === Number(item.course_id)) || null
    }));

  res.render('library', {
    title: 'Library | Pastors LMS',
    items,
    filters: { type, search },
    counts: MATERIAL_TYPES.reduce((acc, t) => ({ ...acc, [t]: all.filter(i => i.type === t).length }), { all: all.length }),
    canManage: ['teacher', 'admin', 'super_admin'].includes(req.session.user.role)
  });
});

// GET /teacher/library - teachers and admins manage materials
router.get('/teacher/library', requireTeacher, (req, res) => {
  res.render('teacher-library', {
    title: 'Manage Library | Pastors LMS',
    items: getMaterials().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    courses: getCourses(),
    types: MATERIAL_TYPES,
    formData: {},
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /teacher/library - add a material
router.post('/teacher/library', requireTeacher, (req, res) => {
  const title = (req.body.title || '').trim();
  const type = MATERIAL_TYPES.includes(req.body.type) ? req.body.type : 'link';
  const url = cleanUrl(req.body.url);
  const description = (req.body.description || '').trim();
  const courseId = req.body.course_id ? Number(req.body.course_id) : null;

  const fail = message => res.status(400).render('teacher-library', {
    title: 'Manage Library | Pastors LMS',
    items: getMaterials(),
    courses: getCourses(),
    types: MATERIAL_TYPES,
    formData: req.body,
    success: null,
    error: message
  });

  if (!title) return fail('Please give the material a title.');
  if (!url) return fail('Please enter a full web address starting with http:// or https://.');

  const items = getMaterials();
  items.push({
    id: `lib-${crypto.randomUUID()}`,
    title,
    type,
    url,
    description,
    course_id: Number.isFinite(courseId) ? courseId : null,
    added_by: req.session.user.username,
    added_by_name: req.session.user.full_name,
    created_at: new Date().toISOString()
  });

  if (!saveMaterials(items)) {
    return fail('Could not save the material. Please try again.');
  }
  res.redirect('/teacher/library?success=' + encodeURIComponent('Material added to the library.'));
});

// POST /teacher/library/:id/delete - remove a material
router.post('/teacher/library/:id/delete', requireTeacher, (req, res) => {
  const items = getMaterials();
  const item = items.find(i => i.id === req.params.id);

  if (!item) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('Material not found.'));
  }

  // Teachers can only remove their own materials; admins can remove any
  const isAdmin = ['admin', 'super_admin'].includes(req.session.user.role);
  if (!isAdmin && item.added_by !== req.session.user.username) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('You can only remove materials you added.'));
  }

  if (!saveMaterials(items.filter(i => i.id !== req.params.id))) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('Could not remove the material. Please try again.'));
  }
  res.redirect('/teacher/library?success=' + encodeURIComponent('Material removed.'));
});

module.exports = router;

