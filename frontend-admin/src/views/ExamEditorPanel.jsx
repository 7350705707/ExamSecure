import React, { useEffect, useState } from 'react';
import { getExam, createExam, updateExam } from '../services/index.js';
import QuestionCard from '../components/QuestionCard.jsx';

const BLANK_EXAM = {
  title: '', course_name: '', level: '', description: '',
  duration_minutes: 60, pass_marks: 0, total_marks: 0, instructions: '', questions: [],
};

const BLANK_Q = {
  id: '', type: 'mcq', text: '', options: ['', '', '', ''],
  marks: 1, answer_key: '', rubric: '',
};

export default function ExamEditorPanel({ examId, onSaved }) {
  const [form, setForm]         = useState({ ...BLANK_EXAM });
  const [editQIdx, setEditQIdx] = useState(null);
  const [qForm, setQForm]       = useState(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const isNew = !examId;

  // ── Validation ────────────────────────────────────────────────────────────
  const mcqOptionWarnings = form.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.type === 'mcq' && (q.options || []).filter((o) => o.trim()).length < 4);

  const emptyAnswerErrors = form.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => !q.answer_key || !String(q.answer_key).trim());

  const hasSaveBlocker = mcqOptionWarnings.length > 0 || emptyAnswerErrors.length > 0;

  useEffect(() => {
    if (!isNew) {
      getExam(examId)
        .then((e) => setForm({ ...e, questions: e.questions || [] }))
        .catch((err) => setError(err.message));
    } else {
      setForm({ ...BLANK_EXAM });
    }
  }, [examId]);

  function fieldChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        duration_minutes: Number(form.duration_minutes),
        pass_marks: Number(form.pass_marks),
        total_marks: form.questions.reduce((s, q) => s + Number(q.marks), 0),
      };
      if (isNew) await createExam(payload);
      else await updateExam(examId, payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openAddQ() {
    setQForm({ ...BLANK_Q, id: `q${Date.now()}` });
    setEditQIdx('new');
  }

  function openEditQ(idx) {
    setQForm({ ...form.questions[idx] });
    setEditQIdx(idx);
  }

  function saveQ() {
    if (!qForm.text.trim()) return;
    setForm((f) => {
      const qs = [...f.questions];
      if (editQIdx === 'new') qs.push(qForm);
      else qs[editQIdx] = qForm;
      return { ...f, questions: qs };
    });
    setQForm(null); setEditQIdx(null);
  }

  function deleteQ(idx) {
    setForm((f) => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-100">{isNew ? 'Create Exam' : 'Edit Exam'}</h2>
          <p className="text-sm text-gray-500">{form.questions.length} question{form.questions.length !== 1 ? 's' : ''} · {form.questions.reduce((s, q) => s + Number(q.marks), 0)} marks</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSaved} className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition border border-gray-600">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || hasSaveBlocker} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : 'Save Exam'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

      {mcqOptionWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-4 py-2 text-sm flex items-start gap-2">
          <span className="mt-0.5">⚠</span>
          <span>
            {mcqOptionWarnings.length} MCQ question{mcqOptionWarnings.length !== 1 ? 's' : ''} (
            {mcqOptionWarnings.map(({ i }) => `#${i + 1}`).join(', ')}) have fewer than 4 options — please edit before saving.
          </span>
        </div>
      )}

      {emptyAnswerErrors.length > 0 && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm flex items-start gap-2">
          <span className="mt-0.5">✕</span>
          <span>
            {emptyAnswerErrors.length} question{emptyAnswerErrors.length !== 1 ? 's' : ''} (
            {emptyAnswerErrors.map(({ i }) => `#${i + 1}`).join(', ')}) have no answer set — please add an answer before saving.
          </span>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title" name="title" value={form.title} onChange={fieldChange} required />
        <Field label="Course / Subject" name="course_name" value={form.course_name} onChange={fieldChange} />
        <Field label="Level" name="level" value={form.level} onChange={fieldChange} placeholder="e.g. A-Level, Grade 10" />
        <Field label="Duration (minutes)" name="duration_minutes" type="number" value={form.duration_minutes} onChange={fieldChange} />
        <Field label="Pass Marks" name="pass_marks" type="number" value={form.pass_marks} onChange={fieldChange} />
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Description</label>
          <textarea name="description" rows={2} value={form.description} onChange={fieldChange}
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 resize-none" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Instructions</label>
          <textarea name="instructions" rows={2} value={form.instructions} onChange={fieldChange}
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 resize-none" />
        </div>
      </div>

      {/* Questions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Questions</h3>
        <button onClick={openAddQ} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition">
          + Add Question
        </button>
      </div>

      {form.questions.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No questions yet. Click "+ Add Question".</p>
      )}

      <div className="flex flex-col gap-3">
        {form.questions.map((q, i) => (
          <QuestionCard
            key={q.id || i}
            question={q}
            index={i}
            onEdit={() => openEditQ(i)}
            onDelete={() => deleteQ(i)}
          />
        ))}
      </div>

      {/* Question modal */}
      {qForm && (
        <QModal
          qForm={qForm}
          setQForm={setQForm}
          onSave={saveQ}
          onCancel={() => { setQForm(null); setEditQIdx(null); }}
        />
      )}
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', required, placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500" />
    </div>
  );
}

const Q_TYPES = ['mcq', 'true_false', 'fill_blank', 'short_answer'];

function QModal({ qForm, setQForm, onSave, onCancel }) {
  function upd(k, v) { setQForm((f) => ({ ...f, [k]: v })); }
  function updOption(i, v) {
    const opts = [...(qForm.options || ['', '', '', ''])];
    opts[i] = v;
    upd('options', opts);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-gray-700 shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        <h3 className="font-bold text-gray-100 text-base">Question Editor</h3>

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Type</label>
            <select value={qForm.type} onChange={(e) => upd('type', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500">
              {Q_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', '-')}</option>)}
            </select>
          </div>
          <div className="w-28">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Marks</label>
            <input type="number" min={1} value={qForm.marks} onChange={(e) => upd('marks', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Question Text</label>
          <textarea rows={3} value={qForm.text} onChange={(e) => upd('text', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 resize-none" />
        </div>

        {qForm.type === 'mcq' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Options</label>
            {(qForm.options || ['', '', '', '']).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-500 w-4">{String.fromCharCode(65+i)}</span>
                <input value={opt} onChange={(e) => updOption(i, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider block mb-1">
            <span className={!qForm.answer_key || !String(qForm.answer_key).trim() ? "text-red-400" : "text-gray-400"}>
              Answer Key
            </span>
            {(!qForm.answer_key || !String(qForm.answer_key).trim()) && (
              <span className="ml-1 text-red-500 text-xs font-bold">* Required</span>
            )}
          </label>
          {qForm.type === 'true_false' ? (
            <select value={qForm.answer_key} onChange={(e) => upd('answer_key', e.target.value)}
              className={`px-3 py-2 rounded-lg border bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 ${
                !qForm.answer_key || !String(qForm.answer_key).trim()
                  ? 'border-red-500 ring-1 ring-red-500'
                  : 'border-gray-700'
              }`}>
              <option value="">-- select --</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          ) : (
            <input value={qForm.answer_key} onChange={(e) => upd('answer_key', e.target.value)}
              placeholder={qForm.type === 'mcq' ? 'e.g. A or exact option text' : 'Enter the correct answer'}
              className={`w-full px-3 py-2 rounded-lg border bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 ${
                !qForm.answer_key || !String(qForm.answer_key).trim()
                  ? 'border-red-500 ring-1 ring-red-500'
                  : 'border-gray-700'
              }`} />
          )}
          {(!qForm.answer_key || !String(qForm.answer_key).trim()) && (
            <p className="text-red-400 text-xs mt-1">⚠ Answer key is required — this question will block saving.</p>
          )}
        </div>

        {qForm.type === 'short_answer' && (
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Rubric (LLM grading hint)</label>
            <textarea rows={2} value={qForm.rubric || ''} onChange={(e) => upd('rubric', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 resize-none" />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">Cancel</button>
          <button onClick={onSave}   className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition">Save Question</button>
        </div>
      </div>
    </div>
  );
}
