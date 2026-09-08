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
  const users = getUsers();
  const pendingUsers = users.filter(u => u.approval_status === 'pending');
  const approvedUsers = users.filter(u => u.approval_status === 'approved');
  const rejectedUsers = users.filter(u => u.approval_status === 'rejected');
  
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

module.exports = router;