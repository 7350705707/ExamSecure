import React from 'react';
import mcteLogo from '../assets/MCTE_logo.png';

const NAV = [
  { key: 'dashboard', label: 'Dashboard',   icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'exams',     label: 'Exams',        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'upload',    label: 'Upload File',  icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' },
  { key: 'results',   label: 'Results',      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { key: 'users',     label: 'Users',        icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
];

export default function Sidebar({ user, activeView, onNavigate, onLogout, onOpenSettings }) {
  return (
    <aside className="w-60 flex-shrink-0 bg-indigo-900 flex flex-col h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-indigo-800">
        <img src={mcteLogo} alt="MCTE Logo" className="h-9 w-auto object-contain flex-shrink-0" />
        <span className="font-bold text-white text-sm tracking-wide leading-tight">ExamAdmin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
        {NAV.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left w-full
              ${activeView === item.key
                ? 'bg-indigo-700 text-white'
                : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
              }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.label}
          </button>
        ))}
      </nav>

      {/* User / Actions */}
      <div className="border-t border-indigo-800 px-4 py-4 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user?.username?.[0]?.toUpperCase() || 'A'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{user?.username}</p>
          <p className="text-xs text-indigo-300">{user?.role}</p>
        </div>
        <button
          onClick={onOpenSettings}
          title="Account Settings"
          className="text-indigo-300 hover:text-white transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          onClick={onLogout}
          title="Logout"
          className="text-indigo-300 hover:text-white transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
