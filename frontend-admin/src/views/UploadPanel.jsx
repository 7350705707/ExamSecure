import React, { useState, useRef } from 'react';
import { uploadParseExam, createExam } from '../services/index.js';

// ── Inline question editor ─────────────────────────────────────────────────
function QuestionEditor({ question, index, onSave, onCancel }) {
  const [q, setQ] = useState(() => ({
    ...question,
    options: question.options ? [...question.options] : [],
  }));

  const set = (field, val) => setQ(prev => ({ ...prev, [field]: val }));

  function setOption(oi, val) {
    setQ(prev => {
      const opts = [...prev.options];
      opts[oi] = val;
      return { ...prev, options: opts };
    });
  }

  function removeOption(oi) {
    setQ(prev => {
      const opts = prev.options.filter((_, idx) => idx !== oi);
      const ak = prev.answer_key === prev.options[oi] ? '' : prev.answer_key;
      return { ...prev, options: opts, answer_key: ak };
    });
  }

  const isMcq = q.type === 'mcq';
  const needsMoreOptions = isMcq && q.options.length < 4;

  return (
    <div className="bg-gray-800 border border-indigo-500 rounded-xl p-4 flex flex-col gap-3">
      {/* Top row: type, marks */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-gray-400 shrink-0">Q{index + 1}</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400">Type</label>
          <select value={q.type} onChange={e => set('type', e.target.value)}
            className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-200 outline-none focus:border-indigo-500">
            <option value="mcq">MCQ</option>
            <option value="short">Short Answer</option>
            <option value="long">Long Answer</option>
            <option value="true_false">True / False</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400">Marks</label>
          <input type="number" value={q.marks} min={1}
            onChange={e => set('marks', Number(e.target.value))}
            className="w-16 text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-200 outline-none focus:border-indigo-500" />
        </div>
      </div>

      {/* Question text */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Question Text</label>
        <textarea value={q.text} onChange={e => set('text', e.target.value)} rows={2}
          className="w-full text-sm px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-gray-200 outline-none focus:border-indigo-500 resize-y" />
      </div>

      {/* MCQ options */}
      {isMcq && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Options <span className="text-gray-600">(click radio = correct answer)</span></label>
            {needsMoreOptions && (
              <span className="text-xs text-amber-400 font-semibold">⚠ {q.options.length}/4 options</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-5 shrink-0">{String.fromCharCode(65 + oi)}.</span>
                <input value={opt} onChange={e => setOption(oi, e.target.value)}
                  className="flex-1 text-sm px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-200 outline-none focus:border-indigo-500" />
                <input type="radio" name={`ans_${index}`} checked={q.answer_key === opt && opt !== ''}
                  onChange={() => set('answer_key', opt)} title="Mark as correct" />
                <button onClick={() => removeOption(oi)} className="text-red-400 hover:text-red-300 text-sm px-1">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setQ(prev => ({ ...prev, options: [...prev.options, ''] }))}
            className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">+ Add option</button>
        </div>
      )}

      {/* True/False */}
      {q.type === 'true_false' && (
        <div className="flex items-center gap-4">
          <label className="text-xs text-gray-400">Correct answer:</label>
          {['True', 'False'].map(val => (
            <label key={val} className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
              <input type="radio" name={`tf_${index}`} checked={q.answer_key === val}
                onChange={() => set('answer_key', val)} />
              {val}
            </label>
          ))}
        </div>
      )}

      {/* Short / Long answer key */}
      {(q.type === 'short' || q.type === 'long') && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">Expected Answer / Rubric</label>
          <textarea value={q.answer_key || ''} onChange={e => set('answer_key', e.target.value)} rows={2}
            className="w-full text-sm px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-gray-200 outline-none focus:border-indigo-500 resize-y" />
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600">
          Cancel
        </button>
        <button onClick={() => onSave(q)}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
          Save
        </button>
      </div>
    </div>
  );
}

// ── Read-only question card ────────────────────────────────────────────────
function QuestionCard({ q, index, onEdit, onRemove }) {
  const isMcq = q.type === 'mcq';
  const lowOptions = isMcq && (!q.options || q.options.length < 4);

  return (
    <div className={`bg-gray-900 rounded-xl border p-4 ${lowOptions ? 'border-amber-500' : 'border-gray-700'}`}>
      <div className="flex items-start gap-2 flex-wrap mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200 font-semibold">{q.type}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600 font-semibold">{q.marks} mk</span>
        {lowOptions && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 font-semibold">
            ⚠ {q.options?.length || 0}/4 options
          </span>
        )}
        <span className="text-xs text-gray-500 ml-auto">#{index + 1}</span>
        <button onClick={onEdit} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">Edit</button>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 font-semibold">Remove</button>
      </div>
      <p className="text-sm text-gray-200 font-medium">{q.text}</p>
      {q.options?.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {q.options.map((o, oi) => (
            <li key={oi} className={`text-xs px-2 py-0.5 rounded ${o === q.answer_key ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-400'}`}>
              {String.fromCharCode(65 + oi)}. {o}
            </li>
          ))}
        </ul>
      )}
      {q.answer_key && !isMcq && (
        <p className="text-xs text-emerald-600 mt-1">Answer: {q.answer_key}</p>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export default function UploadPanel({ onSaved }) {
  const [dragging, setDragging]     = useState(false);
  const [file, setFile]             = useState(null);
  const [parsed, setParsed]         = useState(null);
  const [title, setTitle]           = useState('');
  const [course, setCourse]         = useState('');
  const [duration, setDuration]     = useState(60);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [editingIdx, setEditingIdx] = useState(null); // null | number | 'new'
  const inputRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }

  function acceptFile(f) {
    if (!f.name.toLowerCase().endsWith('.json')) { setError('Only .json files are accepted.'); return; }
    setFile(f); setParsed(null); setError('');
  }

  async function handleParse() {
    if (!file) return;
    setLoading(true); setError('');
    try {
      const result = await uploadParseExam(file);
      setParsed(result.questions || []);
      setTitle(result.title || file.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function saveQuestion(idx, q) {
    if (idx === 'new') setParsed(prev => [...prev, q]);
    else setParsed(prev => prev.map((item, i) => i === idx ? q : item));
    setEditingIdx(null);
  }

  function removeQuestion(idx) {
    setParsed(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  const mcqWarnings = parsed ? parsed.filter(q => q.type === 'mcq' && (!q.options || q.options.length < 4)).length : 0;

  async function handleSave() {
    if (!parsed || !title.trim()) { setError('Provide a title before saving.'); return; }
    if (mcqWarnings > 0) { setError(`Fix ${mcqWarnings} MCQ question(s) with fewer than 4 options first.`); return; }
    setSaving(true); setError('');
    try {
      const total = parsed.reduce((s, q) => s + Number(q.marks || 1), 0);
      await createExam({
        title: title.trim(),
        course_name: course.trim(),
        duration_minutes: Number(duration),
        total_marks: total,
        pass_marks: Math.round(total * 0.5),
        questions: parsed,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const newTemplate = { type: 'mcq', text: '', marks: 1, options: ['', '', '', ''], answer_key: '' };

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-gray-100">Upload Exam File</h2>
        <p className="text-sm text-gray-500">Upload a JSON file, then edit questions, marks, and types before saving.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current.click()}
        className={`rounded-xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition
          ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-700 bg-gray-900 hover:bg-gray-800'}`}
      >
        <input ref={inputRef} type="file" accept=".json" className="hidden"
          onChange={(e) => { if (e.target.files[0]) acceptFile(e.target.files[0]); }} />
        <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm font-semibold text-gray-300">
          {file ? file.name : 'Drag & drop or click to select a file'}
        </p>
        <p className="text-xs text-gray-500">Supported: JSON · Max 50 MB</p>
      </div>

      {file && !parsed && (
        <button onClick={handleParse} disabled={loading}
          className="self-start px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition disabled:opacity-50">
          {loading ? 'Parsing…' : 'Parse File'}
        </button>
      )}

      {parsed && (
        <>
          {/* Exam metadata */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Exam Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Course</label>
                <input value={course} onChange={(e) => setCourse(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Duration (min)</label>
                <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          {/* MCQ warning banner */}
          {mcqWarnings > 0 && (
            <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-4 py-2 text-sm">
              ⚠ {mcqWarnings} MCQ question{mcqWarnings > 1 ? 's have' : ' has'} fewer than 4 options — please edit before saving.
            </div>
          )}

          {/* Questions list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                Questions ({parsed.length}) &nbsp;
                <span className="text-gray-500 font-normal normal-case">
                  Total: {parsed.reduce((s, q) => s + Number(q.marks || 1), 0)} marks
                </span>
              </h3>
              <button onClick={() => setEditingIdx('new')} disabled={editingIdx !== null}
                className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50">
                + Add Question
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {parsed.map((q, i) =>
                editingIdx === i ? (
                  <QuestionEditor key={i} question={q} index={i}
                    onSave={(updated) => saveQuestion(i, updated)}
                    onCancel={() => setEditingIdx(null)} />
                ) : (
                  <QuestionCard key={i} q={q} index={i}
                    onEdit={() => { setEditingIdx(null); setTimeout(() => setEditingIdx(i), 0); }}
                    onRemove={() => removeQuestion(i)} />
                )
              )}

              {editingIdx === 'new' && (
                <QuestionEditor question={newTemplate} index={parsed.length}
                  onSave={(q) => saveQuestion('new', q)}
                  onCancel={() => setEditingIdx(null)} />
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 sticky bottom-4">
            <button onClick={handleSave} disabled={saving || editingIdx !== null}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition disabled:opacity-50">
              {saving ? 'Saving…' : `Save Exam (${parsed.length} questions)`}
            </button>
            <button onClick={() => { setParsed(null); setFile(null); setEditingIdx(null); }}
              className="px-4 py-2.5 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}