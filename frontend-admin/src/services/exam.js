import { request } from './base.js';

// ── Exams ─────────────────────────────────────────────────────────────────────
export const listExams   = (status) => request('GET', `/api/admin/exams${status ? `?status=${status}` : ''}`);
export const getExam     = (id)     => request('GET', `/api/admin/exams/${id}`);
export const createExam  = (body)   => request('POST', '/api/admin/exams', body);
export const updateExam  = (id, b)  => request('PUT', `/api/admin/exams/${id}`, b);
export const deleteExam  = (id)     => request('DELETE', `/api/admin/exams/${id}`);
export const publishExam = (id)     => request('POST', `/api/admin/exams/${id}/publish`);
export const unpublishExam = (id)   => request('POST', `/api/admin/exams/${id}/unpublish`);

// ── Upload & parse ────────────────────────────────────────────────────────────
export async function uploadParseExam(file) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', '/api/admin/exams/upload-parse', form, true);
}

// ── Results ───────────────────────────────────────────────────────────────────
export const listResults = (examId) => request('GET', `/api/admin/results${examId ? `?exam_id=${examId}` : ''}`);
export const getResult   = (id)     => request('GET', `/api/exam/result/${id}`);

// ── Users ─────────────────────────────────────────────────────────────────────
export const listUsers        = ()           => request('GET', '/api/admin/users');
export const createUser       = (body)       => request('POST', '/api/admin/users', body);
export const deleteUser       = (id)         => request('DELETE', `/api/admin/users/${id}`);
export const assignUserGroup  = (uid, gid)   => request('PUT', `/api/admin/users/${uid}/group`, { group_id: gid });

// ── Groups ────────────────────────────────────────────────────────────────────
export const listGroups  = ()       => request('GET', '/api/admin/groups');
export const createGroup = (name)   => request('POST', '/api/admin/groups', { name });
export const deleteGroup = (id)     => request('DELETE', `/api/admin/groups/${id}`);

