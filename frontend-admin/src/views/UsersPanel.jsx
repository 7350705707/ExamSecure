import React, { useEffect, useState, useMemo } from 'react';
import {
  listUsers, createUser, deleteUser, assignUserGroup,
  listGroups, createGroup, deleteGroup,
} from '../services/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function Avatar({ name }) {
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-300 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function UsersPanel() {
  const [users, setUsers]     = useState([]);
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState('users'); // 'users' | 'groups'

  // Modals
  const [showAddUser, setShowAddUser]   = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listUsers(), listGroups()])
      .then(([u, g]) => { setUsers(u || []); setGroups(g || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Group users by group_id for display
  const grouped = useMemo(() => {
    const map = new Map();
    map.set(null, { id: null, name: 'Ungrouped', users: [] });
    for (const g of groups) map.set(g.id, { ...g, users: [] });
    for (const u of users) {
      const key = u.group_id ?? null;
      if (!map.has(key)) map.set(key, { id: key, name: 'Ungrouped', users: [] });
      map.get(key).users.push(u);
    }
    return [...map.values()];
  }, [users, groups]);

  async function handleDeleteUser(id, uname) {
    if (!confirm(`Delete user "${uname}"? All their exam data will be removed.`)) return;
    try { await deleteUser(id); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleDeleteGroup(gid, gname) {
    if (!confirm(`Delete group "${gname}"? ALL users in this group will also be permanently deleted.`)) return;
    try { await deleteGroup(gid); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleAssignGroup(uid, gid) {
    try { await assignUserGroup(uid, gid === '' ? null : Number(gid)); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-100">Users & Groups</h2>
          <p className="text-sm text-gray-500">
            {users.length} user{users.length !== 1 ? 's' : ''} · {groups.length} group{groups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddGroup(true)}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold border border-gray-600 transition">
            + Add Group
          </button>
          <button onClick={() => setShowAddUser(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
            + Add User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700">
        {['users', 'groups'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize rounded-t-lg transition ${tab === t ? 'bg-gray-800 text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : tab === 'users' ? (
        /* ── Users view: grouped ── */
        <div className="flex flex-col gap-4">
          {grouped.map((g) => g.users.length === 0 && g.id === null ? null : (
            <div key={g.id ?? 'ungrouped'} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-800/60 border-b border-gray-700 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {g.name} ({g.users.length})
                </span>
                {g.id !== null && (
                  <button onClick={() => handleDeleteGroup(g.id, g.name)}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold transition">
                    Delete Group + Users
                  </button>
                )}
              </div>
              {g.users.length === 0 ? (
                <p className="text-xs text-gray-600 px-4 py-3 italic">No users in this group.</p>
              ) : (
                g.users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-t border-gray-800 first:border-t-0">
                    <Avatar name={u.username} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-200 truncate">{u.username}</p>
                      <p className="text-xs text-gray-500">{u.role}</p>
                    </div>
                    {/* Group assignment dropdown */}
                    <select
                      value={u.group_id ?? ''}
                      onChange={(e) => handleAssignGroup(u.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-gray-700 bg-gray-800 text-gray-300 outline-none focus:border-indigo-500"
                    >
                      <option value="">No group</option>
                      {groups.map((gr) => (
                        <option key={gr.id} value={gr.id}>{gr.name}</option>
                      ))}
                    </select>
                    {u.role !== 'admin' && (
                      <button onClick={() => handleDeleteUser(u.id, u.username)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition">
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
          {users.length === 0 && <p className="text-sm text-gray-500 text-center py-10">No users found.</p>}
        </div>
      ) : (
        /* ── Groups view ── */
        <div className="flex flex-col gap-2">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No groups created yet.</p>
          ) : groups.map((g) => (
            <div key={g.id} className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-200 truncate">{g.name}</p>
                <p className="text-xs text-gray-500">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => handleDeleteGroup(g.id, g.name)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add User modal */}
      {showAddUser && (
        <AddUserModal
          groups={groups}
          onClose={() => setShowAddUser(false)}
          onCreated={() => { setShowAddUser(false); load(); }}
          onError={setError}
        />
      )}

      {/* Add Group modal */}
      {showAddGroup && (
        <AddGroupModal
          onClose={() => setShowAddGroup(false)}
          onCreated={() => { setShowAddGroup(false); load(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ── Add User modal ────────────────────────────────────────────────────────────
function AddUserModal({ groups, onClose, onCreated, onError }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'student', group_id: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, group_id: form.group_id ? Number(form.group_id) : null };
      await createUser(payload);
      onCreated();
    } catch (e) {
      onError(e.message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit}
        className="bg-gray-900 rounded-xl border border-gray-700 shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <h3 className="font-bold text-gray-100 text-base">Add User</h3>

        {['username', 'password'].map((f) => (
          <div key={f}>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">{f}</label>
            <input
              type={f === 'password' ? 'password' : 'text'}
              value={form[f]}
              onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        ))}

        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Role</label>
          <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500">
            <option value="student">student</option>
            <option value="admin">admin</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Group (optional)</label>
          <select value={form.group_id} onChange={(e) => setForm((p) => ({ ...p, group_id: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Add Group modal ───────────────────────────────────────────────────────────
function AddGroupModal({ onClose, onCreated, onError }) {
  const [name, setName]   = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createGroup(name.trim());
      onCreated();
    } catch (e) {
      onError(e.message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit}
        className="bg-gray-900 rounded-xl border border-gray-700 shadow-xl w-full max-w-xs p-6 flex flex-col gap-4">
        <h3 className="font-bold text-gray-100 text-base">Create Group</h3>
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Group Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}