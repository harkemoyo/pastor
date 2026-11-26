const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { requireAdmin, requireSuperAdmin, requireTeacher } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { getTeachers, findTeacherByUsername, resolveModuleInstructor } = require('../utils/instructors');
const { getCustomLessonsSync, saveCustomLesson, deleteCustomLesson } = require('../utils/lms-store');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const ENROLMENTS_FILE = path.join(__dirname, '../data/enrolments.json');
const ACTIVITY_FILE = path.join(__dirname, '../data/activity-log.json');
const STUDENT_STATUS_OPTIONS = ['active', 'pending', 'inactive', 'suspended', 'graduated', 'rejected'];
const COURSE_STATUS_OPTIONS = ['active', 'inactive', 'archived'];

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || raw.trim() === '') return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Write error:', err);
    return false;
  }
}

function getUsers() {
  return readJson(USERS_FILE, []);
}

function normalizeStudentIdFormat(id) {
  if (!id) return '';
  return String(id).trim().replace(/^STU-/i, 'IDA-');
}

// Read students from Supabase (source of truth for signups) and mirror into data/users.json
// so both stores stay matched; fall back to users.json when Supabase is not configured.
async function getStudents() {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        try {
          const localUsers = getUsers();
          let changed = false;
          for (const s of data) {
            // Normalize STU- to IDA- automatically
            const cleanSid = normalizeStudentIdFormat(s.student_id);
            const supabaseUpdates = {};
            if (s.student_id && cleanSid !== s.student_id) {
              s.student_id = cleanSid;
              supabaseUpdates.student_id = cleanSid;
            }

            // Match by email first so a username reuse never merges two different people
            let idx = s.email
              ? localUsers.findIndex(u => u.email && u.email.toLowerCase() === s.email.toLowerCase())
              : -1;
            if (idx < 0 && s.username) {
              idx = localUsers.findIndex(u =>
                u.username && u.username.toLowerCase() === s.username.toLowerCase() &&
                (!u.email || !s.email || u.email.toLowerCase() === s.email.toLowerCase())
              );
            }

            const localExisting = idx >= 0 ? localUsers[idx] : null;
            const localIsNewer = localExisting && localExisting.updated_at && s.updated_at
              ? new Date(localExisting.updated_at) > new Date(s.updated_at)
              : Boolean(localExisting && localExisting.updated_at && !s.updated_at);

            const isIdaOfficeAdmin =
              (s.email && s.email.toLowerCase() === 'info@intendiscafrica.org') ||
              /\bida\s+office\s+admin\b/i.test(s.full_name || '');

            let resolvedRole = 'student';
            if (isIdaOfficeAdmin) {
              resolvedRole = 'super_admin';
            } else if (localIsNewer && localExisting.role) {
              resolvedRole = localExisting.role;
            } else {
              const rolePriority = ['super_admin', 'admin', 'teacher', 'student'];
              const candidateRoles = [s.role, localExisting?.role].filter(Boolean);
              resolvedRole = rolePriority.find(r => candidateRoles.includes(r)) || 'student';
            }

            if (s.role !== resolvedRole && ['student', 'admin', 'super_admin'].includes(resolvedRole)) {
              supabaseUpdates.role = resolvedRole;
            }

            if (s.id && Object.keys(supabaseUpdates).length > 0) {
              supabaseAdmin.from('students').update(supabaseUpdates).eq('id', s.id).then(() => {}).catch(() => {});
            }

            const merged = localIsNewer
              ? {
                  ...s,
                  ...localExisting,
                  id: s.id,
                  auth_user_id: s.auth_user_id || localExisting.auth_user_id,
                  student_id: normalizeStudentIdFormat(localExisting.student_id || s.student_id),
                  role: resolvedRole
                }
              : {
                  ...(localExisting || {}),
                  ...s,
                  student_id: cleanSid || normalizeStudentIdFormat(localExisting?.student_id),
                  role: resolvedRole,
                  password: (localExisting && localExisting.password) ? localExisting.password : '$2b$10$IFeR81mpSAzXDcSVYRoso.WqE/pxE.dsHCeLDjpWiEmcA5Kdz/tam'
                };

            if (idx >= 0) {
              localUsers[idx] = merged;
            } else {
              localUsers.push(merged);
              changed = true;
            }
          }
          if (changed || data.length > 0) {
            saveUsers(localUsers);
          }
          return localUsers;
        } catch (syncErr) {
          console.warn('Auto-sync Supabase students to users.json warning:', syncErr.message);
        }
        return data;
      }
      console.warn('Supabase students read failed, using local users.json:', error && error.message);
    } catch (err) {
      console.warn('Supabase students read error, using local users.json:', err.message);
    }
  }
  return getUsers();
}

function isStudentRecord(user) {
  return user.role === 'student' || (!user.role && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'teacher');
}

function matchesStudentId(user, id) {
  if (!id || !user) return false;
  const target = String(id).trim().toLowerCase();
  const normTarget = normalizeStudentIdFormat(id).toLowerCase();
  const userSid = normalizeStudentIdFormat(user.student_id).toLowerCase();
  return (
    (user.username && user.username.toLowerCase() === target) ||
    (user.email && user.email.toLowerCase() === target) ||
    (userSid && (userSid === target || userSid === normTarget))
  );
}

// Find one student by username, email, or student_id (prioritizing unique username/email first).
async function findStudent(id) {
  if (!id) return null;
  const target = String(id).trim().toLowerCase();
  const normTarget = normalizeStudentIdFormat(id).toLowerCase();
  const students = await getStudents();
  return (
    students.find(user => (user.username && user.username.toLowerCase() === target) || (user.email && user.email.toLowerCase() === target)) ||
    students.find(user => normalizeStudentIdFormat(user.student_id).toLowerCase() === normTarget) ||
    null
  );
}

// Persist field changes for a student in BOTH Supabase and local data/users.json so they always match.
async function updateStudent(student, fields) {
  const stampedFields = {
    ...fields,
    ...(fields.student_id ? { student_id: normalizeStudentIdFormat(fields.student_id) } : {}),
    updated_at: new Date().toISOString()
  };

  let supabaseOk = false;
  if (supabaseAdmin) {
    try {
      const dbPayload = { ...stampedFields };
      let query = supabaseAdmin.from('students').update(dbPayload);
      if (student.id && String(student.id).includes('-')) {
        query = query.eq('id', student.id);
      } else if (student.email) {
        query = query.ilike('email', student.email);
      } else {
        query = query.eq('username', student.username);
      }

      let { error } = await query;
      // If Postgres check constraint rejects 'teacher' in students.role, retry without role column
      if (error && dbPayload.role === 'teacher') {
        const { role: _omitted, ...restPayload } = dbPayload;
        let retryQuery = supabaseAdmin.from('students').update(restPayload);
        if (student.id && String(student.id).includes('-')) {
          retryQuery = retryQuery.eq('id', student.id);
        } else if (student.email) {
          retryQuery = retryQuery.ilike('email', student.email);
        } else {
          retryQuery = retryQuery.eq('username', student.username);
        }
        const retryRes = await retryQuery;
        error = retryRes.error;
      }

      if (error) {
        console.error('Supabase student update failed:', error.message);
      } else {
        Object.assign(student, stampedFields);
        supabaseOk = true;
      }
    } catch (e) {
      console.error('Supabase student update exception:', e.message);
    }
  }

  const users = getUsers();
  let local = users.find(user =>
    (student.email && user.email && user.email.toLowerCase() === student.email.toLowerCase()) ||
    (student.username && user.username && user.username.toLowerCase() === student.username.toLowerCase())
  );
  if (!local) {
    local = users.find(user => matchesStudentId(user, student.student_id || student.username));
  }
  if (local) {
    Object.assign(local, stampedFields);
    Object.assign(student, stampedFields);
    const localOk = saveUsers(users);
    return supabaseOk || localOk;
  } else {
    Object.assign(student, stampedFields);
    users.push({ ...student });
    const localOk = saveUsers(users);
    return supabaseOk || localOk;
  }
}

function saveUsers(users) {
  return writeJson(USERS_FILE, users);
}

function getCoursesData() {
  return readJson(COURSES_FILE, { courses: [], tasks: [] });
}

function saveCoursesData(data) {
  return writeJson(COURSES_FILE, data);
}

function getEnrolments() {
  return readJson(ENROLMENTS_FILE, []);
}

function saveEnrolments(enrolments) {
  return writeJson(ENROLMENTS_FILE, enrolments);
}

function getActivityLog() {
  return readJson(ACTIVITY_FILE, []);
}

function saveActivityLog(logs) {
  return writeJson(ACTIVITY_FILE, logs);
}

function buildFullName(user) {
  if (user.full_name && user.full_name.trim()) return user.full_name.trim();
  const parts = [user.first_name, user.middle_name, user.last_name].filter(Boolean);
  return parts.join(' ');
}

function buildInitials(name) {
  if (!name) return 'P';
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'P';
}

function normalizeStudentStatus(status) {
  return STUDENT_STATUS_OPTIONS.includes(status) ? status : 'active';
}

function normalizeCourseStatus(status) {
  return COURSE_STATUS_OPTIONS.includes(status) ? status : 'active';
}

function generateStudentId(users) {
  let counter = 1002;
  while (true) {
    const candidate = `IDA-${counter}`;
    const exists = users.some(user => normalizeStudentIdFormat(user.student_id).toUpperCase() === candidate.toUpperCase());
    if (!exists) return candidate;
    counter += 1;
  }
}

function appendActivity({ adminUsername, adminName, action, targetType, targetId }) {
  const logs = getActivityLog();
  logs.unshift({
    id: Date.now() + Math.random(),
    admin_username: adminUsername || 'system',
    admin_name: adminName || 'System Admin',
    action,
    target_type: targetType || 'unknown',
    target_id: targetId || null,
    created_at: new Date().toISOString()
  });
  saveActivityLog(logs);
}

function getStudentCourseIds(studentId) {
  return getEnrolments()
    .filter(enrolment => enrolment.student_id === studentId && enrolment.status !== 'removed')
    .map(enrolment => Number(enrolment.course_id));
}

function studentMatchesSearch(student, term) {
  if (!term) return true;
  const text = term.toLowerCase();
  return [
    student.full_name || '',
    student.student_id || '',
    student.email || '',
    student.phone || '',
    student.username || '',
    student.church_name || '',
    student.county || '',
    student.town || ''
  ]
    .join(' ')
    .toLowerCase()
    .includes(text);
}

function courseMatchesSearch(course, term) {
  if (!term) return true;
  const text = term.toLowerCase();
  return [course.title || '', course.code || '', course.instructor || '', course.description || '']
    .join(' ')
    .toLowerCase()
    .includes(text);
}

function paginate(items, page, pageSize) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const currentPage = Math.min(pageNumber, totalPages);
  const startIndex = (currentPage - 1) * size;
  return {
    items: items.slice(startIndex, startIndex + size),
    page: currentPage,
    pageSize: size,
    totalPages,
    totalItems: items.length
  };
}

function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith('$2');
}

function ensurePasswordHash(user, passwordValue) {
  if (!passwordValue) return user.password || '';
  if (isPasswordHash(passwordValue)) return passwordValue;
  return bcrypt.hashSync(passwordValue, 10);
}

router.get('/', requireAdmin, (req, res) => {
  res.redirect('/admin/dashboard');
});

router.get('/dashboard', requireAdmin, async (req, res) => {
  const users = (await getStudents()).filter(isStudentRecord);
  const courses = getCoursesData().courses || [];
  const enrolments = getEnrolments();
  const log = getActivityLog();

  const totalStudents = users.length;
  const activeStudents = users.filter(u => normalizeStudentStatus(u.status) === 'active').length;
  const inactiveStudents = users.filter(u => normalizeStudentStatus(u.status) === 'inactive').length;
  const graduatedStudents = users.filter(u => normalizeStudentStatus(u.status) === 'graduated').length;
  const totalCourses = courses.length;
  const activeCourses = courses.filter(course => normalizeCourseStatus(course.status) === 'active').length;
  const totalEnrolments = enrolments.length;

  const recentRegistrations = [...users]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  res.render('admin/dashboard', {
    title: 'Administrative Dashboard | Pastors LMS',
    user: req.session.user,
    stats: {
      totalStudents,
      activeStudents,
      inactiveStudents,
      graduatedStudents,
      totalCourses,
      activeCourses,
      totalEnrolments
    },
    recentRegistrations,
    recentActivity: log.slice(0, 8),
    students: users,
    courses,
    enrolments
  });
});

router.get('/students', requireAdmin, async (req, res) => {
  const users = await getStudents();
  const courses = getCoursesData().courses || [];
  const courseIdFilter = req.query.course_id || '';
  const statusFilter = req.query.status || 'all';
  const search = (req.query.search || '').trim();
  const page = Number(req.query.page || 1);

  const filteredStudents = users.filter(student => {
    const studentStatus = normalizeStudentStatus(student.status);
    const matchesSearch = studentMatchesSearch(student, search);
    const matchesStatus = statusFilter === 'all' || studentStatus === statusFilter;
    const matchesCourse = !courseIdFilter || getStudentCourseIds(student.student_id || student.username).includes(Number(courseIdFilter));
    return matchesSearch && matchesStatus && matchesCourse;
  });

  const statusCounts = {
    all: users.length,
    active: users.filter(u => normalizeStudentStatus(u.status) === 'active').length,
    pending: users.filter(u => normalizeStudentStatus(u.status) === 'pending').length,
    inactive: users.filter(u => ['inactive', 'suspended', 'graduated'].includes(normalizeStudentStatus(u.status))).length
  };

  const result = paginate(filteredStudents, page, 10);

  res.render('admin/students', {
    title: 'Student Management | Pastors LMS',
    user: req.session.user,
    students: result.items,
    courses,
    statusCounts,
    filters: {
      search,
      status: statusFilter,
      course_id: courseIdFilter
    },
    pagination: result,
    selectedStudentCount: 0,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.get('/approvals', requireAdmin, async (req, res) => {
  const pendingStudents = (await getStudents())
    .filter(user => user.role === 'student' && (user.approval_status === 'pending' || user.status === 'pending'))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  res.render('admin/approvals', {
    title: 'Student Approvals | Pastors LMS',
    user: req.session.user,
    students: pendingStudents,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/students/:studentId/approve', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);
  const redirectTo = req.body.redirect_to || req.query.redirect_to || '/admin/approvals';

  if (!student) {
    return res.redirect(redirectTo + '?error=' + encodeURIComponent('Student record not found.'));
  }

  const saved = await updateStudent(student, {
    approval_status: 'approved',
    status: 'active',
    role: 'student',
    approved_by: req.session.user.username,
    approved_at: new Date().toISOString()
  });

  if (saved) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Approved application for ${buildFullName(student)}`,
      targetType: 'student',
      targetId: student.student_id || student.username
    });
    return res.redirect(redirectTo + '?success=' + encodeURIComponent('Student approved successfully.'));
  }

  return res.redirect(redirectTo + '?error=' + encodeURIComponent('Approval failed. Please try again.'));
});

router.post('/students/:studentId/reject', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);

  if (!student) {
    return res.redirect('/admin/approvals?error=' + encodeURIComponent('Student record not found.'));
  }

  const saved = await updateStudent(student, { approval_status: 'rejected', status: 'rejected' });

  if (saved) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Rejected application for ${buildFullName(student)}`,
      targetType: 'student',
      targetId: student.student_id || student.username
    });
    return res.redirect('/admin/approvals?success=' + encodeURIComponent('Student application rejected.'));
  }

  return res.redirect('/admin/approvals?error=' + encodeURIComponent('Rejection failed. Please try again.'));
});

router.get('/students/new', requireAdmin, (req, res) => {
  res.render('admin/student-form', {
    title: 'Add Student | Pastors LMS',
    user: req.session.user,
    formData: {},
    error: null,
    mode: 'create'
  });
});

router.get('/students/:studentId/edit', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  res.render('admin/student-form', {
    title: 'Edit Student | Pastors LMS',
    user: req.session.user,
    formData: student,
    error: null,
    mode: 'edit'
  });
});

router.post('/students/:studentId/edit', requireAdmin, async (req, res) => {
  const users = await getStudents();
  const student = users.find(user => matchesStudentId(user, req.params.studentId));

  if (!student) {
    return res.redirect('/admin/students');
  }

  const { first_name, middle_name, last_name, date_of_birth, gender, phone, email, profile_photo, address, county, town, physical_address, church_name, ministry_role, years_in_ministry, emergency_contact_name, emergency_contact_phone, relationship, role } = req.body;
  const assignableRoles = req.session.user.role === 'super_admin' ? ['super_admin', 'admin', 'teacher', 'student'] : ['teacher', 'student'];
  const cleanRole = assignableRoles.includes(role) ? role : (student.role || 'student');

  if (!first_name || !last_name || !phone || !email) {
    return res.render('admin/student-form', {
      title: 'Edit Student | Pastors LMS',
      user: req.session.user,
      formData: { ...student, ...req.body },
      error: 'First name, last name, phone, and email are required.',
      mode: 'edit'
    });
  }

  const duplicateEmail = users.some(user => user.email && user.email.toLowerCase() === email.toLowerCase() && user.student_id !== student.student_id);
  if (duplicateEmail) {
    return res.render('admin/student-form', {
      title: 'Edit Student | Pastors LMS',
      user: req.session.user,
      formData: { ...student, ...req.body },
      error: 'Another student already uses this email address.',
      mode: 'edit'
    });
  }

  const isSupabaseRow = Boolean(supabaseAdmin && student.id);
  const cleanFirstName = first_name.trim();
  const cleanMiddleName = (middle_name || '').trim();
  const cleanLastName = last_name.trim();
  const updates = {
    first_name: cleanFirstName,
    middle_name: cleanMiddleName,
    last_name: cleanLastName,
    full_name: buildFullName({ first_name: cleanFirstName, middle_name: cleanMiddleName, last_name: cleanLastName }),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    county: county || '',
    town: town || '',
    physical_address: physical_address || '',
    church_name: church_name || '',
    ministry_role: ministry_role || '',
    years_in_ministry: Number(years_in_ministry) || 0,
    emergency_contact_name: emergency_contact_name || '',
    emergency_contact_phone: emergency_contact_phone || '',
    relationship: relationship || '',
    role: cleanRole
  };

  if (supabaseAdmin && student.auth_user_id) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(student.auth_user_id, {
        user_metadata: { role: cleanRole },
        app_metadata: { role: cleanRole }
      });
    } catch (e) {
      console.warn('Supabase auth role metadata update warning:', e.message);
    }
  }

  if (!isSupabaseRow) {
    // Local-only fields; the Supabase students table has no columns for these
    Object.assign(updates, {
      date_of_birth: date_of_birth || '',
      gender: gender || '',
      profile_photo: profile_photo || '',
      address: address || '',
      years_in_ministry: years_in_ministry || ''
    });
  }

  const targetId = student.username || student.student_id;
  if (await updateStudent(student, updates)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin updated student ${student.full_name}`,
      targetType: 'student',
      targetId
    });
    res.redirect(`/admin/students/${targetId}?success=${encodeURIComponent('Student record updated successfully.')}`);
    return;
  }

  res.render('admin/student-form', {
    title: 'Edit Student | Pastors LMS',
    user: req.session.user,
    formData: { ...student, ...req.body },
    error: 'Failed to update student record. Please try again.',
    mode: 'edit'
  });
});

router.post('/students/new', requireAdmin, async (req, res) => {
  const { first_name, middle_name, last_name, date_of_birth, gender, phone, email, profile_photo, address, county, town, physical_address, church_name, ministry_role, years_in_ministry, emergency_contact_name, emergency_contact_phone, relationship, password, role } = req.body;
  const assignableRoles = req.session.user.role === 'super_admin' ? ['super_admin', 'admin', 'teacher', 'student'] : ['teacher', 'student'];
  const cleanRole = assignableRoles.includes(role) ? role : 'student';
  const rolePrefix = cleanRole === 'admin' || cleanRole === 'super_admin' ? 'a' : (cleanRole === 'teacher' ? 't' : 'p');

  const cleanFirst = (first_name || '').trim();
  const cleanLast = (last_name || '').trim();
  const cleanPhone = (phone || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();

  if (!cleanFirst || !cleanLast || !cleanPhone || !cleanEmail || !cleanPassword) {
    return res.render('admin/student-form', {
      title: 'Add Student | Pastors LMS',
      user: req.session.user,
      formData: req.body,
      error: 'First name, last name, phone, email, and password are required.',
      mode: 'create'
    });
  }

  const users = await getStudents();
  const emailExists = users.some(user => user.email && user.email.toLowerCase() === cleanEmail);
  const phoneExists = cleanPhone && users.some(user => (user.phone || '').replace(/\s+/g, '') === cleanPhone.replace(/\s+/g, ''));

  if (emailExists) {
    return res.render('admin/student-form', {
      title: 'Add Student | Pastors LMS',
      user: req.session.user,
      formData: req.body,
      error: 'A student with this email already exists.',
      mode: 'create'
    });
  }

  if (phoneExists) {
    return res.render('admin/student-form', {
      title: 'Add Student | Pastors LMS',
      user: req.session.user,
      formData: req.body,
      error: 'A student with this phone number already exists.',
      mode: 'create'
    });
  }

  const studentId = generateStudentId(users);
  const fullName = buildFullName({ first_name: cleanFirst, middle_name, last_name: cleanLast });
  let generatedUsername = null;
  for (let n = 1000000; !generatedUsername; n += 1) {
    const candidate = `${rolePrefix}${n}`;
    if (!users.some(user => user.username === candidate)) generatedUsername = candidate;
  }

  const newUser = {
    username: generatedUsername,
    email: cleanEmail,
    password: bcrypt.hashSync(cleanPassword, 10),
    full_name: fullName,
    first_name: cleanFirst,
    middle_name: (middle_name || '').trim(),
    last_name: cleanLast,
    date_of_birth: date_of_birth || '',
    gender: gender || '',
    phone: cleanPhone,
    profile_photo: profile_photo || '',
    address: address || '',
    county: county || '',
    town: town || '',
    physical_address: physical_address || '',
    church_name: church_name || '',
    ministry_role: ministry_role || '',
    years_in_ministry: years_in_ministry || '',
    emergency_contact_name: emergency_contact_name || '',
    emergency_contact_phone: emergency_contact_phone || '',
    relationship: relationship || '',
    student_id: studentId,
    status: 'active',
    role: cleanRole,
    approval_status: 'approved',
    created_at: new Date().toISOString(),
    archived: false,
    initials: buildInitials(fullName)
  };

  users.push(newUser);

  if (supabaseAdmin) {
    // Create the Supabase Auth login first, then the students profile row
    const renderError = message => res.render('admin/student-form', {
      title: 'Add Student | Pastors LMS',
      user: req.session.user,
      formData: req.body,
      error: message,
      mode: 'create'
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: cleanRole, username: generatedUsername },
      app_metadata: { role: cleanRole }
    });
    if (authError) {
      console.error('Admin create student - auth failed:', authError.message);
      return renderError(authError.message || 'Could not create the student login.');
    }

    const username = generatedUsername;

    const profile = {
      auth_user_id: authData.user.id,
      username,
      email: cleanEmail,
      full_name: fullName,
      first_name: cleanFirst,
      middle_name: (middle_name || '').trim(),
      last_name: cleanLast,
      phone: cleanPhone,
      county: county || '',
      town: town || '',
      physical_address: physical_address || '',
      church_name: church_name || '',
      ministry_role: ministry_role || '',
      years_in_ministry: Number(years_in_ministry) || 0,
      emergency_contact_name: emergency_contact_name || '',
      emergency_contact_phone: emergency_contact_phone || '',
      relationship: relationship || '',
      student_id: studentId,
      role: cleanRole,
      status: 'active',
      approval_status: 'approved'
    };

    const { error: insertError } = await supabaseAdmin.from('students').insert([profile]);
    if (insertError) {
      console.error('Admin create student - profile insert failed:', insertError.message);
      // Roll back the auth user so the email can be reused
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return renderError(`Could not save the student profile: ${insertError.message}`);
    }

    // Also save to local data/users.json so both stores stay matched
    newUser.username = username;
    newUser.auth_user_id = authData.user.id;
    saveUsers([...getUsers(), newUser]);

    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin added student ${fullName}`,
      targetType: 'student',
      targetId: studentId
    });
    return res.redirect(`/admin/students/${studentId}?success=${encodeURIComponent(`Student created. Login username: ${username}`)}`);
  }

  if (saveUsers([...getUsers(), newUser])) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin added student ${fullName}`,
      targetType: 'student',
      targetId: studentId
    });
    res.redirect(`/admin/students/${studentId}?success=${encodeURIComponent('Student created successfully.')}`);
    return;
  }

  res.render('admin/student-form', {
    title: 'Add Student | Pastors LMS',
    user: req.session.user,
    formData: req.body,
    error: 'Failed to create student. Please try again.',
    mode: 'create'
  });
});

router.get('/students/:studentId', requireAdmin, async (req, res) => {
  const users = await getStudents();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId || user.email === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const courseData = getCoursesData();
  const allCourses = courseData.courses || [];
  const enrolments = getEnrolments()
    .filter(enrolment => enrolment.student_id === (student.student_id || student.username) && enrolment.status !== 'removed')
    .map(enrolment => {
      const course = allCourses.find(item => Number(item.id) === Number(enrolment.course_id));
      return {
        ...enrolment,
        course_name: course ? course.title : 'Unknown Course',
        course_code: course ? course.code : 'N/A'
      };
    });

  res.render('admin/student-detail', {
    title: `${buildFullName(student)} | Pastors LMS`,
    user: req.session.user,
    student,
    enrolments,
    courses: allCourses,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/students/:studentId/role', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const targetId = student.username || student.student_id;
  const assignableRoles = req.session.user.role === 'super_admin' ? ['super_admin', 'admin', 'teacher', 'student'] : ['teacher', 'student'];
  if (!assignableRoles.includes(req.body.role) || (student.role === 'super_admin' && req.session.user.role !== 'super_admin')) {
    return res.redirect(`/admin/students/${targetId}?error=${encodeURIComponent('Only a Super Admin can assign or modify Admin / Super Admin roles.')}`);
  }
  const newRole = req.body.role;

  if (supabaseAdmin && student.auth_user_id) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(student.auth_user_id, {
        user_metadata: { role: newRole },
        app_metadata: { role: newRole }
      });
    } catch (e) {
      console.warn('Supabase auth role update warning:', e.message);
    }
  }

  if (await updateStudent(student, { role: newRole })) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin changed ${buildFullName(student)} role to ${newRole}`,
      targetType: 'student',
      targetId
    });
  }

  res.redirect(`/admin/students/${targetId}?success=${encodeURIComponent(`Account role updated to ${newRole.toUpperCase()}.`)}`);
});

router.post('/students/:studentId/status', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const newStatus = normalizeStudentStatus(req.body.status);

  const targetId = student.username || student.student_id;
  if (await updateStudent(student, { status: newStatus })) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin changed ${buildFullName(student)} status to ${newStatus}`,
      targetType: 'student',
      targetId
    });
  }

  res.redirect(`/admin/students/${targetId}`);
});

router.post('/students/:studentId/reset-password', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const tempPassword = (req.body.new_password || 'Pastor@2026').trim();
  const hashedPassword = bcrypt.hashSync(tempPassword, 10);
  let saved = false;

  if (supabaseAdmin) {
    let authUserId = student.auth_user_id || null;
    if (!authUserId && student.email) {
      try {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
        const existingAuth = (listData?.users || []).find(
          u => u.email && u.email.toLowerCase() === student.email.toLowerCase()
        );
        if (existingAuth) {
          authUserId = existingAuth.id;
        }
      } catch (e) {
        console.warn('Admin reset password - listUsers warning:', e.message);
      }
    }

    if (authUserId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: tempPassword,
        email_confirm: true
      });
      if (error) {
        console.error('Supabase password reset failed:', error.message);
      } else {
        saved = true;
      }
    } else if (student.email) {
      // Student row existed without an auth.users record — create the auth login now
      const { data: createdAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: student.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: buildFullName(student),
          username: student.username,
          student_id: student.student_id
        }
      });
      if (!createErr && createdAuth?.user) {
        saved = true;
        if (student.id) {
          await supabaseAdmin.from('students').update({ auth_user_id: createdAuth.user.id }).eq('id', student.id);
        }
      } else if (createErr) {
        console.error('Supabase createUser during password reset failed:', createErr.message);
      }
    }
  }

  // Always sync to local users.json if a matching local record exists
  const localUsers = getUsers();
  const localTarget = localUsers.find(u =>
    matchesStudentId(u, student.student_id || student.username) ||
    (student.email && u.email && u.email.toLowerCase() === student.email.toLowerCase())
  );
  if (localTarget) {
    localTarget.password = hashedPassword;
    if (saveUsers(localUsers)) {
      saved = true;
    }
  }

  const targetId = student.username || student.student_id;
  if (saved) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin reset ${buildFullName(student)} password`,
      targetType: 'student',
      targetId
    });
    res.redirect(`/admin/students/${targetId}?success=${encodeURIComponent(`Password reset successful. Temporary password: ${tempPassword}`)}`);
    return;
  }

  res.redirect(`/admin/students/${targetId}?error=${encodeURIComponent('Failed to reset password. Please try again.')}`);
});

router.post('/students/:studentId/archive', requireAdmin, async (req, res) => {
  const student = await findStudent(req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const targetId = student.username || student.student_id;
  const archiveFields = supabaseAdmin && student.id
    ? { status: 'inactive' }
    : { status: 'inactive', archived: true };

  if (await updateStudent(student, archiveFields)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin archived ${buildFullName(student)}`,
      targetType: 'student',
      targetId
    });
  }

  res.redirect(`/admin/students/${targetId}`);
});

router.post('/students/:studentId/courses', requireAdmin, (req, res) => {
  const studentId = req.params.studentId;
  const courseId = Number(req.body.course_id);
  const students = getUsers();
  const student = students.find(user => user.student_id === studentId || user.username === studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  if (!courseId) {
    return res.redirect(`/admin/students/${studentId}?error=${encodeURIComponent('Please select a course to add.')}`);
  }

  const coursesData = getCoursesData();
  const course = (coursesData.courses || []).find(item => Number(item.id) === Number(courseId));

  if (!course) {
    return res.redirect(`/admin/students/${studentId}?error=${encodeURIComponent('Course not found.')}`);
  }

  const enrolments = getEnrolments();
  const alreadyEnrolled = enrolments.some(entry => entry.student_id === studentId && Number(entry.course_id) === courseId && entry.status !== 'removed');
  if (alreadyEnrolled) {
    return res.redirect(`/admin/students/${studentId}?error=${encodeURIComponent('This student is already enrolled in the selected course.')}`);
  }

  const courseCapacity = Number(course.capacity || 0);
  if (courseCapacity > 0) {
    const currentCount = enrolments.filter(entry => Number(entry.course_id) === courseId && entry.status !== 'removed').length;
    if (currentCount >= courseCapacity) {
      return res.redirect(`/admin/students/${studentId}?error=${encodeURIComponent('Course capacity reached. Enrolment is full.')}`);
    }
  }

  enrolments.push({
    id: Date.now(),
    student_id: studentId,
    course_id: String(courseId),
    status: 'active',
    enrolled_at: new Date().toISOString()
  });

  if (saveEnrolments(enrolments)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin assigned ${course.title} to ${buildFullName(student)}`,
      targetType: 'enrolment',
      targetId: `${studentId}:${courseId}`
    });
  }

  res.redirect(`/admin/students/${studentId}?success=${encodeURIComponent('Course added to student successfully.')}`);
});

router.post('/students/:studentId/courses/:courseId/remove', requireAdmin, (req, res) => {
  const studentId = req.params.studentId;
  const courseId = Number(req.params.courseId);
  const enrolments = getEnrolments();
  const updated = enrolments.filter(entry => !(entry.student_id === studentId && Number(entry.course_id) === courseId));
  if (saveEnrolments(updated)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin removed course ${courseId} from student ${studentId}`,
      targetType: 'enrolment',
      targetId: `${studentId}:${courseId}`
    });
  }
  res.redirect(`/admin/students/${studentId}?success=${encodeURIComponent('Course removed from student.')}`);
});

router.get('/library', requireAdmin, (req, res) => {
  res.redirect('/teacher/library');
});

router.get('/courses', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const courses = data.courses || [];
  const statusFilter = req.query.status || 'all';
  const search = (req.query.search || '').trim();
  const sort = req.query.sort || 'name';
  const page = Number(req.query.page || 1);

  const filteredCourses = courses.filter(course => {
    const matchesStatus = statusFilter === 'all' || normalizeCourseStatus(course.status) === statusFilter;
    const matchesSearch = courseMatchesSearch(course, search);
    return matchesStatus && matchesSearch;
  }).sort((a, b) => {
    if (sort === 'date') {
      return new Date(b.created_at || b.start_date || 0) - new Date(a.created_at || a.start_date || 0);
    }
    return (a.title || '').localeCompare(b.title || '');
  });

  const result = paginate(filteredCourses, page, 10);
  res.render('admin/courses', {
    title: 'Course Management | Pastors LMS',
    user: req.session.user,
    courses: result.items,
    pagination: result,
    filters: {
      search,
      status: statusFilter,
      sort
    },
    enrolments: getEnrolments()
  });
});

router.get('/courses/new', requireAdmin, (req, res) => {
  res.render('admin/course-form', {
    title: 'Add Course | Pastors LMS',
    user: req.session.user,
    mode: 'create',
    formData: {},
    error: null
  });
});

router.post('/courses/new', requireAdmin, (req, res) => {
  const { title, code, description, instructor, status, capacity } = req.body;
  const cleanTitle = (title || '').trim();
  const cleanCode = (code || '').trim();

  if (!cleanTitle || !cleanCode) {
    return res.render('admin/course-form', {
      title: 'Add Course | Pastors LMS',
      user: req.session.user,
      mode: 'create',
      formData: req.body,
      error: 'Course name and code are required.'
    });
  }

  const data = getCoursesData();
  const duplicateCode = (data.courses || []).some(course => (course.code || '').toLowerCase() === cleanCode.toLowerCase());
  if (duplicateCode) {
    return res.render('admin/course-form', {
      title: 'Add Course | Pastors LMS',
      user: req.session.user,
      mode: 'create',
      formData: req.body,
      error: 'A course with this code already exists.'
    });
  }

  const newId = Math.max(0, ...(data.courses || []).map(course => Number(course.id || 0))) + 1;
  const newCourse = {
    id: newId,
    title: cleanTitle,
    code: cleanCode,
    description: (description || '').trim(),
    instructor: (instructor || '').trim(),
    status: normalizeCourseStatus(status),
    capacity: capacity && Number(capacity) > 0 ? Number(capacity) : null,
    created_at: new Date().toISOString(),
    cover_image: '/images/course-hermeneutics.svg',
    modules: [],
    announcement: null,
    archived: normalizeCourseStatus(status) === 'archived'
  };

  data.courses.push(newCourse);
  if (saveCoursesData(data)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin added course ${cleanTitle}`,
      targetType: 'course',
      targetId: newId
    });
    res.redirect('/admin/courses');
    return;
  }

  res.render('admin/course-form', {
    title: 'Add Course | Pastors LMS',
    user: req.session.user,
    mode: 'create',
    formData: req.body,
    error: 'Failed to save course. Please try again.'
  });
});

router.get('/courses/:id', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const allUsers = getUsers();
  const teachers = getTeachers(allUsers);
  const courseInstructor = findTeacherByUsername(course.instructor_username, allUsers);
  const modulesWithInstructors = (course.modules || []).map(mod => ({
    ...mod,
    resolvedInstructor: resolveModuleInstructor(course, mod, allUsers),
    hasOverride: Boolean(mod.instructor_username)
  }));

  const enrolments = getEnrolments().filter(enrolment => Number(enrolment.course_id) === Number(req.params.id) && enrolment.status !== 'removed');
  const studentList = allUsers.filter(user => user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'teacher');
  const enrolledStudents = enrolments.map(enrolment => {
    const user = studentList.find(student => student.student_id === enrolment.student_id || student.username === enrolment.student_id);
    return {
      ...enrolment,
      student_name: user ? buildFullName(user) : 'Unknown Student',
      student_email: user ? user.email : 'N/A'
    };
  });

  res.render('admin/course-detail', {
    title: `${course.title} | Pastors LMS`,
    user: req.session.user,
    isSuperAdmin: req.session.user.role === 'super_admin',
    course,
    teachers,
    courseInstructor,
    modulesWithInstructors,
    enrolments: enrolledStudents,
    studentList,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

function safeCourseReturnUrl(returnTo, fallbackUrl) {
  if (typeof returnTo === 'string' && /^\/admin\/courses\/\d+(\/modules)?$/.test(returnTo.trim())) {
    return returnTo.trim();
  }
  return fallbackUrl;
}

// GET /admin/courses/:id/modules - Module & Module Lecturer Management
router.get('/courses/:id/modules', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const allUsers = getUsers();
  const teachers = getTeachers(allUsers);
  const courseInstructor = findTeacherByUsername(course.instructor_username, allUsers);
  const modulesWithInstructors = (course.modules || []).map(mod => ({
    ...mod,
    resolvedInstructor: resolveModuleInstructor(course, mod, allUsers),
    hasOverride: Boolean(mod.instructor_username)
  }));

  res.render('admin/modules', {
    title: `Manage Modules – ${course.code} | Pastors LMS`,
    user: req.session.user,
    isSuperAdmin: req.session.user.role === 'super_admin',
    course,
    teachers,
    courseInstructor,
    modulesWithInstructors,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /admin/courses/:id/modules/new - Add a new module
router.post('/courses/:id/modules/new', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const title = (req.body.title || '').trim();
  const totalTopics = Math.max(1, parseInt(req.body.total_topics, 10) || 1);
  if (!title) {
    return res.redirect(`/admin/courses/${course.id}/modules?error=${encodeURIComponent('Module title is required.')}`);
  }

  course.modules = Array.isArray(course.modules) ? course.modules : [];
  const nextId = course.modules.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1;
  const newModule = {
    id: nextId,
    title,
    sort_order: course.modules.length + 1,
    total_topics: totalTopics,
    completed_topics: 0
  };

  if (req.session.user.role === 'super_admin' && req.body.instructor_username) {
    const teacher = findTeacherByUsername(req.body.instructor_username, getUsers());
    if (teacher) {
      newModule.instructor_username = teacher.username;
    }
  }

  course.modules.push(newModule);
  saveCoursesData(data);
  appendActivity({
    adminUsername: req.session.user.username,
    adminName: req.session.user.full_name,
    action: `Added module "${title}" to ${course.code}`,
    targetType: 'module',
    targetId: `${course.id}:${nextId}`
  });

  res.redirect(`/admin/courses/${course.id}/modules?success=${encodeURIComponent(`Module "${title}" added.`)}`);
});

// POST /admin/courses/:id/modules/:moduleId/edit - Update module title & topics
router.post('/courses/:id/modules/:moduleId/edit', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const mod = (course.modules || []).find(m => Number(m.id) === Number(req.params.moduleId));
  if (!mod) {
    return res.redirect(`/admin/courses/${course.id}/modules?error=${encodeURIComponent('Module not found.')}`);
  }

  const title = (req.body.title || '').trim();
  const totalTopics = Math.max(1, parseInt(req.body.total_topics, 10) || mod.total_topics || 1);
  if (title) mod.title = title;
  mod.total_topics = totalTopics;

  saveCoursesData(data);
  appendActivity({
    adminUsername: req.session.user.username,
    adminName: req.session.user.full_name,
    action: `Updated module "${mod.title}" in ${course.code}`,
    targetType: 'module',
    targetId: `${course.id}:${mod.id}`
  });

  res.redirect(`/admin/courses/${course.id}/modules?success=${encodeURIComponent(`Module "${mod.title}" updated.`)}`);
});

// POST /admin/courses/:id/modules/:moduleId/delete - Remove module
router.post('/courses/:id/modules/:moduleId/delete', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const beforeLen = (course.modules || []).length;
  course.modules = (course.modules || []).filter(m => Number(m.id) !== Number(req.params.moduleId));
  if (course.modules.length < beforeLen) {
    saveCoursesData(data);
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Deleted module #${req.params.moduleId} from ${course.code}`,
      targetType: 'module',
      targetId: `${course.id}:${req.params.moduleId}`
    });
  }

  res.redirect(`/admin/courses/${course.id}/modules?success=${encodeURIComponent('Module deleted.')}`);
});

function canEditModuleLessons(sessionUser, course, mod) {
  if (!sessionUser) return false;
  if (['admin', 'super_admin'].includes(sessionUser.role)) return true;
  if (sessionUser.role === 'teacher') {
    const resolved = resolveModuleInstructor(course, mod, getUsers());
    return Boolean(resolved && resolved.username.toLowerCase() === String(sessionUser.username || '').toLowerCase());
  }
  return false;
}

// GET /admin/courses/:id/modules/:moduleId/lessons - Browser-Based Lesson, Quiz & Schedule Editor
router.get('/courses/:id/modules/:moduleId/lessons', requireTeacher, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) return res.redirect('/admin/courses');

  const mod = (course.modules || []).find(m => Number(m.id) === Number(req.params.moduleId));
  if (!mod) return res.redirect(`/admin/courses/${course.id}/modules`);

  if (!canEditModuleLessons(req.session.user, course, mod)) {
    return res.redirect('/teacher/classes?error=' + encodeURIComponent('You can only edit lessons for modules assigned to you.'));
  }

  const lessons = getCustomLessonsSync(course.id, mod.id);
  res.render('admin/lesson-editor', {
    title: `Lesson & Quiz Editor – ${mod.title} | Pastors LMS`,
    user: req.session.user,
    course,
    mod,
    lessons,
    isStaffAdmin: ['admin', 'super_admin'].includes(req.session.user.role),
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /admin/courses/:id/modules/:moduleId/schedule - Set module unlock & due dates
router.post('/courses/:id/modules/:moduleId/schedule', requireTeacher, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) return res.redirect('/admin/courses');

  const mod = (course.modules || []).find(m => Number(m.id) === Number(req.params.moduleId));
  if (!mod || !canEditModuleLessons(req.session.user, course, mod)) {
    return res.redirect('/teacher/classes');
  }

  mod.unlock_date = (req.body.unlock_date || '').trim() || null;
  mod.due_date = (req.body.due_date || '').trim() || null;
  saveCoursesData(data);

  res.redirect(`/admin/courses/${course.id}/modules/${mod.id}/lessons?success=${encodeURIComponent('Module schedule dates saved.')}`);
});

// POST /admin/courses/:id/modules/:moduleId/lessons/new - Create a new lesson, assignment, quiz, exam, or discussion
router.post('/courses/:id/modules/:moduleId/lessons/new', requireTeacher, async (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) return res.redirect('/admin/courses');

  const mod = (course.modules || []).find(m => Number(m.id) === Number(req.params.moduleId));
  if (!mod || !canEditModuleLessons(req.session.user, course, mod)) {
    return res.redirect('/teacher/classes');
  }

  const title = (req.body.title || '').trim();
  if (!title) {
    return res.redirect(`/admin/courses/${course.id}/modules/${mod.id}/lessons?error=${encodeURIComponent('Lesson title is required.')}`);
  }

  // Convert plain newlines in reading content into clean HTML paragraphs if raw text was entered
  let rawContent = (req.body.content_html || '').trim();
  if (rawContent && !/<[a-z][\s\S]*>/i.test(rawContent)) {
    rawContent = rawContent
      .split(/\n{2,}/)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  let quizQuestions = [];
  if (req.body.quiz_questions_json) {
    try {
      const parsed = JSON.parse(req.body.quiz_questions_json);
      if (Array.isArray(parsed)) quizQuestions = parsed.filter(q => q && q.prompt);
    } catch {
      quizQuestions = [];
    }
  }

  const existingLessons = getCustomLessonsSync(course.id, mod.id);
  await saveCustomLesson({
    course_id: course.id,
    module_id: mod.id,
    sort_order: existingLessons.length + 1,
    title,
    banner_title: (req.body.banner_title || title).trim(),
    topic_type: req.body.topic_type || 'reading',
    content_html: rawContent,
    scripture_ref: req.body.scripture_ref || '',
    quiz_questions: quizQuestions,
    max_score: req.body.max_score || 100,
    pass_score: req.body.pass_score || 60,
    max_attempts: req.body.max_attempts || 3,
    time_limit_minutes: req.body.time_limit_minutes || null,
    due_date: req.body.due_date || null,
    created_by: req.session.user.username
  });

  // Update module total_topics count to include newly authored lesson
  mod.total_topics = Math.max(Number(mod.total_topics) || 0, existingLessons.length + 1);
  saveCoursesData(data);

  res.redirect(`/admin/courses/${course.id}/modules/${mod.id}/lessons?success=${encodeURIComponent(`Lesson "${title}" published to ${mod.title}.`)}`);
});

// POST /admin/courses/:id/modules/:moduleId/lessons/:topicKey/delete
router.post('/courses/:id/modules/:moduleId/lessons/:topicKey/delete', requireTeacher, async (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  const mod = course && (course.modules || []).find(m => Number(m.id) === Number(req.params.moduleId));
  if (!course || !mod || !canEditModuleLessons(req.session.user, course, mod)) {
    return res.redirect('/teacher/classes');
  }

  await deleteCustomLesson(req.params.topicKey);
  res.redirect(`/admin/courses/${course.id}/modules/${mod.id}/lessons?success=${encodeURIComponent('Lesson removed.')}`);
});

// Super Admin only: Assign default lecturer to a course (e.g. CHUR 201)
router.post('/courses/:id/instructor', requireSuperAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const dest = safeCourseReturnUrl(req.body.return_to, `/admin/courses/${course.id}`);
  const chosenUsername = (req.body.instructor_username || '').trim();
  if (!chosenUsername) {
    delete course.instructor_username;
    course.instructor = '';
  } else {
    const teacher = findTeacherByUsername(chosenUsername, getUsers());
    if (!teacher) {
      return res.redirect(`${dest}?error=${encodeURIComponent('Selected teacher account was not found.')}`);
    }
    course.instructor_username = teacher.username;
    course.instructor = teacher.full_name;
  }

  saveCoursesData(data);
  appendActivity({
    adminUsername: req.session.user.username,
    adminName: req.session.user.full_name,
    action: chosenUsername
      ? `Super Admin assigned ${course.instructor} as default lecturer for ${course.code}`
      : `Super Admin cleared default lecturer for ${course.code}`,
    targetType: 'course',
    targetId: course.id
  });

  res.redirect(`${dest}?success=${encodeURIComponent('Course default lecturer updated.')}`);
});

// Super Admin only: Assign (or clear) lecturer for a specific module/unit
router.post('/courses/:id/modules/:moduleId/instructor', requireSuperAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  const dest = safeCourseReturnUrl(req.body.return_to, `/admin/courses/${course.id}`);
  const mod = (course.modules || []).find(m => Number(m.id) === Number(req.params.moduleId));
  if (!mod) {
    return res.redirect(`${dest}?error=${encodeURIComponent('Module not found.')}`);
  }

  const chosenUsername = (req.body.instructor_username || '').trim();
  let actionText = '';

  if (!chosenUsername) {
    delete mod.instructor_username;
    actionText = `Super Admin reset module "${mod.title}" in ${course.code} to inherit course lecturer`;
  } else {
    const teacher = findTeacherByUsername(chosenUsername, getUsers());
    if (!teacher) {
      return res.redirect(`${dest}?error=${encodeURIComponent('Selected teacher account was not found.')}`);
    }
    mod.instructor_username = teacher.username;
    actionText = `Super Admin assigned ${teacher.full_name} to module "${mod.title}" (${course.code})`;
  }

  saveCoursesData(data);
  appendActivity({
    adminUsername: req.session.user.username,
    adminName: req.session.user.full_name,
    action: actionText,
    targetType: 'module',
    targetId: `${course.id}:${mod.id}`
  });

  res.redirect(`${dest}?success=${encodeURIComponent(`Lecturer updated for "${mod.title}".`)}`);
});

router.get('/courses/:id/edit', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) {
    return res.redirect('/admin/courses');
  }

  res.render('admin/course-form', {
    title: 'Edit Course | Pastors LMS',
    user: req.session.user,
    mode: 'edit',
    formData: course,
    error: null
  });
});

router.post('/courses/:id/edit', requireAdmin, (req, res) => {
  const { title, code, description, instructor, status, capacity } = req.body;
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));

  if (!course) {
    return res.redirect('/admin/courses');
  }

  if (!title || !code) {
    return res.render('admin/course-form', {
      title: 'Edit Course | Pastors LMS',
      user: req.session.user,
      mode: 'edit',
      formData: { ...course, title, code, description, instructor, status, capacity },
      error: 'Course name and code are required.'
    });
  }

  course.title = title.trim();
  course.code = code.trim();
  course.description = (description || '').trim();
  course.instructor = (instructor || '').trim();
  course.status = normalizeCourseStatus(status);
  course.capacity = capacity && Number(capacity) > 0 ? Number(capacity) : null;
  course.archived = course.status === 'archived';

  if (saveCoursesData(data)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin updated course ${course.title}`,
      targetType: 'course',
      targetId: course.id
    });
    res.redirect('/admin/courses');
    return;
  }

  res.render('admin/course-form', {
    title: 'Edit Course | Pastors LMS',
    user: req.session.user,
    mode: 'edit',
    formData: course,
    error: 'Failed to update course. Please try again.'
  });
});

router.post('/courses/:id/archive', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) return res.redirect('/admin/courses');
  course.status = 'archived';
  course.archived = true;
  appendActivity({ adminUsername: req.session.user.username, adminName: req.session.user.full_name, action: `Admin archived ${course.title}`, targetType: 'course', targetId: course.id });
  saveCoursesData(data);
  res.redirect('/admin/courses');
});

router.post('/courses/:id/restore', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = (data.courses || []).find(item => Number(item.id) === Number(req.params.id));
  if (!course) return res.redirect('/admin/courses');
  course.status = 'active';
  course.archived = false;
  appendActivity({ adminUsername: req.session.user.username, adminName: req.session.user.full_name, action: `Admin restored ${course.title}`, targetType: 'course', targetId: course.id });
  saveCoursesData(data);
  res.redirect('/admin/courses');
});

router.post('/courses/:id/delete', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const courseIndex = (data.courses || []).findIndex(item => Number(item.id) === Number(req.params.id));
  if (courseIndex === -1) return res.redirect('/admin/courses');

  const course = data.courses[courseIndex];
  const enrolments = getEnrolments().filter(entry => Number(entry.course_id) === Number(req.params.id) && entry.status !== 'removed');

  if (enrolments.length > 0) {
    course.status = 'archived';
    course.archived = true;
    appendActivity({ adminUsername: req.session.user.username, adminName: req.session.user.full_name, action: `Admin archived ${course.title} due to enrolled students`, targetType: 'course', targetId: course.id });
    saveCoursesData(data);
    return res.redirect(`/admin/courses/${course.id}?success=${encodeURIComponent('Course archived instead of being deleted because students are enrolled.')}`);
  }

  data.courses.splice(courseIndex, 1);
  appendActivity({ adminUsername: req.session.user.username, adminName: req.session.user.full_name, action: `Admin deleted course ${course.title}`, targetType: 'course', targetId: course.id });
  saveCoursesData(data);
  res.redirect('/admin/courses');
});

router.get('/enrolments', requireAdmin, (req, res) => {
  const students = getUsers().filter(user => user.role !== 'admin' && user.role !== 'super_admin');
  const courses = getCoursesData().courses || [];
  const enrolments = getEnrolments();
  const filterStudent = req.query.student_id || 'all';
  const filterCourse = req.query.course_id || 'all';
  const filterStatus = req.query.status || 'all';
  const search = (req.query.search || '').trim();

  const filtered = enrolments.filter(entry => {
    const student = students.find(student => student.student_id === entry.student_id || student.username === entry.student_id);
    const course = courses.find(item => Number(item.id) === Number(entry.course_id));
    const studentName = student ? buildFullName(student) : 'Unknown Student';
    const matchesStudent = filterStudent === 'all' || entry.student_id === filterStudent;
    const matchesCourse = filterCourse === 'all' || Number(entry.course_id) === Number(filterCourse);
    const matchesStatus = filterStatus === 'all' || entry.status === filterStatus;
    const matchesSearch = !search || [studentName, course ? course.title : '', course ? course.code : '', entry.status].join(' ').toLowerCase().includes(search.toLowerCase());
    return matchesStudent && matchesCourse && matchesStatus && matchesSearch;
  }).map(entry => {
    const student = students.find(student => student.student_id === entry.student_id || student.username === entry.student_id);
    const course = courses.find(item => Number(item.id) === Number(entry.course_id));
    return {
      ...entry,
      student_name: student ? buildFullName(student) : 'Unknown Student',
      course_name: course ? course.title : 'Unknown Course',
      course_code: course ? course.code : 'N/A'
    };
  });

  res.render('admin/enrolments', {
    title: 'Enrolment Management | Pastors LMS',
    user: req.session.user,
    enrolments: filtered,
    students,
    courses,
    filters: {
      student_id: filterStudent,
      course_id: filterCourse,
      status: filterStatus,
      search
    }
  });
});

router.post('/enrolments/new', requireAdmin, (req, res) => {
  const { student_id, course_id, status } = req.body;
  const student = getUsers().find(user => user.student_id === student_id || user.username === student_id);
  const coursesData = getCoursesData();
  const course = (coursesData.courses || []).find(item => Number(item.id) === Number(course_id));

  if (!student || !course) {
    return res.redirect('/admin/enrolments?error=' + encodeURIComponent('Student and course are required.'));
  }

  const enrolments = getEnrolments();
  const duplicate = enrolments.some(entry => entry.student_id === student.student_id && Number(entry.course_id) === Number(course_id) && entry.status !== 'removed');
  if (duplicate) {
    return res.redirect('/admin/enrolments?error=' + encodeURIComponent('Duplicate enrolment prevented. Student is already enrolled in this course.'));
  }

  const capacity = Number(course.capacity || 0);
  if (capacity > 0) {
    const currentCount = enrolments.filter(entry => Number(entry.course_id) === Number(course_id) && entry.status !== 'removed').length;
    if (currentCount >= capacity) {
      return res.redirect('/admin/enrolments?error=' + encodeURIComponent('This course is full and cannot accept new enrolments.'));
    }
  }

  enrolments.push({
    id: Date.now(),
    student_id: student.student_id,
    course_id: String(course.id),
    status: status || 'active',
    enrolled_at: new Date().toISOString()
  });

  if (saveEnrolments(enrolments)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin enrolled ${buildFullName(student)} in ${course.title}`,
      targetType: 'enrolment',
      targetId: `${student.student_id}:${course.id}`
    });
    res.redirect('/admin/enrolments?success=' + encodeURIComponent('Enrolment created successfully.'));
    return;
  }

  res.redirect('/admin/enrolments?error=' + encodeURIComponent('Failed to create enrolment. Please try again.'));
});

router.post('/enrolments/:id/remove', requireAdmin, (req, res) => {
  const enrolments = getEnrolments();
  const id = Number(req.params.id);
  const next = enrolments.filter(entry => Number(entry.id) !== id);

  if (saveEnrolments(next)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin removed enrolment ${id}`,
      targetType: 'enrolment',
      targetId: id
    });
  }

  res.redirect('/admin/enrolments?success=' + encodeURIComponent('Enrolment removed successfully.'));
});

router.get('/activity', requireAdmin, (req, res) => {
  const logs = getActivityLog();
  res.render('admin/activity-log', {
    title: 'Activity Log | Pastors LMS',
    user: req.session.user,
    logs
  });
});

router.get('/activity-log', requireAdmin, (req, res) => {
  res.redirect('/admin/activity');
});

router.get('/profile', requireAdmin, (req, res) => {
  res.render('admin/profile', {
    title: 'My Profile | Pastors LMS',
    user: req.session.user
  });
});

router.get('/users', requireAdmin, (req, res) => {
  res.redirect('/admin/students');
});

router.get('/users/new', requireAdmin, (req, res) => {
  res.redirect('/admin/students/new');
});

module.exports = router;