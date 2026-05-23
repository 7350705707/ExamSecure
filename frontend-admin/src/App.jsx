import React, { useState, useEffect } from 'react';
import { getToken, getStoredUser, clearToken } from './services/base.js';
import LoginPage from './views/LoginPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import DashboardPanel from './views/DashboardPanel.jsx';
import ExamListPanel from './views/ExamListPanel.jsx';
import ExamEditorPanel from './views/ExamEditorPanel.jsx';
import UploadPanel from './views/UploadPanel.jsx';
import ResultsPanel from './views/ResultsPanel.jsx';
import UsersPanel from './views/UsersPanel.jsx';

export default function App() {
  const [user, setUser]       = useState(() => getStoredUser());
  const [view, setView]       = useState('dashboard');
  const [editId, setEditId]   = useState(null); // examId being edited

  // Verify token on mount
  useEffect(() => {
    if (!getToken()) { setUser(null); }
  }, []);

  function handleLogin(u) { setUser(u); setView('dashboard'); }
  function handleLogout() { clearToken(); setUser(null); }
  function navigate(v) { setView(v); setEditId(null); }
  function openEditor(id = null) { setEditId(id); setView('editor'); }
  function editorSaved() { setView('exams'); setEditId(null); }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeView={view} onNavigate={navigate} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        {view === 'dashboard' && <DashboardPanel onNavigate={navigate} />}
        {view === 'exams'     && <ExamListPanel onEdit={openEditor} />}
        {view === 'editor'    && <ExamEditorPanel examId={editId} onSaved={editorSaved} />}
        {view === 'upload'    && <UploadPanel onSaved={() => navigate('exams')} />}
        {view === 'results'   && <ResultsPanel />}
        {view === 'users'     && <UsersPanel />}
      </main>
    </div>
  );
}
