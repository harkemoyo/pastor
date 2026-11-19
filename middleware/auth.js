/**
 * Authentication Middleware
 */
const fs = require('fs');
const path = require('path');

const COUNTRY_NAME_TO_CODE = {
  kenya: 'KE',
  ke: 'KE',
  uganda: 'UG',
  ug: 'UG',
  tanzania: 'TZ',
  tz: 'TZ',
  rwanda: 'RW',
  rw: 'RW',
  burundi: 'BI',
  bi: 'BI',
  'south sudan': 'SS',
  ss: 'SS',
  ethiopia: 'ET',
  et: 'ET',
  'dr congo': 'CD',
  drc: 'CD',
  congo: 'CD',
  cd: 'CD',
  somalia: 'SO',
  so: 'SO',
  nigeria: 'NG',
  ng: 'NG',
  ghana: 'GH',
  gh: 'GH',
  'south africa': 'ZA',
  za: 'ZA',
  zambia: 'ZM',
  zm: 'ZM',
  zimbabwe: 'ZW',
  zw: 'ZW',
  malawi: 'MW',
  mw: 'MW',
  mozambique: 'MZ',
  mz: 'MZ',
  egypt: 'EG',
  eg: 'EG',
  'united kingdom': 'GB',
  uk: 'GB',
  gb: 'GB',
  'united states': 'US',
  usa: 'US',
  us: 'US'
};

const PHONE_PREFIX_TO_CODE = [
  ['254', 'KE'],
  ['256', 'UG'],
  ['255', 'TZ'],
  ['250', 'RW'],
  ['257', 'BI'],
  ['211', 'SS'],
  ['251', 'ET'],
  ['243', 'CD'],
  ['252', 'SO'],
  ['234', 'NG'],
  ['233', 'GH'],
  ['260', 'ZM'],
  ['263', 'ZW'],
  ['265', 'MW'],
  ['258', 'MZ'],
  ['27', 'ZA'],
  ['20', 'EG'],
  ['44', 'GB'],
  ['1', 'US']
];

function resolveUserCountryCode(user) {
  if (!user || typeof user !== 'object') return null;

  if (user.country_code && /^[A-Za-z]{2}$/.test(user.country_code)) {
    return user.country_code.toUpperCase();
  }

  if (user.country) {
    const c = String(user.country).trim().toLowerCase();
    if (COUNTRY_NAME_TO_CODE[c]) return COUNTRY_NAME_TO_CODE[c];
  }

  if (user.phone) {
    const raw = String(user.phone).trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+') || digits.length >= 11) {
      for (const [prefix, code] of PHONE_PREFIX_TO_CODE) {
        if (digits.startsWith(prefix)) return code;
      }
    }
  }

  const locationText = [
    user.country,
    user.county,
    user.town,
    user.cohort,
    user.physical_address
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(uganda|kampala|wakiso|gulu|mbarara|jinja|entebbe|mbale|lira|arua|masaka|mukono|fort portal)\b/.test(locationText)) {
    return 'UG';
  }
  if (/\b(tanzania|dar es salaam|arusha|dodoma|mwanza|mbeya|morogoro|tanga|zanzibar|kilimanjaro|moshi)\b/.test(locationText)) {
    return 'TZ';
  }
  if (/\b(rwanda|kigali|butare|huye|musanze|rubavu|gisenyi)\b/.test(locationText)) {
    return 'RW';
  }
  if (/\b(burundi|bujumbura|gitega)\b/.test(locationText)) {
    return 'BI';
  }
  if (/\b(south sudan|juba|wau|malakal)\b/.test(locationText)) {
    return 'SS';
  }
  if (/\b(ethiopia|addis ababa|hawassa|bahir dar)\b/.test(locationText)) {
    return 'ET';
  }
  if (/\b(congo|drc|kinshasa|goma|bukavu|lubumbashi)\b/.test(locationText)) {
    return 'CD';
  }
  if (/\b(kenya|nairobi|nyeri|kiambu|kisumu|laikipia|mombasa|nakuru|eldoret|machakos|kajiado|meru|kakamega|bungoma|kilifi|nyandarua|murang|kirinyaga|embu|kitui|makueni|narok|kericho|bomet|kisii|nyamira|migori|homa bay|siaya|busia|vihiga|trans nzoia|nandi|baringo|turkana|nanyuki|kiawara|mweiga|kieni|kawangware|westlands)\b/.test(locationText)) {
    return 'KE';
  }

  if (user.phone) {
    const digits = String(user.phone).replace(/\D/g, '');
    if ((digits.startsWith('07') || digits.startsWith('01')) && digits.length === 10) {
      return 'KE';
    }
  }

  return null;
}

function findLocalUserForSession(sessionUser) {
  if (!sessionUser) return null;
  try {
    const usersPath = path.join(__dirname, '../data/users.json');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const uLower = (sessionUser.username || '').toLowerCase();
    const eLower = (sessionUser.email || '').toLowerCase();
    return users.find(u =>
      (uLower && u.username && u.username.toLowerCase() === uLower) ||
      (eLower && u.email && u.email.toLowerCase() === eLower) ||
      (uLower && u.student_id && u.student_id.toLowerCase() === uLower)
    ) || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  console.log(`[AUTH] Unauthenticated access to ${req.originalUrl}. Session exists: ${!!req.session}, User: ${!!req.session?.user}. Redirecting to /login`);
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

function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'super_admin') {
    return next();
  }
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    const backUrl = req.get('referer') || '/admin/courses';
    const sep = backUrl.includes('?') ? '&' : '?';
    return res.redirect(`${backUrl}${sep}error=${encodeURIComponent('Only a Super Admin can assign course or module lecturers.')}`);
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
  if (req.session && req.session.user && !req.session.user.country_code) {
    const localRecord = findLocalUserForSession(req.session.user);
    const code = resolveUserCountryCode(req.session.user) || resolveUserCountryCode(localRecord) || 'KE';
    req.session.user.country_code = code;
  }
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireTeacher,
  attachUser,
  resolveUserCountryCode
};
