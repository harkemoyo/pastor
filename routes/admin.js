const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { requireAdmin } = require('../middleware/auth');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const ENROLMENTS_FILE = path.join(__dirname, '../data/enrolments.json');
const ACTIVITY_FILE = path.join(__dirname, '../data/activity-log.json');
const STUDENT_STATUS_OPTIONS = ['active', 'inactive', 'suspended', 'graduated'];
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
  let counter = 1001;
  while (true) {
    const candidate = `STU-${counter}`;
    const exists = users.some(user => (user.student_id || '').toUpperCase() === candidate.toUpperCase());
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
  return [student.full_name || '', student.student_id || '', student.email || '', student.phone || '', student.username || '']
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

router.get('/dashboard', requireAdmin, (req, res) => {
  const users = getUsers().filter(user => user.role !== 'admin' && user.role !== 'super_admin');
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

router.get('/students', requireAdmin, (req, res) => {
  const users = getUsers().filter(user => user.role !== 'admin' && user.role !== 'super_admin');
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

  const result = paginate(filteredStudents, page, 10);

  res.render('admin/students', {
    title: 'Student Management | Pastors LMS',
    user: req.session.user,
    students: result.items,
    courses,
    filters: {
      search,
      status: statusFilter,
      course_id: courseIdFilter
    },
    pagination: result,
    selectedStudentCount: 0
  });
});

router.get('/approvals', requireAdmin, (req, res) => {
  const pendingStudents = getUsers()
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

router.post('/students/:studentId/approve', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId || user.email === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/approvals?error=' + encodeURIComponent('Student record not found.'));
  }

  student.approval_status = 'approved';
  student.status = 'active';
  student.role = 'student';
  student.approved_by = req.session.user.username;
  student.approved_at = new Date().toISOString();

  if (saveUsers(users)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Approved application for ${buildFullName(student)}`,
      targetType: 'student',
      targetId: student.student_id || student.username
    });
    return res.redirect('/admin/approvals?success=' + encodeURIComponent('Student approved successfully.'));
  }

  return res.redirect('/admin/approvals?error=' + encodeURIComponent('Approval failed. Please try again.'));
});

router.post('/students/:studentId/reject', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId || user.email === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/approvals?error=' + encodeURIComponent('Student record not found.'));
  }

  student.approval_status = 'rejected';
  student.status = 'inactive';

  if (saveUsers(users)) {
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

router.get('/students/:studentId/edit', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId || user.email === req.params.studentId);

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

router.post('/students/:studentId/edit', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId || user.email === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const { first_name, middle_name, last_name, date_of_birth, gender, phone, email, profile_photo, address, county, town, physical_address, church_name, ministry_role, years_in_ministry, emergency_contact_name, emergency_contact_phone, relationship } = req.body;

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

  student.first_name = first_name.trim();
  student.middle_name = (middle_name || '').trim();
  student.last_name = last_name.trim();
  student.full_name = buildFullName(student);
  student.date_of_birth = date_of_birth || '';
  student.gender = gender || '';
  student.phone = phone.trim();
  student.email = email.trim().toLowerCase();
  student.profile_photo = profile_photo || '';
  student.address = address || '';
  student.county = county || '';
  student.town = town || '';
  student.physical_address = physical_address || '';
  student.church_name = church_name || '';
  student.ministry_role = ministry_role || '';
  student.years_in_ministry = years_in_ministry || '';
  student.emergency_contact_name = emergency_contact_name || '';
  student.emergency_contact_phone = emergency_contact_phone || '';
  student.relationship = relationship || '';
  student.username = student.email;

  if (saveUsers(users)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin updated student ${student.full_name}`,
      targetType: 'student',
      targetId: student.student_id
    });
    res.redirect(`/admin/students/${student.student_id}?success=${encodeURIComponent('Student record updated successfully.')}`);
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

router.post('/students/new', requireAdmin, (req, res) => {
  const { first_name, middle_name, last_name, date_of_birth, gender, phone, email, profile_photo, address, county, town, physical_address, church_name, ministry_role, years_in_ministry, emergency_contact_name, emergency_contact_phone, relationship, password } = req.body;

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

  const users = getUsers();
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
  const newUser = {
    username: cleanEmail,
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
    role: 'student',
    approval_status: 'approved',
    created_at: new Date().toISOString(),
    archived: false,
    initials: buildInitials(fullName)
  };

  users.push(newUser);

  if (saveUsers(users)) {
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

router.get('/students/:studentId', requireAdmin, (req, res) => {
  const users = getUsers();
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

router.post('/students/:studentId/status', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const newStatus = normalizeStudentStatus(req.body.status);
  student.status = newStatus;
  student.archived = newStatus === 'inactive';

  if (saveUsers(users)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin changed ${buildFullName(student)} status to ${newStatus}`,
      targetType: 'student',
      targetId: student.student_id
    });
  }

  res.redirect(`/admin/students/${student.student_id}`);
});

router.post('/students/:studentId/reset-password', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  const tempPassword = (req.body.new_password || 'Pastor@2026').trim();
  student.password = bcrypt.hashSync(tempPassword, 10);

  if (saveUsers(users)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin reset ${buildFullName(student)} password`,
      targetType: 'student',
      targetId: student.student_id
    });
    res.redirect(`/admin/students/${student.student_id}?success=${encodeURIComponent(`Password reset successful. Temporary password: ${tempPassword}`)}`);
    return;
  }

  res.redirect(`/admin/students/${student.student_id}?error=${encodeURIComponent('Failed to reset password. Please try again.')}`);
});

router.post('/students/:studentId/archive', requireAdmin, (req, res) => {
  const users = getUsers();
  const student = users.find(user => user.student_id === req.params.studentId || user.username === req.params.studentId);

  if (!student) {
    return res.redirect('/admin/students');
  }

  student.status = 'inactive';
  student.archived = true;

  if (saveUsers(users)) {
    appendActivity({
      adminUsername: req.session.user.username,
      adminName: req.session.user.full_name,
      action: `Admin archived ${buildFullName(student)}`,
      targetType: 'student',
      targetId: student.student_id
    });
  }

  res.redirect(`/admin/students/${student.student_id}`);
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

  const enrolments = getEnrolments().filter(enrolment => Number(enrolment.course_id) === Number(req.params.id) && enrolment.status !== 'removed');
  const studentList = getUsers().filter(user => user.role !== 'admin' && user.role !== 'super_admin');
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
    course,
    enrolments: enrolledStudents,
    studentList,
    success: req.query.success || null,
    error: req.query.error || null
  });
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

module.exports = router;