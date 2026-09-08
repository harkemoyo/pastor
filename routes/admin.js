const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');

// Helper functions for user management
function getUsers() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading users.json:', err);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(path.join(__dirname, '../data/users.json'), JSON.stringify(users, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving users.json:', err);
    return false;
  }
}

// Helper functions for course management
function getCoursesData() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data/courses.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading courses.json:', err);
    return { courses: [], tasks: [] };
  }
}

function saveCoursesData(data) {
  try {
    fs.writeFileSync(path.join(__dirname, '../data/courses.json'), JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving courses.json:', err);
    return false;
  }
}

// Generate unique username based on role
function generateUsername(role) {
  const users = getUsers();
  const prefix = role === 'admin' ? 'a' : 'p';
  const existingUsernames = users.map(u => u.username);
  
  let counter = 1;
  let username;
  
  do {
    username = `${prefix}${1000000 + counter}`;
    counter++;
  } while (existingUsernames.includes(username));
  
  return username;
}

// GET /admin/users - List all users
router.get('/users', requireAdmin, (req, res) => {
  console.log('Admin users page accessed by:', req.session.user?.username);
  const users = getUsers();
  const pendingUsers = users.filter(u => u.approval_status === 'pending');
  const approvedUsers = users.filter(u => u.approval_status === 'approved');
  const rejectedUsers = users.filter(u => u.approval_status === 'rejected');
  
  console.log('Total users:', users.length, 'Pending:', pendingUsers.length, 'Approved:', approvedUsers.length);
  
  res.render('admin/users', {
    title: 'User Management | Pastors LMS',
    users: users,
    pendingUsers: pendingUsers,
    approvedUsers: approvedUsers,
    rejectedUsers: rejectedUsers,
    user: req.session.user
  });
});

// GET /admin/users/new - Show create user form
router.get('/users/new', requireAdmin, (req, res) => {
  res.render('admin/user-form', {
    title: 'Create New User | Pastors LMS',
    user: req.session.user,
    mode: 'create'
  });
});

// POST /admin/users/new - Create new user
router.post('/users/new', requireAdmin, (req, res) => {
  const { full_name, email, password, role } = req.body;
  
  if (!full_name || !email || !password || !role) {
    return res.render('admin/user-form', {
      title: 'Create New User | Pastors LMS',
      user: req.session.user,
      mode: 'create',
      error: 'All fields are required'
    });
  }
  
  const users = getUsers();
  const username = generateUsername(role);
  
  const newUser = {
    username,
    email: email.trim().toLowerCase(),
    password: password.trim(),
    full_name: full_name.trim(),
    role: role.trim(),
    approval_status: 'approved', // Admin-created users are auto-approved
    created_at: new Date().toISOString()
  };
  
  users.push(newUser);
  
  if (saveUsers(users)) {
    res.redirect('/admin/users');
  } else {
    res.render('admin/user-form', {
      title: 'Create New User | Pastors LMS',
      user: req.session.user,
      mode: 'create',
      error: 'Failed to save user. Please try again.'
    });
  }
});

// GET /admin/users/:username/edit - Show edit user form
router.get('/users/:username/edit', requireAdmin, (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.username === req.params.username);
  
  if (!user) {
    return res.redirect('/admin/users');
  }
  
  res.render('admin/user-form', {
    title: 'Edit User | Pastors LMS',
    user: req.session.user,
    mode: 'edit',
    userData: user
  });
});

// POST /admin/users/:username/edit - Update user
router.post('/users/:username/edit', requireAdmin, (req, res) => {
  const { full_name, email, password, role } = req.body;
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === req.params.username);
  
  if (userIndex === -1) {
    return res.redirect('/admin/users');
  }
  
  if (!full_name || !email || !role) {
    return res.render('admin/user-form', {
      title: 'Edit User | Pastors LMS',
      user: req.session.user,
      mode: 'edit',
      userData: users[userIndex],
      error: 'Name, email, and role are required'
    });
  }
  
  users[userIndex].full_name = full_name.trim();
  users[userIndex].email = email.trim().toLowerCase();
  users[userIndex].role = role.trim();
  
  if (password && password.trim()) {
    users[userIndex].password = password.trim();
  }
  
  // Ensure approval status exists
  if (!users[userIndex].approval_status) {
    users[userIndex].approval_status = 'approved';
  }
  
  // Ensure created_at exists
  if (!users[userIndex].created_at) {
    users[userIndex].created_at = new Date().toISOString();
  }
  
  if (saveUsers(users)) {
    res.redirect('/admin/users');
  } else {
    res.render('admin/user-form', {
      title: 'Edit User | Pastors LMS',
      user: req.session.user,
      mode: 'edit',
      userData: users[userIndex],
      error: 'Failed to update user. Please try again.'
    });
  }
});

// POST /admin/users/:username/delete - Delete user
router.post('/users/:username/delete', requireAdmin, (req, res) => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === req.params.username);
  
  if (userIndex === -1) {
    return res.redirect('/admin/users');
  }
  
  // Prevent deleting the last admin
  if (users[userIndex].role === 'admin') {
    const adminCount = users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.render('admin/users', {
        title: 'User Management | Pastors LMS',
        users: users,
        user: req.session.user,
        error: 'Cannot delete the last administrator'
      });
    }
  }
  
  users.splice(userIndex, 1);
  
  if (saveUsers(users)) {
    res.redirect('/admin/users');
  } else {
    const pendingUsers = users.filter(u => u.approval_status === 'pending');
    const approvedUsers = users.filter(u => u.approval_status === 'approved');
    const rejectedUsers = users.filter(u => u.approval_status === 'rejected');
    
    res.render('admin/users', {
      title: 'User Management | Pastors LMS',
      users: users,
      pendingUsers: pendingUsers,
      approvedUsers: approvedUsers,
      rejectedUsers: rejectedUsers,
      user: req.session.user,
      error: 'Failed to delete user. Please try again.'
    });
  }
});

// POST /admin/users/:username/approve - Approve user application
router.post('/users/:username/approve', requireAdmin, (req, res) => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === req.params.username);
  
  if (userIndex === -1) {
    return res.redirect('/admin/users');
  }
  
  users[userIndex].approval_status = 'approved';
  
  if (saveUsers(users)) {
    res.redirect('/admin/users');
  } else {
    const pendingUsers = users.filter(u => u.approval_status === 'pending');
    const approvedUsers = users.filter(u => u.approval_status === 'approved');
    const rejectedUsers = users.filter(u => u.approval_status === 'rejected');
    
    res.render('admin/users', {
      title: 'User Management | Pastors LMS',
      users: users,
      pendingUsers: pendingUsers,
      approvedUsers: approvedUsers,
      rejectedUsers: rejectedUsers,
      user: req.session.user,
      error: 'Failed to approve user. Please try again.'
    });
  }
});

// POST /admin/users/:username/reject - Reject user application
router.post('/users/:username/reject', requireAdmin, (req, res) => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === req.params.username);
  
  if (userIndex === -1) {
    return res.redirect('/admin/users');
  }
  
  users[userIndex].approval_status = 'rejected';
  
  if (saveUsers(users)) {
    res.redirect('/admin/users');
  } else {
    const pendingUsers = users.filter(u => u.approval_status === 'pending');
    const approvedUsers = users.filter(u => u.approval_status === 'approved');
    const rejectedUsers = users.filter(u => u.approval_status === 'rejected');
    
    res.render('admin/users', {
      title: 'User Management | Pastors LMS',
      users: users,
      pendingUsers: pendingUsers,
      approvedUsers: approvedUsers,
      rejectedUsers: rejectedUsers,
      user: req.session.user,
      error: 'Failed to reject user. Please try again.'
    });
  }
});

// ============================================
// COURSE MANAGEMENT ROUTES
// ============================================

// GET /admin/courses - List all courses
router.get('/courses', requireAdmin, (req, res) => {
  const data = getCoursesData();
  res.render('admin/courses', {
    title: 'Course Management | Pastors LMS',
    courses: data.courses,
    user: req.session.user
  });
});

// GET /admin/courses/new - Show create course form
router.get('/courses/new', requireAdmin, (req, res) => {
  res.render('admin/course-form', {
    title: 'Create New Course | Pastors LMS',
    user: req.session.user,
    mode: 'create'
  });
});

// POST /admin/courses/new - Create new course
router.post('/courses/new', requireAdmin, (req, res) => {
  const { title, code, term, description, start_date, end_date, status } = req.body;
  
  if (!title || !code || !term) {
    return res.render('admin/course-form', {
      title: 'Create New Course | Pastors LMS',
      user: req.session.user,
      mode: 'create',
      error: 'Title, code, and term are required'
    });
  }
  
  const data = getCoursesData();
  const newId = Math.max(...data.courses.map(c => c.id), 0) + 1;
  
  const newCourse = {
    id: newId,
    title: title.trim(),
    code: code.trim(),
    term: term.trim(),
    description: description?.trim() || '',
    cover_image: '/images/course-hermeneutics.svg', // Default image
    start_date: start_date || '',
    end_date: end_date || '',
    status: status || 'current',
    modules: [],
    announcement: null
  };
  
  data.courses.push(newCourse);
  
  if (saveCoursesData(data)) {
    res.redirect('/admin/courses');
  } else {
    res.render('admin/course-form', {
      title: 'Create New Course | Pastors LMS',
      user: req.session.user,
      mode: 'create',
      error: 'Failed to save course. Please try again.'
    });
  }
});

// GET /admin/courses/:id/edit - Show edit course form
router.get('/courses/:id/edit', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = data.courses.find(c => c.id === parseInt(req.params.id));
  
  if (!course) {
    return res.redirect('/admin/courses');
  }
  
  res.render('admin/course-form', {
    title: 'Edit Course | Pastors LMS',
    user: req.session.user,
    mode: 'edit',
    course: course
  });
});

// POST /admin/courses/:id/edit - Update course
router.post('/courses/:id/edit', requireAdmin, (req, res) => {
  const { title, code, term, description, start_date, end_date, status } = req.body;
  const data = getCoursesData();
  const courseIndex = data.courses.findIndex(c => c.id === parseInt(req.params.id));
  
  if (courseIndex === -1) {
    return res.redirect('/admin/courses');
  }
  
  if (!title || !code || !term) {
    return res.render('admin/course-form', {
      title: 'Edit Course | Pastors LMS',
      user: req.session.user,
      mode: 'edit',
      course: data.courses[courseIndex],
      error: 'Title, code, and term are required'
    });
  }
  
  data.courses[courseIndex].title = title.trim();
  data.courses[courseIndex].code = code.trim();
  data.courses[courseIndex].term = term.trim();
  data.courses[courseIndex].description = description?.trim() || '';
  data.courses[courseIndex].start_date = start_date || '';
  data.courses[courseIndex].end_date = end_date || '';
  data.courses[courseIndex].status = status || 'current';
  
  if (saveCoursesData(data)) {
    res.redirect('/admin/courses');
  } else {
    res.render('admin/course-form', {
      title: 'Edit Course | Pastors LMS',
      user: req.session.user,
      mode: 'edit',
      course: data.courses[courseIndex],
      error: 'Failed to update course. Please try again.'
    });
  }
});

// POST /admin/courses/:id/delete - Delete course
router.post('/courses/:id/delete', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const courseIndex = data.courses.findIndex(c => c.id === parseInt(req.params.id));
  
  if (courseIndex === -1) {
    return res.redirect('/admin/courses');
  }
  
  data.courses.splice(courseIndex, 1);
  
  if (saveCoursesData(data)) {
    res.redirect('/admin/courses');
  } else {
    res.render('admin/courses', {
      title: 'Course Management | Pastors LMS',
      courses: data.courses,
      user: req.session.user,
      error: 'Failed to delete course. Please try again.'
    });
  }
});

// ============================================
// MODULE/TOPIC MANAGEMENT ROUTES
// ============================================

// GET /admin/courses/:id/modules - Show modules for a course
router.get('/courses/:id/modules', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const course = data.courses.find(c => c.id === parseInt(req.params.id));
  
  if (!course) {
    return res.redirect('/admin/courses');
  }
  
  res.render('admin/modules', {
    title: `Manage Modules - ${course.title} | Pastors LMS`,
    course: course,
    user: req.session.user
  });
});

// POST /admin/courses/:id/modules/new - Add new module to course
router.post('/courses/:id/modules/new', requireAdmin, (req, res) => {
  const { title, total_topics } = req.body;
  const data = getCoursesData();
  const courseIndex = data.courses.findIndex(c => c.id === parseInt(req.params.id));
  
  if (courseIndex === -1) {
    return res.redirect('/admin/courses');
  }
  
  if (!title || !total_topics) {
    const course = data.courses[courseIndex];
    return res.render('admin/modules', {
      title: `Manage Modules - ${course.title} | Pastors LMS`,
      course: course,
      user: req.session.user,
      error: 'Module title and total topics are required'
    });
  }
  
  const course = data.courses[courseIndex];
  const newModuleId = Math.max(...(course.modules?.map(m => m.id) || [0]), 0) + 1;
  const sortOrder = (course.modules?.length || 0) + 1;
  
  const newModule = {
    id: newModuleId,
    title: title.trim(),
    sort_order: sortOrder,
    total_topics: parseInt(total_topics),
    completed_topics: 0
  };
  
  if (!course.modules) {
    course.modules = [];
  }
  
  course.modules.push(newModule);
  
  if (saveCoursesData(data)) {
    res.redirect(`/admin/courses/${course.id}/modules`);
  } else {
    res.render('admin/modules', {
      title: `Manage Modules - ${course.title} | Pastors LMS`,
      course: course,
      user: req.session.user,
      error: 'Failed to add module. Please try again.'
    });
  }
});

// POST /admin/courses/:id/modules/:moduleId/edit - Edit module
router.post('/courses/:id/modules/:moduleId/edit', requireAdmin, (req, res) => {
  const { title, total_topics } = req.body;
  const data = getCoursesData();
  const courseIndex = data.courses.findIndex(c => c.id === parseInt(req.params.id));
  
  if (courseIndex === -1) {
    return res.redirect('/admin/courses');
  }
  
  const course = data.courses[courseIndex];
  const moduleIndex = course.modules?.findIndex(m => m.id === parseInt(req.params.moduleId));
  
  if (moduleIndex === -1) {
    return res.redirect(`/admin/courses/${course.id}/modules`);
  }
  
  if (!title || !total_topics) {
    return res.render('admin/modules', {
      title: `Manage Modules - ${course.title} | Pastors LMS`,
      course: course,
      user: req.session.user,
      error: 'Module title and total topics are required'
    });
  }
  
  course.modules[moduleIndex].title = title.trim();
  course.modules[moduleIndex].total_topics = parseInt(total_topics);
  
  if (saveCoursesData(data)) {
    res.redirect(`/admin/courses/${course.id}/modules`);
  } else {
    res.render('admin/modules', {
      title: `Manage Modules - ${course.title} | Pastors LMS`,
      course: course,
      user: req.session.user,
      error: 'Failed to update module. Please try again.'
    });
  }
});

// POST /admin/courses/:id/modules/:moduleId/delete - Delete module
router.post('/courses/:id/modules/:moduleId/delete', requireAdmin, (req, res) => {
  const data = getCoursesData();
  const courseIndex = data.courses.findIndex(c => c.id === parseInt(req.params.id));
  
  if (courseIndex === -1) {
    return res.redirect('/admin/courses');
  }
  
  const course = data.courses[courseIndex];
  const moduleIndex = course.modules?.findIndex(m => m.id === parseInt(req.params.moduleId));
  
  if (moduleIndex === -1) {
    return res.redirect(`/admin/courses/${course.id}/modules`);
  }
  
  course.modules.splice(moduleIndex, 1);
  
  if (saveCoursesData(data)) {
    res.redirect(`/admin/courses/${course.id}/modules`);
  } else {
    res.render('admin/modules', {
      title: `Manage Modules - ${course.title} | Pastors LMS`,
      course: course,
      user: req.session.user,
      error: 'Failed to delete module. Please try again.'
    });
  }
});

module.exports = router;