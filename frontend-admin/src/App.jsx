import React, { useState, useEffect } from 'react';
import { getToken, getStoredUser, clearToken, setStoredUser } from './services/base.js';
import { changePassword, changeUsername } from './services/auth.js';
import LoginPage from './views/LoginPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import DashboardPanel from './views/DashboardPanel.jsx';
import ExamListPanel from './views/ExamListPanel.jsx';
import ExamEditorPanel from './views/ExamEditorPanel.jsx';
import UploadPanel from './views/UploadPanel.jsx';
import ResultsPanel from './views/ResultsPanel.jsx';
import UsersPanel from './views/UsersPanel.jsx';

export default function App() {
  const [user, setUser]           = useState(() => getStoredUser());
  const [view, setView]           = useState('dashboard');
  const [editId, setEditId]       = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!getToken()) { setUser(null); }
  }, []);

  function handleLogin(u) { setUser(u); setView('dashboard'); }
  function handleLogout() { clearToken(); setUser(null); }
  function navigate(v) { setView(v); setEditId(null); }
  function openEditor(id = null) { setEditId(id); setView('editor'); }
  function editorSaved() { setView('exams'); setEditId(null); }

  function handleUsernameChanged(newUsername) {
    const updated = { ...user, username: newUsername };
    setStoredUser(updated);
    setUser(updated);
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeView={view} onNavigate={navigate} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} />
      <main className="flex-1 overflow-y-auto">
        {view === 'dashboard' && <DashboardPanel onNavigate={navigate} />}
        {view === 'exams'     && <ExamListPanel onEdit={openEditor} />}
        {view === 'editor'    && <ExamEditorPanel examId={editId} onSaved={editorSaved} />}
        {view === 'upload'    && <UploadPanel onSaved={() => navigate('exams')} />}
        {view === 'results'   && <ResultsPanel />}
        {view === 'users'     && <UsersPanel />}
      </main>
      {showSettings && (
        <AccountSettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onUsernameChanged={handleUsernameChanged}
        />
      )}
    </div>
  );
}

// ── Account Settings Modal ────────────────────────────────────────────────────
function AccountSettingsModal({ user, onClose, onUsernameChanged }) {
  const [tab, setTab]       = useState('password'); // 'password' | 'username'
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Password change form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  // Username change form
  const [unForm, setUnForm] = useState({ current_pw: '', new_username: '' });

  function switchTab(t) { setTab(t); setError(''); setSuccess(''); }

  async function handleChangePassword(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (pwForm.next !== pwForm.confirm) { setError('New passwords do not match.'); return; }
    if (pwForm.next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setSuccess('Password updated successfully.');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeUsername(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!unForm.new_username.trim()) { setError('New username is required.'); return; }
    setSaving(true);
    try {
      const res = await changeUsername(unForm.current_pw, unForm.new_username.trim());
      setSuccess('Username updated successfully.');
      onUsernameChanged(res.username);
      setUnForm({ current_pw: '', new_username: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-100">{user?.username}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6">
          {[['password', 'Change Password'], ['username', 'Change Username']].map(([key, label]) => (
            <button key={key} onClick={() => switchTab(key)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition -mb-px ${tab === key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-red-950 border border-red-700 text-red-400 rounded-lg px-4 py-2.5 text-sm flex justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="ml-3 font-bold text-red-400 hover:text-red-200">×</button>
            </div>
          )}
          {success && (
            <div className="bg-emerald-950 border border-emerald-700 text-emerald-400 rounded-lg px-4 py-2.5 text-sm">
              ✓ {success}
            </div>
          )}

          {tab === 'password' ? (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              {[
                { label: 'Current Password', key: 'current' },
                { label: 'New Password',     key: 'next' },
                { label: 'Confirm New Password', key: 'confirm' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
                  <input type="password" value={pwForm[key]}
                    onChange={(e) => setPwForm((p) => ({ ...p, [key]: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 transition" />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50">
                  {saving ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleChangeUsername} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">New Username</label>
                <input type="text" value={unForm.new_username}
                  onChange={(e) => setUnForm((p) => ({ ...p, new_username: e.target.value }))}
                  required autoComplete="off"
                  className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 transition" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Current Password</label>
                <input type="password" value={unForm.current_pw}
                  onChange={(e) => setUnForm((p) => ({ ...p, current_pw: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 transition" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50">
                  {saving ? 'Updating…' : 'Update Username'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
