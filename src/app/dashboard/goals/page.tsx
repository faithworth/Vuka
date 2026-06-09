'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Plus, Target, Trash2, Pencil, AlertTriangle, Check, X } from 'lucide-react';

export default function DashboardGoalsPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', targetAmount: '', deadline: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', targetAmount: '', deadline: '' });
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/goals')
      .then(r => r.json())
      .then(d => setGoals(Array.isArray(d.goals) ? d.goals : []))
      .catch(() => setGoals([]))
      .finally(() => setLoading(false));
  }, []);

  // Split into live (deadline in future or no deadline) and expired
  const now = new Date();
  const liveGoals    = goals.filter(g => g.isActive && (!g.deadline || new Date(g.deadline) > now));
  const expiredGoals = goals.filter(g => g.deadline && new Date(g.deadline) <= now);

  async function createGoal() {
    const res = await fetch('/api/dashboard/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, targetAmount: parseFloat(form.targetAmount) }),
    });
    if (res.ok) {
      const d = await res.json();
      setGoals(prev => [d.goal, ...prev]);
      setShowForm(false);
      setForm({ title: '', description: '', targetAmount: '', deadline: '' });
    }
  }

  async function deleteGoal(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);
    const res = await fetch(`/api/dashboard/goals?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setGoals(prev => prev.filter(g => g.id !== id));
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Could not delete this goal.');
    }
    setDeletingId(null);
  }

  function startEdit(goal: any) {
    setEditingId(goal.id);
    setEditForm({
      title: goal.title,
      description: goal.description || '',
      targetAmount: String(goal.targetAmount),
      deadline: goal.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '',
    });
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    const res = await fetch('/api/dashboard/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        title: editForm.title,
        description: editForm.description,
        targetAmount: parseFloat(editForm.targetAmount),
        deadline: editForm.deadline || null,
      }),
    });
    if (res.ok) {
      setGoals(prev => prev.map(g => g.id === id ? {
        ...g,
        title: editForm.title,
        description: editForm.description,
        targetAmount: parseFloat(editForm.targetAmount),
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
      } : g));
      setEditingId(null);
    }
    setSavingId(null);
  }

  function GoalCard({ goal }: { goal: any }) {
    const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
    const isExpired = goal.deadline && new Date(goal.deadline) <= now;
    const daysLeft = goal.deadline && !isExpired
      ? Math.ceil((new Date(goal.deadline).getTime() - now.getTime()) / 86400000)
      : null;

    if (editingId === goal.id) {
      return (
        <div className="p-5 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="space-y-3">
            <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="Goal title" />
            <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm h-16 resize-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="Description (optional)" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={editForm.targetAmount} onChange={e => setEditForm(f => ({ ...f, targetAmount: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                placeholder="Target (ZAR)" />
              <input type="date" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => saveEdit(goal.id)} disabled={!!savingId}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm text-white"
                style={{ background: 'var(--sky)' }}>
                <Check size={13} /> {savingId === goal.id ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditingId(null)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--text-muted)' }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={goal.id} className="p-5 rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: deletingId === goal.id ? 0.5 : 1 }}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>{goal.title}</h3>
              {isExpired && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Expired</span>
              )}
            </div>
            {goal.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{goal.description}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {goal.deadline && (
              <span className="text-xs mr-2" style={{ color: daysLeft !== null && daysLeft <= 7 ? '#ef4444' : 'var(--text-muted)' }}>
                {isExpired
                  ? new Date(goal.deadline).toLocaleDateString('en-ZA')
                  : daysLeft === 0 ? 'Last day!' : `${daysLeft}d left`}
              </span>
            )}
            <button onClick={() => startEdit(goal)} title="Edit goal"
              className="p-1.5 rounded-lg transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}>
              <Pencil size={14} />
            </button>
            <button onClick={() => setConfirmDeleteId(goal.id)} title="Delete goal"
              className="p-1.5 rounded-lg transition-colors hover:opacity-80"
              style={{ color: '#ef4444' }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--surface2)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: isExpired ? '#6b7280' : 'var(--sky)' }} />
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: isExpired ? 'var(--text-muted)' : 'var(--sky)' }}>{formatCurrency(goal.currentAmount)} raised</span>
          <span style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}% of {formatCurrency(goal.targetAmount)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Goals</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: 'var(--sky)' }}>
          <Plus className="w-4 h-4" /> New Goal
        </button>
      </div>

      {showForm && (
        <div className="p-5 rounded-xl border mb-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>Create Goal</h3>
          <div className="space-y-3">
            <input placeholder="Goal title (e.g. Studio Session Fund)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm h-20 resize-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="number" placeholder="Target amount (ZAR)" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <div className="flex gap-3">
              <button onClick={createGoal} className="px-4 py-2 rounded-lg font-bold text-white text-sm"
                style={{ background: 'var(--sky)' }}>Create Goal</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Just now…</p>}

      {!loading && goals.length === 0 && (
        <div className="text-center py-20 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Target className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--sky)' }} />
          <p className="font-bold" style={{ color: 'var(--text)' }}>Nothing here yet, go create</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Set a funding goal for fans to support.</p>
        </div>
      )}

      {/* Live goals */}
      {liveGoals.length > 0 && (
        <div className="space-y-4 mb-8">
          {liveGoals.map(goal => <GoalCard key={goal.id} goal={goal} />)}
        </div>
      )}

      {/* Expired goals — collapsed section */}
      {expiredGoals.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Expired ({expiredGoals.length}) — no longer visible to fans
          </p>
          <div className="space-y-3">
            {expiredGoals.map(goal => <GoalCard key={goal.id} goal={goal} />)}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (() => {
        const goal = goals.find(g => g.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: 'var(--text)' }}>Delete "{goal?.title}"?</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                The goal will be permanently removed. Any support already received is yours and won't be affected.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                  Cancel
                </button>
                <button onClick={() => deleteGoal(confirmDeleteId)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: '#ef4444' }}>
                  Delete Goal
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

