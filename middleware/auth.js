/**
 * Authentication Middleware
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  const allowedRoles = ['admin', 'super_admin'];
  const userRole = req.session?.user?.role;

  if (req.session && req.session.user && allowedRoles.includes(userRole)) {
    return next();
  }

  return res.redirect('/login?error=admin_required');
}

function requireTeacher(req, res, next) {
  const allowedRoles = ['teacher', 'admin', 'super_admin'];
  const userRole = req.session?.user?.role;

  if (req.session && req.session.user && allowedRoles.includes(userRole)) {
    return next();
  }

  if (req.session && req.session.user) {
    return res.redirect('/library');
  }
  return res.redirect('/login');
}

function attachUser(req, res, next) {
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireTeacher,
  attachUser
};
