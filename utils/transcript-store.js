const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase');

const TRANSCRIPTS_FILE = path.join(__dirname, '../data/transcript-records.json');
const TRANSCRIPTS_TMP = path.join(os.tmpdir(), 'pastors-lms-transcript-records.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');
const HMAC_SECRET = process.env.SESSION_SECRET || 'pastors-lms-secure-key-nairobi-2026';

const DEFAULT_TOKEN_FEE = 'KES 500';

function readJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw && raw.trim()) return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return fallback;
}

function readAllLocalRecords() {
  for (const p of [TRANSCRIPTS_FILE, TRANSCRIPTS_TMP]) {
    const parsed = readJsonFile(p, null);
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

function writeAllLocalRecords(records) {
  const payload = JSON.stringify(records, null, 2);
  try {
    fs.writeFileSync(TRANSCRIPTS_FILE, payload, 'utf8');
    return true;
  } catch {
    try {
      fs.writeFileSync(TRANSCRIPTS_TMP, payload, 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}

function normalizeScope(courseId) {
  if (!courseId || String(courseId).toLowerCase() === 'all') return 'all';
  const num = parseInt(courseId, 10);
  return Number.isFinite(num) && num > 0 ? `course:${num}` : 'all';
}

function buildRecordId(username, scope) {
  return `${String(username || '').toLowerCase()}::${scope}`;
}

function generateVerificationCode() {
  // 16 random hex chars = 64 bits of cryptographic entropy (unguessable, prevents enumeration)
  return `IDA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

function computeIntegritySignature(rec) {
  const canonical = [
    rec.verification_code || '',
    String(rec.student_id || rec.student_username || '').toUpperCase(),
    rec.course_scope || 'all',
    rec.transcript_status || 'draft',
    rec.issued_at || ''
  ].join('|');
  return crypto.createHmac('sha256', HMAC_SECRET).update(canonical).digest('hex').slice(0, 24);
}

async function listTranscriptRecords() {
  const local = readAllLocalRecords();
  if (!supabaseAdmin) return local;
  try {
    const { data, error } = await supabaseAdmin
      .from('transcript_records')
      .select('*');
    if (!error && Array.isArray(data) && data.length > 0) {
      const byId = new Map();
      local.forEach(r => byId.set(r.id, r));
      data.forEach(r => byId.set(r.id, { ...byId.get(r.id), ...r }));
      return Array.from(byId.values());
    }
  } catch {
    // fallback to local
  }
  return local;
}

async function getTranscriptRecord(username, courseScope = 'all') {
  const scope = normalizeScope(courseScope);
  const id = buildRecordId(username, scope);
  const all = await listTranscriptRecords();
  return all.find(r => r.id === id) || null;
}

async function saveTranscriptRecord(record) {
  const now = new Date().toISOString();
  const normalizedScope = normalizeScope(record.course_scope);
  const id = buildRecordId(record.student_username, normalizedScope);

  const existing = (await listTranscriptRecords()).find(r => r.id === id) || {};
  const verificationCode = record.regenerate_code
    ? generateVerificationCode()
    : (record.verification_code || existing.verification_code || generateVerificationCode());

  const merged = {
    id,
    verification_code: verificationCode,
    student_username: String(record.student_username || existing.student_username || '').toLowerCase(),
    student_id: record.student_id || existing.student_id || '',
    student_name: record.student_name || existing.student_name || '',
    student_cohort: record.student_cohort || existing.student_cohort || 'East Africa Pastoral Cohort',
    course_scope: normalizedScope,
    course_label: record.course_label || existing.course_label || (normalizedScope === 'all' ? 'Cumulative Academic Record' : normalizedScope),
    course_overrides: record.course_overrides !== undefined ? record.course_overrides : (existing.course_overrides || {}),
    registrar_notes: record.registrar_notes !== undefined ? record.registrar_notes : (existing.registrar_notes || ''),
    fee_amount: record.fee_amount || existing.fee_amount || DEFAULT_TOKEN_FEE,
    payment_status: record.payment_status || existing.payment_status || 'unpaid',
    payment_method: record.payment_method !== undefined ? record.payment_method : (existing.payment_method || ''),
    payment_reference: record.payment_reference !== undefined ? record.payment_reference : (existing.payment_reference || ''),
    payment_submitted_at: record.payment_submitted_at !== undefined ? record.payment_submitted_at : (existing.payment_submitted_at || null),
    payment_verified_at: record.payment_verified_at !== undefined ? record.payment_verified_at : (existing.payment_verified_at || null),
    payment_verified_by: record.payment_verified_by !== undefined ? record.payment_verified_by : (existing.payment_verified_by || null),
    transcript_status: record.transcript_status || existing.transcript_status || 'draft',
    summary_snapshot: record.summary_snapshot || existing.summary_snapshot || null,
    issued_at: record.issued_at !== undefined ? record.issued_at : (existing.issued_at || null),
    issued_by: record.issued_by !== undefined ? record.issued_by : (existing.issued_by || null),
    updated_at: now
  };
  merged.integrity_sig = computeIntegritySignature(merged);

  const local = readAllLocalRecords();
  const idx = local.findIndex(r => r.id === id);
  if (idx >= 0) local[idx] = merged;
  else local.unshift(merged);
  writeAllLocalRecords(local);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('transcript_records').upsert(merged, { onConflict: 'id' });
    } catch {
      // local JSON already saved
    }
  }
  return merged;
}

/**
 * Check if the student genuinely exists in the school registry (no security leak).
 */
async function confirmStudentExistsInSchool(studentUsername, studentId) {
  const uname = String(studentUsername || '').toLowerCase();
  const sid = String(studentId || '').toLowerCase();

  // 1. Check Supabase students table if configured
  if (supabaseAdmin) {
    try {
      if (uname) {
        const { data } = await supabaseAdmin
          .from('students')
          .select('id, status, full_name, student_id, cohort')
          .ilike('username', uname)
          .maybeSingle();
        if (data && data.status !== 'rejected') {
          return {
            exists: true,
            standing: data.status || 'active',
            full_name: data.full_name,
            student_id: data.student_id,
            cohort: data.cohort
          };
        }
      }
    } catch {
      // fall through to local registry
    }
  }

  // 2. Check local school users registry
  const users = readJsonFile(USERS_FILE, []);
  const matched = (Array.isArray(users) ? users : []).find(u => {
    if (!u) return false;
    return (
      (uname && String(u.username || '').toLowerCase() === uname) ||
      (sid && String(u.student_id || '').toLowerCase() === sid)
    );
  });

  if (matched && matched.status !== 'rejected') {
    return {
      exists: true,
      standing: matched.status || 'active',
      full_name: matched.full_name || [matched.first_name, matched.last_name].filter(Boolean).join(' ') || matched.username,
      student_id: matched.student_id || matched.username,
      cohort: matched.cohort || 'East Africa Pastoral Cohort'
    };
  }
  return { exists: false };
}

/**
 * Privacy-safe public QR code verification lookup.
 * Returns ONLY non-sensitive public school verification fields (zero email/phone/credentials).
 */
async function verifyTranscriptByCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^IDA-[A-F0-9]{12,24}$/.test(code)) {
    return { valid: false, reason: 'invalid_format' };
  }

  const all = await listTranscriptRecords();
  const record = all.find(r => String(r.verification_code || '').toUpperCase() === code);
  if (!record) {
    return { valid: false, reason: 'not_found' };
  }

  const expectedSig = computeIntegritySignature(record);
  const sigValid = Boolean(record.integrity_sig && record.integrity_sig === expectedSig);
  const schoolCheck = await confirmStudentExistsInSchool(record.student_username, record.student_id);

  if (!sigValid || !schoolCheck.exists) {
    return { valid: false, reason: 'registry_mismatch' };
  }

  if (record.transcript_status === 'revoked') {
    return {
      valid: false,
      revoked: true,
      reason: 'revoked',
      verification_code: record.verification_code,
      student_name: schoolCheck.full_name || record.student_name
    };
  }

  if (record.transcript_status !== 'issued' || record.payment_status !== 'paid') {
    return { valid: false, reason: 'not_issued' };
  }

  // Strictly minimal, privacy-safe verification payload (NO email, phone, address, username, or receipt info)
  return {
    valid: true,
    existsInSchool: true,
    verification_code: record.verification_code,
    student_name: schoolCheck.full_name || record.student_name,
    student_id: schoolCheck.student_id || record.student_id || 'Registered',
    student_standing: schoolCheck.standing || 'active',
    cohort: schoolCheck.cohort || record.student_cohort || 'East Africa Pastoral Cohort',
    course_label: record.course_label || 'Official Academic Transcript',
    summary: record.summary_snapshot || null,
    registrar_notes: record.registrar_notes || '',
    issued_at: record.issued_at
  };
}

module.exports = {
  DEFAULT_TOKEN_FEE,
  normalizeScope,
  getTranscriptRecord,
  saveTranscriptRecord,
  verifyTranscriptByCode
};
