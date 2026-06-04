'use client';
// ============================================================
// VUKA — Admin Security (Phase 8)
// /admin/security — audit logs, active sessions, content flags,
// suspicious activity. All admin actions are logged here.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, RefreshCw, Shield, Eye, Flag, Activity,
  Search, Download, Clock, AlertTriangle, CheckCircle,
} from 'lucide-react';

type SecurityTab = 'audit' | 'flags' | 'activity';

export default function AdminSecurityPage() {
  const [tab, setTab]         = useState<SecurityTab>('audit');
  const [logs, setLogs]       = useState<any[]>([]);
  const [flags, setFlags]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'audit') {
        const res = await fetch(`/api/admin/audit?q=${encodeURIComponent(search)}&page=${page}`);
        if (res.ok) setLogs((await res.json()).logs || []);
      } else if (tab === 'flags') {
        const res = await fetch('/api/admin/security?type=flags');
        if (res.ok) setFlags((await res.json()).flags || []);
      }
    } finally { setLoading(false); }
  }, [tab, search, page]);

  useEffect(() => { load(); }, [load]);

  async function resolveFlag(id: string, action: 'resolve' | 'dismiss') {
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, flagId: id }),
    });
    await load();
  }

  const ACTION_COLORS: Record<string, string> = {
    approve_release: '#a0e87c', reject_release: '#ff4d4d',
    suspend_user: '#ff4d4d', verify_user: '#a0e87c',
    approve_payout: '#a0e87c', reject_payout: '#ff4d4d',
    update_settings: '#e8c87c', delete_user: '#ff4d4d',
    broadcast: '#38b6e8',
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Security</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Audit logs, content flags & suspicious activity</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'audit',    label: 'Audit Logs',     icon: Shield },
          { key: 'flags',    label: 'Content Flags',  icon: Flag },
          { key: 'activity', label: 'Activity Feed',  icon: Activity },
        ] as { key: SecurityTab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{
              background: tab === key ? 'rgba(160,232,124,0.12)' : 'var(--surface)',
              color: tab === key ? 'var(--green)' : 'var(--text-muted)',
              border: tab === key ? '1px solid rgba(160,232,124,0.3)' : '1px solid var(--border)',
            }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Search (audit tab) */}
      {tab === 'audit' && (
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by action, user, entity…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      )}

      {/* Audit Logs */}
      {tab === 'audit' && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Action', 'Entity', 'Admin', 'IP Address', 'Time'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="animate-spin mx-auto" size={20} style={{ color: 'var(--green)' }} />
                  </td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    No audit logs found
                  </td></tr>
                ) : logs.map((log, i) => (
                  <tr key={log.id || i} className="border-t hover:bg-white/[0.02]"
                    style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: `${ACTION_COLORS[log.action] || '#a0a0a0'}22`,
                          color: ACTION_COLORS[log.action] || '#a0a0a0',
                        }}>
                        {log.action?.replace(/_/g, ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {log.targetType && <span>{log.targetType}:{log.targetId?.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {log.adminId?.slice(0,8) || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {log.ipAddress || '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}>← Prev</button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Page {page}</span>
            <button onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--bg)', color: 'var(--text)' }}>Next →</button>
          </div>
        </div>
      )}

      {/* Content Flags */}
      {tab === 'flags' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" size={20} style={{ color: 'var(--green)' }} />
            </div>
          ) : flags.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No open flags</div>
          ) : flags.map(f => (
            <div key={f.id} className="p-4 rounded-xl flex items-start gap-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Flag size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#e8a87c' }} />
              <div className="flex-1">
                <div className="font-medium text-sm">{f.entityType}: {f.entityId}</div>
                <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.reason}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Reported {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '—'}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => resolveFlag(f.id, 'resolve')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}>
                  Resolve
                </button>
                <button onClick={() => resolveFlag(f.id, 'dismiss')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Feed placeholder */}
      {tab === 'activity' && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Activity size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <div className="font-medium mb-1">Real-time Activity Feed</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect Supabase Realtime to stream live events here.
            <br />See <code>src/lib/supabase.ts</code> for subscription setup.
          </div>
        </div>
      )}
    </div>
  );
}
