'use client';
/**
 * /admin/db-repair
 *
 * Visual DB repair tool — accessible without being logged in as admin.
 * Requires CRON_SECRET to operate, which you paste directly in the UI.
 *
 * Lists all users, highlights broken roles, lets you fix individually or
 * run fixAll to auto-repair all detected issues in one click.
 */

import { useState } from 'react';
import { Shield, RefreshCw, Wrench, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import VukaLoader from '@/components/brand/VukaLoader';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isSuspended: boolean;
  createdAt: string;
  artist: { id: string; slug: string; name: string } | null;
  industryUser: { id: string } | null;
  issues: string[];
};

type ScanResult = {
  total: number;
  broken: number;
  adminEmail: string;
  users: UserRow[];
  hint: string;
};

const VALID_ROLES = ['fan', 'artist', 'producer', 'industry', 'admin', 'owner', 'super_admin', 'moderator', 'verified_artist'];

const ROLE_COLORS: Record<string, string> = {
  owner: '#a0e87c',
  super_admin: '#a0e87c',
  admin: '#a0e87c',
  moderator: '#60a5fa',
  verified_artist: '#e8c87c',
  artist: '#38b6e8',
  producer: '#38b6e8',
  industry: '#a78bfa',
  fan: '#6b7280',
};

export default function DbRepairPage() {
  const [secret, setSecret]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [fixingAll, setFixingAll]   = useState(false);
  const [result, setResult]         = useState<ScanResult | null>(null);
  const [error, setError]           = useState('');
  const [fixLog, setFixLog]         = useState<string[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [fixingUserId, setFixingUserId] = useState<string | null>(null);

  async function scan() {
    if (!secret.trim()) { setError('Enter your CRON_SECRET first'); return; }
    setLoading(true);
    setError('');
    setFixLog([]);
    try {
      const res = await fetch(`/api/admin/db-repair?secret=${encodeURIComponent(secret)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Scan failed'); }
      else setResult(data);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function fixAll() {
    if (!secret.trim()) { setError('Enter your CRON_SECRET first'); return; }
    setFixingAll(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/db-repair?secret=${encodeURIComponent(secret)}&fixAll=true`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fix all failed');
      } else {
        const log: string[] = [`✅ Scanned ${data.usersScanned} users, fixed ${data.usersFixed}`];
        for (const r of data.results || []) {
          for (const f of r.fixes || []) log.push(`  ${r.email}: ${f}`);
          for (const e of r.errors || []) log.push(`  ❌ ${r.email}: ${e}`);
        }
        setFixLog(log);
        // Re-scan to show updated state
        await scan();
      }
    } catch (e) {
      setError(String(e));
    }
    setFixingAll(false);
  }

  async function fixUser(userId: string, role: string) {
    setFixingUserId(userId);
    setError('');
    try {
      const res = await fetch(`/api/admin/db-repair?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, ensureArtistRecord: ['artist', 'producer'].includes(role) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fix failed');
      } else {
        setFixLog(prev => [...prev, `✅ Fixed ${data.email}: role → ${data.role}`, ...(data.sideEffects || []).map((s: string) => `   ${s}`)]);
        await scan();
      }
    } catch (e) {
      setError(String(e));
    }
    setFixingUserId(null);
  }

  const brokenUsers = result?.users.filter(u => u.issues.length > 0) || [];
  const cleanUsers  = result?.users.filter(u => u.issues.length === 0) || [];

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Admin</Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(160,232,124,0.12)', border: '1px solid rgba(160,232,124,0.3)' }}>
              <Wrench size={20} style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <h1 className="text-xl font-black font-display" style={{ color: 'var(--text)' }}>DB Role Repair</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fix broken artist/admin roles in the database</p>
            </div>
          </div>
        </div>

        {/* Secret Input */}
        <div className="rounded-2xl p-6 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            CRON_SECRET (from your Vercel/Doppler env vars)
          </label>
          <div className="flex gap-3">
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && scan()}
              placeholder="Paste your CRON_SECRET here…"
              className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--surface2, #1a1a1a)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
            <button
              onClick={scan}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-60"
              style={{ background: 'var(--sky)', color: '#fff' }}>
              {loading ? <VukaLoader size={15} /> : <RefreshCw size={15} />}
              Scan DB
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 mb-5 text-sm flex items-center gap-2"
            style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', color: '#ff4d4d' }}>
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        {/* Fix log */}
        {fixLog.length > 0 && (
          <div className="rounded-xl p-4 mb-5 text-xs font-mono space-y-1"
            style={{ background: '#0d1a0a', border: '1px solid rgba(160,232,124,0.3)', color: '#a0e87c' }}>
            {fixLog.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Total Users', value: result.total, color: 'var(--sky)' },
                { label: 'Broken Roles', value: result.broken, color: result.broken > 0 ? '#ff4d4d' : '#a0e87c' },
                { label: 'Admin Email', value: result.adminEmail || 'NOT SET ⚠️', color: 'var(--text-muted)', small: true },
              ].map(({ label, value, color, small }) => (
                <div key={label} className="rounded-xl p-4"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  <div className={`font-black ${small ? 'text-sm' : 'text-2xl'}`} style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Fix All button */}
            {brokenUsers.length > 0 && (
              <div className="rounded-2xl p-5 mb-6 flex items-center justify-between"
                style={{ background: 'rgba(255,77,77,0.06)', border: '1px solid rgba(255,77,77,0.25)' }}>
                <div>
                  <div className="font-bold text-sm mb-1" style={{ color: '#ff4d4d' }}>
                    {brokenUsers.length} user{brokenUsers.length !== 1 ? 's' : ''} with broken roles detected
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Auto-fix uses these rules: Artist record exists → role=artist; ADMIN_EMAIL match → role=owner; IndustryUser exists → role=industry
                  </div>
                </div>
                <button
                  onClick={fixAll}
                  disabled={fixingAll}
                  className="ml-4 px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-60 flex-shrink-0"
                  style={{ background: '#a0e87c', color: '#0a0a0a' }}>
                  {fixingAll ? <VukaLoader size={15} /> : <Shield size={15} />}
                  {fixingAll ? 'Fixing…' : 'Fix All Issues'}
                </button>
              </div>
            )}

            {result.broken === 0 && (
              <div className="rounded-2xl p-5 mb-6 flex items-center gap-3"
                style={{ background: 'rgba(160,232,124,0.06)', border: '1px solid rgba(160,232,124,0.3)' }}>
                <CheckCircle size={20} style={{ color: '#a0e87c' }} />
                <div>
                  <div className="font-bold text-sm" style={{ color: '#a0e87c' }}>All roles look correct</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{result.hint}</div>
                </div>
              </div>
            )}

            {/* Broken Users */}
            {brokenUsers.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-bold mb-3" style={{ color: '#ff4d4d' }}>⚠️ Broken / Needs Fix</h2>
                <div className="space-y-2">
                  {brokenUsers.map(u => (
                    <UserCard
                      key={u.id}
                      u={u}
                      expanded={expandedUser === u.id}
                      onToggle={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                      onFix={fixUser}
                      fixing={fixingUserId === u.id}
                      broken
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Clean Users */}
            <details>
              <summary className="cursor-pointer text-xs mb-3 select-none" style={{ color: 'var(--text-muted)' }}>
                ✅ {cleanUsers.length} users with correct roles (click to expand)
              </summary>
              <div className="space-y-1 mt-2">
                {cleanUsers.map(u => (
                  <UserCard
                    key={u.id}
                    u={u}
                    expanded={expandedUser === u.id}
                    onToggle={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                    onFix={fixUser}
                    fixing={fixingUserId === u.id}
                    broken={false}
                  />
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function UserCard({ u, expanded, onToggle, onFix, fixing, broken }: {
  u: UserRow;
  expanded: boolean;
  onToggle: () => void;
  onFix: (userId: string, role: string) => void;
  fixing: boolean;
  broken: boolean;
}) {
  const [selectedRole, setSelectedRole] = useState(u.role);

  const roleColor = ROLE_COLORS[u.role] ?? '#6b7280';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${broken ? 'rgba(255,77,77,0.3)' : 'var(--border)'}`,
      }}>

      {/* Row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{u.name}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</span>
            {u.artist && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,182,232,0.15)', color: '#38b6e8' }}>has Artist</span>}
            {u.industryUser && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>has IndustryUser</span>}
          </div>
          {broken && u.issues.map((iss, i) => (
            <div key={i} className="text-xs mt-0.5" style={{ color: '#fca5a5' }}>⚠ {iss}</div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-bold px-2 py-1 rounded-lg"
            style={{ background: `${roleColor}22`, color: roleColor }}>
            {u.role}
          </span>
          {expanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-4 text-xs mb-4">
            <div>
              <div style={{ color: 'var(--text-muted)' }}>User ID</div>
              <div className="font-mono text-xs mt-0.5 break-all" style={{ color: 'var(--text)' }}>{u.id}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Created</div>
              <div style={{ color: 'var(--text)' }}>{new Date(u.createdAt).toLocaleDateString()}</div>
            </div>
            {u.artist && (
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Artist Slug</div>
                <div style={{ color: '#38b6e8' }}>{u.artist.slug}</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {VALID_ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={() => onFix(u.id, selectedRole)}
              disabled={fixing || selectedRole === u.role}
              className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: '#a0e87c', color: '#0a0a0a' }}>
              {fixing ? <VukaLoader size={13} /> : <Wrench size={13} />}
              {fixing ? 'Fixing…' : selectedRole === u.role ? 'No Change' : `Set to ${selectedRole}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
