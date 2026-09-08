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
  console.log('Admin check - Session user:', req.session?.user);
  console.log('Admin check - User role:', req.session?.user?.role);
  
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  // If not admin, redirect to login with error message
  return res.redirect('/login?error=admin_required');
}

function attachUser(req, res, next) {
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  attachUser
};
