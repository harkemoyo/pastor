const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { requireAuth, requireTeacher } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');

const LIBRARY_FILE = path.join(__dirname, '../data/library.json');
const LIBRARY_TMP_FILE = path.join(os.tmpdir(), 'pastors-lms-library.json');
const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const UPLOADS_DIR = path.join(__dirname, '../public/uploads/library');
const MATERIAL_TYPES = ['video', 'document', 'audio', 'link'];

const ALLOWED_UPLOAD_EXTS = {
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Always prefer whichever local file (data/library.json or /tmp fallback on read-only Vercel) is newest!
function getLocalMaterials() {
  const candidates = [LIBRARY_FILE, LIBRARY_TMP_FILE]
    .filter(p => fs.existsSync(p))
    .map(p => {
      try {
        return { p, mtime: fs.statSync(p).mtimeMs };
      } catch {
        return { p, mtime: 0 };
      }
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const c of candidates) {
    const parsed = readJson(c.p, null);
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

function saveLocalMaterials(items) {
  const payload = JSON.stringify(items, null, 2);
  let wrotePrimary = false;
  try {
    fs.writeFileSync(LIBRARY_FILE, payload, 'utf8');
    wrotePrimary = true;
  } catch {
    // Expected on read-only serverless deployments (e.g. Vercel)
  }

  let wroteTmp = false;
  try {
    fs.writeFileSync(LIBRARY_TMP_FILE, payload, 'utf8');
    wroteTmp = true;
  } catch (err) {
    if (!wrotePrimary) console.error('Error saving library fallback:', err.message);
  }
  return wrotePrimary || wroteTmp;
}

function normalizeMaterialType(type) {
  const t = String(type || 'link').toLowerCase().trim();
  if (t === 'pdf' || t === 'book') return 'document';
  return MATERIAL_TYPES.includes(t) ? t : 'link';
}

async function getMaterials() {
  const localItems = getLocalMaterials();
  if (!supabaseAdmin) return localItems;
  try {
    const { data, error } = await supabaseAdmin
      .from('library_materials')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      const byId = new Map();
      localItems.forEach(item => byId.set(item.id, item));
      data.forEach(item => {
        const prev = byId.get(item.id) || {};
        byId.set(item.id, {
          ...prev,
          ...item,
          content_html: item.content_html || prev.content_html,
          duration: item.duration || prev.duration || '',
          type: normalizeMaterialType(item.type)
        });
      });
      return Array.from(byId.values());
    }
  } catch {
    // Graceful local fallback when offline or table not yet created
  }
  return localItems;
}

async function persistMaterialUpsert(material) {
  const items = getLocalMaterials();
  const idx = items.findIndex(i => i.id === material.id);
  if (idx >= 0) items[idx] = material;
  else items.unshift(material);
  const localOk = saveLocalMaterials(items);

  let cloudOk = false;
  if (supabaseAdmin) {
    const baseRow = {
      id: material.id,
      title: material.title,
      type: material.type,
      url: material.url,
      description: material.description || null,
      course_id: material.course_id || null,
      added_by: material.added_by || null,
      added_by_name: material.added_by_name || null,
      created_at: material.created_at || new Date().toISOString()
    };
    const fullRow = {
      ...baseRow,
      duration: material.duration || null,
      content_html: material.content_html || null
    };

    try {
      const { error } = await supabaseAdmin.from('library_materials').upsert(fullRow, { onConflict: 'id' });
      if (!error) {
        cloudOk = true;
      } else {
        // Fallback if table exists without newer duration/content_html columns or older 'document' check constraint
        const fallbackType = /check constraint/i.test(error.message || '') && baseRow.type === 'document'
          ? 'pdf'
          : baseRow.type;
        const { error: retryErr } = await supabaseAdmin
          .from('library_materials')
          .upsert({ ...baseRow, type: fallbackType }, { onConflict: 'id' });
        if (!retryErr) cloudOk = true;
        else console.warn('Supabase library upsert note:', retryErr.message);
      }
    } catch (err) {
      console.warn('Supabase library upsert skipped:', err.message);
    }
  }

  return cloudOk || localOk;
}

async function persistMaterialDelete(id) {
  const items = getLocalMaterials();
  const localOk = saveLocalMaterials(items.filter(i => i.id !== id));

  let cloudOk = false;
  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('library_materials').delete().eq('id', id);
      if (!error) cloudOk = true;
    } catch {
      // Ignore if table absent
    }
  }
  return cloudOk || localOk;
}

function getCourses() {
  return (readJson(COURSES_FILE, { courses: [] }).courses || []).map(c => ({
    id: c.id,
    code: c.code,
    title: c.title
  }));
}

// Allow http(s) links (auto-prepending https:// if user omits protocol), or safe internal paths
function cleanUrl(value) {
  let trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/library/read/') || trimmed.startsWith('/uploads/library/')) {
    return trimmed;
  }
  // Reject dangerous protocols explicitly
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  // Auto-prepend https:// if admin pasted "youtube.com/..." or "www.esv.org" without protocol
  if (!/^https?:\/\//i.test(trimmed) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainNotesToHtml(notes) {
  const trimmed = String(notes || '').replace(/\r\n/g, '\n').trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  const out = [];
  let paraBuf = [];
  let listBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${paraBuf.map(escapeHtml).join('<br>')}</p>`);
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      out.push(`<ul>${listBuf.map(li => `<li>${escapeHtml(li)}</li>`).join('')}</ul>`);
      listBuf = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (line.startsWith('### ')) {
      flushPara();
      flushList();
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flushPara();
      flushList();
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara();
      listBuf.push(line.slice(2));
    } else {
      flushList();
      paraBuf.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

function htmlToEditableNotes(html) {
  if (!html) return '';
  return String(html)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function enrichMaterialPlayback(item, courses) {
  const normalizedType = normalizeMaterialType(item.type);
  const url = String(item.url || '');
  let embedUrl = null;
  let playbackMode = 'external';

  if (item.content_html || url.startsWith('/library/read/')) {
    playbackMode = 'reader';
  } else {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (ytMatch) {
      embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`;
      playbackMode = 'video-embed';
    } else if (vimeoMatch) {
      embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
      playbackMode = 'video-embed';
    } else if (/\.(mp3|m4a|wav|ogg)(\?.*)?$/i.test(url)) {
      embedUrl = url;
      playbackMode = 'audio-player';
    } else if (/\.pdf(\?.*)?$/i.test(url)) {
      embedUrl = url;
      playbackMode = 'pdf-embed';
    }
  }

  return {
    ...item,
    type: normalizedType,
    embedUrl,
    playbackMode,
    course: courses.find(c => Number(c.id) === Number(item.course_id)) || null
  };
}

async function saveUploadedLibraryFile(fileName, dataUrl) {
  if (!fileName || !dataUrl) return null;
  const ext = path.extname(String(fileName)).toLowerCase();
  const mime = ALLOWED_UPLOAD_EXTS[ext];
  if (!mime) return { error: 'Supported file types: PDF, MP3, M4A, WAV, OGG, DOC, DOCX, TXT.' };

  const match = String(dataUrl).match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return { error: 'Invalid uploaded file data.' };

  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > 4 * 1024 * 1024) {
    return { error: 'File must be smaller than 4 MB. For larger videos or audio, paste a YouTube or Google Drive link.' };
  }

  const safeSlug = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

  // Try Supabase Storage first (auto-create bucket if missing!)
  if (supabaseAdmin) {
    try {
      let { error } = await supabaseAdmin.storage
        .from('library-files')
        .upload(safeSlug, buffer, { contentType: mime, upsert: true });

      if (error && /not found|bucket/i.test(error.message || '')) {
        await supabaseAdmin.storage.createBucket('library-files', { public: true }).catch(() => {});
        const retry = await supabaseAdmin.storage
          .from('library-files')
          .upload(safeSlug, buffer, { contentType: mime, upsert: true });
        error = retry.error;
      }

      if (!error) {
        const { data: pub } = supabaseAdmin.storage.from('library-files').getPublicUrl(safeSlug);
        if (pub && pub.publicUrl) {
          return { url: pub.publicUrl, ext };
        }
      }
    } catch {
      // Fall through to local uploads dir
    }
  }

  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, safeSlug), buffer);
    return { url: `/uploads/library/${safeSlug}`, ext };
  } catch {
    return { error: 'Direct file upload requires Supabase Storage on cloud hosting. Please paste a Google Drive, Dropbox, or YouTube link instead.' };
  }
}

// Friendly alias: /admin/library -> /teacher/library
router.get('/admin/library', requireTeacher, (req, res) => {
  res.redirect('/teacher/library');
});

// GET /library - everyone signed in can browse materials
router.get('/library', requireAuth, async (req, res) => {
  const type = MATERIAL_TYPES.includes(req.query.type) ? req.query.type : 'all';
  const courseFilter = req.query.course && req.query.course !== 'all' ? String(req.query.course) : 'all';
  const search = (req.query.search || '').trim();
  const searchLower = search.toLowerCase();
  const courses = getCourses();

  const all = (await getMaterials()).map(item => enrichMaterialPlayback(item, courses));
  const courseScoped = courseFilter === 'all'
    ? all
    : all.filter(item => String(item.course_id || '') === courseFilter);

  const items = courseScoped
    .filter(item => type === 'all' || item.type === type)
    .filter(item => {
      if (!searchLower) return true;
      const hay = `${item.title} ${item.description || ''} ${item.added_by_name || ''} ${item.course ? item.course.code + ' ' + item.course.title : ''}`.toLowerCase();
      return hay.includes(searchLower);
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const counts = MATERIAL_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: courseScoped.filter(i => i.type === t).length }),
    { all: courseScoped.length }
  );

  res.render('library', {
    title: 'Library | Pastors LMS',
    items,
    courses,
    filters: { type, course: courseFilter, search },
    counts,
    totalLibraryCount: all.length,
    canManage: ['teacher', 'admin', 'super_admin'].includes(req.session.user.role)
  });
});

// GET /library/read/:id - printable in-app pastoral study guide reader
router.get('/library/read/:id', requireAuth, async (req, res) => {
  const courses = getCourses();
  const all = await getMaterials();
  const found = all.find(i => i.id === req.params.id);
  if (!found) {
    return res.status(404).render('404', {
      title: 'Study Guide Not Found | Pastors LMS',
      requestedUrl: req.originalUrl
    });
  }
  const item = enrichMaterialPlayback(found, courses);
  res.render('library-reader', {
    title: `${item.title} | Pastors Library`,
    item
  });
});

// GET /teacher/library - teachers and admins manage materials
router.get('/teacher/library', requireTeacher, async (req, res) => {
  const courses = getCourses();
  const all = (await getMaterials())
    .map(item => enrichMaterialPlayback(item, courses))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const counts = MATERIAL_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: all.filter(i => i.type === t).length }),
    { all: all.length }
  );

  const editId = req.query.edit ? String(req.query.edit) : null;
  const editingItem = editId ? all.find(i => i.id === editId) : null;
  const formData = editingItem
    ? {
      ...editingItem,
      content_notes: editingItem.content_html ? htmlToEditableNotes(editingItem.content_html) : ''
    }
    : {};

  const initialMode = editingItem
    ? (editingItem.playbackMode === 'reader' ? 'notes' : 'link')
    : 'link';

  res.render('teacher-library', {
    title: 'Manage Library | Pastors LMS',
    items: all,
    counts,
    courses,
    types: MATERIAL_TYPES,
    editingItem: editingItem || null,
    formData,
    initialMode,
    cloudConnected: Boolean(supabaseAdmin),
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /teacher/library - add a material (URL, uploaded file, or in-app written study guide)
router.post('/teacher/library', requireTeacher, async (req, res) => {
  const title = (req.body.title || '').trim();
  let type = normalizeMaterialType(req.body.type);
  const mode = String(req.body.input_mode || 'link');
  const rawUrl = (req.body.url || '').trim();
  const description = (req.body.description || '').trim();
  const duration = (req.body.duration || '').trim();
  const contentNotes = (req.body.content_notes || '').trim();
  const uploadedName = (req.body.uploaded_file_name || '').trim();
  const uploadedData = (req.body.uploaded_file_data || '').trim();
  const courseId = req.body.course_id ? Number(req.body.course_id) : null;

  const fail = async (message) => {
    const courses = getCourses();
    const all = (await getMaterials()).map(i => enrichMaterialPlayback(i, courses));
    const counts = MATERIAL_TYPES.reduce(
      (acc, t) => ({ ...acc, [t]: all.filter(i => i.type === t).length }),
      { all: all.length }
    );
    return res.status(400).render('teacher-library', {
      title: 'Manage Library | Pastors LMS',
      items: all,
      counts,
      courses,
      types: MATERIAL_TYPES,
      editingItem: null,
      formData: req.body,
      initialMode: mode,
      cloudConnected: Boolean(supabaseAdmin),
      success: null,
      error: message
    });
  };

  if (!title) return fail('Please give the material a clear title.');

  const newId = `lib-${crypto.randomUUID().slice(0, 8)}`;
  let finalUrl = null;
  let contentHtml = null;

  if ((mode === 'upload' || (uploadedData && uploadedName)) && uploadedData && uploadedName) {
    const uploaded = await saveUploadedLibraryFile(uploadedName, uploadedData);
    if (uploaded && uploaded.error) return fail(uploaded.error);
    if (uploaded && uploaded.url) {
      finalUrl = uploaded.url;
      if (['.mp3', '.m4a', '.wav', '.ogg'].includes(uploaded.ext)) type = 'audio';
      else type = 'document';
    }
  } else if (mode === 'notes' || (contentNotes && !rawUrl)) {
    if (!contentNotes) {
      return fail('Please type or paste your study guide notes in the text box.');
    }
    contentHtml = plainNotesToHtml(contentNotes);
    finalUrl = `/library/read/${newId}`;
    type = 'document';
  } else {
    finalUrl = cleanUrl(rawUrl);
    if (finalUrl) {
      if (/(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(finalUrl) && type === 'link') type = 'video';
      else if (/\.(mp3|m4a|wav|ogg)(\?.*)?$/i.test(finalUrl)) type = 'audio';
      else if (/\.pdf(\?.*)?$/i.test(finalUrl) && type === 'link') type = 'document';
    }
    if (contentNotes) contentHtml = plainNotesToHtml(contentNotes);
  }

  if (!finalUrl) {
    return fail('Please paste a valid web link (for example: youtube.com/... or https://...), upload a file, or write study notes.');
  }

  const material = {
    id: newId,
    title,
    type,
    url: finalUrl,
    description,
    duration: duration || (contentHtml ? 'Study Guide • Printable' : ''),
    content_html: contentHtml || undefined,
    course_id: Number.isFinite(courseId) ? courseId : null,
    added_by: req.session.user.username,
    added_by_name: req.session.user.full_name,
    created_at: new Date().toISOString()
  };

  const saved = await persistMaterialUpsert(material);
  if (!saved) {
    return fail('Could not save the material. Please try again.');
  }
  res.redirect('/teacher/library?success=' + encodeURIComponent(`"${title}" is now live in the Pastors Library.`));
});

// POST /teacher/library/:id/edit - update an existing material
router.post('/teacher/library/:id/edit', requireTeacher, async (req, res) => {
  const all = await getMaterials();
  const existing = all.find(i => i.id === req.params.id);
  if (!existing) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('Material not found.'));
  }

  const isAdmin = ['admin', 'super_admin'].includes(req.session.user.role);
  if (!isAdmin && existing.added_by !== req.session.user.username) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('You can only edit materials you added.'));
  }

  const title = (req.body.title || '').trim();
  const type = normalizeMaterialType(req.body.type || existing.type);
  const rawUrl = (req.body.url || '').trim();
  const description = (req.body.description || '').trim();
  const duration = (req.body.duration || '').trim();
  const contentNotes = (req.body.content_notes || '').trim();
  const courseId = req.body.course_id ? Number(req.body.course_id) : null;

  if (!title) {
    return res.redirect(`/teacher/library?edit=${encodeURIComponent(existing.id)}&error=${encodeURIComponent('Title cannot be empty.')}`);
  }

  let finalUrl = existing.url;
  let contentHtml = existing.content_html;
  if (rawUrl) {
    const cleaned = cleanUrl(rawUrl);
    if (!cleaned) {
      return res.redirect(`/teacher/library?edit=${encodeURIComponent(existing.id)}&error=${encodeURIComponent('Please enter a valid web address (e.g., https://...).')}`);
    }
    finalUrl = cleaned;
  }
  if (contentNotes) {
    contentHtml = plainNotesToHtml(contentNotes);
    if (!rawUrl) finalUrl = `/library/read/${existing.id}`;
  }

  const updated = {
    ...existing,
    title,
    type,
    url: finalUrl,
    description,
    duration,
    content_html: contentHtml,
    course_id: Number.isFinite(courseId) ? courseId : null
  };

  await persistMaterialUpsert(updated);
  res.redirect('/teacher/library?success=' + encodeURIComponent(`Updated "${title}" successfully.`));
});

// POST /teacher/library/:id/delete - remove a material
router.post('/teacher/library/:id/delete', requireTeacher, async (req, res) => {
  const items = await getMaterials();
  const item = items.find(i => i.id === req.params.id);

  if (!item) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('Material not found.'));
  }

  const isAdmin = ['admin', 'super_admin'].includes(req.session.user.role);
  if (!isAdmin && item.added_by !== req.session.user.username) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('You can only remove materials you added.'));
  }

  const deleted = await persistMaterialDelete(req.params.id);
  if (!deleted) {
    return res.redirect('/teacher/library?error=' + encodeURIComponent('Could not remove the material. Please try again.'));
  }
  res.redirect('/teacher/library?success=' + encodeURIComponent('Material removed from the library.'));
});

module.exports = router;
