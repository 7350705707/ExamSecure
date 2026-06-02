import React, { useState } from 'react';
import { login } from '../services/auth.js';
import mcteLogo from '../assets/MCTE_logo.png';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role !== 'admin') {
        setError('Admin access only. Please use an admin account.');
        return;
      }
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow p-8 flex flex-col gap-5">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 mb-1">
            <img src={mcteLogo} alt="MCTE Logo" className="h-16 w-auto object-contain" />
          </div>

          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-100">ExamAdmin</h1>
            <p className="text-sm text-gray-500 mt-1">Exam Management Portal</p>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Username</label>
              <input
                className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 transition"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Password</label>
              <input
                type="password"
                className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500 transition"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
