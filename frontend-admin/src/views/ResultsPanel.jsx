import React, { useEffect, useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { listResults, reviewSession, updateAnswerScore, releaseResult, releaseGroupResults } from '../services/index.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

function pct(score, total) {
  if (!total) return '—';
  return `${Math.round((score / total) * 100)}%`;
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(examTitle, rows) {
  const data = [
    ['Exam', examTitle],
    [],
    ['#', 'Army No', 'Rank', 'Name', 'Unit', 'Score', 'Out of', 'Percentage', 'Submitted At'],
    ...rows.map((r, i) => [
      i + 1,
      r.username,
      r.rank || '—',
      r.full_name || r.username,
      r.unit || '—',
      r.score ?? 0,
      r.total_marks ?? '—',
      total(r.score, r.total_marks),
      r.end_time ? new Date(r.end_time).toLocaleString() : '—',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 20 },
    { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 22 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.writeFile(wb, `${examTitle.replace(/[^a-z0-9]/gi, '_')}_results.xlsx`);
}

// ── DOCX export (HTML-based, opened by Word) ──────────────────────────────────
function exportDocx(examTitle, rows) {
  const rows_html = rows.map((r, i) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">${i + 1}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;">${r.username}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;">${r.rank || '—'}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;">${r.full_name || r.username}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;">${r.unit || '—'}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">${r.score ?? 0}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">${r.total_marks ?? '—'}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">${total(r.score, r.total_marks)}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;">${r.end_time ? new Date(r.end_time).toLocaleString() : '—'}</td>
    </tr>`).join('');

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'
    xmlns='http://www.w3.org/TR/REC-html40'>
  <head><meta charset='utf-8'><title>${examTitle} Results</title></head>
  <body style="font-family:Calibri,Arial,sans-serif;">
    <h1 style="font-size:18pt;">${examTitle} — Results</h1>
    <p style="color:#555;">Generated: ${new Date().toLocaleString()}</p>
    <table style="border-collapse:collapse;width:100%;margin-top:16px;">
      <thead style="background:#1e40af;color:#fff;">
        <tr>
          <th style="padding:8px 10px;border:1px solid #ccc;">#</th>
          <th style="padding:8px 10px;border:1px solid #ccc;text-align:left;">Army No</th>
          <th style="padding:8px 10px;border:1px solid #ccc;text-align:left;">Rank</th>
          <th style="padding:8px 10px;border:1px solid #ccc;text-align:left;">Name</th>
          <th style="padding:8px 10px;border:1px solid #ccc;text-align:left;">Unit</th>
          <th style="padding:8px 10px;border:1px solid #ccc;">Score</th>
          <th style="padding:8px 10px;border:1px solid #ccc;">Out of</th>
          <th style="padding:8px 10px;border:1px solid #ccc;">Percentage</th>
          <th style="padding:8px 10px;border:1px solid #ccc;text-align:left;">Submitted At</th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>
  </body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${examTitle.replace(/[^a-z0-9]/gi, '_')}_results.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

function total(score, totalMarks) {
  if (!totalMarks) return '—';
  return `${Math.round((score / totalMarks) * 100)}%`;
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score, total: tot }) {
  const p = tot ? (score / tot) * 100 : 0;
  const color =
    p >= 80 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
    : p >= 50 ? 'bg-amber-100 text-amber-700 border-amber-300'
    : 'bg-red-100 text-red-700 border-red-300';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {score}/{tot} ({pct(score, tot)})
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function ResultsPanel() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterExam, setFilter] = useState('');
  const [reviewId, setReviewId] = useState(null);

  function reload() {
    listResults()
      .then((r) => setResults(r || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  // Group results by exam_id
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (!map.has(r.exam_id)) {
        map.set(r.exam_id, { exam_id: r.exam_id, exam_title: r.exam_title, rows: [] });
      }
      map.get(r.exam_id).rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.exam_title.localeCompare(b.exam_title));
  }, [results]);

  const examOptions = grouped.map((g) => ({ id: g.exam_id, title: g.exam_title }));
  const displayed = filterExam
    ? grouped.filter((g) => String(g.exam_id) === String(filterExam))
    : grouped;

  const totalSubmissions = results.length;

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-100">Results</h2>
          <p className="text-sm text-gray-500">
            {totalSubmissions} submission{totalSubmissions !== 1 ? 's' : ''} across {grouped.length} exam{grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        <select
          value={filterExam}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All exams</option>
          {examOptions.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : displayed.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-16">No results found.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {displayed.map((group) => (
            <ExamGroup key={group.exam_id} group={group} onReview={setReviewId} onRefresh={reload} />
          ))}
        </div>
      )}

      {reviewId && (
        <ReviewModal
          sessionId={reviewId}
          onClose={() => setReviewId(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

// ── Exam group card ───────────────────────────────────────────────────────────
function ExamGroup({ group, onReview, onRefresh }) {
  const { exam_id, exam_title, rows } = group;
  const avg = rows.length
    ? rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length
    : 0;
  const totalMarks = rows[0]?.total_marks ?? 0;
  const [releasing, setReleasing] = useState(null); // session_id or 'group'

  async function handleReleaseOne(sessionId) {
    setReleasing(sessionId);
    try { await releaseResult(sessionId); onRefresh(); }
    catch (e) { alert('Failed: ' + e.message); }
    finally { setReleasing(null); }
  }

  async function handleReleaseGroup() {
    if (!confirm(`Release results for ALL students in "${exam_title}"?`)) return;
    const groupId = rows[0]?.group_id ?? null;
    setReleasing('group');
    try { await releaseGroupResults(exam_id, groupId); onRefresh(); }
    catch (e) { alert('Failed: ' + e.message); }
    finally { setReleasing(null); }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Group header */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 border-b border-gray-700 bg-gray-800/60">
        <div>
          <h3 className="font-bold text-gray-100 text-base">{exam_title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {rows.length} student{rows.length !== 1 ? 's' : ''} ·
            Avg: <span className="text-indigo-400 font-medium">
              {avg.toFixed(1)}/{totalMarks} ({pct(avg, totalMarks)})
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportExcel(exam_title, rows)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition flex items-center gap-1.5"
          >
            ↓ Excel
          </button>
          <button
            onClick={() => exportDocx(exam_title, rows)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-600 text-white transition flex items-center gap-1.5"
          >
            ↓ Word
          </button>
          <button
            onClick={handleReleaseGroup}
            disabled={releasing === 'group'}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
          >
            {releasing === 'group' ? 'Releasing…' : '🔓 Release All'}
          </button>
        </div>
      </div>

      {/* Student table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2">#</th>
              <th className="text-left px-5 py-2">Army No</th>
              <th className="text-left px-5 py-2">Rank</th>
              <th className="text-left px-5 py-2">Name</th>
              <th className="text-left px-5 py-2">Unit</th>
              <th className="text-center px-5 py-2">Score</th>
              <th className="text-center px-5 py-2">Out of</th>
              <th className="text-center px-5 py-2">%</th>
              <th className="text-left px-5 py-2">Submitted</th>
              <th className="text-center px-5 py-2">Review</th>
              <th className="text-center px-5 py-2">Release</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map((r, i) => (
                <tr
                  key={r.id}
                  className="border-t border-gray-800 hover:bg-gray-800/40 transition"
                >
                  <td className="px-5 py-3 text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-300">{r.username}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{r.rank || '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-200">
                    {r.full_name || r.username}
                    {r.reviewed && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-indigo-900 text-indigo-300 font-semibold border border-indigo-700">Reviewed</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">{r.unit || '—'}</td>
                  <td className="px-5 py-3 text-center">
                    <ScoreBadge score={r.score ?? 0} total={r.total_marks ?? 0} />
                  </td>
                  <td className="px-5 py-3 text-center text-gray-400">{r.total_marks ?? '—'}</td>
                  <td className="px-5 py-3 text-center text-gray-300 font-semibold">
                    {pct(r.score ?? 0, r.total_marks ?? 0)}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {r.end_time ? new Date(r.end_time).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => onReview(r.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 text-white transition">
                      Review
                    </button>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {r.result_released ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-900 text-emerald-300 border border-emerald-700">Released</span>
                    ) : (
                      <button
                        onClick={() => handleReleaseOne(r.id)}
                        disabled={releasing === r.id}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white transition disabled:opacity-50">
                        {releasing === r.id ? '…' : 'Release'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({ sessionId, onClose, onSaved }) {
  const [data, setData]     = useState(null);
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(null); // question_id being saved
  const [error, setError]   = useState('');

  useEffect(() => {
    reviewSession(sessionId)
      .then((d) => {
        setData(d);
        const init = {};
        (d.questions || []).forEach((q) => { init[q.question_id] = q.score; });
        setScores(init);
      })
      .catch((e) => { setError(e.message); });
  }, [sessionId]);

  async function saveScore(questionId, maxScore) {
    const val = Number(scores[questionId]);
    if (isNaN(val) || val < 0 || val > maxScore) {
      setError(`Score must be between 0 and ${maxScore}`);
      return;
    }
    setSaving(questionId);
    setError('');
    try {
      const res = await updateAnswerScore(sessionId, questionId, val);
      setData((prev) => ({
        ...prev,
        current_score: res.total_score,
        reviewed: true,
        questions: prev.questions.map((q) =>
          q.question_id === questionId ? { ...q, score: val } : q
        ),
      }));
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h3 className="font-bold text-gray-100 text-base">
              Review: {data?.student_name || data?.student_username || '…'}
            </h3>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                {data.student_rank && <span className="mr-1 font-semibold text-gray-300">{data.student_rank}</span>}
                {data.student_unit && <span className="mr-2 text-gray-400">· {data.student_unit}</span>}
                {data.exam_title} · Score: <span className="text-indigo-300 font-semibold">{data.current_score}/{data.total_marks}</span>
                {data.reviewed && <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-300 text-xs font-semibold border border-indigo-700">Reviewed</span>}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition text-xl font-bold">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
          {error && <p className="text-sm text-red-400 bg-red-900/30 rounded px-3 py-2">{error}</p>}
          {!data ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            data.questions.map((q, idx) => (
              <div key={q.question_id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-gray-500 mt-0.5">Q{idx + 1}</span>
                  <p className="flex-1 text-gray-200 text-sm font-medium">{q.question_text}</p>
                  <span className="text-xs text-gray-500 flex-shrink-0">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                </div>

                {q.question_type === 'mcq' && q.options && q.options.length > 0 && (
                  <div className="flex flex-col gap-1 pl-5">
                    {q.options.map((opt, oi) => (
                      <span key={oi} className={`text-xs px-2 py-1 rounded ${opt === q.student_answer ? 'bg-indigo-900 text-indigo-200 font-semibold' : 'text-gray-400'} ${opt && opt === q.answer_key ? 'ring-1 ring-emerald-500' : ''}`}>
                        {oi + 1}. {opt}
                        {opt && opt === q.answer_key && <span className="ml-1 text-emerald-400">(correct)</span>}
                        {opt === q.student_answer && opt !== q.answer_key && <span className="ml-1 text-red-400">(selected)</span>}
                      </span>
                    ))}
                  </div>
                )}

                {q.question_type !== 'mcq' && q.question_type !== 'short_answer_screenshot' && !(q.question_type === 'short_answer' && q.student_answer && /^[0-9a-f\-]{36}\.\w+$/i.test(q.student_answer)) && (
                  <div className="pl-5 flex flex-col gap-1 text-xs">
                    <p className="text-gray-400">Student answer:</p>
                    <p className="text-gray-200 font-medium whitespace-pre-wrap bg-gray-900 rounded px-2 py-1.5 border border-gray-700">
                      {q.student_answer || '—'}
                    </p>
                    {q.answer_key && <p className="text-gray-400">Answer key: <span className="text-emerald-300 font-medium whitespace-pre-wrap">{q.answer_key}</span></p>}
                    {q.feedback && <p className="text-gray-500 italic">{q.feedback}</p>}
                  </div>
                )}

                {(q.question_type === 'short_answer_screenshot' || (q.question_type === 'short_answer' && q.student_answer && /^[0-9a-f\-]{36}\.\w+$/i.test(q.student_answer))) && (
                  <div className="pl-5">
                    <p className="text-xs text-gray-400 mb-2">Screenshot submitted:</p>
                    {q.student_answer ? (
                      <ScreenshotImage filename={q.student_answer} token={token} apiBase={API_BASE} />
                    ) : (
                      <p className="text-xs text-gray-500 italic">No screenshot uploaded.</p>
                    )}
                  </div>
                )}

                {/* Score editor */}
                <div className="flex items-center gap-3 pl-5 pt-1">
                  <label className="text-xs text-gray-400 font-semibold">Score:</label>
                  <input
                    type="number"
                    min={0}
                    max={q.marks}
                    step={0.5}
                    value={scores[q.question_id] ?? 0}
                    onChange={(e) => setScores((p) => ({ ...p, [q.question_id]: e.target.value }))}
                    className="w-20 px-2 py-1 rounded border border-gray-600 bg-gray-700 text-gray-200 text-sm outline-none focus:border-indigo-400"
                  />
                  <span className="text-xs text-gray-500">/ {q.marks}</span>
                  <button
                    onClick={() => saveScore(q.question_id, q.marks)}
                    disabled={saving === q.question_id}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 text-white transition disabled:opacity-50">
                    {saving === q.question_id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-700">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screenshot image helper (fetches with auth header) ────────────────────────
function ScreenshotImage({ filename, token, apiBase }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url;
    fetch(`${apiBase}/api/admin/screenshots/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error('Not found'); return r.blob(); })
      .then((blob) => { url = URL.createObjectURL(blob); setSrc(url); })
      .catch(() => setSrc('error'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [filename, token, apiBase]);

  if (!src) return <p className="text-xs text-gray-500 italic">Loading image…</p>;
  if (src === 'error') return <p className="text-xs text-red-400">Could not load screenshot.</p>;
  return (
    <img
      src={src}
      alt="Student screenshot"
      className="max-w-full max-h-80 rounded border border-gray-600 object-contain"
    />
  );
}