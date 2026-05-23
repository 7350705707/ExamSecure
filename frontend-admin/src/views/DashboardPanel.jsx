import React, { useEffect, useState } from 'react';
import { listExams, listResults, listUsers } from '../services/index.js';

export default function DashboardPanel({ onNavigate }) {
  const [stats, setStats] = useState({ exams: 0, published: 0, drafts: 0, results: 0, users: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listExams(), listResults(), listUsers()])
      .then(([exams, results, users]) => {
        setStats({
          exams: exams.length,
          published: exams.filter((e) => e.status === 'published').length,
          drafts: exams.filter((e) => e.status === 'draft').length,
          results: results.length,
          users: users.length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Total Exams',      value: stats.exams,     color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200',  nav: 'exams' },
    { label: 'Published',        value: stats.published,  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', nav: 'exams' },
    { label: 'Drafts',           value: stats.drafts,     color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',    nav: 'exams' },
    { label: 'Submitted Results',value: stats.results,    color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200',  nav: 'results' },
    { label: 'Students',         value: stats.users,      color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',    nav: 'users' },
  ];

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-gray-100">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your exam ecosystem</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading stats…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((c) => (
            <button
              key={c.label}
              onClick={() => onNavigate(c.nav)}
              className={`rounded-xl border p-4 flex flex-col gap-1 text-left hover:shadow-md transition ${c.bg}`}
            >
              <span className={`text-3xl font-extrabold ${c.color}`}>{c.value}</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <QuickBtn label="Create New Exam"    onClick={() => onNavigate('editor')} color="bg-indigo-600 hover:bg-indigo-700" />
          <QuickBtn label="Upload Exam File"   onClick={() => onNavigate('upload')} color="bg-violet-600 hover:bg-violet-700" />
          <QuickBtn label="View Results"       onClick={() => onNavigate('results')} color="bg-emerald-600 hover:bg-emerald-700" />
          <QuickBtn label="Manage Users"       onClick={() => onNavigate('users')} color="bg-slate-600 hover:bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

function QuickBtn({ label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition ${color}`}
    >
      {label}
    </button>
  );
}
