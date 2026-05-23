import React, { useEffect, useState } from 'react';
import { listExams, publishExam, unpublishExam, deleteExam } from '../services/index.js';

const STATUS_COLORS = {
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  draft:     'bg-amber-100 text-amber-700 border-amber-200',
};

export default function ExamListPanel({ onEdit }) {
  const [exams, setExams]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [error, setError]     = useState('');

  const load = () => {
    setLoading(true);
    listExams()
      .then(setExams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function handlePublish(exam) {
    try {
      if (exam.status === 'published') await unpublishExam(exam.id);
      else await publishExam(exam.id);
      load();
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exam? This cannot be undone.')) return;
    try { await deleteExam(id); load(); }
    catch (e) { setError(e.message); }
  }

  const filtered = exams.filter((e) =>
    !filter || e.title.toLowerCase().includes(filter.toLowerCase()) || e.course_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-100">Exams</h2>
          <p className="text-sm text-gray-500">{exams.length} exam{exams.length !== 1 ? 's' : ''} total</p>
        </div>
        <input
          className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 w-60"
          placeholder="Search exams…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && <ErrBanner msg={error} onClose={() => setError('')} />}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((exam) => (
            <div key={exam.id} className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-200 truncate">{exam.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[exam.status] || 'bg-gray-100 text-gray-500'}`}>
                    {exam.status}
                  </span>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                  {exam.course_name && <span>Course: {exam.course_name}</span>}
                  {exam.level && <span>Level: {exam.level}</span>}
                  <span>{exam.duration_minutes} min</span>
                  <span>{exam.total_marks} marks</span>
                  <span>{exam.question_count} question{exam.question_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                <ActionBtn label="Edit" color="bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100" onClick={() => onEdit(exam.id)} />
                <ActionBtn
                  label={exam.status === 'published' ? 'Unpublish' : 'Publish'}
                  color={exam.status === 'published'
                    ? 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'}
                  onClick={() => handlePublish(exam)}
                />
                <ActionBtn label="Delete" color="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100" onClick={() => handleDelete(exam.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${color}`}>
      {label}
    </button>
  );
}

function ErrBanner({ msg, onClose }) {
  return (
    <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm flex justify-between">
      <span>{msg}</span>
      <button onClick={onClose} className="ml-4 font-bold">×</button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
      <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm font-medium">No exams found</p>
      <p className="text-xs">Create or upload an exam to get started.</p>
    </div>
  );
}
