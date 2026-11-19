const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireTeacher } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const {
  formatWhatsAppDigits,
  getTeacherAssignments,
  findTeacherByUsername
} = require('../utils/instructors');

const COURSES_FILE = path.join(__dirname, '../data/courses.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');
const ENROLMENTS_FILE = path.join(__dirname, '../data/enrolments.json');

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function getAllStudents() {
  let students = [];
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        students = data;
      }
    } catch {
      // fall back to local users.json
    }
  }
  if (!students.length) {
    students = readJson(USERS_FILE, []);
  }
  return students.filter(u => !u.role || u.role === 'student');
}

// GET /teacher/classes - Teacher's Assigned Courses, Modules & Student Contact Roster
router.get('/classes', requireTeacher, async (req, res) => {
  const user = req.session.user;
  const coursesData = readJson(COURSES_FILE, { courses: [] });
  const allCourses = coursesData.courses || [];
  const enrolments = readJson(ENROLMENTS_FILE, []);
  const allStudents = await getAllStudents();
  const isStaffAdmin = ['admin', 'super_admin'].includes(user.role);

  let assignments = [];
  if (user.role === 'teacher') {
    assignments = getTeacherAssignments(allCourses, user.username);
  } else {
    // Admin / Super Admin sees all courses that have an assigned lecturer (or all courses for overview)
    assignments = allCourses.map(course => ({
      course,
      isCourseLecturer: Boolean(course.instructor_username),
      assignedModules: (course.modules || []),
      courseInstructor: findTeacherByUsername(course.instructor_username)
    }));
  }

  const enrichedAssignments = assignments.map(item => {
    const courseEnrolments = enrolments.filter(
      e => Number(e.course_id) === Number(item.course.id) && e.status !== 'removed'
    );

    let studentsForCourse = [];
    if (courseEnrolments.length > 0) {
      studentsForCourse = courseEnrolments
        .map(enr => {
          const match = allStudents.find(
            s =>
              (s.student_id && s.student_id === enr.student_id) ||
              (s.username && s.username === enr.student_id)
          );
          if (!match) return null;
          return match;
        })
        .filter(Boolean);
    } else {
      // Default active cohort students when explicit per-course enrolment rows aren't set yet
      studentsForCourse = allStudents.filter(s => s.status !== 'archived' && s.status !== 'suspended' && s.status !== 'rejected');
    }

    const contactableStudents = studentsForCourse.map(s => {
      const fullName = (s.full_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || 'Pastor').trim();
      const waDigits = formatWhatsAppDigits(s.phone);
      const waMessage = encodeURIComponent(
        `Hello ${fullName}, this is ${user.full_name}, your ${item.course.code} (${item.course.title}) instructor at Pastors LMS.`
      );
      const emailSubject = encodeURIComponent(`${item.course.code} - Message from your Instructor (${user.full_name})`);
      const emailBody = encodeURIComponent(
        `Dear ${fullName},\n\nGrace and peace to you! I am writing as your instructor for ${item.course.code} (${item.course.title}).\n\n`
      );
      return {
        student_id: s.student_id || s.username || 'N/A',
        username: s.username || '',
        full_name: fullName,
        email: s.email || '',
        phone: s.phone || '',
        church_name: s.church_name || '',
        wa_url: waDigits ? `https://wa.me/${waDigits}?text=${waMessage}` : '',
        mailto_url: s.email ? `mailto:${s.email}?subject=${emailSubject}&body=${emailBody}` : ''
      };
    });

    return {
      ...item,
      students: contactableStudents
    };
  });

  res.render('teacher-classes', {
    title: 'My Assigned Classes | Pastors LMS',
    user,
    isStaffAdmin,
    assignments: enrichedAssignments,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

module.exports = router;
