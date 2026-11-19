const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../data/users.json');

function loadLocalUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function formatWhatsAppDigits(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  // Convert local East African leading 0 (e.g. 07xx / 01xx) to Kenya 254 prefix
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1);
  }
  return digits;
}

function buildInitials(name) {
  if (!name) return 'T';
  return String(name)
    .trim()
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'T';
}

function toPublicInstructor(user) {
  if (!user) return null;
  const fullName = (user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Instructor').trim();
  return {
    username: user.username,
    full_name: fullName,
    email: user.email || '',
    phone: user.phone || '',
    whatsapp_digits: formatWhatsAppDigits(user.phone),
    initials: buildInitials(fullName)
  };
}

function getTeachers(usersList) {
  const users = Array.isArray(usersList) ? usersList : loadLocalUsers();
  return users
    .filter(u => u && u.role === 'teacher' && u.status !== 'archived' && u.status !== 'suspended')
    .map(toPublicInstructor);
}

function findTeacherByUsername(username, usersList) {
  if (!username) return null;
  const users = Array.isArray(usersList) ? usersList : loadLocalUsers();
  const target = String(username).trim().toLowerCase();
  const found = users.find(u => u && u.username && u.username.toLowerCase() === target);
  return found ? toPublicInstructor(found) : null;
}

function resolveModuleInstructor(course, mod, usersList) {
  const users = Array.isArray(usersList) ? usersList : loadLocalUsers();
  if (mod && mod.instructor_username) {
    const modTeacher = findTeacherByUsername(mod.instructor_username, users);
    if (modTeacher) return { ...modTeacher, scope: 'module' };
  }
  if (course && course.instructor_username) {
    const courseTeacher = findTeacherByUsername(course.instructor_username, users);
    if (courseTeacher) return { ...courseTeacher, scope: 'course' };
  }
  return null;
}

function getTeacherAssignments(courses, teacherUsername) {
  if (!teacherUsername || !Array.isArray(courses)) return [];
  const target = String(teacherUsername).trim().toLowerCase();

  return courses.reduce((acc, course) => {
    const isCourseLecturer =
      course.instructor_username &&
      course.instructor_username.toLowerCase() === target;

    const allModules = Array.isArray(course.modules) ? course.modules : [];
    const assignedModules = allModules.filter(mod => {
      if (mod.instructor_username) {
        return mod.instructor_username.toLowerCase() === target;
      }
      return isCourseLecturer;
    });

    if (isCourseLecturer || assignedModules.length > 0) {
      acc.push({
        course,
        isCourseLecturer,
        assignedModules
      });
    }
    return acc;
  }, []);
}

module.exports = {
  formatWhatsAppDigits,
  getTeachers,
  findTeacherByUsername,
  resolveModuleInstructor,
  getTeacherAssignments
};
