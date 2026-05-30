import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  listUsers, createUser, deleteUser, assignUserGroup,
  listGroups, createGroup, deleteGroup, bulkImportUsers,
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
  const [showAddUser, setShowAddUser]       = useState(false);
  const [showAddGroup, setShowAddGroup]     = useState(false);
  const [showImportUsers, setShowImportUsers] = useState(false);

  function downloadDemoExcel() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Army No', 'Rank', 'Name', 'Unit'],
      ['12345', 'Pte', 'Ahmad bin Ali', '3 SIR'],
      ['67890', 'Cpl', 'Ravi Kumar', '7 SIB'],
      ['11223', 'Sgt', 'Tan Wei Liang', '1 GDS'],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'bulk_users_template.xlsx');
  }

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
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadDemoExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-semibold border border-gray-600 transition">
            ↓ Demo Excel
          </button>
          <button onClick={() => setShowImportUsers(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold border border-amber-500 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Users
          </button>
          <button onClick={() => setShowAddGroup(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-900/40 border border-emerald-500 transition-all duration-150">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            New Group
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
                    <Avatar name={u.full_name || u.username} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-200 truncate">{u.full_name || u.username}</p>
                      <p className="text-xs text-gray-400 truncate font-mono">{u.username}</p>
                      <p className="text-xs text-gray-500 capitalize">{u.role}</p>
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

      {/* Import Users modal */}
      {showImportUsers && (
        <BulkImportModal
          groups={groups}
          onClose={() => setShowImportUsers(false)}
          onImported={() => { setShowImportUsers(false); load(); }}
          onError={setError}
        />
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
  const [form, setForm] = useState({ username: '', full_name: '', rank: '', unit: '', password: '', role: 'student', group_id: '' });
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

        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Full Name</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            placeholder="e.g. Ahmad bin Ali"
            className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Rank</label>
            <input
              type="text"
              value={form.rank}
              onChange={(e) => setForm((p) => ({ ...p, rank: e.target.value }))}
              placeholder="e.g. Pte, Cpl"
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Unit</label>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              placeholder="e.g. 3 SIR"
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {['username', 'password'].map((f) => (
          <div key={f}>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">{f === 'username' ? 'Username (Army No)' : 'Password'}</label>
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

// ── Bulk Import Users modal ───────────────────────────────────────────────────
function BulkImportModal({ groups, onClose, onImported, onError }) {
  const [preview, setPreview] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving]   = useState(false);
  const [result, setResult]   = useState(null);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { onError('Excel file is empty or has no data rows.'); return; }
      const header = rows[0].map((h) => String(h).toLowerCase().trim());
      const armyCol = header.findIndex((h) => h.includes('army') || h === 'id');
      const nameCol = header.findIndex((h) => h.includes('name'));
      const rankCol = header.findIndex((h) => h.includes('rank'));
      const unitCol = header.findIndex((h) => h.includes('unit'));
      if (armyCol === -1) { onError('Could not find "Army No" column.'); return; }
      const parsed = rows.slice(1)
        .filter((r) => String(r[armyCol] || '').trim())
        .map((r) => ({
          army_no: String(r[armyCol]).trim(),
          rank: rankCol !== -1 ? String(r[rankCol] || '').trim() : '',
          name: nameCol !== -1 ? String(r[nameCol] || '').trim() : '',
          unit: unitCol !== -1 ? String(r[unitCol] || '').trim() : '',
        }));
      setPreview(parsed);
    };
    reader.readAsArrayBuffer(file);
  }

  function clearPreview() {
    setPreview([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleImport() {
    if (!preview.length) return;
    setSaving(true);
    try {
    const users = preview.map((u) => ({ ...u, group_id: groupId ? Number(groupId) : null }));
      const res = await bulkImportUsers(users);
      setResult(res);
    } catch (e) {
      onError(e.message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
          <h3 className="font-bold text-gray-100 text-base">Import Complete</h3>
          <p className="text-emerald-400 font-semibold text-sm">✓ {result.created} user{result.created !== 1 ? 's' : ''} created</p>
          {result.skipped > 0 && <p className="text-amber-400 text-sm">⚠ {result.skipped} skipped (already exist or invalid)</p>}
          {result.errors?.length > 0 && (
            <div className="bg-gray-800 rounded p-2 max-h-32 overflow-y-auto">
              {result.errors.map((err, i) => <p key={i} className="text-red-400 text-xs">{err}</p>)}
            </div>
          )}
          <button onClick={onImported}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
        <h3 className="font-bold text-gray-100 text-base">Import Users from Excel</h3>
        <p className="text-xs text-gray-400">
          Upload an .xlsx file with columns: <span className="text-gray-200 font-semibold">Army No</span>, <span className="text-gray-200 font-semibold">Rank</span>, <span className="text-gray-200 font-semibold">Name</span>, and <span className="text-gray-200 font-semibold">Unit</span>.
          Army No becomes the username &amp; password.
        </p>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
          className="text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-600 file:bg-gray-700 file:text-gray-200 file:text-xs file:font-semibold hover:file:bg-gray-600 cursor-pointer" />

        {groups.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Assign to Group (optional)</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm outline-none focus:border-indigo-500">
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        {preview.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">{preview.length} user{preview.length !== 1 ? 's' : ''} found — preview:</p>
              <button type="button" onClick={clearPreview}
                className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400 hover:bg-red-900 hover:text-red-300 border border-gray-600 transition">
                ✕ Deselect
              </button>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700">
                    <th className="text-left px-3 py-1.5 text-gray-300 font-semibold">Army No</th>
                    <th className="text-left px-3 py-1.5 text-gray-300 font-semibold">Rank</th>
                    <th className="text-left px-3 py-1.5 text-gray-300 font-semibold">Name</th>
                    <th className="text-left px-3 py-1.5 text-gray-300 font-semibold">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-gray-700">
                      <td className="px-3 py-1.5 text-gray-200 font-mono">{r.army_no}</td>
                      <td className="px-3 py-1.5 text-gray-300">{r.rank || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-300">{r.name || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-300">{r.unit || '—'}</td>
                    </tr>
                  ))}
                  {preview.length > 20 && (
                    <tr className="border-t border-gray-700">
                      <td colSpan={4} className="px-3 py-1.5 text-gray-500 italic">…and {preview.length - 20} more</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 transition">
            Cancel
          </button>
          <button onClick={handleImport} disabled={!preview.length || saving}
            className="px-4 py-2 rounded-lg text-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold transition disabled:opacity-40">
            {saving ? 'Importing…' : `Import ${preview.length} User${preview.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
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