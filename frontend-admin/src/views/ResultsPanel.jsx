import React, { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { listResults } from '../services/index.js';

function pct(score, total) {
  if (!total) return '—';
  return `${Math.round((score / total) * 100)}%`;
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(examTitle, rows) {
  const data = [
    ['Exam', examTitle],
    [],
    ['Student Name', 'Score', 'Out of', 'Percentage', 'Submitted At'],
    ...rows.map((r) => [
      r.username,
      r.score ?? 0,
      r.total_marks ?? '—',
      total(r.score, r.total_marks),
      r.end_time ? new Date(r.end_time).toLocaleString() : '—',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.writeFile(wb, `${examTitle.replace(/[^a-z0-9]/gi, '_')}_results.xlsx`);
}

// ── DOCX export (HTML-based, opened by Word) ──────────────────────────────────
function exportDocx(examTitle, rows) {
  const rows_html = rows.map((r) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ccc;">${r.username}</td>
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
          <th style="padding:8px 10px;border:1px solid #ccc;text-align:left;">Student Name</th>
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

  useEffect(() => {
    listResults()
      .then((r) => setResults(r || []))
      .finally(() => setLoading(false));
  }, []);

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
            <ExamGroup key={group.exam_id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Exam group card ───────────────────────────────────────────────────────────
function ExamGroup({ group }) {
  const { exam_title, rows } = group;
  const avg = rows.length
    ? rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length
    : 0;
  const totalMarks = rows[0]?.total_marks ?? 0;

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
        </div>
      </div>

      {/* Student table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2">#</th>
              <th className="text-left px-5 py-2">Student</th>
              <th className="text-center px-5 py-2">Score</th>
              <th className="text-center px-5 py-2">Out of</th>
              <th className="text-center px-5 py-2">Percentage</th>
              <th className="text-left px-5 py-2">Submitted</th>
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
                  <td className="px-5 py-3 font-medium text-gray-200">{r.username}</td>
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}